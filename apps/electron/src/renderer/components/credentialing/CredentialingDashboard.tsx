import * as React from 'react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { DashboardViewModel, UiStatusBucket } from '../../../shared/types'
import { useNavigation, routes } from '@/contexts/NavigationContext'
import { STATUS_BADGE_CLASSES, URGENCY_CLASSES } from './status-styles'

const STATUS_ORDER: UiStatusBucket[] = ['at-risk', 'blocked', 'pending-submission', 'with-facility', 'active', 'cleared']

export function CredentialingDashboard() {
  const [data, setData] = useState<DashboardViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const { navigate } = useNavigation()

  useEffect(() => {
    setLoading(true)
    window.electronAPI.credentialingGetDashboard()
      .then((result: DashboardViewModel) => {
        setData(result)
      })
      .catch((err: unknown) => {
        console.error('[CredentialingDashboard] fetch error', err)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Loading dashboard...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Failed to load dashboard</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Credentialing Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data.totalFiles} active {data.totalFiles === 1 ? 'file' : 'files'}
        </p>
      </div>

      {/* Status Breakdown */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Status Breakdown
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_ORDER.map((bucket) => {
            const config = STATUS_BADGE_CLASSES[bucket]
            const count = data.statusBreakdown[bucket] ?? 0
            return (
              <button
                key={bucket}
                onClick={() => navigate(routes.view.credentialing(bucket))}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-[8px] text-left',
                  'hover:opacity-80 transition-opacity cursor-pointer shadow-minimal',
                  config.bg
                )}
              >
                <span className={cn('text-sm font-medium', config.color)}>
                  {config.label}
                </span>
                <span className={cn('text-sm font-bold tabular-nums', config.color)}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Requires Your Attention */}
      {data.attentionItems.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Requires Your Attention
          </h2>
          <div className="flex flex-col gap-2">
            {data.attentionItems.map((item) => (
              <div
                key={item.caseId}
                className="flex flex-col gap-1 px-3 py-2 rounded-[8px] bg-background shadow-minimal"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{item.clinicianName}</span>
                  <span className={cn('text-xs font-medium', URGENCY_CLASSES[item.urgency] ?? 'text-muted-foreground')}>
                    {item.urgency.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{item.reason}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => navigate(routes.view.credentialing('at-risk'))}
              className="text-xs px-3 py-1.5 rounded-[6px] border border-destructive/20 text-destructive hover:bg-destructive/5 transition-colors"
            >
              View At-Risk Files
            </button>
            <button
              onClick={() => navigate(routes.view.credentialing('blocked'))}
              className="text-xs px-3 py-1.5 rounded-[6px] border border-info/20 text-info hover:bg-info/5 transition-colors"
            >
              Review Adverse Findings
            </button>
          </div>
        </section>
      )}

      {/* Agent Activity */}
      {data.agentActivity.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Agent Activity (Last 24 Hours)
          </h2>
          <div className="flex flex-col gap-2">
            {data.agentActivity.map((item, idx) => (
              <div
                key={`${item.caseId}-${idx}`}
                className="flex flex-col gap-1 px-3 py-2 rounded-[8px] bg-background shadow-minimal"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{item.clinicianName}</span>
                  <span className="text-xs text-muted-foreground">{item.agentRole}</span>
                </div>
                <p className="text-xs text-muted-foreground">{item.summary}</p>
                <p className="text-xs text-muted-foreground/60">{item.timestamp}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Start Dates */}
      {data.upcomingStartDates.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Upcoming Start Dates
          </h2>
          <div className="flex flex-col gap-4">
            {data.upcomingStartDates.map((group) => (
              <div key={group.weekLabel}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{group.weekLabel}</p>
                <div className="flex flex-col gap-1">
                  {group.cases.map((c) => (
                    <div
                      key={c.caseId}
                      className="flex items-center justify-between px-3 py-1.5 rounded-[8px] bg-background shadow-minimal"
                    >
                      <span className="text-sm text-foreground">{c.clinicianName}</span>
                      <span className="text-xs text-muted-foreground">{c.startDate}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state for no attention items + no activity */}
      {data.attentionItems.length === 0 && data.agentActivity.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm font-medium text-foreground">All files on track</p>
          <p className="text-xs text-muted-foreground mt-1">No items require immediate attention</p>
        </div>
      )}
    </div>
  )
}
