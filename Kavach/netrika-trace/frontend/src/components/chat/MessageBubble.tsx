import { motion } from 'framer-motion'
import { Bot, Settings, User } from 'lucide-react'
import type { ChatMessage } from '../../hooks/useChat'
import DlpBadge from './DlpBadge'
import { cn } from '../ui/cn'

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const Icon = isUser ? User : isSystem ? Settings : Bot

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
        {message.extractedPreview && (
          <div className="mt-2 max-h-28 overflow-auto rounded-2xl border border-line bg-subtle px-3 py-2 text-xs text-muted">
            <div className="mb-1 font-medium text-fg">Extracted text preview</div>
            {message.extractedPreview}
          </div>
        )}
        <DlpBadge dlp={message.dlp} />
      </div>
    </motion.div>
  )
}
