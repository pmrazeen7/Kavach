export type Decision = 'ALLOW' | 'WARN' | 'BLOCK'

export interface EntityDetection {
  entity_type: string
  entity_count: number
  confidence_score: number | null
  detector_source: string
}

export interface Incident {
  id: string
  timestamp: string
  user_ip: string
  target_host: string
  target_url: string
  http_method: string
  risk_score: number
  decision: Decision
  intent_label: string
  entities_json: string
  code_detected: boolean
  payload_size_bytes: number
  simulation_html: string
  reviewed: boolean
  reviewed_by?: string
  notes?: string
  entity_detections?: EntityDetection[]
}

export interface IncidentStats {
  total: number
  blocked: number
  warned: number
  allowed: number
}

export interface HourlyData {
  hour: number
  timestamp: string
  BLOCK: number
  WARN: number
  ALLOW: number
}

export interface StatsResponse {
  stats: IncidentStats
  hourly: HourlyData[]
  entity_breakdown: Record<string, number>
  window: '1h' | '24h' | '7d' | '30d'
}

export interface EndpointInfo {
  id: number
  hostname: string
  display_name: string
  is_active: boolean
}

export interface PolicyConfig {
  block_threshold: number
  warn_threshold: number
  enable_code: boolean
  enable_secrets: boolean
  enable_pii: boolean
  enable_semantic: boolean
  enable_local_llm: boolean
}

export interface EndpointStat {
  hostname: string
  total: number
  blocked: number
  warned: number
}
