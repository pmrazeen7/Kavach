/**
 * Browser scanning engine: layers 0-3 and 5 (formats, bare tokens, context, configured business rules),
 * the decision layer, and multi-turn scanning. Mirror of scanner/engine.py minus the keyed
 * fingerprint layer, which stays on the server (shipping fingerprints to a browser would make
 * low-entropy secrets guessable offline).
 *
 * Pure and synchronous once `init()` has loaded the shared rule pack. Runs in a Web Worker.
 */

import { findContextValues, judge } from './context'
import { clean, decodeViews, fixLineSplits, joinWrappedLines, type Cleaned } from './normalize'
import { candidateTokens, FI, isPlaceholder, loadStatistics, probability, shannon } from './statistical'
import { DEFAULT_SETTINGS, maxAction, type Action, type Category, type Finding, type Policy, type ScanOptions, type ScanResult, type ScannerSettings } from './types'
import { validate } from './validators'

interface Rule {
  id: string
  name: string
  cat: Category
  pattern: string
  flags: string
  group: number
  conf: number
  validator?: string
  min_ent?: number
  allow: boolean
  rx?: RegExp
}

const MAX_CHARS = 1_000_000
const HISTORY_TURNS = 6
const LAYER_NAMES: Record<number, string> = { 1: 'formats', 2: 'statistical', 3: 'context', 4: 'fingerprint', 5: 'pii-business' }

let rules: Rule[] | null = null

export async function init(): Promise<void> {
  if (rules) return
  await loadStatistics()
  const mod = await import('../../../scanner/rules/formats.json')
  const pack = (mod.default ?? mod) as unknown as { rules: Rule[] }
  rules = pack.rules.map((r) => ({ ...r, rx: new RegExp(r.pattern, 'dg' + (r.flags.includes('i') ? 'i' : '')) }))
}

type IndexedMatch = RegExpMatchArray & { indices?: Array<[number, number] | undefined> }

// ── helpers ──────────────────────────────────────────────────────

function maskPreview(value: string, category: string): string {
  const n = value.length
  if (n <= 4) return '•'.repeat(n)
  if ((category === 'financial' || category === 'pii') && n >= 8) return '•'.repeat(n - 4) + value.slice(-4)
  if (n >= 12) return value.slice(0, 2) + '•'.repeat(Math.min(n - 4, 12)) + value.slice(-2)
  return value[0] + '•'.repeat(n - 1)
}

const SECRETY = new Set<Category>(['secret', 'key_material', 'credential_url'])
const SOFT_PII = new Set(['email', 'phone_in', 'phone_intl', 'passport_in', 'ipv4_private'])
const WEIGHT: Record<string, number> = { secret: 1, key_material: 1, credential_url: 1, fingerprint: 1, canary: 1, suspicious: 0.8, financial: 0.9, pii: 0.7, business: 0.4 }
const TYPE_WEIGHT: Record<string, number> = { email: 0.3, phone_in: 0.45, phone_intl: 0.4, ipv4_private: 0.3, passport_in: 0.5, ifsc: 0.35 }

export function riskScore(findings: Finding[]): number {
  let keep = 1
  for (const f of findings) {
    if (f.action === 'ALLOW') continue
    const w = TYPE_WEIGHT[f.type] ?? WEIGHT[f.category] ?? 0.5
    keep *= 1 - Math.min(0.999, w * f.confidence)
  }
  return Math.round(100 * (1 - keep))
}

function decide(f: Finding, profile: Policy, tokenize: boolean): [Action, boolean] {
  const rewrite: Action = tokenize ? 'TOKENIZE' : 'REDACT'
  const cat = f.category
  if (cat === 'fingerprint' || cat === 'canary') return ['BLOCK', false]
  if (SECRETY.has(cat)) {
    if (f.confidence >= 0.85) return [{ strict: 'BLOCK', balanced: 'BLOCK', relaxed: rewrite }[profile] as Action, false]
    return [{ strict: 'BLOCK', balanced: 'BLOCK', relaxed: 'WARN' }[profile] as Action, f.allowlistable && profile !== 'relaxed']
  }
  if (cat === 'suspicious') return [{ strict: 'BLOCK', balanced: 'BLOCK', relaxed: 'WARN' }[profile] as Action, profile !== 'relaxed']
  if (cat === 'financial') return [{ strict: 'BLOCK', balanced: 'BLOCK', relaxed: 'REDACT' }[profile] as Action, false]
  if (cat === 'pii') {
    if (SOFT_PII.has(f.type) || f.confidence < 0.9) return [{ strict: rewrite, balanced: 'WARN', relaxed: 'ALLOW' }[profile] as Action, false]
    return [{ strict: 'REDACT', balanced: rewrite, relaxed: 'WARN' }[profile] as Action, false]
  }
  if (cat === 'business') return [{ strict: 'REDACT', balanced: 'WARN', relaxed: 'ALLOW' }[profile] as Action, false]
  return ['WARN', false]
}

type OrigFn = (a: number, b: number) => [number, number]
interface Draft extends Finding {
  forcedAction?: Action
}

function mkOrig(c: Cleaned): OrigFn {
  return (a, b) => {
    a = Math.max(0, Math.min(a, c.idx.length - 1))
    b = Math.max(a + 1, Math.min(b, c.idx.length))
    return [c.idx[a], c.idx[b - 1] + 1]
  }
}

function newFinding(p: Partial<Draft> & Pick<Draft, 'layer' | 'type' | 'label' | 'category' | 'start' | 'end' | 'confidence' | 'view'>): Draft {
  return { reasons: [], allowlistable: true, fp: '', masked: '', action: 'WARN', needsConfirmation: false, spansMessages: false, source: 'local', ...p }
}

// ── per-view layers ──────────────────────────────────────────────

function layersForView(vtext: string, view: string, origin: [number, number] | null, orig: OrigFn, settings: ScannerSettings): Draft[] {
  const span = (a: number, b: number): [number, number] => (origin ? orig(origin[0], origin[1]) : orig(a, b))
  const out: Draft[] = []
  const covered: Array<[number, number]> = []

  // Layer 1: known formats + validators
  for (const r of rules!) {
    const rx = r.rx!
    rx.lastIndex = 0
    for (const m of vtext.matchAll(rx) as IterableIterator<IndexedMatch>) {
      const g = r.group
      const value = g ? m[g] : m[0]
      if (!value || !validate(r.validator, value) || (r.min_ent != null && shannon(value) < r.min_ent)) continue
      if (isPlaceholder(value) && r.cat === 'secret') continue
      const [a, b] = g ? (m.indices?.[g] ?? [m.index! + m[0].indexOf(value), m.index! + m[0].indexOf(value) + value.length]) : [m.index!, m.index! + m[0].length]
      const [s, e] = span(a, b)
      out.push(newFinding({
        layer: 1, type: r.id, label: r.name, category: r.cat, start: s, end: e, confidence: r.conf,
        reasons: ['known-format', ...(r.validator ? ['checksum-valid'] : [])], view, allowlistable: !!r.allow, masked: maskPreview(value, r.cat),
      }))
      covered.push([a, b])
    }
  }

  // Layer 3: context
  for (const h of findContextValues(vtext)) {
    const j = judge(h)
    if (!j) continue
    const [conf, reasons] = j
    const [s, e] = span(h.start, h.end)
    out.push(newFinding({ layer: 3, type: 'context_secret', label: 'Secret introduced by context', category: 'secret', start: s, end: e, confidence: conf, reasons, view, allowlistable: conf < 0.85, masked: maskPreview(h.value, 'secret') }))
    covered.push([h.start, h.end])
  }

  // Layer 2: bare opaque tokens, context-free
  const aloneLines = new Set<string>()
  for (const m of vtext.matchAll(/^[ \t]*["'`(]?([^\s"'`()]{6,256})["'`),.;]?[ \t]*$/gm)) aloneLines.add(m[1])
  const small = vtext.split(/\s+/).filter(Boolean).length <= 3
  if (!view.includes('reversed')) {
    for (const { token: tok, start: a, end: b } of candidateTokens(vtext)) {
      if (/^\d+$/.test(tok) || isPlaceholder(tok) || covered.some(([ca, cb]) => a < cb && b > ca)) continue
      const alone = aloneLines.has(tok)
      const [p, x] = probability(tok, alone, small)
      if (p < 0.5) continue
      const [s, e] = span(a, b)
      const reasons = ['no-keyword-needed', 'random-looking', ...(alone ? ['alone-in-message'] : [])]
      if (x[FI.lp_avg] < -3.2) reasons.push('implausible-as-a-word')
      if (x[FI.entropy] >= 3.3) reasons.push('high-entropy')
      out.push(newFinding({ layer: 2, type: 'suspicious_token', label: 'Suspicious random token', category: 'suspicious', start: s, end: e, confidence: Math.min(0.97, p), reasons, view, masked: maskPreview(tok, 'suspicious') }))
    }
  }

  // Layer 5: configured business patterns
  const low = vtext.toLowerCase()
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const host of settings.internal_hosts) {
    for (const m of low.matchAll(new RegExp(escapeRe(host), 'g'))) {
      const [s, e] = span(m.index!, m.index! + m[0].length)
      out.push(newFinding({ layer: 5, type: 'internal_host', label: 'Internal hostname', category: 'business', start: s, end: e, confidence: 0.9, reasons: ['configured-internal-host'], view, masked: maskPreview(host, 'business') }))
    }
  }
  for (const name of settings.codenames) {
    for (const m of low.matchAll(new RegExp('\\b' + escapeRe(name.toLowerCase()) + '\\b', 'g'))) {
      const [s, e] = span(m.index!, m.index! + m[0].length)
      out.push(newFinding({ layer: 5, type: 'codename', label: 'Project codename', category: 'business', start: s, end: e, confidence: 0.9, reasons: ['configured-codename'], view, masked: maskPreview(name, 'business') }))
    }
  }
  for (const p of settings.custom_patterns) {
    let rx: RegExp
    try {
      rx = new RegExp(p.pattern, 'g')
    } catch {
      continue // a Python-only construct; the server still applies it
    }
    for (const m of vtext.matchAll(rx)) {
      if (!m[0]) continue
      const [s, e] = span(m.index!, m.index! + m[0].length)
      out.push(newFinding({ layer: 5, type: `custom:${p.name}`, label: p.name, category: p.category, start: s, end: e, confidence: 0.9, reasons: ['custom-pattern'], view, masked: maskPreview(m[0], p.category), forcedAction: p.action }))
    }
  }
  return out
}

function scanText(text: string, settings: ScannerSettings): Draft[] {
  if (!text.trim()) return []
  const c = fixLineSplits(clean(text))
  const out: Draft[] = []
  out.push(...layersForView(c.text, 'plain', null, mkOrig(c), settings))
  const j = joinWrappedLines({ text: c.text, idx: [...c.idx] })
  if (j.text !== c.text) out.push(...layersForView(j.text, 'joined-lines', null, mkOrig(j), settings))
  for (const v of decodeViews(c.text)) out.push(...layersForView(v.text, v.name, v.origin, mkOrig(c), settings))
  return out
}

function scanAcrossTurns(hist: string[], text: string, settings: ScannerSettings): Draft[] {
  const out: Draft[] = []
  const transcript = [...hist, text].join('\n')
  const newestStart = transcript.length - text.length
  for (const f of scanText(transcript, settings)) {
    if (f.end > newestStart) {
      f.start = Math.max(0, f.start - newestStart)
      f.end = Math.max(f.start + 1, Math.min(f.end - newestStart, text.length))
      f.spansMessages = true
      f.reasons.push('spans-messages')
      out.push(f)
    }
  }
  const frags = [...hist, text].map((m) => {
    const s = m.trim()
    return /^\S{3,128}$/.test(s) ? s : null
  })
  const run: string[] = []
  for (let i = frags.length - 1; i >= 0; i--) {
    if (frags[i] === null) break
    run.push(frags[i]!)
  }
  if (run.length >= 2 && frags[frags.length - 1] !== null) {
    for (const f of scanText(run.reverse().join(''), settings)) {
      f.start = 0
      f.end = Math.max(1, text.length)
      f.spansMessages = true
      f.view = 'joined'
      f.reasons.push('split-across-messages')
      out.push(f)
    }
  }
  return out
}

const PRIO: Record<string, number> = { canary: 6, fingerprint: 5, key_material: 4, credential_url: 4, secret: 3, financial: 3, pii: 2, business: 2, suspicious: 1 }

function merge(findings: Draft[]): Draft[] {
  const sorted = [...findings].sort((a, b) => (PRIO[b.category] ?? 0) - (PRIO[a.category] ?? 0) || b.confidence - a.confidence || a.start - b.start)
  const kept: Draft[] = []
  for (const f of sorted) {
    const clash = kept.find((k) => f.start < k.end && f.end > k.start)
    if (clash) {
      for (const r of f.reasons) if (!clash.reasons.includes(r)) clash.reasons.push(r)
      clash.confidence = Math.max(clash.confidence, f.confidence)
      continue
    }
    kept.push(f)
  }
  return kept
}

export function scan(text: string, opts: ScanOptions = {}): ScanResult {
  if (!rules) throw new Error('scanner not initialised: await init() first')
  const t0 = performance.now()
  const settings = opts.settings ?? DEFAULT_SETTINGS
  const profile: Policy = opts.policy ?? settings.profile
  const truncated = text.length > MAX_CHARS
  text = text.slice(0, MAX_CHARS)
  const hist = (opts.history ?? []).slice(-HISTORY_TURNS).map((h) => h.slice(0, 20_000))

  let findings = scanText(text, settings)
  if (hist.length) findings.push(...scanAcrossTurns(hist, text, settings))
  findings = merge(findings)

  const confirmed = new Set(opts.confirmed ?? [])
  const allow = new Set(settings.allowlist)
  for (const f of findings) {
    const [action, needs] = f.forcedAction ? [f.forcedAction, false] : decide(f, profile, settings.tokenize)
    f.action = action
    f.needsConfirmation = needs
    if (f.allowlistable && f.action !== 'ALLOW' && f.fp && (allow.has(f.fp) || confirmed.has(f.fp)) && f.category !== 'fingerprint' && f.category !== 'canary') {
      f.action = 'ALLOW'
      f.needsConfirmation = false
      f.reasons.push(allow.has(f.fp) ? 'marked-safe' : 'confirmed-safe-once')
    }
  }
  findings.sort((a, b) => a.start - b.start || b.confidence - a.confidence)
  let action: Action = 'ALLOW'
  for (const f of findings) action = maxAction(action, f.action)
  const layers: Record<string, number> = {}
  for (const f of findings) layers[LAYER_NAMES[f.layer] ?? String(f.layer)] = (layers[LAYER_NAMES[f.layer] ?? String(f.layer)] ?? 0) + 1
  const clean_ = findings.map(stripDraft)
  return {
    findings: clean_,
    score: riskScore(clean_),
    action,
    policy: profile,
    needsConfirmation: clean_.some((f) => f.needsConfirmation && f.action === 'BLOCK'),
    elapsedMs: performance.now() - t0,
    truncated,
    layers,
  }
}

function stripDraft(f: Draft): Finding {
  const copy: Draft = { ...f }
  delete copy.forcedAction
  return copy
}
