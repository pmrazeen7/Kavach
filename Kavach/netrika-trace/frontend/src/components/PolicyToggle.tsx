interface PolicyToggleProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export default function PolicyToggle({ label, description, checked, onChange }: PolicyToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-0">
      <div>
        <div className="text-sm font-medium text-fg">{label}</div>
        {description && <div className="mt-0.5 text-xs text-muted">{description}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-label={label}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${checked ? 'bg-accent' : 'bg-line'}`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}
