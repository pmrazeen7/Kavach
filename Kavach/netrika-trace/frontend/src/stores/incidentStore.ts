import { create } from 'zustand'
import type { Incident, IncidentStats } from '../types/incident'

interface IncidentStore {
  incidents: Incident[]
  stats: IncidentStats
  wsConnected: boolean
  addIncident: (incident: Incident) => void
  setIncidents: (incidents: Incident[]) => void
  setStats: (stats: IncidentStats) => void
  setWsConnected: (connected: boolean) => void
}

export const useIncidentStore = create<IncidentStore>((set) => ({
  incidents: [],
  stats: { total: 0, blocked: 0, warned: 0, allowed: 0 },
  wsConnected: false,

  addIncident: (incident) =>
    set((state) => {
      const updated = [incident, ...state.incidents].slice(0, 200)
      const newStats = { ...state.stats }
      newStats.total++
      if (incident.decision === 'BLOCK') newStats.blocked++
      else if (incident.decision === 'WARN') newStats.warned++
      else newStats.allowed++
      return { incidents: updated, stats: newStats }
    }),

  setIncidents: (incidents) => set({ incidents }),
  setStats: (stats) => set({ stats }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
}))
