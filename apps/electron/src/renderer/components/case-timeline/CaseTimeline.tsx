import { ArrowLeft, ChevronRight, Play, Send, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  CredentialingApproval,
  CredentialingCase,
  CredentialingCaseEvent,
  CredentialingCaseState,
  CredentialingDocument,
  CredentialingGuardResult,
  CredentialingVerification,
} from '../../../shared/types'
import { BlockerBanner } from './BlockerBanner'
import { DocumentChecklist } from './DocumentChecklist'
import { TimelineEvent } from './TimelineEvent'

function formatState(state: CredentialingCaseState): string {
  return state.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')
}

export function CaseTimeline({
  caseRecord,
  events,
  documents,
  verifications,
  approvals,
  nextState,
  guardResult,
  isBusy,
  onRefresh,
  onRunVerification,
  onAdvanceState,
  onReviewFinding,
  onBack,
}: {
  caseRecord: CredentialingCase
  events: CredentialingCaseEvent[]
  documents: CredentialingDocument[]
  verifications: CredentialingVerification[]
  approvals: CredentialingApproval[]
  nextState: CredentialingCaseState | null
  guardResult: CredentialingGuardResult | null
  isBusy: boolean
  onRefresh: () => Promise<void>
  onRunVerification: () => Promise<void>
  onAdvanceState: () => Promise<void>
  onReviewFinding: (verificationId: string) => void
  onBack: () => void
}) {
  const adverseFindings = verifications.filter((v) => !v.pass)
  const advanceEnabled = !!nextState && !!guardResult?.allowed && !isBusy

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-border/40 bg-background shadow-minimal p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Button type="button" variant="ghost" size="sm" onClick={onBack} className="-ml-2 w-fit">
              <ArrowLeft className="size-4" /> Back to Dashboard
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Case Timeline</h2>
              <Badge variant="outline">{caseRecord.id}</Badge>
              <Badge variant="secondary">{formatState(caseRecord.state)}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void onRefresh()} disabled={isBusy}>
              Refresh
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void onRunVerification()} disabled={isBusy}>
              <Play className="size-3.5" />
              Run Verification
            </Button>
            <Button type="button" size="sm" onClick={() => void onAdvanceState()} disabled={!advanceEnabled}>
              <Send className="size-3.5" />
              Advance State
              {nextState ? <ChevronRight className="size-3.5" /> : null}
            </Button>
          </div>
        </div>
      </div>

      <BlockerBanner caseId={caseRecord.id} targetState={nextState} guardResult={guardResult ?? undefined} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.3fr]">
        <div className="space-y-4">
          <DocumentChecklist caseRecord={caseRecord} documents={documents} />

          <div className="rounded-[8px] border border-border/40 bg-background shadow-minimal overflow-hidden">
            <div className="px-4 py-2 bg-foreground/3 border-b border-border/30">
              <div className="text-sm font-semibold">Findings</div>
              <div className="text-xs text-muted-foreground">Adverse verification results require review</div>
            </div>
            <div className="p-4 space-y-2">
              {adverseFindings.length === 0 ? (
                <div className="text-sm text-muted-foreground">No adverse findings.</div>
              ) : (
                adverseFindings.map((verification) => {
                  const latestApproval = approvals
                    .filter((approval) => approval.verificationId === verification.id)
                    .sort((a, b) => (a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt)))[0] ?? null
                  return (
                    <div key={verification.id} className="rounded-[6px] border border-border/30 px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <ShieldAlert className="size-4 text-destructive" />
                          {verification.verificationType}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {verification.source} • {latestApproval ? `Latest: ${latestApproval.decision}` : 'No approval yet'}
                        </div>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => onReviewFinding(verification.id)}>
                        Review Finding
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {events.length === 0 ? (
            <div className="rounded-[8px] border border-border/40 bg-background px-4 py-6 text-sm text-muted-foreground shadow-minimal">
              No timeline events yet.
            </div>
          ) : (
            events.map((event) => <TimelineEvent key={event.id} event={event} />)
          )}
        </div>
      </div>
    </div>
  )
}
