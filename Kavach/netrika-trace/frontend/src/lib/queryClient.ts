import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      retry: 1,
    },
  },
})

/** Fallback polling when WebSocket is disconnected (dashboard live data). */
export const LIVE_QUERY_OPTIONS = {
  refetchInterval: 10_000,
  refetchIntervalInBackground: true,
} as const
