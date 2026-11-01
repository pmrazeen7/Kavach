import { motion } from 'framer-motion'

const steps = [
  { number: 1, title: 'Your data leaks', description: 'Sensitive data is sent to an external AI service and stored on their servers.', tone: 'bg-danger-soft text-danger-fg' },
  { number: 2, title: 'Attacker exploits', description: 'A threat actor harvests data via API breach, model extraction, or MITM attack.', tone: 'bg-warn-soft text-warn-fg' },
  { number: 3, title: 'Damage occurs', description: 'Identity theft, financial fraud, IP loss, and DPDP Act penalties up to ₹250 Cr.', tone: 'bg-danger-soft text-danger-fg' },
]

export default function WhatWouldHappenTimeline() {
  return (
    <section id="timeline">
      <h2 className="mb-3 text-base font-semibold text-fg">What would have happened</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((step, i) => (
          <motion.div
            key={step.number}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12, duration: 0.35 }}
            className="rounded-2xl border border-line bg-surface p-5 shadow-card"
          >
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${step.tone}`}>{step.number}</div>
            <div className="mb-1 text-sm font-semibold text-fg">{step.title}</div>
            <div className="text-sm leading-relaxed text-muted">{step.description}</div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
