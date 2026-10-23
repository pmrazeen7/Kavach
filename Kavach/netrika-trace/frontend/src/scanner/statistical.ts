/**
 * Layer 2: context-free statistical detector for opaque tokens.
 * Line-for-line mirror of scanner/statistical.py; a parity test compares the
 * feature vectors and probabilities against the server's.
 */

export const FEATURE_NAMES = [
  'bias_len', 'log_len', 'entropy', 'entropy_norm', 'lower', 'upper', 'digit', 'symbol',
  'classes', 'transitions', 'vowel', 'max_cons', 'max_vowel', 'max_rep',
  'lp_avg', 'lp_min', 'has_letters', 'dict_cov', 'dict_full', 'benign_shape',
  'alone_in_line', 'msg_small', 'mixed_alnum', 'ends_symbol', 'has_special', 'special_ratio',
] as const

const F = (n: (typeof FEATURE_NAMES)[number]) => FEATURE_NAMES.indexOf(n)
export const FI = Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, i])) as Record<(typeof FEATURE_NAMES)[number], number>
void F

interface Lexicon {
  words: string[]
  uni: Record<string, number>
  bi: Record<string, Record<string, number>>
  tri: Record<string, Record<string, number>>
}
interface Model {
  w: number[]
  mean: number[]
  std: number[]
}

let lex: (Lexicon & { wordset: Set<string>; uniTotal: number; biTotals: Map<string, number>; triTotals: Map<string, number> }) | null = null
let model: Model | null = null

/** Load the shared lexicon and model (large; fetched lazily, inside the worker). */
export async function loadStatistics(): Promise<void> {
  if (lex && model) return
  const [l, m] = await Promise.all([import('../../../scanner/rules/lexicon.json'), import('../../../scanner/rules/model.json')])
  const L = (l.default ?? l) as unknown as Lexicon
  lex = {
    ...L,
    wordset: new Set(L.words),
    uniTotal: Object.values(L.uni).reduce((a, b) => a + b, 0),
    biTotals: new Map(),
    triTotals: new Map(),
  }
  model = (m.default ?? m) as unknown as Model
}

function needLex() {
  if (!lex || !model) throw new Error('scanner statistics not loaded: await init() first')
  return lex
}

const VOWELS = new Set('aeiouy')
const SPECIAL = new Set('!@#$%^&*+=~?')

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const HEXH = /^[0-9a-fA-F]+$/
const SEMVER = /^v?\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.]+)?$/
const DATE = /^(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})$/
const HEXCOLOR = /^#?[0-9a-fA-F]{6}$/
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
const TEMPLATEX = /^[xXyYmMdDhHsS0]+(?:[-:/. ][xXyYmMdDhHsS0]+)+$/
const SVGPATH = /^[MmLlHhVvCcSsQqTtAaZz]?-?\d+(?:\.\d+)?(?:[MmLlHhVvCcSsQqTtAaZz,-]-?\d+(?:\.\d+)?)+[MmLlHhVvCcSsQqTtAaZz]?$/
const CSSUNIT = /^-?\d+(?:\.\d+)?(?:px|em|rem|vh|vw|dvh|svh|lvh|vmin|vmax|ch|ex|pt|pc|cm|mm|in|fr|deg|rad|ms|s|%)$/
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
const CHARCLASS = /^(?:[A-Za-z0-9]-[A-Za-z0-9])+[_-]*$/
const PATH = /^[./~]{0,2}(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]*$/
const PIECE = /[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g

export function shannon(t: string): number {
  const n = t.length
  const counts = new Map<string, number>()
  for (const c of t) counts.set(c, (counts.get(c) ?? 0) + 1)
  let h = 0
  for (const v of counts.values()) h -= (v / n) * Math.log2(v / n)
  return h
}

const pieces = (token: string) => (token.match(PIECE) ?? []).map((p) => p.toLowerCase())

function rowTotal(cache: Map<string, number>, row: Record<string, number> | undefined, key: string): number {
  if (!row) return 0
  let t = cache.get(key)
  if (t === undefined) {
    t = Object.values(row).reduce((a, b) => a + b, 0)
    cache.set(key, t)
  }
  return t
}

function charLogprob(word: string): number {
  const L = needLex()
  const s = '^^' + word + '$'
  let lp = 0
  for (let i = 2; i < s.length; i++) {
    const c = s[i]
    const p1 = ((L.uni[c] ?? 0) + 0.5) / (L.uniTotal + 0.5 * 40)
    const b = L.bi[s[i - 1]]
    const bt = rowTotal(L.biTotals, b, s[i - 1])
    const p2 = bt ? ((b?.[c] ?? 0) + 0.1) / (bt + 0.1 * 40) : p1
    const k = s.slice(i - 2, i)
    const t = L.tri[k]
    const tt = rowTotal(L.triTotals, t, k)
    const p3 = tt ? ((t?.[c] ?? 0) + 0.05) / (tt + 0.05 * 40) : p2
    lp += Math.log2(0.6 * p3 + 0.3 * p2 + 0.1 * p1)
  }
  return lp / (s.length - 2)
}

function dictCoverage(letters: string): number {
  const ws = needLex().wordset
  const n = letters.length
  if (n === 0) return 0
  let covered = 0
  let i = 0
  while (i < n) {
    let hit = 0
    for (let j = Math.min(n, i + 24); j > i + 2; j--) {
      if (ws.has(letters.slice(i, j))) {
        hit = j - i
        break
      }
    }
    if (hit) {
      covered += hit
      i += hit
    } else i += 1
  }
  return covered / n
}

const lettersOf = (t: string) => [...t.toLowerCase()].filter((c) => /[a-z]/.test(c)).join('')

function pathLike(t: string): boolean {
  if (!PATH.test(t)) return false
  const letters = lettersOf(t)
  return letters.length >= 4 && dictCoverage(letters) >= 0.7
}

function dottedIdent(t: string): boolean {
  const parts = t.split('.')
  if (parts.length < 2 || !parts.every((p) => IDENT.test(p))) return false
  const letters = lettersOf(t)
  return letters.length >= 4 && dictCoverage(letters) >= 0.55
}

export function benignShape(t: string): boolean {
  if (SVGPATH.test(t) || CSSUNIT.test(t) || dottedIdent(t)) return true
  if (CHARCLASS.test(t) || TEMPLATEX.test(t) || pathLike(t)) return true
  if (UUID.test(t) || DATE.test(t) || IPV4.test(t) || SEMVER.test(t)) return true
  if (HEXH.test(t) && [7, 8, 9, 10, 11, 12, 32, 40, 56, 64, 96, 128].includes(t.length)) return true
  return HEXCOLOR.test(t)
}

const isLower = (c: string) => c >= 'a' && c <= 'z'
const isUpper = (c: string) => c >= 'A' && c <= 'Z'
const isDigit = (c: string) => c >= '0' && c <= '9'

export function features(token: string, aloneInLine = false, msgSmall = false): number[] {
  const L = needLex()
  const chars = [...token]
  const n = chars.length
  let lower = 0, upper = 0, digit = 0, special = 0
  for (const c of chars) {
    if (isLower(c)) lower++
    else if (isUpper(c)) upper++
    else if (isDigit(c)) digit++
    if (SPECIAL.has(c)) special++
  }
  const symbol = n - lower - upper - digit
  const H = shannon(token)
  const classes = (lower > 0 ? 1 : 0) + (upper > 0 ? 1 : 0) + (digit > 0 ? 1 : 0) + (symbol > 0 ? 1 : 0)
  const cls = (c: string) => (isLower(c) ? 0 : isUpper(c) ? 1 : isDigit(c) ? 2 : 3)
  let trans = 0
  for (let i = 1; i < n; i++) if (cls(chars[i - 1]) !== cls(chars[i])) trans++
  const transitions = trans / Math.max(1, n - 1)

  const letters = lettersOf(token)
  const vow = letters ? [...letters].filter((c) => VOWELS.has(c)).length / letters.length : 0
  let maxCons = 0, maxVow = 0, run = 0
  let prev: boolean | null = null
  for (const c of letters) {
    const v = VOWELS.has(c)
    run = v === prev ? run + 1 : 1
    prev = v
    if (v) maxVow = Math.max(maxVow, run)
    else maxCons = Math.max(maxCons, run)
  }
  let maxRep = 1
  let r = 1
  for (let i = 1; i < n; i++) {
    r = chars[i - 1] === chars[i] ? r + 1 : 1
    maxRep = Math.max(maxRep, r)
  }

  const ps = pieces(token).filter((p) => p.length >= 3)
  let lpAvg = -5.0, lpMin = -5.0
  if (ps.length) {
    const tot = ps.reduce((a, p) => a + p.length, 0)
    lpAvg = ps.reduce((a, p) => a + charLogprob(p) * p.length, 0) / tot
    lpMin = Math.min(...ps.map(charLogprob))
  }
  const dictCov = ps.length ? ps.reduce((a, p) => a + dictCoverage(p) * p.length, 0) / ps.reduce((a, p) => a + p.length, 0) : 0
  const all = pieces(token)
  const dictFull = all.length > 0 && all.every((p) => L.wordset.has(p)) && all.join('').length >= 0.6 * n ? 1 : 0
  const last = chars[n - 1]
  const endsSymbol = n > 0 && !(isLower(last) || isUpper(last) || isDigit(last)) ? 1 : 0

  return [
    1,
    Math.log(n),
    H,
    n > 1 ? H / Math.log2(n) : 0,
    lower / n, upper / n, digit / n, symbol / n,
    classes, transitions, vow,
    Math.min(maxCons, 12), Math.min(maxVow, 8), Math.min(maxRep, 8),
    lpAvg, lpMin, letters ? 1 : 0,
    dictCov, dictFull, benignShape(token) ? 1 : 0,
    aloneInLine ? 1 : 0, msgSmall ? 1 : 0,
    letters && digit ? 1 : 0,
    endsSymbol,
    special ? 1 : 0,
    special / n,
  ]
}

export function probability(token: string, aloneInLine = false, msgSmall = false): [number, number[]] {
  needLex()
  const m = model!
  const x = features(token, aloneInLine, msgSmall)
  let z = m.w[0]
  for (let i = 1; i < x.length; i++) z += (m.w[i] * (x[i] - m.mean[i])) / m.std[i]
  z = Math.max(-30, Math.min(30, z))
  return [1 / (1 + Math.exp(-z)), x]
}

const PLACEHOLDER = new RegExp(
  '^(?:x{4,}|\\*{3,}|\\.{3,}|\\?{3,}|<[^>]+>|\\[[^\\]]+\\]|\\{\\{.*\\}\\}|\\$\\{.*\\}|\\$[A-Z_]+|%[A-Z_]+%|your[_\\-]?.*|my[_\\-]?(?:api|secret|token|key|password).*|' +
    '(?:changeme|change_me|example|sample|dummy|test|testing|password|secret|token|placeholder|redacted|none|null|undefined|todo|fixme|abcdef\\w*|12345\\w*|qwerty\\w*)\\b.*|' +
    '(?:process\\.env|os\\.environ|os\\.getenv|env\\[|getenv\\().*)$',
  'i',
)
const TEMPLATE = /<[^<>\s]{1,40}>|\$\{[^}]*\}|\{\{[^}]*\}\}|\[[A-Z_ ]{3,30}\]/
const SCHEME = /^(?:bearer|basic|token)\s+/i

export function isPlaceholder(value: string): boolean {
  const v = value.trim().replace(SCHEME, '')
  return PLACEHOLDER.test(v) || TEMPLATE.test(v) || new Set(v).size <= 2
}

const TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9_\-+/=.!@#$%^&*~]{4,}/g

export interface Candidate {
  token: string
  start: number
  end: number
}

export function candidateTokens(text: string): Candidate[] {
  const out: Candidate[] = []
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index!
    let tok = m[0].replace(/[.,;:!?*_+\-$]+$/, '')
    const nxt = text.slice(start + m[0].length, start + m[0].length + 1)
    if (tok.endsWith('=') && ['"', "'", '{', '<', '(', '['].includes(nxt)) tok = tok.replace(/=+$/, '')
    if (tok.length < 6 || tok.length > 256 || ![...tok].some((c) => /[A-Za-z]/.test(c))) continue
    if (text.slice(Math.max(0, start - 8), start + 3).includes('://') || ((tok.match(/\//g) ?? []).length >= 2 && tok.includes('.'))) continue
    out.push({ token: tok, start, end: start + tok.length })
  }
  return out
}
