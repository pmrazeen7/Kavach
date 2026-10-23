import { useState, useRef, useEffect } from 'react'
import { Bot, MessageSquare, Settings, User } from 'lucide-react'
import Mascot from '../components/ui/Mascot'
import { useChat } from '../hooks/useChat'
import type { ChatMessage, MemoryTestResult, ChatWaitMode } from '../hooks/useChat'

/* ── DLP Alert Badge ──────────────────────────────────────────────── */

function DlpBadge({ dlp }: { dlp: ChatMessage['dlp'] }) {
  if (!dlp) return null

  const isBlock = dlp.decision === 'BLOCK'
  const isWarn = dlp.decision === 'WARN'
  const isSafe = dlp.decision === 'ALLOW'

  const bgColor = isBlock
    ? 'rgb(var(--danger) / 0.15)'
    : isWarn
    ? 'rgb(var(--warn) / 0.15)'
    : 'rgb(var(--success) / 0.1)'

  const borderColor = isBlock
    ? 'rgb(var(--danger))'
    : isWarn
    ? 'rgb(var(--warn))'
    : 'rgb(var(--success))'

  const label = isBlock ? '🛑 BLOCKED' : isWarn ? '⚠️ WARNING' : '✅ SAFE'

  const entities = dlp.entities_found || []

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        padding: '8px 12px',
        marginTop: 6,
        fontSize: 11,
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span style={{ color: 'rgb(var(--muted))' }}>
          Risk: <b style={{ color: borderColor }}>{dlp.risk_score}</b>
        </span>
        <span style={{ color: 'rgb(var(--muted))' }}>
          Intent: <b>{dlp.intent_label}</b>
        </span>
        {dlp.code_detected && (
          <span style={{ color: 'rgb(var(--danger))', fontWeight: 600 }}>💻 CODE</span>
        )}
        {dlp.secrets_detected && (
          <span style={{ color: 'rgb(var(--danger))', fontWeight: 600 }}>🔑 SECRETS</span>
        )}
      </div>
      {entities.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {entities.map((e, i) => (
            <span
              key={i}
              style={{
                background: 'rgb(var(--subtle))',
                border: '1px solid rgb(var(--line))',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 10,
                color: 'rgb(var(--fg))',
              }}
            >
              {e.type} ×{e.count}
            </span>
          ))}
        </div>
      )}
      {(isSafe || !dlp.incident_id) ? null : (
        <div style={{ marginTop: 4, fontSize: 9, color: 'rgb(var(--faint))' }}>
          Incident: {dlp.incident_id}
        </div>
      )}
    </div>
  )
}

/* ── Message Bubble ───────────────────────────────────────────────── */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 16,
        paddingLeft: isUser ? 60 : 0,
        paddingRight: isUser ? 0 : 60,
      }}
    >
      <div style={{ maxWidth: '100%' }}>
        {/* Avatar + name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
            justifyContent: isUser ? 'flex-end' : 'flex-start',
          }}
        >
          <span style={{ display: 'inline-flex', color: 'rgb(var(--muted))' }}>
            {isUser ? <User size={16} /> : isSystem ? <Settings size={16} /> : <Bot size={16} />}
          </span>
          <span style={{ fontSize: 11, color: 'rgb(var(--faint))', fontWeight: 600 }}>
            {isUser ? 'You' : isSystem ? 'System' : 'Gemini AI'}
          </span>
          <span style={{ fontSize: 9, color: 'rgb(var(--faint))' }}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        {/* Message content */}
        <div
          style={{
            background: isUser
              ? 'rgb(var(--accent))'
              : isSystem
              ? 'rgb(var(--danger) / 0.1)'
              : 'rgb(var(--subtle))',
            border: isUser
              ? '1px solid rgb(var(--accent))'
              : isSystem
              ? '1px solid rgb(var(--danger) / 0.3)'
              : '1px solid rgb(var(--line))',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 13,
            lineHeight: 1.6,
            color: isUser ? '#fff' : 'rgb(var(--fg))',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>

        {/* Extracted text preview for document uploads */}
        {message.extractedPreview && (
          <div
            style={{
              marginTop: 6,
              background: 'rgb(var(--subtle))',
              border: '1px solid rgb(var(--subtle))',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 10,
              color: 'rgb(var(--muted))',
              maxHeight: 100,
              overflow: 'auto',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4, color: 'rgb(var(--faint))' }}>
              📋 Extracted text preview:
            </div>
            {message.extractedPreview}
          </div>
        )}

        {/* DLP Alert */}
        <DlpBadge dlp={message.dlp} />
      </div>
    </div>
  )
}

/* ── Typing Indicator ─────────────────────────────────────────────── */

function TypingIndicator({ mode }: { mode: ChatWaitMode }) {
  const label =
    mode === 'upload_scan'
      ? 'Scanning document for sensitive data…'
      : mode === 'upload_llm'
        ? 'Generating assistant reply…'
        : mode === 'message'
          ? 'Checking message and generating reply…'
          : 'Working…'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        marginBottom: 16,
      }}
    >
      <span style={{ fontSize: 16 }}>🤖</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'rgb(var(--accent))',
              animation: `typingDot 1.4s infinite ${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'rgb(var(--faint))' }}>{label}</span>
    </div>
  )
}

/* ── Memory Test Panel ────────────────────────────────────────────── */

function MemoryTestPanel({
  result,
  loading,
  onClose,
}: {
  result: MemoryTestResult | null
  loading: boolean
  onClose: () => void
}) {
  if (!loading && !result) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgb(17 24 39 / 0.5)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgb(var(--surface))',
          border: '1px solid rgb(var(--line))',
          borderRadius: 16,
          maxWidth: 900,
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: 32,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              color: 'rgb(var(--fg))',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            🧠 Digital Alzheimer&apos;s Proof
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'rgb(var(--line))',
              border: 'none',
              color: 'rgb(var(--muted))',
              fontSize: 18,
              cursor: 'pointer',
              borderRadius: 8,
              padding: '4px 12px',
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgb(var(--faint))' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔬</div>
            <div>Running memory test in a fresh session...</div>
            <div style={{ fontSize: 11, marginTop: 8, color: 'rgb(var(--faint))' }}>
              Asking the LLM about PII from your previous session
            </div>
          </div>
        ) : result ? (
          <div>
            {/* Verdict Banner */}
            <div
              style={{
                background:
                  result.verdict === 'NO_MEMORY'
                    ? 'rgb(var(--success) / 0.1)'
                    : 'rgb(var(--danger) / 0.1)',
                border: `1px solid ${
                  result.verdict === 'NO_MEMORY' ? 'rgb(var(--success))' : 'rgb(var(--danger))'
                }`,
                borderRadius: 12,
                padding: 16,
                marginBottom: 24,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>
                {result.verdict === 'NO_MEMORY' ? '✅' : '❌'}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'rgb(var(--fg))' }}>
                {result.verdict === 'NO_MEMORY'
                  ? 'CONFIRMED: LLM Has No Memory'
                  : 'Memory Test Failed'}
              </div>
              <div
                style={{ fontSize: 12, color: 'rgb(var(--muted))', marginTop: 8, lineHeight: 1.5 }}
              >
                {result.explanation}
              </div>
            </div>

            {/* Side-by-side comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Session A — Previous */}
              <div
                style={{
                  background: 'rgb(var(--danger) / 0.05)',
                  border: '1px solid rgb(var(--danger) / 0.2)',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'rgb(var(--danger))',
                    marginBottom: 12,
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                  }}
                >
                  Session A — Your Messages (ID: {result.previous_session_id})
                </div>
                {result.previous_messages.length > 0 ? (
                  result.previous_messages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        background: 'rgb(var(--subtle))',
                        borderRadius: 8,
                        padding: '8px 12px',
                        marginBottom: 8,
                        fontSize: 12,
                        color: 'rgb(var(--fg))',
                        borderLeft: '3px solid rgb(var(--danger))',
                      }}
                    >
                      {msg}
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'rgb(var(--faint))', fontSize: 12 }}>
                    No messages in previous session
                  </div>
                )}
              </div>

              {/* Session B — Memory Test */}
              <div
                style={{
                  background: 'rgb(var(--success) / 0.05)',
                  border: '1px solid rgb(var(--success) / 0.2)',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'rgb(var(--success))',
                    marginBottom: 12,
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                  }}
                >
                  Session B — Fresh Session (ID: {result.new_session_id})
                </div>
                {result.memory_test_results.map((r, i) => (
                  <div key={i}>
                    <div
                      style={{
                        background: 'rgb(var(--subtle))',
                        borderRadius: 8,
                        padding: '8px 12px',
                        marginBottom: 4,
                        fontSize: 12,
                        color: 'rgb(var(--muted))',
                        borderLeft: '3px solid rgb(var(--accent))',
                      }}
                    >
                      <strong>Q:</strong> {r.question}
                    </div>
                    <div
                      style={{
                        background: 'rgb(var(--success) / 0.06)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        marginBottom: 12,
                        fontSize: 12,
                        color: 'rgb(var(--fg))',
                        borderLeft: '3px solid rgb(var(--success))',
                        lineHeight: 1.5,
                      }}
                    >
                      <strong>A:</strong> {r.answer}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ── Main Chat Page ───────────────────────────────────────────────── */

export default function ChatLLM() {
  const {
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
  } = useChat()

  const [input, setInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = () => {
    if (!input.trim() || loading) return
    sendMessage(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadDocument(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadDocument(file)
    e.target.value = ''
  }

  const hasPiiMessages = messages.some(
    m => m.dlp && (m.dlp.decision === 'BLOCK' || m.dlp.decision === 'WARN')
  )

  return (
    <>
      {/* Typing animation keyframes */}
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>

      <div
        id="chat-llm-page"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100dvh - 104px)',
          minHeight: 420,
          position: 'relative',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 0',
            borderBottom: '1px solid rgb(var(--line))',
            marginBottom: 16,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <MessageSquare size={24} color="rgb(var(--accent))" />
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'rgb(var(--fg))',
                  letterSpacing: 0.5,
                }}
              >
                Kavach AI Chat
              </div>
              <div style={{ fontSize: 10, color: 'rgb(var(--faint))', letterSpacing: 0 }}>
                Powered by Gemini · DLP protected
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {sessionId && (
              <span
                style={{
                  fontSize: 10,
                  color: 'rgb(var(--faint))',
                  background: 'rgb(var(--subtle))',
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid rgb(var(--subtle))',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                🔗 Session: {sessionId}
              </span>
            )}

            {hasPiiMessages && sessionId && (
              <button
                onClick={proveAlzheimers}
                disabled={memoryTestLoading}
                style={{
                  background: 'rgb(var(--accent-soft))',
                  border: '1px solid rgb(var(--accent))',
                  color: 'rgb(var(--accent-fg))',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                🧠 Prove Alzheimer&apos;s
              </button>
            )}

            <button
              onClick={startNewSession}
              style={{
                background: 'rgb(var(--subtle))',
                border: '1px solid rgb(var(--line))',
                color: 'rgb(var(--muted))',
                fontSize: 11,
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}
            >
              New chat
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '0 4px',
          }}
          onDragOver={e => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
        >
          {/* Welcome screen */}
          {messages.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'rgb(var(--faint))',
                textAlign: 'center',
              }}
            >
              <div style={{ marginBottom: 8 }}><Mascot pose="wave" size={110} /></div>
              <div
                style={{ fontSize: 22, fontWeight: 700, color: 'rgb(var(--muted))', marginBottom: 8 }}
              >
                Kavach AI Chat
              </div>
              <div style={{ fontSize: 13, maxWidth: 450, lineHeight: 1.6, color: 'rgb(var(--faint))' }}>
                Every message is scanned through the DLP pipeline before reaching the AI.
                Sensitive data gets flagged in real-time on the War Room dashboard.
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginTop: 32,
                  maxWidth: 500,
                }}
              >
                {[
                  {
                    icon: '🔍',
                    title: 'PII Detection',
                    desc: 'Aadhaar, PAN, UPI, emails auto-detected',
                  },
                  {
                    icon: '📄',
                    title: 'Document Upload',
                    desc: 'Upload PDF, DOCX, TXT for analysis',
                  },
                  {
                    icon: '🧠',
                    title: 'Digital Alzheimer\'s',
                    desc: 'Prove the AI forgets between sessions',
                  },
                  {
                    icon: '📊',
                    title: 'Live Dashboard',
                    desc: 'Incidents appear in War Room instantly',
                  },
                ].map((card, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgb(var(--subtle))',
                      border: '1px solid rgb(var(--subtle))',
                      borderRadius: 10,
                      padding: 16,
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{card.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'rgb(var(--muted))' }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgb(var(--faint))', marginTop: 4 }}>
                      {card.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Typing indicator */}
          {loading && <TypingIndicator mode={waitMode} />}

          <div ref={messagesEndRef} />
        </div>

        {/* Drag overlay */}
        {dragOver && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgb(var(--accent) / 0.15)',
              border: '2px dashed rgb(var(--accent))',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              fontSize: 16,
              color: 'rgb(var(--accent))',
              fontWeight: 600,
            }}
          >
            📄 Drop document here to scan & analyze
          </div>
        )}

        {/* Input Bar */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '12px 0 4px',
            borderTop: '1px solid rgb(var(--line))',
            alignItems: 'flex-end',
            flexShrink: 0,
          }}
        >
          {/* File upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            style={{
              background: 'rgb(var(--subtle))',
              border: '1px solid rgb(var(--line))',
              color: 'rgb(var(--muted))',
              fontSize: 16,
              padding: '10px 12px',
              borderRadius: 10,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.2s',
            }}
            title="Upload document (PDF, DOCX, TXT)"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.csv"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          {/* Text input */}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for new line)"
            disabled={loading}
            rows={1}
            style={{
              flex: 1,
              background: 'rgb(var(--subtle))',
              border: '1px solid rgb(var(--line))',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              color: 'rgb(var(--fg))',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              minHeight: 42,
              maxHeight: 120,
              lineHeight: 1.5,
            }}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              background:
                input.trim() && !loading
                  ? 'rgb(var(--accent))'
                  : 'rgb(var(--subtle))',
              border: 'none',
              color: input.trim() && !loading ? '#fff' : 'rgb(var(--faint))',
              fontSize: 16,
              padding: '10px 14px',
              borderRadius: 10,
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              flexShrink: 0,
              transition: 'all 0.2s',
            }}
          >
            ➤
          </button>
        </div>
      </div>

      {/* Memory Test Modal */}
      <MemoryTestPanel
        result={memoryTest}
        loading={memoryTestLoading}
        onClose={() => {}}
      />
    </>
  )
}
