import * as React from 'react'
import { cn } from '@/lib/utils'
import type { CaseDetailViewModel, UiStatusBucket } from '../../../shared/types'
import { STATUS_BANNER_CLASSES } from './status-styles'

const STATE_LABELS: Record<string, string> = {
  offer_accepted: 'Offer Accepted',
  documents_requested: 'Documents Requested',
  documents_collected: 'Documents Collected',
  verification_in_progress: 'Verification In Progress',
  verification_complete: 'Verification Complete',
  packet_assembled: 'Packet Assembled',
  submitted: 'Submitted',
  cleared: 'Cleared',
  closed: 'Closed',
}

interface OverviewTabProps {
  overview: CaseDetailViewModel['overview']
}

export function OverviewTab({ overview }: OverviewTabProps) {
  const bannerConfig = STATUS_BANNER_CLASSES[overview.derivedStatus] ?? STATUS_BANNER_CLASSES.active
  const categories = Object.entries(overview.completionByCategory)
  const overallPct = categories.length > 0
    ? Math.round(categories.reduce((sum, [, pct]) => sum + pct, 0) / categories.length)
    : 0

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto h-full">
      {/* Status Banner */}
      <div className={cn('flex items-center justify-between px-4 py-3 rounded-[8px] border', bannerConfig.banner)}>
        <div>
          <span className={cn('text-sm font-semibold', bannerConfig.color)}>
            {STATUS_BANNER_CLASSES[overview.derivedStatus]?.color ? statusLabel(overview.derivedStatus) : 'Active'}
          </span>
          <span className="text-xs text-muted-foreground ml-2">
            {STATE_LABELS[overview.state] ?? overview.state}
          </span>
        </div>
        <span className={cn('text-lg font-bold tabular-nums', bannerConfig.color)}>{overallPct}%</span>
      </div>

      {/* Overall Progress Bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">Overall Completion</span>
          <span className="text-xs font-medium text-foreground">{overallPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Completion by Category */}
      {categories.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Completion by Category
          </h3>
          <div className="flex flex-col gap-2">
            {categories.map(([category, pct]) => (
              <div key={category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground capitalize">{category.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-muted-foreground">{Math.round(pct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-all"
                    style={{ width: `${Math.round(pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Agents */}
      {overview.activeAgents.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Active Agents
          </h3>
          <div className="flex flex-col gap-1.5">
            {overview.activeAgents.map((agent) => (
              <div
                key={agent.sessionId}
                className="flex items-center justify-between px-3 py-2 rounded-[8px] bg-background shadow-minimal"
              >
                <span className="text-sm text-foreground">{agent.agentRole}</span>
                <span className="text-xs text-muted-foreground">Running</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Blockers */}
      {overview.blockers.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Blockers
          </h3>
          <div className="flex flex-col gap-1.5">
            {overview.blockers.map((blocker, idx) => (
              <div
                key={idx}
                className="px-3 py-2 rounded-[8px] border border-info/20 bg-info/10"
              >
                <p className="text-sm font-medium text-info">{blocker.requiredItem}</p>
                <p className="text-xs text-info mt-0.5">{blocker.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick Actions (disabled placeholders) */}
      {overview.quickActions.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Quick Actions
          </h3>
          <div className="flex flex-wrap gap-2">
            {overview.quickActions.map((action, idx) => (
              <button
                key={idx}
                disabled
                title="Coming in v2"
                className={cn(
                  'px-3 py-1.5 text-xs rounded-[6px] border border-border',
                  'text-muted-foreground bg-muted/40 cursor-not-allowed opacity-60'
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Quick actions coming in v2</p>
        </section>
      )}
    </div>
  )
}

function statusLabel(bucket: UiStatusBucket): string {
  const labels: Record<UiStatusBucket, string> = {
    'at-risk': 'At Risk',
    'blocked': 'Blocked',
    'pending-submission': 'Pending Submission',
    'with-facility': 'With Facility',
    'active': 'Active',
    'cleared': 'Cleared',
  }
  return labels[bucket]
}
