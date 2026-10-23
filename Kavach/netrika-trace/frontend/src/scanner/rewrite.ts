import type { Finding } from './types'

const PLACEHOLDER_NAME: Record<string, string> = {
  secret: 'SECRET', key_material: 'KEY', credential_url: 'CREDENTIAL', pii: 'PII', financial: 'FINANCIAL',
  business: 'INTERNAL', suspicious: 'SECRET', fingerprint: 'SECRET', canary: 'SECRET',
}

export type PlaceholderMap = Record<string, string>

function pick(findings: Finding[], only?: Set<Finding>): Finding[] {
  const out: Finding[] = []
  let end = -1
  for (const f of [...findings].filter((f) => f.action !== 'ALLOW' && (!only || only.has(f))).sort((a, b) => a.start - b.start)) {
    if (f.start < end) continue // overlapping findings were already merged by the engine
    out.push(f)
    end = f.end
  }
  return out
}

/** Replace flagged spans with [SECRET_1]-style placeholders. The map stays in memory so replies can be restored locally. */
export function tokenize(text: string, findings: Finding[], start = 1, only?: Set<Finding>): { text: string; map: PlaceholderMap } {
  const map: PlaceholderMap = {}
  const counters: Record<string, number> = {}
  let out = ''
  let pos = 0
  let n = start
  for (const f of pick(findings, only)) {
    const kind = PLACEHOLDER_NAME[f.category] ?? 'SECRET'
    counters[kind] = (counters[kind] ?? 0) + 1
    const ph = `[${kind}_${n++}]`
    map[ph] = text.slice(f.start, f.end)
    out += text.slice(pos, f.start) + ph
    pos = f.end
  }
  return { text: out + text.slice(pos), map }
}

/** Irreversible masking: the value is gone for good. */
export function redact(text: string, findings: Finding[], only?: Set<Finding>): string {
  let out = ''
  let pos = 0
  for (const f of pick(findings, only)) {
    out += text.slice(pos, f.start) + '█'.repeat(Math.max(4, Math.min(f.end - f.start, 16)))
    pos = f.end
  }
  return out + text.slice(pos)
}

/** Put the originals back into text that contains placeholders (used on the model's reply). */
export function restore(text: string, map: PlaceholderMap): string {
  let out = text
  for (const [ph, original] of Object.entries(map)) out = out.split(ph).join(original)
  return out
}
