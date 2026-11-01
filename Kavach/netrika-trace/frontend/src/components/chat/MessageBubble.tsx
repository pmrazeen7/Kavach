import { motion } from 'framer-motion'
import { Bot, KeyRound, Settings, ShieldAlert, User } from 'lucide-react'
import type { ChatMessage } from '../../hooks/useChat'
import DlpBadge from './DlpBadge'
import { cn } from '../ui/cn'

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const Icon = isUser ? User : isSystem ? Settings : Bot
  const outputFlagged = !isUser && !isSystem ? message.dlp?.output_flagged ?? 0 : 0

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('mb-4 flex', isUser ? 'justify-end pl-12' : 'justify-start pr-12')}>
      <div className="max-w-full">
        <div className={cn('mb-1 flex items-center gap-2 text-xs text-faint', isUser && 'justify-end')}>
          <Icon className="h-3.5 w-3.5" />
          <span className="font-medium text-muted">{isUser ? 'You' : isSystem ? 'System' : 'Gemini AI'}</span>
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-sm leading-relaxed',
            isUser ? 'rounded-br-lg bg-accent text-accent-on' : isSystem ? 'border border-danger/30 bg-danger-soft/60 text-danger-fg' : 'rounded-bl-lg border border-line bg-surface text-fg',
          )}
        >
          {message.content}
        </div>
        {!!message.restored && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent-fg">
            <KeyRound className="h-3 w-3" /> {message.restored} placeholder{message.restored === 1 ? '' : 's'} restored on this device
          </div>
        )}
        {outputFlagged > 0 && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-medium text-warn-fg">
            <ShieldAlert className="h-3 w-3" /> {outputFlagged} item{outputFlagged === 1 ? '' : 's'} in this reply masked by policy
          </div>
        )}
        {message.extractedPreview && (
          <div className="mt-2 max-h-28 overflow-auto rounded-2xl border border-line bg-subtle px-3 py-2 text-xs text-muted">
            <div className="mb-1 font-medium text-fg">Extracted text preview</div>
            {message.extractedPreview}
          </div>
        )}
        {(isUser || isSystem) && <DlpBadge dlp={message.dlp} />}
      </div>
    </motion.div>
  )
}
