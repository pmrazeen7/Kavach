import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

interface BreachSimulationViewerProps {
  text: string
  entities?: Record<string, number>
}

const CHARS_PER_FRAME = 48

export default function BreachSimulationViewer({ text, entities }: BreachSimulationViewerProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(true)

  useEffect(() => {
    if (!text) return

    setDisplayedText('')
    setIsTyping(true)

    let index = 0
    let frameId = 0

    const tick = () => {
      index = Math.min(index + CHARS_PER_FRAME, text.length)
      setDisplayedText(text.slice(0, index))

      if (index >= text.length) {
        setIsTyping(false)
        return
      }

      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [text])

  if (!text) return null

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line border-l-4 border-l-danger bg-surface p-6 shadow-card" id="breach-simulation">
      <div className="relative z-10 mb-4 flex items-center gap-2 text-sm font-semibold text-danger-fg">
        <TriangleAlert className="h-4 w-4" />
        Breach simulation (AI generated)
      </div>

      {entities && Object.keys(entities).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5 relative z-10">
          {Object.entries(entities).map(([type, count]) => (
            <span
              key={type}
              className="rounded-full bg-danger-soft px-2.5 py-1 font-mono text-xs font-medium text-danger-fg"
            >
              {type} ×{count}
            </span>
          ))}
        </div>
      )}

      <div className="font-mono text-sm text-fg font-medium leading-[1.8] whitespace-pre-wrap relative z-10">
        {displayedText}
        {isTyping && <span className="inline-block w-2 h-4 bg-danger animate-pulse ml-0.5 align-text-bottom" />}
      </div>

      <div className="relative z-10 mt-6 text-right text-xs text-muted">
        Simulated, not real data
      </div>
    </div>
  )
}
