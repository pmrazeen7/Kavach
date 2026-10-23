/** Checksum and shape validators. Mirror of scanner/validators.py. */

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

const digits = (s: string) => s.replace(/\D/g, '')

export function verhoeff(s: string): boolean {
  const d = digits(s)
  if (d.length !== 12 || d[0] === '0' || d[0] === '1') return false
  let c = 0
  const rev = d.split('').reverse()
  for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][Number(rev[i])]]
  return c === 0
}

export function luhn(s: string): boolean {
  const d = digits(s)
  if (d.length < 13 || d.length > 19 || new Set(d).size === 1) return false
  let total = 0
  const rev = d.split('').reverse()
  for (let i = 0; i < rev.length; i++) {
    let n = Number(rev[i])
    if (i % 2) {
      n *= 2
      if (n > 9) n -= 9
    }
    total += n
  }
  return total % 10 === 0
}

export function iban(s: string): boolean {
  const c = s.replace(/\s/g, '').toUpperCase()
  if (c.length < 15 || c.length > 34 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(c)) return false
  const r = c.slice(4) + c.slice(0, 4)
  const n = r.split('').map((ch) => parseInt(ch, 36).toString()).join('')
  return BigInt(n) % 97n === 1n
}

const PAN_TYPES = new Set('PCHABGJLFT')
export const pan = (s: string) => /^[A-Z]{5}\d{4}[A-Z]$/.test(s) && PAN_TYPES.has(s[3])
export const ifsc = (s: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s)

const GST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export function gstin(s: string): boolean {
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return false
  const state = Number(s.slice(0, 2))
  if (state < 1 || state > 99) return false
  let total = 0
  for (let i = 0; i < 14; i++) {
    const v = GST.indexOf(s[i]) * (i % 2 === 0 ? 1 : 2)
    total += Math.floor(v / 36) + (v % 36)
  }
  return GST[(36 - (total % 36)) % 36] === s[14]
}

export function ssn(s: string): boolean {
  const m = /^(\d{3})-(\d{2})-(\d{4})$/.exec(s)
  if (!m) return false
  const [, area, group, serial] = m
  return area !== '000' && area !== '666' && !area.startsWith('9') && group !== '00' && serial !== '0000'
}

export const passportIn = (s: string) => /^[A-PR-WY][1-9]\d{6}$/.test(s)

export function ipv4(s: string): boolean {
  const p = s.split('.')
  return p.length === 4 && p.every((x) => /^\d+$/.test(x) && Number(x) >= 0 && Number(x) <= 255)
}

function b64urlJson(seg: string): unknown {
  const s = seg.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

export function jwt(s: string): boolean {
  const parts = s.split('.')
  if (parts.length !== 3) return false
  try {
    const h = b64urlJson(parts[0]) as Record<string, unknown>
    const p = b64urlJson(parts[1]) as Record<string, unknown>
    return typeof h === 'object' && h !== null && !Array.isArray(h) && typeof p === 'object' && p !== null && !Array.isArray(p) && ('alg' in h || 'typ' in h)
  } catch {
    return false
  }
}

const VALIDATORS: Record<string, (s: string) => boolean> = { verhoeff, luhn, iban, pan, ifsc, gstin, ssn, passport_in: passportIn, ipv4, jwt }

export function validate(name: string | undefined, value: string): boolean {
  return name ? VALIDATORS[name](value) : true
}
