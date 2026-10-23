/// <reference lib="webworker" />
/** Web Worker: scanning never runs on the main thread, so typing cannot lag. */
import { init, scan } from './engine'
import type { ScanOptions, ScanResult } from './types'

export interface WorkerRequest {
  id: number
  text: string
  opts: ScanOptions
}
export type WorkerResponse = { id: number; result: ScanResult } | { id: number; error: string }

const ready = init()

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, text, opts } = e.data
  try {
    await ready
    ;(self as unknown as Worker).postMessage({ id, result: scan(text, opts) } satisfies WorkerResponse)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse)
  }
}
