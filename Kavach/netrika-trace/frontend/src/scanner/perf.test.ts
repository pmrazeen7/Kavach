import { beforeAll, describe, expect, it } from 'vitest'
import { init, scan } from './engine'

const SECRET = 'ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'
const prose = (n: number) => 'Please rewrite this paragraph so it sounds friendlier and keep it under 120 words. '.repeat(Math.ceil(n / 84)).slice(0, n)

beforeAll(async () => {
  await init()
})

describe('latency budget', () => {
  it('scans a normal prompt in well under 50 ms', () => {
    scan('warm up')
    const t = Array.from({ length: 30 }, () => scan(prose(600)).elapsedMs).sort((a, b) => a - b)
    expect(t[Math.floor(t.length * 0.9)]).toBeLessThan(50)
  })

  it('scans long documents in bounded time (it runs in a worker, so typing never waits)', () => {
    const r20 = scan(prose(20_000))
    const r200 = scan(prose(200_000) + ' ' + SECRET)
    expect(r20.elapsedMs).toBeLessThan(500)
    expect(r200.elapsedMs).toBeLessThan(5_000)
    expect(r200.action).toBe('BLOCK')
  })

  it('does not blow up on adversarial input (nested quantifier probes)', () => {
    const t0 = performance.now()
    scan('x'.repeat(5000) + '!')
    scan('0-'.repeat(3000))
    scan(('a'.repeat(30) + ' ').repeat(200))
    scan('%41'.repeat(3000))
    expect(performance.now() - t0).toBeLessThan(5_000)
  })
})
