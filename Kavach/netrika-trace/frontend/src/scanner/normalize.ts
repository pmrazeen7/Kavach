/**
 * Layer 0: make text comparable before any detector sees it.
 * Mirror of scanner/normalize.py. Every cleaned character keeps an index back to
 * the original text, so findings highlight the exact original span.
 */

const ZERO_WIDTH = new Set(
  '​‌‍‎‏‪‫‬‭‮⁠⁡⁢⁣⁤⁦⁧⁨⁩﻿­᠎͏'.split(''),
)

// Cyrillic and Greek letters that render like Latin ones (same table as the server).
const PAIRS =
  'аa вb сc еe һh іi јj кk мm нh оo рp ѕs тt уy хx ԁd ɡg ӏl ԛq ԝw ' +
  'АA ВB СC ЕE НH ІI ЈJ КK МM ОO РP ЅS ТT ХX УY ᏚS ' +
  'αa βb γy εe ηn ιi κk νv οo ρp τt υu χx ωw ' +
  'ΑA ΒB ΕE ΖZ ΗH ΙI ΚK ΜM ΝN ΟO ΡP ΤT ΥY ΧX'
const HOMOGLYPHS = new Map<string, string>(PAIRS.split(' ').map((p) => [p[0], p[1]] as [string, string]))

const LEET_MAP: Record<string, string> = { '4': 'a', '3': 'e', '1': 'i', '0': 'o', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'l', '8': 'b' }
/** Same-length leetspeak fold: p4ssw0rd -> password. */
export const leet = (s: string) => s.replace(/[43105 7@$!|8]/g, (c) => LEET_MAP[c] ?? c)

const SPACED = /(?<![^\s])(?:[A-Za-z0-9_\-+/=.] ){7,}[A-Za-z0-9_\-+/=.](?![^\s])/g
const DOTTED = /(?<![^\s])(?:[A-Za-z0-9][._·•] ?){7,}[A-Za-z0-9](?![^\s])/g

export interface Cleaned {
  text: string
  idx: number[]
}

export function normalize(text: string): Cleaned {
  const out: string[] = []
  const idx: number[] = []
  for (let i = 0; i < text.length; ) {
    const cp = String.fromCodePoint(text.codePointAt(i)!)
    const at = i
    i += cp.length
    if (ZERO_WIDTH.has(cp)) continue
    for (const c of cp.normalize('NFKC')) {
      if (ZERO_WIDTH.has(c)) continue
      const piece = HOMOGLYPHS.get(c) ?? c
      out.push(piece)
      for (let k = 0; k < piece.length; k++) idx.push(at)
    }
  }
  return { text: out.join(''), idx }
}

function drop(c: Cleaned, positions: Set<number>): Cleaned {
  if (positions.size === 0) return c
  const chars: string[] = []
  const idx: number[] = []
  for (let i = 0; i < c.text.length; i++) {
    if (!positions.has(i)) {
      chars.push(c.text[i])
      idx.push(c.idx[i])
    }
  }
  return { text: chars.join(''), idx }
}

export function collapseSpaced(c: Cleaned): Cleaned {
  const rm = new Set<number>()
  for (const rx of [SPACED, DOTTED]) {
    rx.lastIndex = 0
    for (const m of c.text.matchAll(rx)) {
      const s = m.index!
      const e = s + m[0].length
      for (let i = s; i < e; i++) if (' ._·•'.includes(c.text[i]) && i !== s && i !== e - 1) rm.add(i)
    }
  }
  return drop(c, rm)
}

/** Explicit shell-style continuation inside a token. Deliberately narrow. */
export function fixLineSplits(c: Cleaned): Cleaned {
  const rm = new Set<number>()
  for (const m of c.text.matchAll(/(?<=[A-Za-z0-9_-])\\\r?\n[ \t]*(?=[A-Za-z0-9_-])/g)) {
    for (let i = m.index!; i < m.index! + m[0].length; i++) rm.add(i)
  }
  return drop(c, rm)
}

/** A long unbroken token followed by a line starting with a token: often one wrapped secret. */
export function joinWrappedLines(c: Cleaned): Cleaned {
  const rm = new Set<number>()
  for (const m of c.text.matchAll(/(\S{16,})[ \t]*\r?\n[ \t]*(?=\S{6,})/g)) {
    for (let i = m.index! + m[1].length; i < m.index! + m[0].length; i++) rm.add(i)
  }
  return drop(c, rm)
}

export function clean(text: string): Cleaned {
  return collapseSpaced(normalize(text))
}

// ── Recursive decoding ───────────────────────────────────────────

export interface View {
  name: string
  text: string
  origin: [number, number]
}

const B64 = /[A-Za-z0-9+/_-]{16,}={0,2}/g
const HEX = /\b(?:[0-9a-fA-F]{2}){8,}\b/g
const PCT = /(?:%[0-9A-Fa-f]{2}){3,}/
const ENT = /&(?:#\d{2,6}|#x[0-9a-fA-F]{2,6}|[a-zA-Z]{2,8});/
const TOKEN = /[^\s"'`<>(){}[\],;]{10,}/g
const MAX_VIEWS = 40
const MAX_VIEW_CHARS = 64_000
const NOT_PRINTABLE = /\p{Cc}|\p{Cf}|\p{Cs}|\p{Co}|\p{Cn}|\p{Zl}|\p{Zp}|(?! )\p{Zs}/u

function printable(bytes: Uint8Array): string | null {
  let s: string
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  const chars = [...s]
  if (chars.length < 6) return null
  const ok = chars.filter((c) => !NOT_PRINTABLE.test(c) || c === '\r' || c === '\n' || c === '\t').length
  return ok / chars.length >= 0.9 ? s : null
}

function b64bytes(s: string): Uint8Array | null {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded) || s.length % 4 === 1) return null
  try {
    const bin = atob(padded)
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

function decodeB64(tok: string): string | null {
  const t = tok.replace(/^=+|=+$/g, '')
  if (t.length < 16 || (/^[A-Za-z]+$/.test(t) && t.length < 24)) return null
  for (const alt of [false, true]) {
    const s = alt ? t.replace(/-/g, '+').replace(/_/g, '/') : t
    const raw = b64bytes(s)
    if (!raw) continue
    const out = printable(raw)
    if (out) return out
  }
  return null
}

function decodeHex(tok: string): string | null {
  const bytes = new Uint8Array(tok.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(tok.slice(i * 2, i * 2 + 2), 16)
  return printable(bytes)
}

function unquote(s: string): string {
  const bytes: number[] = []
  const enc = new TextEncoder()
  for (let i = 0; i < s.length; ) {
    if (s[i] === '%' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16))
      i += 3
    } else {
      const cp = String.fromCodePoint(s.codePointAt(i)!)
      bytes.push(...enc.encode(cp))
      i += cp.length
    }
  }
  return new TextDecoder('utf-8').decode(Uint8Array.from(bytes))
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©' }
function unescapeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, g: string) => {
    if (g[0] === '#') {
      const n = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
    }
    return NAMED[g] ?? m
  })
}

const reverse = (s: string) => [...s].reverse().join('')

function* decoders(text: string): Generator<[string, [number, number], string]> {
  for (const m of text.matchAll(B64)) {
    const d = decodeB64(m[0])
    if (d) yield ['base64', [m.index!, m.index! + m[0].length], d]
  }
  for (const m of text.matchAll(HEX)) {
    const d = decodeHex(m[0])
    if (d) yield ['hex', [m.index!, m.index! + m[0].length], d]
  }
  if (PCT.test(text)) yield ['url', [0, text.length], unquote(text)]
  if (ENT.test(text)) yield ['html', [0, text.length], unescapeHtml(text)]
  for (const m of text.matchAll(TOKEN)) {
    if (m[0].length >= 12) yield ['reversed', [m.index!, m.index! + m[0].length], reverse(m[0])]
  }
  if (text.length <= 4096 && text.length >= 12) yield ['reversed', [0, text.length], reverse(text)]
}

export function decodeViews(text: string, depth = 3): View[] {
  const views: View[] = []
  const seen = new Set<string>([text])
  let total = 0
  const walk = (cur: string, name: string, origin: [number, number] | null, level: number): void => {
    if (level >= depth) return
    for (const [kind, span, decoded] of decoders(cur)) {
      if (seen.has(decoded) || views.length >= MAX_VIEWS) continue
      total += decoded.length
      if (total > MAX_VIEW_CHARS) return
      seen.add(decoded)
      const root = origin ?? span
      const nm = name ? `${name}>${kind}` : kind
      views.push({ name: nm, text: decoded, origin: root })
      if (kind !== 'reversed') walk(decoded, nm, root, level + 1)
    }
  }
  walk(text, '', null, 0)
  return views
}
