/** Layer 3: context signals. Mirror of scanner/context.py. */

import { leet } from './normalize'
import { FI, isPlaceholder, probability } from './statistical'

const KEYWORDS = [
  'password', 'passwd', 'passphrase', 'passcode', 'pwd', 'pass', 'secret', 'token', 'api key', 'apikey', 'api_key', 'api-key',
  'access key', 'access_key', 'secret key', 'secret_key', 'private key', 'private_key', 'client secret', 'client_secret',
  'credential', 'credentials', 'auth key', 'auth token', 'bearer', 'otp', 'pin', 'cvv', 'login', 'signing key', 'salt',
  'my key', 'the key', 'use this to log in', 'log in with', 'sign in with', 'here is my', "here's my",
  'kunji', 'gupt', 'guptshabd', 'paasword', 'पासवर्ड', 'गुप्त', 'कुंजी', 'पिन', 'ओटीपी',
  'contraseña', 'contrasena', 'clave', 'llave', 'senha', 'chave', 'mot de passe', 'motdepasse', 'clé', 'jeton',
  'passwort', 'kennwort', 'schlüssel', 'schluessel', 'geheim', 'parola', 'password segreta', 'chiave',
  'пароль', 'ключ', 'токен', 'كلمة المرور', 'كلمة السر', 'مفتاح', '密码', '密钥', '令牌', '口令', 'パスワード', 'トークン', '비밀번호',
]

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// eslint-disable-next-line no-control-regex
const isAscii = (s: string) => /^[\x00-\x7f]*$/.test(s)

function kwRegex(): RegExp {
  const ordered = [...KEYWORDS].sort((a, b) => b.length - a.length)
  const ascii = ordered.filter(isAscii).map(esc)
  const other = ordered.filter((k) => !isAscii(k)).map(esc)
  const parts: string[] = []
  if (ascii.length) parts.push('(?<![A-Za-z])(?:' + ascii.join('|') + ')(?![A-Za-z])')
  if (other.length) parts.push('(?:' + other.join('|') + ')')
  return new RegExp(parts.join('|'), 'gi')
}

const KW = kwRegex()
const CODEISH = /[()[\]{}]|::|\|\||&&|^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$|^\.{1,2}\/|^[A-Za-z]:\\/
const SECRETISH_NAME = /(?:pass(?:word|wd|phrase|code)?|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|auth|credential|private[_-]?key|client[_-]?secret|signing|salt|dsn|otp|pin|cvv|bearer|session|cookie)/i

const VALUE = '["\'`]?([^\\s"\'`<>,;]{4,200})'
const ASSIGN_AFTER_KW = new RegExp('^["\'`\\]\\s]{0,3}(?::=|=>|->|[:=])\\s*' + VALUE)
const SAY_AFTER_KW = new RegExp('^\\s+(?:is|are|was|will be|equals|hai|hain|es|est|ist|è|é|เป็น|是|है)\\s*[:=]?\\s*' + VALUE, 'i')
const BARE_AFTER_KW = new RegExp('^\\s+' + VALUE)

const ENV_LINE = /^[ \t]*(?:export[ \t]+|set[ \t]+|\$env:)?([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*=[ \t]*(.+?)[ \t]*$/gm
const YAML_LINE = /^[ \t]*-?[ \t]*([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*:[ \t]+(.+?)[ \t]*$/gm
const JSON_PAIR = /"([A-Za-z_][A-Za-z0-9_.-]*)"[ \t]*:[ \t]*"([^"\n]{4,300})"/g
const CLI_FLAG = /(?:^|\s)--?(?:p|pw|pass|password|passwd|token|secret|api-key|apikey|key|auth)(?:=|\s+)([^\s"']{4,200}|"[^"\n]{4,200}"|'[^'\n]{4,200}')/gi
const CURL_USER = /\bcurl\b[^\n]*?\s-u\s+["']?[^\s:"']+:([^\s"']{3,200})/gi
const HEADER = /(?:-H\s+)?["']?(?:x-api-key|x-auth-token|x-access-token|api-key|apikey|authorization|proxy-authorization)["']?\s*:\s*(?:bearer\s+|token\s+|basic\s+)?([A-Za-z0-9_\-.~+/=]{8,300})/gi
const MYSQL_P = /\bmysql[^\n]*\s-p([^\s"']{3,100})/g

export type CtxKind = 'assign' | 'say' | 'bare' | 'env' | 'yaml' | 'json' | 'cli' | 'curl' | 'header'
export interface CtxHit {
  start: number
  end: number
  value: string
  kind: CtxKind
  keyword: string
  weight: number
}

function stripQuotes(v: string): string {
  v = v.trim()
  if (v.length >= 2 && v[0] === v[v.length - 1] && '"\'`'.includes(v[0])) v = v.slice(1, -1)
  return v.replace(/[,;]+$/, '')
}

export function findContextValues(text: string): CtxHit[] {
  const hits: CtxHit[] = []
  const lowered = text.toLowerCase()
  const leeted = leet(lowered)
  const seen = new Set<number>()
  for (const source of [lowered, leeted]) {
    for (const m of source.matchAll(KW)) {
      const at = m.index!
      if (seen.has(at)) continue
      seen.add(at)
      const end = at + m[0].length
      const tail = text.slice(end, end + 240)
      const kw = text.slice(at, end)
      const tries: Array<[RegExp, CtxKind, number]> = [[ASSIGN_AFTER_KW, 'assign', 0.35], [SAY_AFTER_KW, 'say', 0.3], [BARE_AFTER_KW, 'bare', 0.12]]
      for (const [rx, kind, weight] of tries) {
        const mm = rx.exec(tail)
        if (mm) {
          const v = mm[1]
          const start = end + mm[0].length - v.length
          hits.push({ start, end: start + v.length, value: v.replace(/[.,;:!?]+$/, ''), kind, keyword: kw.toLowerCase(), weight })
          break
        }
      }
    }
  }
  for (const [rx, kind] of [[ENV_LINE, 'env'], [YAML_LINE, 'yaml']] as Array<[RegExp, CtxKind]>) {
    for (const m of text.matchAll(rx)) {
      const name = m[1]
      const value = stripQuotes(m[2])
      if (SECRETISH_NAME.test(name) && value.length >= 4 && value.length <= 300 && !'{[('.includes(value[0] ?? '')) {
        const g2 = m[2]
        const groupStart = m.index! + m[0].lastIndexOf(g2)
        const off = g2.includes(value) ? g2.indexOf(value) : 0
        const s = groupStart + off
        hits.push({ start: s, end: s + value.length, value, kind, keyword: name.toLowerCase(), weight: 0.4 })
      }
    }
  }
  for (const m of text.matchAll(JSON_PAIR)) {
    if (SECRETISH_NAME.test(m[1])) {
      const s = m.index! + m[0].length - 1 - m[2].length
      hits.push({ start: s, end: s + m[2].length, value: m[2], kind: 'json', keyword: m[1].toLowerCase(), weight: 0.4 })
    }
  }
  for (const [rx, kind] of [[CLI_FLAG, 'cli'], [CURL_USER, 'curl'], [HEADER, 'header'], [MYSQL_P, 'cli']] as Array<[RegExp, CtxKind]>) {
    for (const m of text.matchAll(rx)) {
      const g1 = m[1]
      const v = stripQuotes(g1)
      const groupStart = m.index! + m[0].length - g1.length
      const s = groupStart + (g1.includes(v) ? g1.indexOf(v) : 0)
      hits.push({ start: s, end: s + v.length, value: v, kind, keyword: kind, weight: 0.4 })
    }
  }
  return hits
}

export function judge(hit: CtxHit): [number, string[]] | null {
  const v = hit.value
  if (v.length < 4 || isPlaceholder(v) || CODEISH.test(v)) return null
  const [p, x] = probability(v, false, false)
  const reasons = [`ctx:${hit.kind}`, `kw:${hit.keyword.trim().slice(0, 24)}`]
  const dictWord = x[FI.dict_full] === 1 && /^[A-Za-z]+$/.test(v)
  if (hit.kind === 'bare' && (p < 0.35 || dictWord)) return null
  let conf = 1 - (1 - p) * (1 - hit.weight)
  const wordLike = x[FI.dict_cov] >= 0.8 && !(/\d/.test(v) && v.length >= 8)
  const assigned: CtxKind[] = ['assign', 'env', 'yaml', 'json', 'cli', 'curl', 'header']
  if (assigned.includes(hit.kind) && v.length >= 6 && !dictWord && !wordLike) {
    conf = Math.max(conf, 0.55)
    reasons.push('assigned-value')
  }
  if (p >= 0.5) reasons.push('random-looking')
  if (x[FI.entropy] >= 3.2) reasons.push('high-entropy')
  if (dictWord || wordLike) {
    conf = Math.min(conf, 0.45)
    reasons.push('looks-like-a-word')
  }
  if (conf < 0.5) return null
  return [Math.min(conf, 0.99), reasons]
}
