import { useEffect, useRef, useCallback } from 'react'
import { useIncidentStore } from '../stores/incidentStore'
import { queryClient } from '../lib/queryClient'
import { wsUrl } from '../lib/api'
import type { Incident } from '../types/incident'

const MAX_BACKOFF = 8000

export function useWebSocket(enabled = true) {
  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef(1000)
  const setWsConnected = useIncidentStore((s) => s.setWsConnected)

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(wsUrl('/ws/alerts'))
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        backoffRef.current = 1000
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as Incident
          queryClient.setQueryData<Incident[]>(['incidents', 50, ''], (old) => {
            if (!old) return [data]
            if (old.some((item) => item.id === data.id)) return old
            return [data, ...old].slice(0, 50)
          })
        } catch {
          /* ignore parse errors */
        }
        queryClient.invalidateQueries({ queryKey: ['incidents'] })
        queryClient.invalidateQueries({ queryKey: ['stats'] })
        queryClient.invalidateQueries({ queryKey: ['endpoint-stats'] })
      }

      ws.onclose = () => {
        setWsConnected(false)
        const delay = Math.min(backoffRef.current, MAX_BACKOFF)
        backoffRef.current *= 2
        setTimeout(connect, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      const delay = Math.min(backoffRef.current, MAX_BACKOFF)
      backoffRef.current *= 2
      setTimeout(connect, delay)
    }
  }, [setWsConnected])

  useEffect(() => {
    if (!enabled) {
      setWsConnected(false)
      return
    }
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect, enabled, setWsConnected])
}
