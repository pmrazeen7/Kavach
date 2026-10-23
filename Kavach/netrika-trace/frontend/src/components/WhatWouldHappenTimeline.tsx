import { motion } from 'framer-motion'

const steps = [
  {
    number: 1,
    title: 'Your Data Leaks',
    description: 'Sensitive data transmitted to external AI service and stored on their servers',
    color: 'red',
    bgColor: 'bg-red/10',
    textColor: 'text-red',
  },
  {
    number: 2,
    title: 'Attacker Exploits',
    description: 'Threat actor harvests data via API breach, model extraction, or MITM attack',
    color: 'amber',
    bgColor: 'bg-amber/10',
    textColor: 'text-amber',
  },
  {
    number: 3,
    title: 'Damage Occurs',
    description: 'Identity theft, financial fraud, IP loss, DPDP Act penalties up to ₹250 Cr',
    color: 'red',
    bgColor: 'bg-red/10',
    textColor: 'text-red',
    pulse: true,
  },
]

export default function WhatWouldHappenTimeline() {
  return (
    <div id="timeline">
      <div className="panel-title mb-4">WHAT WOULD HAVE HAPPENED</div>
      <div className="flex gap-6">
        {steps.map((step, i) => (
          <motion.div
            key={step.number}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.2, duration: 0.4 }}
            className="flex-1 bg-white/60 backdrop-blur-md border border-white/60 p-6 text-center rounded-2xl shadow-sm relative overflow-hidden"
          >
            <div className={`absolute top-0 left-0 right-0 h-1 ${step.bgColor}`}></div>
            <div
              className={`w-10 h-10 rounded-full ${step.bgColor} ${step.textColor} inline-flex items-center justify-center font-display font-bold text-base mb-4 ${step.pulse ? 'pulse-red shadow-sm' : 'shadow-sm'}`}
            >
              {step.number}
            </div>
            <div className={`text-xs font-bold tracking-wider uppercase mb-2 ${step.textColor}`}>
              {step.title}
            </div>
            <div className="text-xs font-medium text-text-dim leading-relaxed">
              {step.description}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

