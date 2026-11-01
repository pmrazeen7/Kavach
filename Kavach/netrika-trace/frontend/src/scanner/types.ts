export type Action = 'ALLOW' | 'WARN' | 'TOKENIZE' | 'REDACT' | 'BLOCK'
export type Policy = 'strict' | 'balanced' | 'relaxed'
export type Category = 'secret' | 'key_material' | 'credential_url' | 'pii' | 'financial' | 'business' | 'suspicious' | 'fingerprint' | 'canary'

export const ACTION_RANK: Record<Action, number> = { ALLOW: 0, WARN: 1, TOKENIZE: 2, REDACT: 3, BLOCK: 4 }

export function maxAction(a: Action, b: Action): Action {
  return ACTION_RANK[a] >= ACTION_RANK[b] ? a : b
}

export interface Finding {
  layer: number
  type: string
  label: string
  category: Category
  /** UTF-16 offsets in the ORIGINAL text (what a textarea uses). */
  start: number
  end: number
  confidence: number
  reasons: string[]
  view: string
  allowlistable: boolean
  /** Keyed fingerprint. Only the server can compute it; local findings leave it empty. */
  fp: string
  masked: string
  action: Action
  needsConfirmation: boolean
  spansMessages: boolean
  /** Where the finding came from. */
  source?: 'local' | 'server'
}

export interface ScanResult {
  findings: Finding[]
  score: number
  action: Action
  policy: Policy
  needsConfirmation: boolean
  elapsedMs: number
  truncated: boolean
  layers: Record<string, number>
}

export interface CustomPattern {
  name: string
  pattern: string
  category: 'secret' | 'pii' | 'business' | 'financial'
  action: 'WARN' | 'REDACT' | 'TOKENIZE' | 'BLOCK'
}

export interface ScannerSettings {
  profile: Policy
  allowlist: string[]
  custom_patterns: CustomPattern[]
  fingerprint_sources: string[]
  internal_hosts: string[]
  codenames: string[]
  tokenize: boolean
  scan_output: boolean
}

export const DEFAULT_SETTINGS: ScannerSettings = {
  profile: 'balanced',
  allowlist: [],
  custom_patterns: [],
  fingerprint_sources: [],
  internal_hosts: [],
  codenames: [],
  tokenize: true,
  scan_output: true,
}

export interface ScanOptions {
  history?: string[]
  policy?: Policy
  /** Fingerprints the user confirmed safe for this send. */
  confirmed?: string[]
  settings?: ScannerSettings
}
