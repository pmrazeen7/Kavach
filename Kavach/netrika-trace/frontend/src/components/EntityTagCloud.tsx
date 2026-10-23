interface EntityTagCloudProps {
  entities: Record<string, number>
}

export default function EntityTagCloud({ entities }: EntityTagCloudProps) {
  const entries = Object.entries(entities)

  if (entries.length === 0) {
    return <div className="text-text-dim text-xs">No entities detected</div>
  }

  return (
    <div className="flex flex-wrap gap-2" id="entity-tags">
      {entries.map(([type, count]) => (
        <span
          key={type}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-dim border border-red/20 rounded text-[11px] text-red font-mono"
        >
          {type.replace(/_/g, ' ')}
          <span className="text-text-dim">×{count}</span>
        </span>
      ))}
    </div>
  )
}
