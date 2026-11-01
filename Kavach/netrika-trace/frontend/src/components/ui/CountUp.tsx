import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export default function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    if (reduced()) {
      setShown(value)
      from.current = value
      return
    }
    const start = performance.now()
    const origin = from.current
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const current = Math.round(origin + (value - origin) * eased)
      setShown(current)
      from.current = current
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <>{shown.toLocaleString()}</>
}
