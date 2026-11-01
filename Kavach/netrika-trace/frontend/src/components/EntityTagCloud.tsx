import { Badge } from './ui/Badge'

interface EntityTagCloudProps {
  entities: Record<string, number>
}

export default function EntityTagCloud({ entities }: EntityTagCloudProps) {
  const entries = Object.entries(entities)

  if (entries.length === 0) {
    return <div className="text-sm text-muted">No entities detected</div>
  }

  return (
    <div className="flex flex-wrap gap-2" id="entity-tags">
      {entries.map(([type, count]) => (
        <Badge key={type} tone="danger">
          {type.replace(/_/g, ' ')}
          <span className="opacity-70">×{count}</span>
        </Badge>
      ))}
    </div>
  )
}
