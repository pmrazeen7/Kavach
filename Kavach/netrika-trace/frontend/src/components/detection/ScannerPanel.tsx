import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Fingerprint, Plus, Scale, ShieldCheck, Siren, Trash2, X } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import { Sentinel, Vault } from '../scanner/Characters'
import { toast } from '../ui/Toast'
import { cn } from '../ui/cn'
import { addCanary, fetchSettings, ingestFingerprints, removeAllowed, saveSettings } from '../../scanner/client'
import type { CustomPattern, Policy, ScannerSettings } from '../../scanner/types'

const PROFILES: Array<{ id: Policy; title: string; blurb: string; points: string[] }> = [
  { id: 'strict', title: 'Strict', blurb: 'Nothing questionable leaves.', points: ['Unlabeled random tokens: block, ask to confirm', 'Aadhaar, PAN, SSN: redacted for good', 'Internal hostnames: redacted'] },
  { id: 'balanced', title: 'Balanced', blurb: 'The default.', points: ['Unlabeled random tokens: block, ask to confirm', 'Aadhaar, PAN, SSN: replaced by placeholders', 'Emails and phone numbers: warn only'] },
  { id: 'relaxed', title: 'Relaxed', blurb: 'Fewer interruptions.', points: ['Random tokens: warn only', 'Known-format secrets: replaced by placeholders', 'Cards and bank numbers: still redacted'] },
]

type Settings = ScannerSettings & { fingerprint_count: number; source_root: string }

function TagInput({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-fg">{label}</label>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-surface p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-fg">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full hover:bg-surface/60"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add()
            } else if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1))
          }}
          onBlur={add}
          placeholder={values.length ? '' : placeholder}
          aria-label={label}
          className="min-w-[140px] flex-1 bg-transparent px-1.5 py-1 text-sm text-fg outline-none placeholder:text-faint"
        />
      </div>
    </div>
  )
}

function validRegex(p: string): boolean {
  try {
    new RegExp(p)
    return true
  } catch {
    return false
  }
}

export default function ScannerPanel() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery<Settings>({ queryKey: ['scanner-settings'], queryFn: fetchSettings, retry: false })
  const [canary, setCanary] = useState<{ label: string; value: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [canaryLabel, setCanaryLabel] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [draft, setDraft] = useState<CustomPattern>({ name: '', pattern: '', category: 'business', action: 'WARN' })

  const save = useMutation({
    mutationFn: (patch: Partial<ScannerSettings>) => saveSettings(patch),
    onSuccess: (s) => {
      qc.setQueryData(['scanner-settings'], s)
      toast.success('Scanner settings saved')
    },
    onError: (e: Error) => toast.error('Could not save', e.message),
  })

  const ingest = useMutation({
    mutationFn: (paths: string[]) => ingestFingerprints(paths),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['scanner-settings'] })
      toast.success(`${r.fingerprints} secret${r.fingerprints === 1 ? '' : 's'} fingerprinted`, r.errors.length ? r.errors.join('; ') : `${r.files} file${r.files === 1 ? '' : 's'} read. Only hashes were stored.`)
    },
    onError: (e: Error) => toast.error('Fingerprinting failed', e.message),
  })

  const plant = useMutation({
    mutationFn: (label: string) => addCanary(label),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['scanner-settings'] })
      if (r.value) setCanary({ label: r.label, value: r.value })
    },
    onError: (e: Error) => toast.error('Could not plant the canary', e.message),
  })

  if (isLoading) return <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div>
  if (isError || !data) return <Card><EmptyState kind="error" title="Unable to load scanner settings" description={error instanceof Error ? error.message : undefined} /></Card>

  const s = data
  const patch = (p: Partial<ScannerSettings>) => save.mutate(p)
  const addPattern = () => {
    if (!draft.name.trim() || !draft.pattern.trim()) return
    if (!validRegex(draft.pattern)) return void toast.error('That pattern is not a valid regular expression')
    patch({ custom_patterns: [...s.custom_patterns, { ...draft, name: draft.name.trim() }] })
    setDraft({ name: '', pattern: '', category: 'business', action: 'WARN' })
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">Policy profile</h2>
            <p className="text-sm text-muted">Decides what each finding turns into: block, redact, replace with a placeholder, warn or allow.</p>
          </div>
          <Sentinel pose="safe" size={64} />
        </div>
        <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Policy profile">
          {PROFILES.map((p) => {
            const active = s.profile === p.id
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => !active && patch({ profile: p.id })}
                className={cn('rounded-2xl border p-4 text-left transition-colors', active ? 'border-accent bg-accent-soft/60' : 'border-line bg-surface hover:bg-subtle')}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-fg">{p.title}</span>
                  {active && <Check className="h-4 w-4 text-accent" />}
                </div>
                <p className="mt-0.5 text-xs text-muted">{p.blurb}</p>
                <ul className="mt-3 space-y-1.5 text-xs text-muted">
                  {p.points.map((pt) => <li key={pt} className="flex gap-1.5"><Scale className="mt-0.5 h-3 w-3 shrink-0 text-faint" />{pt}</li>)}
                </ul>
              </button>
            )
          })}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([
            ['tokenize', 'Reversible placeholders', 'Replace secrets with [SECRET_1] before sending and restore them in the reply, on the user\'s device. Off means irreversible masking.'],
            ['scan_output', 'Scan model replies', 'Mask sensitive data the model echoes or invents before it reaches the screen.'],
          ] as const).map(([key, title, desc]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-3.5">
              <input type="checkbox" checked={s[key]} onChange={(e) => patch({ [key]: e.target.checked })} className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" />
              <span><span className="block text-sm font-medium text-fg">{title}</span><span className="text-xs text-muted">{desc}</span></span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg"><Fingerprint className="h-4 w-4 text-accent" /> Your own secrets</h2>
            <p className="text-sm text-muted">The strongest defence: keyed hashes of your real secrets are matched anywhere in a message, even as a bare string. Only hashes are stored.</p>
          </div>
          <Badge tone="accent"><Vault pose="idle" size={18} /> {s.fingerprint_count} registered</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder={`Path to a .env or .json file inside ${s.source_root}/`}
            aria-label="Fingerprint source path"
            className="h-10 min-w-[240px] flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <Button onClick={() => sourcePath.trim() && patch({ fingerprint_sources: [...new Set([...s.fingerprint_sources, sourcePath.trim()])] })}><Plus className="h-4 w-4" /> Add source</Button>
          <Button variant="primary" disabled={ingest.isPending} onClick={() => ingest.mutate(s.fingerprint_sources)}>{ingest.isPending ? 'Fingerprinting…' : s.fingerprint_sources.length ? 'Fingerprint now' : 'Use project .env files'}</Button>
        </div>
        {s.fingerprint_sources.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {s.fingerprint_sources.map((p) => (
              <li key={p} className="flex items-center justify-between gap-2 rounded-xl bg-subtle px-3 py-2 font-mono text-xs text-muted">
                <span className="truncate">{p}</span>
                <button type="button" aria-label={`Remove ${p}`} onClick={() => patch({ fingerprint_sources: s.fingerprint_sources.filter((x) => x !== p) })} className="text-faint hover:text-danger"><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 border-t border-line pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg"><Siren className="h-4 w-4 text-warn" /> Canary tripwires</h3>
          <p className="mt-0.5 text-xs text-muted">Plant a fake credential somewhere an intruder or careless colleague might look. Any sighting in a prompt raises an alert and is always blocked.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input value={canaryLabel} onChange={(e) => setCanaryLabel(e.target.value)} placeholder="Label, e.g. shared-drive-honeypot" aria-label="Canary label" className="h-10 min-w-[220px] flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" />
            <Button disabled={plant.isPending} onClick={() => plant.mutate(canaryLabel.trim() || 'canary')}>Generate canary</Button>
          </div>
          {canary && (
            <div className="mt-3 rounded-2xl border border-warn/30 bg-warn-soft/60 p-3.5">
              <p className="text-xs font-medium text-warn-fg">Copy this now. It is shown once; only its fingerprint is kept.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 font-mono text-xs text-fg">{canary.value}</code>
                <Button size="sm" onClick={() => void navigator.clipboard.writeText(canary.value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCanary(null)}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-fg">Internal names</h2>
        <p className="mb-4 text-sm text-muted">Words that mean something only inside your company.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <TagInput label="Internal hostnames" values={s.internal_hosts} onChange={(v) => patch({ internal_hosts: v })} placeholder="db.corp.internal, then Enter" />
          <TagInput label="Project codenames" values={s.codenames} onChange={(v) => patch({ codenames: v })} placeholder="Project Falcon, then Enter" />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-fg">Custom patterns</h2>
        <p className="mb-4 text-sm text-muted">Your own regular expressions, for example employee or customer IDs.</p>
        {s.custom_patterns.length === 0 ? (
          <p className="mb-4 rounded-2xl bg-subtle px-4 py-3 text-sm text-muted">No custom patterns yet.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {s.custom_patterns.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line px-3.5 py-2.5">
                <span className="text-sm font-medium text-fg">{p.name}</span>
                <code className="min-w-0 flex-1 truncate rounded bg-subtle px-2 py-0.5 font-mono text-xs text-muted">{p.pattern}</code>
                <Badge>{p.category}</Badge>
                <Badge tone={p.action === 'BLOCK' ? 'danger' : p.action === 'WARN' ? 'warn' : 'accent'}>{p.action.toLowerCase()}</Badge>
                <button type="button" aria-label={`Delete ${p.name}`} onClick={() => patch({ custom_patterns: s.custom_patterns.filter((_, j) => j !== i) })} className="text-faint hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_auto_auto_auto]">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" aria-label="Pattern name" className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none" />
          <input value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} placeholder="EMP-\d{6}" aria-label="Regular expression" aria-invalid={!!draft.pattern && !validRegex(draft.pattern)} className={cn('h-10 rounded-xl border bg-surface px-3 font-mono text-sm text-fg placeholder:text-faint focus:outline-none', draft.pattern && !validRegex(draft.pattern) ? 'border-danger' : 'border-line focus:border-accent')} />
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as CustomPattern['category'] })} aria-label="Category" className="h-10 rounded-xl border border-line bg-surface px-2 text-sm text-fg">
            <option value="business">Business</option><option value="secret">Secret</option><option value="pii">Personal</option><option value="financial">Financial</option>
          </select>
          <select value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value as CustomPattern['action'] })} aria-label="Action" className="h-10 rounded-xl border border-line bg-surface px-2 text-sm text-fg">
            <option value="WARN">Warn</option><option value="TOKENIZE">Placeholder</option><option value="REDACT">Redact</option><option value="BLOCK">Block</option>
          </select>
          <Button variant="primary" onClick={addPattern}><Plus className="h-4 w-4" /> Add</Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg"><ShieldCheck className="h-4 w-4 text-success" /> Allowlist</h2>
        <p className="mb-4 text-sm text-muted">Tokens someone marked as safe. Only that exact token is skipped; known-format secrets and your own fingerprints can never be added.</p>
        {s.allowlist.length === 0 ? (
          <p className="rounded-2xl bg-subtle px-4 py-3 text-sm text-muted">Nothing allowlisted. Use "Mark as safe" on a finding in the chat to add one.</p>
        ) : (
          <ul className="space-y-1.5">
            {s.allowlist.map((fp) => (
              <li key={fp} className="flex items-center justify-between rounded-xl bg-subtle px-3 py-2 font-mono text-xs text-muted">
                <span>{fp.slice(0, 8)}…{fp.slice(-4)}</span>
                <button
                  type="button"
                  aria-label={`Remove allowlist entry ${fp.slice(0, 8)}`}
                  onClick={() => void removeAllowed(fp).then(() => qc.invalidateQueries({ queryKey: ['scanner-settings'] })).catch((e: Error) => toast.error('Could not remove', e.message))}
                  className="text-faint hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
