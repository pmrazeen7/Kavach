import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search as SearchIcon } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { Decision } from '../types/incident'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import { DecisionBadge } from '../components/ui/Badge'

interface SearchIncident {
  id: string
  timestamp: string
  user_ip: string
  target_host: string
  risk_score: number
  decision: string
  intent_label: string
}

const fieldCls =
  'h-10 rounded-xl border border-line bg-surface px-3 text-sm text-fg transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export default function Search() {
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
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

  // Re-run when the decision filter or the ?q= from the command palette changes.
  const urlQuery = searchParams.get('q') || ''
  useEffect(() => {
    setQuery(urlQuery)
    void loadResults(urlQuery, decision)
  }, [decision, urlQuery, loadResults])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    void loadResults(query, decision)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Global incident search" subtitle="Search persisted incidents by incident ID, destination, intent, and decision status." />

      <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
        <div className="relative min-w-[260px] flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="text"
            aria-label="Search incidents"
            placeholder="Search by incident, host, IP, or intent…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${fieldCls} w-full pl-9`}
          />
        </div>
        <select aria-label="Decision filter" value={decision} onChange={(e) => setDecision(e.target.value)} className={fieldCls}>
          <option value="">All decisions</option>
          <option value="BLOCK">Blocked</option>
          <option value="WARN">Warned</option>
          <option value="ALLOW">Allowed</option>
        </select>
        <Button type="submit" variant="primary" disabled={searching}>{searching ? 'Searching…' : 'Search'}</Button>
      </form>

      {error && (
        <Card>
          <EmptyState kind="error" title="Search failed" description={error} action={<Button variant="primary" onClick={() => void loadResults(query, decision)}>Retry</Button>} />
        </Card>
      )}

      <div className="space-y-2.5">
        {searching && results.length === 0 && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
        {results.map((inc, i) => (
          <motion.button
            type="button"
            key={inc.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 10) * 0.03 }}
            onClick={() => navigate(`/incidents/${inc.id}`)}
            className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-accent/50"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fg">{inc.intent_label || inc.id}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                <span>Host: {inc.target_host}</span>
                <span>IP: {inc.user_ip}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <span className="text-sm font-semibold tabular-nums text-fg">{inc.risk_score}/100</span>
              <DecisionBadge decision={inc.decision as Decision} />
            </div>
          </motion.button>
        ))}
        {!searching && !error && results.length === 0 && (
          <Card>
            <EmptyState kind="search" title="No matching incidents" description="Submit a search or change the decision filter." />
          </Card>
        )}
      </div>
    </div>
  )
}
