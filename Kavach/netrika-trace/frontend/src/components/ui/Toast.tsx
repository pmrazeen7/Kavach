import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { create } from 'zustand'
import confetti from 'canvas-confetti'

type Kind = 'success' | 'error' | 'info'
interface ToastItem { id: number; kind: Kind; title: string; description?: string }
interface ToastStore {
  items: ToastItem[]
  push: (t: Omit<ToastItem, 'id'>) => void
  dismiss: (id: number) => void
}

let nextId = 1
const useToasts = create<ToastStore>((set) => ({
  items: [],
  push: (t) => {
    const id = nextId++
    set((s) => ({ items: [...s.items, { ...t, id }].slice(-4) }))
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 4500)
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export const toast = {
  success: (title: string, description?: string) => useToasts.getState().push({ kind: 'success', title, description }),
  error: (title: string, description?: string) => useToasts.getState().push({ kind: 'error', title, description }),
  info: (title: string, description?: string) => useToasts.getState().push({ kind: 'info', title, description }),
}

export function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  void confetti({ particleCount: 90, spread: 70, origin: { y: 0.75 }, colors: ['#4F46E5', '#6EE7B7', '#FDBA74', '#F9A8D4'] })
}

const icons = {
  success: <CheckCircle2 className="h-5 w-5 text-success" />,
  error: <AlertTriangle className="h-5 w-5 text-danger" />,
  info: <Info className="h-5 w-5 text-accent" />,
}

export function ToastViewport() {
  const { items, dismiss } = useToasts()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-pop"
          >
            {icons[t.kind]}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-fg">{t.title}</div>
              {t.description && <div className="mt-0.5 text-[13px] text-muted">{t.description}</div>}
            </div>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="text-faint hover:text-fg">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
