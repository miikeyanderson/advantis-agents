import * as React from 'react'
import { Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ChecklistItemEditor({
  title,
  items,
  onChange,
}: {
  title: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  const [draft, setDraft] = React.useState('')

  return (
    <div className="rounded-[8px] border border-border/30 p-3 space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-2">
            <div className="flex-1 rounded-[6px] border border-border/30 bg-foreground/3 px-3 py-2 text-sm">
              {item}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(items.filter((value) => value !== item))}>
              <X className="size-4" />
              <span className="sr-only">Remove {item}</span>
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add item"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const value = draft.trim()
            if (!value) return
            if (items.includes(value)) return
            onChange([...items, value])
            setDraft('')
          }}
        >
          <Plus className="size-4" />
          Add Item
        </Button>
      </div>
    </div>
  )
}
