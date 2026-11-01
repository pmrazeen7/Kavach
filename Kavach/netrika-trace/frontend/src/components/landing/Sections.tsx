import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useInView, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { Check, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../lib/theme'
import Aurora from '../ui/Aurora'
import Button from '../ui/Button'
import Character, { CAST, type CharacterId } from '../ui/Character'
import CountUp from '../ui/CountUp'
import { Logo, LogoMark } from '../ui/Logo'
import { celebrate } from '../ui/Toast'
import { cn } from '../ui/cn'
import Magnetic from './Magnetic'

/* ── Shared ─────────────────────────────────────────────────── */

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function SectionHead({ eyebrow, title, sub, center }: { eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <Reveal className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <div className="mb-2 text-sm font-semibold text-accent">{eyebrow}</div>
      <h2 className="text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-lg text-muted">{sub}</p>}
    </Reveal>
  )
}

/* ── Navbar: glass, shrinks on scroll ───────────────────────── */

export function Navbar() {
  const { theme, toggle } = useTheme()
  const { scrollY } = useScroll()
  const height = useTransform(scrollY, [0, 120], [76, 58])
  const border = useTransform(scrollY, [0, 80], ['rgb(var(--line) / 0)', 'rgb(var(--line) / 1)'])
  const [condensed, setCondensed] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setCondensed(y > 90))
  return (
    <motion.header style={{ height, borderBottomColor: border }} className="sticky top-0 z-50 border-b bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-6">
        <a href="#top" className="flex h-11 items-center" aria-label="Kavach home">
          <AnimatePresence mode="wait" initial={false}>
            {condensed ? (
              <motion.span key="mark" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}>
                <LogoMark size={36} animated decorative />
              </motion.span>
            ) : (
              <motion.span key="full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <Logo variant="full" size={44} animated decorative />
              </motion.span>
            )}
          </AnimatePresence>
        </a>
        <nav aria-label="Sections" className="hidden gap-1 md:flex">
          {[['#cast', 'Meet the crew'], ['#pipeline', 'Pipeline'], ['#demo', 'Live demo'], ['#deploy', 'Deploy']].map(([href, label]) => (
            <a key={href} href={href} className="rounded-xl px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-fg">{label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-subtle hover:text-fg">
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
          <Link to="/login"><Button variant="primary">Launch Kavach</Button></Link>
        </div>
      </div>
    </motion.header>
  )
}

/* ── Marquee of real, seeded AI destinations (text only) ────── */

const DESTINATIONS = ['ChatGPT', 'OpenAI API', 'Claude', 'Anthropic API', 'Gemini', 'Google Gemini API', 'Microsoft Copilot', 'Perplexity', 'Mistral', 'Cohere', 'Groq', 'Together AI', 'HuggingFace', 'Replicate']

export function Marquee() {
  const items = [...DESTINATIONS, ...DESTINATIONS]
  return (
    <section aria-label="AI destinations Kavach watches" className="border-y border-line bg-surface/60 py-6 backdrop-blur">
      <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-faint">Watching traffic to</p>
      <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,rgb(var(--ink))_12%,rgb(var(--ink))_88%,transparent)]">
        <ul className="marquee-track flex gap-10">
          {items.map((d, i) => (
            <li key={i} className="flex shrink-0 items-center gap-10 text-lg font-semibold tracking-tight text-muted">
              {d} <span className="h-1.5 w-1.5 rounded-full bg-line" aria-hidden="true" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ── Counters (facts from the architecture, not made-up stats) ─ */

const FACTS = [
  { n: 3, label: 'Coordinated agents' },
  { n: 5, label: 'Detection layers' },
  { n: 3, label: 'Outcomes: allow, warn, block' },
  { n: 0, label: 'Bytes sent to external clouds' },
]

export function Counters() {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, margin: '-80px' })
  return (
    <div ref={ref} className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-6 py-14 lg:grid-cols-4">
      {FACTS.map((f, i) => (
        <Reveal key={f.label} delay={i * 0.06}>
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-card">
            <div className="text-4xl font-extrabold tabular-nums tracking-tight text-fg">{seen ? <CountUp value={f.n} duration={1100} /> : 0}</div>
            <div className="mt-1 text-sm text-muted">{f.label}</div>
          </div>
        </Reveal>
      ))}
    </div>
  )
}

/* ── The cast ───────────────────────────────────────────────── */

export function Cast() {
  const [hover, setHover] = useState<CharacterId | null>(null)
  const ids = Object.keys(CAST) as CharacterId[]
  return (
    <section id="cast" className="mx-auto max-w-6xl px-6 py-20">
      <SectionHead eyebrow="Meet the crew" title="Four guardians, one job" sub="Every request meets all four. Hover or tap to say hello." center />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ids.map((id, i) => (
          <Reveal key={id} delay={i * 0.07}>
            <motion.div
              whileHover={{ y: -6 }}
              onHoverStart={() => setHover(id)}
              onHoverEnd={() => setHover(null)}
              onFocus={() => setHover(id)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              className="rounded-3xl border border-line bg-surface p-6 text-center shadow-card outline-none transition-shadow hover:shadow-pop focus-visible:shadow-pop"
            >
              <div className="flex justify-center"><Character who={id} pose={hover === id ? (id === 'bolt' ? 'jump' : id === 'sage' ? 'think' : 'wave') : 'idle'} size={130} interactive /></div>
              <div className="mt-3 text-lg font-semibold text-fg">{CAST[id].name}</div>
              <div className="text-sm font-medium text-accent">{CAST[id].role}</div>
              <p className="mt-2 text-sm text-muted">{CAST[id].blurb}</p>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ── Problem / solution ─────────────────────────────────────── */

export function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <SectionHead eyebrow="The problem" title="Unveil and neutralize the Shadow AI threat" sub="Employees unknowingly paste confidential assets (PAN numbers, source code, API keys) into unmanaged LLMs. Kavach acts the moment it happens." />
      <div className="mt-10 grid gap-4 md:grid-cols-5">
        <Reveal className="md:col-span-2">
          <div className="h-full rounded-3xl border border-line bg-surface p-7 shadow-card">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-danger-soft text-danger-fg">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
            </span>
            <h3 className="text-xl font-semibold text-fg">Passive DLP</h3>
            <p className="mt-2 text-muted">Context-blind. It logs incidents after the breach and blocks traffic indiscriminately, flooding teams with false positives.</p>
          </div>
        </Reveal>
        <Reveal className="md:col-span-3" delay={0.08}>
          <div className="relative h-full overflow-hidden rounded-3xl border border-line bg-surface p-7 shadow-card">
            <Aurora tone="blue" />
            <div className="relative">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-fg">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
              </span>
              <h3 className="text-xl font-semibold text-fg">Kavach-Trace defense</h3>
              <p className="mt-2 text-fg/80">Active and intelligent. It stops the leak during the act with agentic reasoning. On-premise local LLMs judge the contextual sensitivity of every payload without exposing data to external clouds.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Deploy (no prices; there is no pricing data in the product) ─ */

const TIERS = [
  { name: 'Pilot', blurb: 'Try it on one machine.', points: ['Proxy and dashboard on a single host', 'Local SQLite storage', 'Local Phi-3 via Ollama for simulations', 'Chrome extension for browser coverage'] },
  { name: 'Enterprise on-prem', blurb: 'Run it for the whole organization.', points: ['Docker Compose: backend, Postgres, Redis', 'Role-based access and multi-tenant orgs', 'Device registration and policy sync', 'PDF incident and DPDP compliance reports'], featured: true },
]

export function Deploy() {
  const [cheer, setCheer] = useState(false)
  return (
    <section id="deploy" className="mx-auto max-w-6xl px-6 py-20">
      <SectionHead eyebrow="Ways to deploy" title="Start small, scale on-prem" sub="Both options keep your data inside your network." center />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {TIERS.map((t, i) => (
          <Reveal key={t.name} delay={i * 0.08}>
            <div
              className={cn('relative h-full overflow-hidden rounded-3xl border bg-surface p-7 shadow-card', t.featured ? 'border-accent/40' : 'border-line')}
              onMouseEnter={() => t.featured && setCheer(true)}
              onMouseLeave={() => t.featured && setCheer(false)}
            >
              {t.featured && <Aurora tone="mix" />}
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-fg">{t.name}</h3>
                    <p className="mt-1 text-sm text-muted">{t.blurb}</p>
                  </div>
                  {t.featured && (
                    <button type="button" aria-label="Cheer with Kavi" onClick={() => celebrate()} className="-mt-2">
                      <Character who="kavi" pose={cheer ? 'celebrate' : 'idle'} size={84} follow={false} />
                    </button>
                  )}
                </div>
                <ul className="mt-5 space-y-2.5">
                  {t.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-fg">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-fg"><Check className="h-3 w-3" strokeWidth={3} /></span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ── Final CTA + footer ─────────────────────────────────────── */

export function FinalCta() {
  const reduce = useReducedMotion()
  const [sent, setSent] = useState(false)
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-8">
      <Reveal>
        <div className="relative overflow-hidden rounded-4xl border border-line bg-surface px-6 py-16 text-center shadow-pop">
          <Aurora tone="mix" strong />
          <div className="relative">
            <motion.div animate={reduce ? undefined : { y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }} className="flex justify-center">
              <Character who="kavi" pose={sent ? 'celebrate' : 'wave'} size={110} interactive />
            </motion.div>
            <h2 className="mx-auto mt-3 max-w-xl text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">Secure the enterprise</h2>
            <p className="mx-auto mt-3 max-w-lg text-lg text-muted">Request a personalized demo and learn how to quantify and mitigate the risk of Shadow AI.</p>
            {sent ? (
              <p role="status" className="mt-8 font-semibold text-success-fg">Thanks! Your request was noted on this page. No data left your browser.</p>
            ) : (
              <form
                className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  setSent(true)
                  celebrate()
                }}
              >
                {[['Your name', 'text'], ['Work email', 'email'], ['Organization', 'text']].map(([ph, type]) => (
                  <input key={ph} type={type} required placeholder={ph} aria-label={ph} className="h-12 min-w-[180px] flex-1 rounded-xl border border-line bg-surface/80 px-4 text-sm text-fg backdrop-blur placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" />
                ))}
                <Magnetic><Button type="submit" variant="primary" className="h-12 px-6">Request access</Button></Magnetic>
              </form>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-line py-8 text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6">
        <div className="flex flex-wrap items-center gap-4">
          <Logo variant="full" size={36} theme="auto" label="Kavach" />
          <span>&copy; 2026 Netrika Inc. All rights reserved. Kavach&trade;</span>
        </div>
        <nav aria-label="Footer" className="flex gap-5">
          <a href="#top" className="hover:text-fg">Privacy Policy</a>
          <a href="#top" className="hover:text-fg">Terms of Service</a>
        </nav>
      </div>
    </footer>
  )
}
