import { useState, useEffect } from 'react'
import { useIncidentStore } from '../../stores/incidentStore'

export default function TopBar() {
  const [time, setTime] = useState('')
  const wsConnected = useIncidentStore((s) => s.wsConnected)
  const stats = useIncidentStore((s) => s.stats)

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' IST'
      )
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header
      className="fixed top-4 left-4 right-4 h-[60px] bg-bg2 backdrop-blur-xl border border-border rounded-2xl flex items-center justify-between px-8 z-50 shadow-card"
      id="topbar"
    >
      {/* Logo */}
      <div className="font-sans font-bold text-xl tracking-wider text-text flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-500 shadow-sm flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-white"></div>
        </div>
        NETRIKA<span className="text-slate-400 font-light">TRACE</span>
      </div>

      {/* Status Pills */}
      <div className="flex items-center gap-4">
        <StatusPill
          label="PROXY"
          color={wsConnected ? 'green' : 'red'}
          blink={wsConnected}
        />
        <StatusPill
          label={`${stats.blocked} BLOCKED`}
          color={stats.blocked > 0 ? 'red' : 'green'}
          blink={false}
        />
        <StatusPill label="OLLAMA" color="amber" blink={false} />
        
        {/* Clock */}
        <div className="ml-4 pl-4 border-l border-border font-mono text-sm font-semibold text-text-dim tracking-widest bg-subtle px-3 py-1.5 rounded-lg shadow-sm">
          {time}
        </div>
      </div>
    </header>
  )
}

function StatusPill({
  label,
  color,
  blink,
}: {
  label: string
  color: 'green' | 'red' | 'amber'
  blink: boolean
}) {
  const dotColor = {
    green: 'bg-green',
    red: 'bg-red',
    amber: 'bg-amber',
  }[color]

  return (
    <div className="flex items-center gap-2 bg-subtle backdrop-blur-md px-3 py-1.5 rounded-full border border-line shadow-sm">
      <span
        className={`w-2 h-2 rounded-full shadow-sm ${dotColor} ${blink ? 'dot-blink' : ''}`}
      />
      <span className="label-uppercase text-text-dim font-bold">{label}</span>
    </div>
  )
}
