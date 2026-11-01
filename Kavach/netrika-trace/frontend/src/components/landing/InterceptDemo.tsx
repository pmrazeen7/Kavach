import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { cn } from '../ui/cn'

type Part = string | { m: string }
interface Scene {
  host: string
  parts: Part[]
  score: number
  bad: boolean
  why: string
}

const SCENES: Scene[] = [
  { host: 'chat.openai.com', parts: ['Summarize this customer record:\nName: Priya Nair\nAadhaar: ', { m: '4821 5530 9167' }, '\nPAN: ', { m: 'ABCPN1234F' }], score: 94, bad: true, why: 'Aadhaar and PAN in prompt' },
  { host: 'gemini.google.com', parts: ['Explain what a binary tree is and give a short Python example.'], score: 6, bad: false, why: 'No sensitive entities' },
  { host: 'claude.ai', parts: ['Fix my deploy script:\nAWS_SECRET_KEY=', { m: 'wJalrXUtnFEMI/K7MDENG' }, '\nrun_deploy.sh --prod'], score: 88, bad: true, why: 'Credential detected' },
]

const len = (s: Scene) => s.parts.reduce((a, p) => a + (typeof p === 'string' ? p : p.m).length, 0)

function Typed({ scene, upTo }: { scene: Scene; upTo: number }) {
  let n = 0
  return (
    <>
      {scene.parts.map((p, i) => {
        const text = typeof p === 'string' ? p : p.m
        const take = Math.max(0, Math.min(text.length, upTo - n))
        n += text.length
        const seg = text.slice(0, take)
        return typeof p === 'string' ? <span key={i}>{seg}</span> : <mark key={i} className="rounded bg-danger-soft px-0.5 text-danger-fg">{seg}</mark>
      })}
    </>
  )
}

/** Self-playing interception demo: types a prompt, scores it, then blocks or allows. */
export default function InterceptDemo({ compact }: { compact?: boolean }) {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [chars, setChars] = useState(0)
  const [done, setDone] = useState(false)
  const scene = SCENES[i % SCENES.length]

  useEffect(() => {
    let alive = true
    let t: ReturnType<typeof setTimeout>
    const total = len(scene)
    if (reduce) {
      setChars(total)
      setDone(true)
      t = setTimeout(() => alive && (setDone(false), setI((v) => v + 1)), 5000)
      return () => clearTimeout(t)
    }
    setChars(0)
    setDone(false)
    let c = 0
    const iv = setInterval(() => {
      c += 2
      setChars(c)
      if (c >= total) {
        clearInterval(iv)
        t = setTimeout(() => {
          if (!alive) return
          setDone(true)
          t = setTimeout(() => alive && setI((v) => v + 1), 3400)
        }, 350)
      }
    }, 28)
    return () => {
      alive = false
      clearInterval(iv)
      clearTimeout(t)
    }
  }, [scene, reduce])

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-pop">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm font-medium text-fg">
        <span className="flex gap-1.5" aria-hidden="true">{[0, 1, 2].map((d) => <i key={d} className="block h-2.5 w-2.5 rounded-full bg-line" />)}</span>
        <span>{scene.host}</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Inspecting</span>
      </div>
      <div className="space-y-3.5 p-4">
        <div className={cn('whitespace-pre-wrap break-words rounded-2xl border border-line bg-subtle p-3.5 font-mono text-[12.5px] text-muted', compact ? 'min-h-[72px]' : 'min-h-[96px]')} aria-live="polite">
          <Typed scene={scene} upTo={chars} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted">Risk score</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
            <div className={cn('h-full rounded-full transition-[width,background-color] duration-700 ease-smooth', scene.bad ? 'bg-danger' : 'bg-success')} style={{ width: done ? `${scene.score}%` : '0%' }} />
          </div>
          <span className="w-8 text-right text-sm font-semibold tabular-nums text-fg">{done ? scene.score : 0}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors', !done ? 'bg-subtle text-muted' : scene.bad ? 'bg-danger-soft text-danger-fg' : 'bg-success-soft text-success-fg')}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" /> {!done ? 'Scanning…' : scene.bad ? 'Blocked' : 'Allowed'}
          </span>
          <span className="text-xs text-faint">{done ? scene.why : 'Waiting for payload'}</span>
        </div>
      </div>
    </div>
  )
}
