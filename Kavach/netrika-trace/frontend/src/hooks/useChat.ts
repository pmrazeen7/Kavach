import { useState, useCallback } from 'react'
import { apiUrl } from '../lib/api'
import { restore as restorePlaceholders, type PlaceholderMap } from '../scanner/rewrite'

/** Chat endpoints require a signed-in user. */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem('netrika_token')
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  dlp?: {
    incident_id: string
    decision: string
    risk_score: number
    intent_label: string
    entities_found: Array<{ type: string; count: number }>
    code_detected: boolean
    secrets_detected: boolean
    /** Items the server masked in the model's reply. */
    output_flagged?: number
  }
  /** Placeholders restored locally in this reply. */
  restored?: number
  filename?: string
  extractedPreview?: string
}

export interface MemoryTestResult {
  previous_session_id: string
  new_session_id: string
  previous_messages: string[]
  memory_test_results: Array<{ question: string; answer: string }>
  verdict: string
  explanation: string
}

/** What the UI is waiting on during async chat operations */
export type ChatWaitMode = 'idle' | 'message' | 'upload_scan' | 'upload_llm'

async function readApiResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed (${response.status})`
    throw new Error(message)
  }
  if (!data || typeof data !== 'object' || ('error' in data && typeof data.error === 'string')) {
    throw new Error(
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'The server returned an invalid response'
    )
  }
  return data as T
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [waitMode, setWaitMode] = useState<ChatWaitMode>('idle')
  const [memoryTest, setMemoryTest] = useState<MemoryTestResult | null>(null)
  const [memoryTestLoading, setMemoryTestLoading] = useState(false)

  const sendMessage = useCallback(async (text: string, opts: { confirmedSafe?: string[]; restore?: PlaceholderMap } = {}) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setWaitMode('message')

    try {
      const res = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message: text, session_id: sessionId, confirmed_safe: opts.confirmedSafe ?? [] }),
      })
      if (res.status === 422) {
        // Stopped by the server-side scanner: the message never reached the model.
        const blocked = (await res.json().catch(() => null)) as { message?: string; incident_id?: string; scan?: { score?: number } } | null
        setMessages(prev => [
          ...prev.map(m => (m.id === userMsg.id ? { ...m, dlp: { incident_id: blocked?.incident_id ?? '', decision: 'BLOCK', risk_score: blocked?.scan?.score ?? 100, intent_label: 'SECRET_LEAK', entities_found: [], code_detected: false, secrets_detected: true } } : m)),
          { id: (Date.now() + 1).toString(), role: 'system' as const, content: blocked?.message ?? 'Blocked by policy.', timestamp: new Date().toISOString() },
        ])
        return
      }
      const data = await readApiResponse<{
        session_id: string
        response: string
        dlp: ChatMessage['dlp']
      }>(res)

      if (data.session_id && !sessionId) {
        setSessionId(data.session_id)
      }

      // Update user message with DLP data
      setMessages(prev =>
        prev.map(m =>
          m.id === userMsg.id ? { ...m, dlp: data.dlp } : m
        )
      )

      // Add assistant response
      const map = opts.restore ?? {}
      const restoredText = Object.keys(map).length ? restorePlaceholders(data.response, map) : data.response
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: restoredText,
        timestamp: new Date().toISOString(),
        restored: restoredText === data.response ? 0 : Object.keys(map).filter(ph => data.response.includes(ph)).length,
        dlp: data.dlp?.output_flagged ? data.dlp : undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `Error: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
      setWaitMode('idle')
    }
  }, [sessionId])

  const uploadDocument = useCallback(async (file: File) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: `Uploaded document: ${file.name}`,
      timestamp: new Date().toISOString(),
      filename: file.name,
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setWaitMode('upload_scan')

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (sessionId) formData.append('session_id', sessionId)

      const scanRes = await fetch(apiUrl('/api/chat/upload/scan'), {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      })
      const scanData = await readApiResponse<{
        session_id: string
        dlp: ChatMessage['dlp']
        extracted_text_preview: string
        blocked: boolean
      }>(scanRes)

      if (scanData.session_id && !sessionId) {
        setSessionId(scanData.session_id)
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === userMsg.id
            ? {
                ...m,
                dlp: scanData.dlp,
                extractedPreview: scanData.extracted_text_preview,
              }
            : m
        )
      )

      if (scanData.blocked) {
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `The document '${file.name}' was BLOCKED by the DLP system. Sensitive data was detected. The document content was not sent to the AI model.`,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, assistantMsg])
        return
      }

      if (!scanData.session_id) {
        throw new Error('The document scan did not return a session ID')
      }
      setWaitMode('upload_llm')

      const respondRes = await fetch(apiUrl('/api/chat/upload/respond'), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ session_id: scanData.session_id }),
      })
      const respondData = await readApiResponse<{ response: string }>(respondRes)

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: respondData.response,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `Upload error: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
      setWaitMode('idle')
    }
  }, [sessionId])

  const proveAlzheimers = useCallback(async () => {
    if (!sessionId) return
    setMemoryTestLoading(true)
    setMemoryTest(null)

    try {
      const res = await fetch(apiUrl('/api/chat/memory-test'), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ previous_session_id: sessionId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMemoryTest(data)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setMemoryTest({
        previous_session_id: sessionId,
        new_session_id: '',
        previous_messages: [],
        memory_test_results: [{ question: 'Error', answer: errorMessage }],
        verdict: 'ERROR',
        explanation: errorMessage,
      })
    } finally {
      setMemoryTestLoading(false)
    }
  }, [sessionId])

  const startNewSession = useCallback(() => {
    setMessages([])
    setSessionId('')
    setMemoryTest(null)
  }, [])

  return {
    messages,
    sessionId,
    loading,
    waitMode,
    memoryTest,
    memoryTestLoading,
    sendMessage,
    uploadDocument,
    proveAlzheimers,
    startNewSession,
  }
}
