import * as React from 'react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import type { VerificationRow } from '../../../shared/types'
import { PASS_FAIL_CLASSES } from './status-styles'

interface VerificationsTabProps {
  verifications: VerificationRow[]
}

export function VerificationsTab({ verifications }: VerificationsTabProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleRow = (idx: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }

  if (verifications.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">No verifications on record</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-5 overflow-y-auto h-full">
      <h3 className="text-sm font-medium text-foreground">Verification Status</h3>

      {/* Table header */}
      <div className="rounded-[8px] border border-border overflow-hidden">
        <div className="grid grid-cols-4 px-3 py-2 bg-muted/40 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground">Requirement</span>
          <span className="text-xs font-medium text-muted-foreground">Source</span>
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <span className="text-xs font-medium text-muted-foreground">Last Checked</span>
        </div>

        {/* Table rows */}
        {verifications.map((row, idx) => {
          const pf = row.pass ? PASS_FAIL_CLASSES.pass : PASS_FAIL_CLASSES.fail
          return (
            <div key={idx} className="border-b border-border last:border-b-0">
              {/* Main row */}
              <button
                className="w-full grid grid-cols-4 px-3 py-2.5 text-left hover:bg-muted/20 transition-colors"
                onClick={() => toggleRow(idx)}
              >
                <span className="text-sm text-foreground truncate pr-2">
                  {row.verificationType.replace(/_/g, ' ')}
                </span>
                <span className="text-sm text-muted-foreground truncate pr-2">{row.source}</span>
                <span className={cn('text-xs font-medium', pf.text)}>
                  {row.pass ? 'Pass' : 'Fail'}
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{row.lastChecked}</span>
                  <ChevronDown className={cn(
                    'h-3.5 w-3.5 text-muted-foreground/60 transition-transform',
                    expandedRows.has(idx) && 'rotate-180'
                  )} />
                </div>
              </button>

              {/* Expandable timeline row */}
              {expandedRows.has(idx) && (
                <div className="px-4 py-3 bg-muted/20 border-t border-border">
                  <div className="flex items-start gap-3">
                    <div className={cn('w-2.5 h-2.5 rounded-full mt-0.5 shrink-0', pf.dot)} />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {row.pass ? 'Verification passed' : 'Verification failed'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Source: {row.source} — {row.lastChecked}
                      </p>
                      <button
                        disabled
                        title="Coming in v2"
                        className={cn(
                          'mt-2 text-xs px-2.5 py-1 rounded-[6px] border border-border',
                          'text-muted-foreground bg-muted/40 cursor-not-allowed opacity-60'
                        )}
                      >
                        Override — Coming in v2
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
