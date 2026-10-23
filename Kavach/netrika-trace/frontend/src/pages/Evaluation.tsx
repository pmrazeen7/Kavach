import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Target, BarChart2, Activity, Zap } from 'lucide-react'
import { apiFetch } from '../lib/api'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import StatCard, { type Aurora } from '../components/ui/StatCard'

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

  const metrics: Array<{ label: string; value: number | null; icon: typeof Target; aurora: Aurora }> = current
    ? [
        { label: 'Accuracy (%)', value: accuracy, icon: BarChart2, aurora: 'blue' },
        { label: 'Precision (%)', value: current.precision, icon: Target, aurora: 'mint' },
        { label: 'Recall (%)', value: current.recall, icon: Activity, aurora: 'peach' },
        { label: 'F1 score (%)', value: current.f1_score, icon: Zap, aurora: 'red' },
      ]
    : []

  return (
    <div className="space-y-5">
      <PageHeader title="Model evaluation" subtitle="Metrics are shown only for persisted evaluation runs." />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Loading evaluations">
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-36 rounded-2xl" />)}
        </div>
      ) : error ? (
        <Card>
          <EmptyState kind="error" title="Unable to load evaluations" description={error} action={<Button variant="primary" onClick={() => setRetry((v) => v + 1)}>Retry</Button>} />
        </Card>
      ) : !current || !cm ? (
        <Card>
          <EmptyState kind="empty" title="No evaluation results yet" description="Run an evaluation against a labeled dataset to see model metrics here." />
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted">
            {current.model_version} · {current.dataset_name} · {current.timestamp ? new Date(current.timestamp).toLocaleString() : 'Timestamp unavailable'} · {sampleCount.toLocaleString()} samples
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((m) => (
              <StatCard key={m.label} label={m.label} aurora={m.aurora} icon={<m.icon className="h-4 w-4" />} value={m.value === null ? null : Math.round(m.value * 1000) / 10} error={m.value === null} />
            ))}
          </div>

          <Card className="space-y-4 p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
              <BarChart2 className="h-4 w-4 text-accent" /> Confusion matrix
            </h2>
            <div className="grid max-w-lg grid-cols-2 gap-3">
              {[
                { label: 'True positives', key: 'TP' as const, tone: 'bg-success-soft text-success-fg' },
                { label: 'False positives', key: 'FP' as const, tone: 'bg-warn-soft text-warn-fg' },
                { label: 'False negatives', key: 'FN' as const, tone: 'bg-danger-soft text-danger-fg' },
                { label: 'True negatives', key: 'TN' as const, tone: 'bg-subtle text-fg' },
              ].map((item, i) => (
                <motion.div key={item.key} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} className={`rounded-xl p-4 text-center ${item.tone}`}>
                  <div className="text-xs font-medium opacity-80">{item.label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{cm[item.key]}</div>
                </motion.div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
