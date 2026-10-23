import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search as SearchIcon, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'

interface SearchIncident {
  id: string
  timestamp: string
  user_ip: string
  target_host: string
  risk_score: number
  decision: string
  intent_label: string
}

export default function Search() {
  const [query, setQuery] = useState('')
  const [searchParams] = useSearchParams()
  const [decision, setDecision] = useState(searchParams.get('decision') || '')
  const [results, setResults] = useState<SearchIncident[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const loadResults = useCallback(async (searchQuery: string, searchDecision: string) => {
    setSearching(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.append('q', searchQuery)
      if (searchDecision) params.append('decision', searchDecision)
      setResults(await apiFetch<SearchIncident[]>(`/api/v1/analytics/search?${params.toString()}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to search incidents')
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    void loadResults('', decision)
  }, [decision, loadResults])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    void loadResults(query, decision)
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Global Incident Search</h1>
        <p className="text-sm text-text-dim mt-1">
          Search persisted incidents by incident ID, destination, intent, and decision status.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[280px] relative">
          <SearchIcon className="w-5 h-5 text-text-dim absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by incident, host, IP, or intent..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-grapho-surface/80 border border-white/[0.1] text-text text-sm focus:outline-none focus:border-grapho-orange transition-all"
          />
        </div>

        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          className="px-4 py-3 rounded-2xl bg-grapho-surface/80 border border-white/[0.1] text-text text-sm focus:outline-none focus:border-grapho-orange transition-all"
        >
          <option value="">All Decisions</option>
          <option value="BLOCK">BLOCK</option>
          <option value="WARN">WARN</option>
          <option value="ALLOW">ALLOW</option>
        </select>

        <button
          type="submit"
          className="px-6 py-3 rounded-2xl bg-grapho-orange hover:bg-orange-600 text-white font-semibold text-sm transition-all shadow-lg shadow-orange-900/30"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={() => void loadResults(query, decision)} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      <div className="space-y-3">
        {results.map((inc) => (
          <motion.div
            key={inc.id}
            onClick={() => navigate(`/incidents/${inc.id}`)}
            className="p-4 rounded-xl bg-grapho-surface/60 border border-white/[0.06] hover:border-grapho-orange/40 transition-all cursor-pointer flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              {inc.decision === 'BLOCK' ? (
                <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
              ) : inc.decision === 'WARN' ? (
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              ) : (
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text truncate">{inc.intent_label || inc.id}</div>
                <div className="text-xs text-text-dim flex gap-3">
                  <span>Host: {inc.target_host}</span>
                  <span>IP: {inc.user_ip}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <span className="text-sm font-bold text-grapho-orange">{inc.risk_score}/100</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                inc.decision === 'BLOCK' ? 'bg-rose-500/20 text-rose-400' :
                inc.decision === 'WARN' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {inc.decision}
              </span>
            </div>
          </motion.div>
        ))}
        {!searching && !error && results.length === 0 && (
          <p className="rounded-xl border border-white/[0.06] p-6 text-center text-sm text-text-dim">
            No matching incidents. Submit a search or change the decision filter.
          </p>
        )}
      </div>
    </div>
  )
}
