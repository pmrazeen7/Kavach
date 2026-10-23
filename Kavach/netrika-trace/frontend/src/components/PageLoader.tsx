import { motion } from 'framer-motion'
import { LogoMark } from './ui/Logo'
import Skeleton from './ui/Skeleton'

export default function PageLoader() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4" role="status" aria-label="Loading">
      <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
        <LogoMark size={44} />
      </motion.div>
      <Skeleton className="h-2 w-28" />
    </div>
  )
}
