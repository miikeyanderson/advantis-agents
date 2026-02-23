import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import type { CredentialingApprovalDecision, CredentialingFindingDetail } from '../../../shared/types'

type ApprovalModalProps = {
  finding: CredentialingFindingDetail | null
  isSubmitting: boolean
  onDecision: (decision: CredentialingApprovalDecision, notes: string) => Promise<unknown>
}

export function ApprovalModalContent({
  finding,
  isSubmitting,
  onDecision,
  onClose,
}: ApprovalModalProps & {
  onClose?: () => void
}) {
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    setNotes('')
  }, [finding?.verification.id])

  if (!finding) {
    return null
  }

  const verification = finding.verification
  const evidenceSummary = JSON.stringify(verification.evidence.responseData, null, 2)

  const handleDecision = async (decision: CredentialingApprovalDecision) => {
    await onDecision(decision, notes)
    onClose?.()
  }

  return (
    <>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Review Finding</h2>
        <p className="text-sm text-muted-foreground">
          Review verification evidence and record a human approval decision.
        </p>
      </div>

      <div className="space-y-3 text-sm">
        <div className="rounded-[8px] border border-border/30 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">{verification.verificationType}</div>
            <Badge variant={verification.pass ? 'secondary' : 'destructive'}>
              {verification.pass ? 'Pass' : 'Fail'}
            </Badge>
          </div>
          <div className="text-muted-foreground">Source: {verification.source}</div>
          <div className="text-muted-foreground break-all">Evidence URL: {verification.evidence.sourceUrl}</div>
          <div className="text-muted-foreground">Evidence Timestamp: {verification.evidence.timestamp}</div>
        </div>

        <div className="rounded-[8px] border border-border/30 p-3">
          <div className="mb-2 font-medium">Evidence Summary</div>
          <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground max-h-40 overflow-auto">{evidenceSummary}</pre>
        </div>

        <div className="rounded-[8px] border border-border/30 p-3 space-y-2">
          <div className="font-medium">Notes</div>
          <textarea
            className="min-h-24 w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/30"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add reviewer notes"
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => onClose?.()}>
          Cancel
        </Button>
        <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => void handleDecision('approved')}>
          Approve
        </Button>
        <Button type="button" variant="destructive" disabled={isSubmitting} onClick={() => void handleDecision('rejected')}>
          Reject
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleDecision('waiver')}>
          Request Waiver
        </Button>
      </div>
    </>
  )
}

export function ApprovalModal({
  open,
  onOpenChange,
  finding,
  isSubmitting,
  onDecision,
}: ApprovalModalProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <ApprovalModalContent
          finding={finding}
          isSubmitting={isSubmitting}
          onDecision={onDecision}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
