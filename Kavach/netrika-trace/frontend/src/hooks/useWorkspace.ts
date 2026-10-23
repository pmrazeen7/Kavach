import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'

interface Me {
  user: { email?: string; role?: string }
  organization: { id: string; name: string; domain: string; license_tier: string }
}

export interface Device {
  id: string
  device_uuid: string
  user_id: string
  os: string
  browser: string
  ext_version: string
  last_seen: string | null
}

export function useMe() {
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => apiFetch<Me>('/api/v1/auth/me'),
    staleTime: 5 * 60_000,
  })
}

export function useDevices() {
  return useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => apiFetch<Device[]>('/api/v1/auth/devices'),
    staleTime: 60_000,
  })
}
