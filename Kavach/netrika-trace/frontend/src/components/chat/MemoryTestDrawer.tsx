import type { MemoryTestResult } from '../../hooks/useChat'
import Drawer from '../ui/Drawer'
import Character from '../ui/Character'
import { cn } from '../ui/cn'

interface Props {
  open: boolean
  onClose: () => void
  loading: boolean
  result: MemoryTestResult | null
}

export default function MemoryTestDrawer({ open, onClose, loading, result }: Props) {
  const ok = result?.verdict === 'NO_MEMORY'
  return (
    <Drawer open={open} onClose={onClose} width={560} title="Digital Alzheimer's test" subtitle="Proves the model forgets between sessions">
      {loading ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Character who="sage" pose="think" size={130} follow={false} />
          <p className="mt-3 text-sm font-medium text-fg">Running the memory test in a fresh session…</p>
          <p className="mt-1 text-xs text-muted">Asking the LLM about PII from your previous session</p>
        </div>
      ) : result ? (
        <div className="space-y-4">
          <div className={cn('flex flex-col items-center rounded-3xl border p-5 text-center', ok ? 'border-success/30 bg-success-soft/60' : 'border-danger/30 bg-danger-soft/60')}>
            <Character who="kavi" pose={ok ? 'celebrate' : 'think'} size={96} follow={false} />
            <div className="mt-2 text-base font-semibold text-fg">{ok ? 'Confirmed: the LLM has no memory' : 'Memory test failed'}</div>
            <p className="mt-1 text-sm text-muted">{result.explanation}</p>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">Session A · your messages <span className="font-mono text-xs font-normal text-faint">{result.previous_session_id}</span></h3>
            {result.previous_messages.length > 0 ? (
              <ul className="space-y-2">
                {result.previous_messages.map((m, i) => <li key={i} className="rounded-2xl border border-line bg-subtle px-3 py-2 text-sm text-fg">{m}</li>)}
              </ul>
            ) : <p className="text-sm text-muted">No messages in the previous session.</p>}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">Session B · fresh session <span className="font-mono text-xs font-normal text-faint">{result.new_session_id}</span></h3>
            <ul className="space-y-3">
              {result.memory_test_results.map((r, i) => (
                <li key={i} className="rounded-2xl border border-line p-3 text-sm">
                  <p className="text-muted"><span className="font-semibold text-fg">Q</span> {r.question}</p>
                  <p className="mt-1 text-fg"><span className="font-semibold">A</span> {r.answer}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </Drawer>
  )
}
