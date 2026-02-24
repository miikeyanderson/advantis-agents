import * as React from 'react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { DocumentChecklistItem } from '../../../shared/types'
import { DOC_STATUS_CLASSES } from './status-styles'

interface DocumentsTabProps {
  documents: DocumentChecklistItem[]
}

export function DocumentsTab({ documents }: DocumentsTabProps) {
  const [showFileBrowser, setShowFileBrowser] = useState(false)

  const verified = documents.filter(d => d.status === 'verified').length
  const total = documents.length

  return (
    <div className="flex flex-col gap-4 p-5 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Requirements Checklist</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {verified} of {total} verified
          </p>
        </div>
        <button
          onClick={() => setShowFileBrowser(!showFileBrowser)}
          disabled
          title="Coming in v2"
          className={cn(
            'text-xs px-3 py-1.5 rounded-[6px] border border-border',
            'text-muted-foreground bg-muted/40 cursor-not-allowed opacity-60'
          )}
        >
          {showFileBrowser ? 'Hide' : 'View'} Files
        </button>
      </div>

      {/* File Browser Placeholder */}
      {showFileBrowser && (
        <div className="px-4 py-6 rounded-[8px] border border-dashed border-border text-center">
          <p className="text-sm text-muted-foreground">File browser coming in v2</p>
        </div>
      )}

      {/* Checklist */}
      {documents.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">No documents required</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {documents.map((doc) => {
            const config = DOC_STATUS_CLASSES[doc.status]
            return (
              <div
                key={doc.docType}
                className="flex items-center justify-between px-3 py-2.5 rounded-[8px] bg-background shadow-minimal"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', config.dot)} />
                  <span className="text-sm text-foreground truncate">{doc.label}</span>
                </div>
                <span className={cn('text-xs font-medium shrink-0 ml-3', config.color)}>
                  {config.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
