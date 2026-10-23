import type { CSSProperties } from 'react'

interface Props {
  id: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
  tone: 'danger' | 'warn' | 'accent'
}

export default function Slider({ id, min, max, value, onChange, tone }: Props) {
  const pct = ((value - min) / (max - min)) * 100
  const color = `rgb(var(--${tone}))`
  const style = {
    '--slider-color': color,
    background: `linear-gradient(to right, ${color} ${pct}%, rgb(var(--subtle)) ${pct}%)`,
  } as CSSProperties
  return <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="slider w-full" style={style} />
}
