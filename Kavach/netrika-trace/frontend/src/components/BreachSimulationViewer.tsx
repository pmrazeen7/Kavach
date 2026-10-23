import { useEffect, useRef, useState } from 'react'

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
    <div className="bg-white/60 backdrop-blur-xl border border-white/60 border-l-4 border-l-red rounded-2xl p-6 shadow-sm relative overflow-hidden" id="breach-simulation">
      <div className="flex items-center gap-2 mb-4 relative z-10">
        <span className="text-red text-sm">⚠</span>
        <span className="label-uppercase text-red font-bold tracking-widest text-[10px]">
          BREACH SIMULATION — AI GENERATED
        </span>
      </div>

      {entities && Object.keys(entities).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5 relative z-10">
          {Object.entries(entities).map(([type, count]) => (
            <span
              key={type}
              className="px-2 py-1 bg-red/10 border border-red/20 rounded shadow-sm text-xs font-semibold text-red font-mono"
            >
              {type} ×{count}
            </span>
          ))}
        </div>
      )}

      <div className="font-mono text-sm text-text font-medium leading-[1.8] whitespace-pre-wrap relative z-10">
        {displayedText}
        {isTyping && <span className="inline-block w-2 h-4 bg-red animate-pulse ml-0.5 align-text-bottom" />}
      </div>

      <div className="text-right mt-6 text-[10px] text-text-dim font-bold tracking-wider relative z-10">
        SIMULATED — NOT REAL DATA
      </div>
    </div>
  )
}
