import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Target, BarChart2, Activity, Zap } from 'lucide-react'
import { apiFetch } from '../lib/api'

interface EvaluationMetric {
  id: string
  model_version: string
  dataset_name: string
  precision: number
  recall: number
  f1_score: number
  confusion_matrix: { TP: number; FP: number; TN: number; FN: number }
  timestamp: string | null
}

export default function Evaluation() {
  const [evalData, setEvalData] = useState<EvaluationMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const loadEvaluations = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<EvaluationMetric[]>('/api/v1/eval/latest', { signal })
      setEvalData(data)
    } catch (err) {
      if (!signal.aborted) {
        setError(err instanceof Error ? err.message : 'Unable to load evaluation results')
      }
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadEvaluations(controller.signal)
    return () => controller.abort()
  }, [loadEvaluations, retry])

  const current = evalData[0]
  const cm = current?.confusion_matrix
  const sampleCount = cm ? cm.TP + cm.FP + cm.TN + cm.FN : 0
  const accuracy = cm && sampleCount > 0 ? (cm.TP + cm.TN) / sampleCount : null

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Model Evaluation</h1>
        <p className="text-sm text-text-dim mt-1">
          Metrics are shown only for persisted evaluation runs.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="Loading evaluations">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-36 rounded-2xl bg-subtle animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-6 text-sm text-danger-fg">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="mt-3 rounded-lg border border-danger/30 px-3 py-2 font-semibold hover:bg-rose-300/10"
          >
            Retry
          </button>
        </div>
      ) : !current || !cm ? (
        <div className="rounded-2xl border border-line bg-subtle p-8 text-center">
          <h2 className="text-lg font-semibold text-text">No evaluation results yet</h2>
          <p className="mt-2 text-sm text-text-dim">
            Run an evaluation against a labeled dataset to see model metrics here.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-text-dim">
            {current.model_version} · {current.dataset_name} · {current.timestamp
              ? new Date(current.timestamp).toLocaleString()
              : 'Timestamp unavailable'} · {sampleCount.toLocaleString()} samples
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Accuracy', value: accuracy, icon: BarChart2, color: 'text-sky-400' },
              { label: 'Precision', value: current.precision, icon: Target, color: 'text-success-fg' },
              { label: 'Recall', value: current.recall, icon: Activity, color: 'text-violet-400' },
              { label: 'F1 score', value: current.f1_score, icon: Zap, color: 'text-grapho-orange' },
            ].map((metric, index) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-6 rounded-2xl bg-grapho-surface/80 border border-line shadow-xl space-y-3"
              >
                <div className={`flex items-center justify-between ${metric.color}`}>
                  <span className="text-xs font-semibold uppercase tracking-wider">{metric.label}</span>
                  <metric.icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="text-3xl font-extrabold text-text">
                  {metric.value === null ? '—' : `${(metric.value * 100).toFixed(1)}%`}
                </div>
              </motion.div>
            ))}
          </div>

          <div className="p-6 rounded-2xl bg-grapho-surface/80 border border-line shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-text flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-grapho-orange" />
              Confusion matrix
            </h2>
            <div className="grid grid-cols-2 gap-3 max-w-lg">
              {[
                { label: 'True positives', key: 'TP' as const },
                { label: 'False positives', key: 'FP' as const },
                { label: 'False negatives', key: 'FN' as const },
                { label: 'True negatives', key: 'TN' as const },
              ].map((item) => (
                <div key={item.key} className="p-4 rounded-xl bg-subtle border border-line text-center">
                  <div className="text-xs font-bold text-text-dim">{item.label}</div>
                  <div className="text-2xl font-extrabold text-text mt-1">{cm[item.key]}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
