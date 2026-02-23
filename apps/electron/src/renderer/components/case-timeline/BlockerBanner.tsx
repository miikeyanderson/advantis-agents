import * as React from 'react'
import { AlertTriangle, CheckCircle2, RefreshCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { CredentialingCaseState, CredentialingGuardResult } from '../../../shared/types'

export function BlockerBanner({
  caseId,
  targetState,
  guardResult,
  onGuardResultChange,
}: {
  caseId: string
  targetState: CredentialingCaseState | null
  guardResult?: CredentialingGuardResult
  onGuardResultChange?: (result: CredentialingGuardResult | null) => void
}) {
  const [liveResult, setLiveResult] = React.useState<CredentialingGuardResult | null>(guardResult ?? null)
  const [isLoading, setIsLoading] = React.useState(false)
  const effective = guardResult ?? liveResult

  const refresh = React.useCallback(async () => {
    if (!targetState) {
      setLiveResult(null)
      onGuardResultChange?.(null)
      return
    }
    setIsLoading(true)
    try {
      const response = await window.electronAPI.credentialingCheckGuards(caseId, targetState)
      if (response.success) {
        setLiveResult(response.data)
        onGuardResultChange?.(response.data)
      }
    } finally {
      setIsLoading(false)
    }
  }, [caseId, onGuardResultChange, targetState])

  React.useEffect(() => {
    if (guardResult) {
      setLiveResult(guardResult)
      return
    }
    void refresh()
  }, [guardResult, refresh])

  if (!targetState) {
    return (
      <div className="rounded-[8px] border border-border/40 bg-background px-4 py-3 shadow-minimal text-sm text-muted-foreground">
        No further state transitions available from this state.
      </div>
    )
  }

  if (!effective) {
    return (
      <div className="rounded-[8px] border border-border/40 bg-background px-4 py-3 shadow-minimal text-sm text-muted-foreground">
        Checking blockers for {targetState}…
      </div>
    )
  }

  if (effective.allowed) {
    return (
      <div className="rounded-[8px] border border-success/20 bg-success/10 px-4 py-3 shadow-minimal flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" />
          Ready to advance to {targetState.replace(/_/g, ' ')}.
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={isLoading}>
          <RefreshCcw className="size-3.5" /> Refresh
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-[8px] border border-destructive/30 bg-destructive/10 px-4 py-3 shadow-minimal">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="size-4" />
          Blockers ({effective.blockers.length})
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={isLoading}>
          <RefreshCcw className="size-3.5" /> Refresh
        </Button>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-destructive">
        {effective.blockers.map((blocker, index) => (
          <li key={`${blocker.type}-${blocker.requiredItem}-${index}`}>
            {blocker.description}
            {blocker.docTypes && blocker.docTypes.length > 0 ? ` (${blocker.docTypes.join(', ')})` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
