import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { init, scan } from './engine'
import { features, probability } from './statistical'
import { ACTION_RANK, type Action } from './types'

const EVAL = resolve(__dirname, '../../../scanner/eval')
const parity = JSON.parse(readFileSync(resolve(EVAL, 'parity.json'), 'utf8')) as {
  tokens: Array<{ token: string; alone: boolean; small: boolean; p: number; x: number[] }>
  samples: Array<{ id: string; action: Action; types: string[] }>
}
const corpus = JSON.parse(readFileSync(resolve(EVAL, 'corpus.json'), 'utf8')) as Array<{ id: string; text: string; history: string[]; kind: 'pos' | 'neg'; expect?: Action; category: string; engine: string }>

beforeAll(async () => {
  await init()
})

describe('statistical layer parity with the Python engine', () => {
  it('computes identical feature vectors and probabilities', () => {
    const bad: string[] = []
    for (const t of parity.tokens) {
      const x = features(t.token, t.alone, t.small)
      const [p] = probability(t.token, t.alone, t.small)
      const maxDiff = Math.max(...x.map((v, i) => Math.abs(v - t.x[i])))
      if (maxDiff > 1e-9 || Math.abs(p - t.p) > 1e-9) bad.push(`${t.token}: dx=${maxDiff.toExponential(2)} dp=${Math.abs(p - t.p).toExponential(2)}`)
    }
    expect(bad, bad.slice(0, 10).join('\n')).toHaveLength(0)
  })
})

describe('end-to-end parity on the labelled corpus', () => {
  const results = () =>
    corpus.map((s) => {
      const py = parity.samples.find((p) => p.id === s.id)!
      const r = scan(s.text, { history: s.history, policy: 'balanced' })
      return { s, py, ts: r }
    })

  it('agrees with the server on the action for at least 99% of samples', () => {
    const rows = results()
    const diff = rows.filter(({ py, ts }) => py.action !== ts.action)
    const rate = diff.length / rows.length
    const detail = diff.slice(0, 12).map(({ s, py, ts }) => `${s.id} ${s.category}: py=${py.action} ts=${ts.action}`).join('\n')
    expect(rate, detail).toBeLessThan(0.01)
  })

  it('never disagrees about BLOCK vs not-BLOCK on known formats, evasions and context', () => {
    const rows = results().filter(({ s }) => /^(format|evasion|context|adversarial):/.test(s.category))
    const diff = rows.filter(({ py, ts }) => (py.action === 'BLOCK') !== (ts.action === 'BLOCK'))
    expect(diff.map(({ s, py, ts }) => `${s.id} ${s.category} py=${py.action} ts=${ts.action}`)).toHaveLength(0)
  })

  it('meets the same recall bar as the server on the browser-side layers', () => {
    const pos = results().filter(({ s }) => s.kind === 'pos')
    const caught = pos.filter(({ s, ts }) => ACTION_RANK[ts.action] >= ACTION_RANK[s.expect!])
    expect(caught.length / pos.length).toBeGreaterThan(0.97)
  })

  it('keeps the false-alarm rate on negatives under 1%', () => {
    const neg = results().filter(({ s }) => s.kind === 'neg')
    const fa = neg.filter(({ ts }) => ACTION_RANK[ts.action] >= ACTION_RANK.TOKENIZE)
    expect(fa.length / neg.length).toBeLessThan(0.01)
  })

  it('is fast enough to run on every keystroke', () => {
    const times = results().map(({ ts }) => ts.elapsedMs).sort((a, b) => a - b)
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(50)
  })
})
