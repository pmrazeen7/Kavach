import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { markSafe as apiMarkSafe, scanLocal, scanServer } from './client'
import type { Finding, ScanResult, ScannerSettings } from './types'

export type ScanStatus = 'idle' | 'scanning' | 'safe' | 'risk' | 'blocked'

interface Stamped {
  text: string
  confirmedKey: string
  result: ScanResult
}

const LOCAL_DEBOUNCE = 150
const SERVER_DEBOUNCE = 450

/**
 * Live scanning for a text box. A local scan answers within a frame or two (worker);
 * the server scan then adds the fingerprint layer and the keyed fingerprints and is
 * authoritative. Fails closed: if the server cannot be reached, local blocks still stand.
 */
export function useComposerScan(text: string, history: string[], settings?: ScannerSettings) {
  const [local, setLocal] = useState<Stamped | null>(null)
  const [server, setServer] = useState<Stamped | null>(null)
  const [serverDown, setServerDown] = useState(false)
  const [confirmed, setConfirmed] = useState<string[]>([])
  const [nonce, setNonce] = useState(0)
  const histKey = history.join('\u0001')
  const confirmedKey = confirmed.join(',')
  const latest = useRef({ text, histKey, confirmedKey })
  latest.current = { text, histKey, confirmedKey }

  useEffect(() => {
    if (!text.trim()) {
      setLocal(null)
      setServer(null)
      return
    }
    const t = setTimeout(() => {
      scanLocal(text, { history, settings })
        .then((result) => latest.current.text === text && setLocal({ text, confirmedKey, result }))
        .catch(() => undefined)
    }, LOCAL_DEBOUNCE)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, histKey, settings, confirmedKey, nonce])

  useEffect(() => {
    if (!text.trim()) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      scanServer(text, { history, confirmed, signal: ctl.signal })
        .then((result) => {
          setServerDown(false)
          if (latest.current.text === text) setServer({ text, confirmedKey, result })
        })
        .catch((e: unknown) => {
          if ((e as { name?: string }).name !== 'AbortError') setServerDown(true)
        })
    }, SERVER_DEBOUNCE)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, histKey, confirmedKey, nonce])

  const fresh = (s: Stamped | null) => (s && s.text === text && s.confirmedKey === confirmedKey ? s.result : null)
  const serverResult = fresh(server)
  const localResult = fresh(local)
  // The server's answer wins; until it arrives, fall back to the local one.
  const result = serverResult ?? localResult

  const status: ScanStatus = useMemo(() => {
    if (!text.trim()) return 'idle'
    if (!result) return 'scanning'
    const live = result.findings.filter((f) => f.action !== 'ALLOW')
    if (result.action === 'BLOCK') return 'blocked'
    if (live.length) return 'risk'
    // Looks clean locally: still "scanning" until the server (fingerprints) has confirmed.
    return serverResult || serverDown ? 'safe' : 'scanning'
  }, [text, result, serverResult, serverDown])

  const findings = useMemo<Finding[]>(() => (result ? result.findings.filter((f) => f.action !== 'ALLOW') : []), [result])

  const confirmOnce = useCallback((fp: string) => setConfirmed((c) => (fp && !c.includes(fp) ? [...c, fp] : c)), [])
  const markSafe = useCallback(async (fp: string) => {
    await apiMarkSafe(fp)
    setNonce((n) => n + 1)
  }, [])
  const rescan = useCallback(() => setNonce((n) => n + 1), [])
  const reset = useCallback(() => {
    setConfirmed([])
    setLocal(null)
    setServer(null)
  }, [])

  /** At send time: make sure the verdict is for exactly this text. */
  const ensureFresh = useCallback(async (): Promise<{ result: ScanResult; authoritative: boolean }> => {
    const have = serverResult
    if (have) return { result: have, authoritative: true }
    try {
      const r = await scanServer(text, { history, confirmed })
      setServer({ text, confirmedKey, result: r })
      return { result: r, authoritative: true }
    } catch {
      const r = localResult ?? (await scanLocal(text, { history, settings }))
      return { result: r, authoritative: false }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverResult, localResult, text, histKey, confirmedKey, settings])

  return { status, result, findings, serverOnline: !serverDown, confirmed, confirmOnce, markSafe, rescan, reset, ensureFresh }
}
