import { useState } from 'react'
import { Activity, Bell, ShieldAlert } from 'lucide-react'
import Aurora, { type AuroraTone } from '../components/ui/Aurora'
import Badge, { DecisionBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Character, { CAST, type CharacterId, type Pose } from '../components/ui/Character'
import Drawer from '../components/ui/Drawer'
import EmptyState from '../components/ui/EmptyState'
import IconButton from '../components/ui/IconButton'
import { Logo, LogoMark, Wordmark } from '../components/ui/Logo'
import PageHeader from '../components/ui/PageHeader'
import Skeleton from '../components/ui/Skeleton'
import StatCard from '../components/ui/StatCard'
import Tabs from '../components/ui/Tabs'
import { celebrate, toast } from '../components/ui/Toast'
import { useTheme } from '../lib/theme'
import { Lens, Sentinel, Vault, type LensPose, type SentinelPose, type VaultPose } from '../components/scanner/Characters'
import { Link } from 'react-router-dom'

const SWATCHES: Array<{ group: string; tokens: Array<[string, string]> }> = [
  { group: 'Surfaces', tokens: [['bg', 'Page'], ['surface', 'Card'], ['subtle', 'Subtle'], ['line', 'Border']] },
  { group: 'Text', tokens: [['fg', 'Heading'], ['muted', 'Secondary'], ['faint', 'Caption'], ['ink', 'Ink']] },
  { group: 'Accent', tokens: [['accent', 'Accent'], ['accent-soft', 'Accent soft'], ['accent-fg', 'Accent text'], ['accent-deep', 'Accent deep']] },
  { group: 'Status', tokens: [['success', 'Success'], ['success-soft', 'Success soft'], ['warn', 'Warn'], ['warn-soft', 'Pending soft'], ['danger', 'Danger'], ['danger-soft', 'Failed soft']] },
  { group: 'Aurora', tokens: [['a-blue', 'Blue'], ['a-violet', 'Violet'], ['a-pink', 'Pink'], ['a-mint', 'Mint'], ['a-peach', 'Peach'], ['a-sun', 'Sun']] },
  { group: 'Charts', tokens: [['chart-1', 'Series 1'], ['chart-2', 'Series 2'], ['chart-3', 'Series 3'], ['chart-4', 'Series 4'], ['chart-5', 'Series 5']] },
]

const POSES: Pose[] = ['idle', 'wave', 'jump', 'think', 'celebrate', 'sleep']
const TONES: AuroraTone[] = ['blue', 'red', 'peach', 'mint']
const SENTINEL: SentinelPose[] = ['idle', 'scan', 'suspect', 'alert', 'blocked', 'safe']
const VAULT: VaultPose[] = ['idle', 'swallow', 'happy']
const LENS: LensPose[] = ['idle', 'explain']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-semibold text-fg">{title}</h2>
      {children}
    </section>
  )
}

export default function StyleGuide() {
  const { theme, toggle } = useTheme()
  const [tab, setTab] = useState<'a' | 'b'>('a')
  const [drawer, setDrawer] = useState(false)

  return (
    <div className="min-h-screen bg-bg px-6 py-10 text-fg">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/"><Wordmark /></Link>
          <Button onClick={toggle}>{theme === 'dark' ? 'Light' : 'Dark'} mode</Button>
        </div>
        <PageHeader title="Style guide" subtitle="Every token and component, rendered live from the single token file." />

        <Section title="Color tokens">
          <div className="space-y-5">
            {SWATCHES.map((g) => (
              <div key={g.group}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{g.group}</div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {g.tokens.map(([token, label]) => (
                    <div key={token} className="rounded-2xl border border-line bg-surface p-2">
                      <div className="h-12 rounded-xl border border-line" style={{ background: `rgb(var(--${token}))` }} />
                      <div className="mt-2 text-xs font-medium text-fg">{label}</div>
                      <div className="font-mono text-[11px] text-faint">--{token}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography (Inter)">
          <Card className="space-y-2 p-6">
            <div className="text-4xl font-extrabold tracking-tight">Display 36 / extrabold</div>
            <div className="text-2xl font-semibold tracking-tight">Page title 24 / semibold</div>
            <div className="text-base font-semibold">Card title 16 / semibold</div>
            <div className="text-sm text-fg">Body 14 / regular. The quick brown fox jumps over the lazy dog.</div>
            <div className="text-sm text-muted">Muted 14. Secondary copy and subtitles.</div>
            <div className="text-xs text-faint">Caption 12. Hints and timestamps.</div>
            <div className="font-mono text-xs text-muted">Mono 12 / JetBrains Mono</div>
          </Card>
        </Section>

        <Section title="Radii and elevation">
          <div className="flex flex-wrap gap-4">
            {[['xl', 'rounded-xl', '12px buttons, inputs'], ['2xl', 'rounded-2xl', '16px small cards'], ['3xl', 'rounded-3xl', '20px cards'], ['4xl', 'rounded-4xl', '28px hero panels'], ['full', 'rounded-full', 'pills']].map(([n, cls, d]) => (
              <div key={n} className={`flex h-24 w-40 flex-col items-center justify-center border border-line bg-surface text-center shadow-card ${cls}`}>
                <div className="text-sm font-semibold">{n}</div>
                <div className="text-xs text-muted">{d}</div>
              </div>
            ))}
            <div className="flex h-24 w-40 items-center justify-center rounded-3xl border border-line bg-surface text-sm font-semibold shadow-pop">shadow-pop</div>
          </div>
        </Section>

        <Section title="Buttons and controls">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="dark">Dark</Button>
            <Button variant="primary" disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <IconButton label="Notifications"><Bell className="h-[18px] w-[18px]" /></IconButton>
            <Tabs label="Demo tabs" tabs={[{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }]} value={tab} onChange={setTab} />
          </div>
        </Section>

        <Section title="Status pills">
          <div className="flex flex-wrap gap-2">
            <DecisionBadge decision="ALLOW" /><DecisionBadge decision="WARN" /><DecisionBadge decision="BLOCK" />
            <Badge tone="accent">Accent</Badge><Badge>Neutral</Badge>
          </div>
        </Section>

        <Section title="Stat cards with aurora">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TONES.map((t, i) => (
              <StatCard key={t} label={`Aurora ${t}`} aurora={t} icon={i % 2 ? <ShieldAlert className="h-4 w-4" /> : <Activity className="h-4 w-4" />} value={1284 - i * 311} spark={[3, 6, 4, 9, 7, 12, 10 - i]} />
            ))}
          </div>
          <Card className="relative mt-4 h-32 overflow-hidden"><Aurora tone="mix" strong /><div className="relative flex h-full items-center justify-center text-sm font-medium text-fg">Hero aurora</div></Card>
        </Section>

        <Section title="The crew">
          <div className="space-y-4">
            {(Object.keys(CAST) as CharacterId[]).map((id) => (
              <Card key={id} className="p-4">
                <div className="mb-2 flex items-baseline gap-2"><span className="font-semibold">{CAST[id].name}</span><span className="text-sm text-muted">{CAST[id].role}</span></div>
                <div className="flex flex-wrap gap-4">
                  {POSES.map((p) => (
                    <div key={p} className="flex flex-col items-center">
                      <Character who={id} pose={p} size={96} interactive />
                      <span className="text-xs text-muted">{p}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="The scanner crew">
          <Card className="space-y-5 p-4">
            {([['Sentinel', 'the guard robot', SENTINEL, (p: string) => <Sentinel pose={p as SentinelPose} size={96} />], ['Vault', 'swallows redacted secrets', VAULT, (p: string) => <Vault pose={p as VaultPose} size={96} />], ['Lens', 'explains why something was flagged', LENS, (p: string) => <Lens pose={p as LensPose} size={96} />]] as const).map(([name, role, poses, render]) => (
              <div key={name}>
                <div className="mb-2 flex items-baseline gap-2"><span className="font-semibold">{name}</span><span className="text-sm text-muted">{role}</span></div>
                <div className="flex flex-wrap gap-4">
                  {poses.map((p) => (
                    <div key={p} className="flex flex-col items-center">
                      {render(p)}
                      <span className="text-xs text-muted">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Badge tone="accent">Scanning…</Badge><Badge tone="success">Safe to send</Badge><Badge tone="warn">2 risks found</Badge><Badge tone="danger">Blocked</Badge><Badge>Protected</Badge>
              <span className="text-xs text-muted">Status chips: indigo scanning, mint safe, peach suspicious, pink-red blocked. Each also carries an icon and words, never color alone.</span>
            </div>
          </Card>
        </Section>

        <Section title="Brand">
          <div className="flex flex-wrap items-center gap-6">
            <Logo variant="full" size={64} animated label="Kavach lockup" />
            <Logo variant="full" size={64} theme="dark" className="rounded-2xl bg-ink p-3" label="Kavach lockup on dark" />
            <LogoMark size={24} /><LogoMark size={64} animated /><Wordmark />
            <LogoMark size={40} tint="blocked" tintKey="b" /><LogoMark size={40} tint="safe" tintKey="s" />
          </div>
          <p className="mt-3 text-xs text-muted">Animated below 32px is never allowed; at most two animated logos run at once. See docs/BRAND.md.</p>
        </Section>

        <Section title="Feedback">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => toast.success('Saved', 'Everything is up to date.')}>Success toast</Button>
            <Button onClick={() => toast.error('Something went wrong', 'Try again in a moment.')}>Error toast</Button>
            <Button onClick={() => toast.info('Heads up')}>Info toast</Button>
            <Button onClick={celebrate}>Confetti</Button>
            <Button onClick={() => setDrawer(true)}>Open drawer</Button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Card><EmptyState title="Nothing here yet" description="Empty state with illustration." /></Card>
            <Card><EmptyState kind="search" title="No results" description="Search state." /></Card>
            <Card><EmptyState kind="error" title="Something broke" description="Error state." /></Card>
          </div>
          <div className="mt-4 space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-16 w-full" /></div>
        </Section>
      </div>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Slide-over drawer" subtitle="The one overlay pattern">
        <p className="text-sm text-muted">Forms, tours and detail panels all use this component.</p>
      </Drawer>
    </div>
  )
}
