import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import { LIVE_QUERY_OPTIONS } from '../lib/queryClient'
import { useIncidentStore } from '../stores/incidentStore'
import type { Incident, StatsResponse, EndpointStat } from '../types/incident'

function useLiveQueryOptions() {
  const wsConnected = useIncidentStore((s) => s.wsConnected)
  return wsConnected
    ? { refetchInterval: 15_000 as const, refetchIntervalInBackground: true as const }
    : LIVE_QUERY_OPTIONS
}

export function useIncidents(limit = 50, decision = '') {
  const liveOptions = useLiveQueryOptions()
  return useQuery<Incident[]>({
    queryKey: ['incidents', limit, decision],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (decision) params.set('decision', decision)
      return apiFetch<Incident[]>(`/api/v1/incidents?${params.toString()}`)
    },
    ...liveOptions,
  })
}

export function useIncidentDetail(id: string) {
  return useQuery<Incident>({
    queryKey: ['incident', id],
    queryFn: () => apiFetch<Incident>(`/api/v1/incidents/${id}`),
    enabled: !!id,
  })
}

export function useStats(window = '24h') {
  const liveOptions = useLiveQueryOptions()
  return useQuery<StatsResponse>({
    queryKey: ['stats', window],
    queryFn: () => apiFetch<StatsResponse>(`/api/v1/analytics/stats?window=${window}`),
    ...liveOptions,
  })
}

export function useCompliance() {
  return useQuery<Record<string, number>>({
    queryKey: ['compliance'],
    queryFn: () => apiFetch<Record<string, number>>('/api/v1/analytics/compliance'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useEndpointStats() {
  const liveOptions = useLiveQueryOptions()
  return useQuery<EndpointStat[]>({
    queryKey: ['endpoint-stats'],
    queryFn: () => apiFetch<EndpointStat[]>('/api/v1/analytics/endpoints-stats'),
    ...liveOptions,
  })
}
