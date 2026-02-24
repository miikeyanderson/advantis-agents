import * as React from 'react'
import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'

const PRE_PROMPT_CHIPS = [
  "What's blocking this file?",
  'Summarize verifications',
  'When will this be cleared?',
  'What should I do next?',
]

interface AgentTabProps {
  caseId: string
  clinicianName: string
  profession: string
  facility: string
}

export function AgentTab({ caseId, clinicianName, profession, facility }: AgentTabProps) {
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const context = `Case context: ${clinicianName} (${profession}) at ${facility}. Case ID: ${caseId}.`

  const handleChipClick = (chip: string) => {
    setInputValue(chip)
    textareaRef.current?.focus()
  }

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInputValue('')
    // Placeholder: in v2, wire to session IPC with case context
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Agent capabilities coming in v2. This tab will use a dedicated credentialing session with full case context.',
        },
      ])
    }, 500)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Context banner */}
      <div className="px-4 py-2 bg-muted/30 border-b border-border">
        <p className="text-xs text-muted-foreground">{context}</p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground text-center">
              Ask a question about this case or select a suggestion below
            </p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              'max-w-[85%] px-3 py-2 rounded-lg text-sm',
              msg.role === 'user'
                ? 'self-end bg-primary text-primary-foreground ml-auto'
                : 'self-start bg-muted text-foreground'
            )}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Pre-prompt chips */}
      <div className="px-4 py-2 flex flex-wrap gap-2 border-t border-border bg-background">
        {PRE_PROMPT_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => handleChipClick(chip)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border border-border',
              'text-muted-foreground hover:text-foreground hover:border-foreground/30',
              'transition-colors bg-background'
            )}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-border bg-background">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ask about this case..."
            className={cn(
              'flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
              'min-h-[60px] max-h-[120px]'
            )}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className={cn(
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            Send
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">Full agent integration coming in v2</p>
      </div>
    </div>
  )
}
