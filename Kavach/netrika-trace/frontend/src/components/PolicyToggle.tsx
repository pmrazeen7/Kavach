interface PolicyToggleProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export default function PolicyToggle({ label, description, checked, onChange }: PolicyToggleProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50">
      <div>
        <div className="text-sm text-text">{label}</div>
        {description && <div className="text-[9px] text-text-dim mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${
          checked ? 'bg-green' : 'bg-bg3 border border-border'
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
