import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Character from './ui/Character'
import { celebrate, toast } from './ui/Toast'

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
const IDLE_MS = 120_000

/** Hidden delights: the Konami code and a nap after two idle minutes. */
export default function EasterEggs() {
  const [party, setParty] = useState(false)
  const [asleep, setAsleep] = useState(false)
  const progress = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      progress.current = key === KONAMI[progress.current] ? progress.current + 1 : key === KONAMI[0] ? 1 : 0
      if (progress.current === KONAMI.length) {
        progress.current = 0
        setParty(true)
        celebrate()
        setTimeout(celebrate, 600)
        toast.success('Konami code unlocked', 'Kavi is very proud of you.')
        setTimeout(() => setParty(false), 4200)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let timer = setTimeout(() => setAsleep(true), IDLE_MS)
    const wake = () => {
      clearTimeout(timer)
      setAsleep(false)
      timer = setTimeout(() => setAsleep(true), IDLE_MS)
    }
    const events = ['pointermove', 'keydown', 'pointerdown', 'scroll'] as const
    events.forEach((ev) => window.addEventListener(ev, wake, { passive: true }))
    return () => {
      clearTimeout(timer)
      events.forEach((ev) => window.removeEventListener(ev, wake))
    }
  }, [])

  return (
    <>
      <AnimatePresence>
        {party && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden="true"
          >
            <motion.div initial={{ scale: 0.4, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 12 }}>
              <Character who="kavi" pose="celebrate" size={260} follow={false} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {asleep && (
          <motion.div
            className="pointer-events-none fixed bottom-4 left-4 z-[60]"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            aria-hidden="true"
          >
            <Character who="kavi" pose="sleep" size={84} follow={false} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
