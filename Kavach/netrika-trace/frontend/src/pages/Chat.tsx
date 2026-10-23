import { useEffect, useRef, useState } from 'react'
import { Brain, Link2, Paperclip, Plus, ScanSearch, FileText, Send, Radar } from 'lucide-react'
import { useChat, type ChatWaitMode } from '../hooks/useChat'
import MessageBubble from '../components/chat/MessageBubble'
import MemoryTestDrawer from '../components/chat/MemoryTestDrawer'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Character from '../components/ui/Character'
import PageHeader from '../components/ui/PageHeader'
import { cn } from '../components/ui/cn'

const WAIT_LABEL: Record<ChatWaitMode, string> = {
  idle: 'Working…',
  message: 'Checking message and generating reply…',
  upload_scan: 'Scanning document for sensitive data…',
  upload_llm: 'Generating assistant reply…',
}

const FEATURES = [
  { icon: ScanSearch, title: 'PII detection', desc: 'Aadhaar, PAN, UPI and emails are caught automatically.' },
  { icon: FileText, title: 'Document upload', desc: 'Drop a PDF, DOCX or TXT to scan and analyse.' },
  { icon: Brain, title: "Digital Alzheimer's", desc: 'Prove the AI forgets between sessions.' },
  { icon: Radar, title: 'Live dashboard', desc: 'Incidents show up on the dashboard instantly.' },
]

export default function Chat() {
  const { messages, sessionId, loading, waitMode, memoryTest, memoryTestLoading, sendMessage, uploadDocument, proveAlzheimers, startNewSession } = useChat()
  const [input, setInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = () => {
    if (!input.trim() || loading) return
    void sendMessage(input.trim())
    setInput('')
  }

  const hasFlagged = messages.some((m) => m.dlp && (m.dlp.decision === 'BLOCK' || m.dlp.decision === 'WARN'))

  return (
    <div className="flex h-[calc(100dvh-104px)] min-h-[420px] flex-col" id="chat-llm-page">
      <PageHeader
        title="AI Chat sandbox"
        subtitle="Powered by Gemini. Every message passes the DLP pipeline first."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {sessionId && (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-mono text-xs text-muted">
                <Link2 className="h-3.5 w-3.5" /> {sessionId}
              </span>
            )}
            {hasFlagged && sessionId && (
              <Button
                onClick={() => {
                  setMemoryOpen(true)
                  void proveAlzheimers()
                }}
                disabled={memoryTestLoading}
              >
                <Brain className="h-4 w-4" /> Prove Alzheimer&apos;s
              </Button>
            )}
            <Button onClick={startNewSession}><Plus className="h-4 w-4" /> New chat</Button>
          </div>
        }
      />

      <Card
        className={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl', dragOver && 'ring-2 ring-accent')}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) void uploadDocument(file)
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center py-4 text-center">
              <Character who="kavi" pose="wave" size={120} interactive />
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-fg">Ask anything. Kavi is watching.</h2>
              <p className="mt-1 max-w-md text-sm text-muted">Sensitive data gets flagged in real time and appears on the dashboard.</p>
              <div className="mt-6 grid max-w-xl grid-cols-1 gap-3 text-left sm:grid-cols-2">
                {FEATURES.map((f) => (
                  <div key={f.title} className="rounded-2xl border border-line bg-subtle/60 p-4">
                    <f.icon className="mb-2 h-5 w-5 text-accent" strokeWidth={1.75} />
                    <div className="text-sm font-semibold text-fg">{f.title}</div>
                    <div className="mt-0.5 text-xs text-muted">{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}

          {loading && (
            <div className="flex items-center gap-3 px-1 py-2" role="status">
              <Character who="sage" pose="think" size={48} follow={false} />
              <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
              <span className="text-xs text-muted">{WAIT_LABEL[waitMode]}</span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-accent-soft/80 text-base font-semibold text-accent-fg">
            Drop a document here to scan and analyse
          </div>
        )}

        <div className="flex items-end gap-2 border-t border-line p-3">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={loading} aria-label="Upload document (PDF, DOCX, TXT)" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-subtle hover:text-fg disabled:opacity-50">
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void uploadDocument(file)
              e.target.value = ''
            }}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Type a message (Shift+Enter for a new line)"
            aria-label="Message"
            disabled={loading}
            rows={1}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
          />
          <Button variant="primary" onClick={send} disabled={!input.trim() || loading} aria-label="Send message" className="h-11 w-11 shrink-0 px-0">
            <Send className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </Card>

      <MemoryTestDrawer open={memoryOpen} onClose={() => setMemoryOpen(false)} loading={memoryTestLoading} result={memoryTest} />
    </div>
  )
}
