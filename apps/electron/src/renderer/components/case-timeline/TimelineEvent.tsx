import { ArrowRight, CheckCircle2, ClipboardCheck, FileText, ShieldAlert, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { CredentialingCaseEvent } from '../../../shared/types'

function formatLabel(value: string): string {
  return value.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')
}

function EventIcon({ eventType }: { eventType: CredentialingCaseEvent['eventType'] }) {
  switch (eventType) {
    case 'state_transition':
      return <ArrowRight className="size-4 text-accent" />
    case 'document_recorded':
      return <FileText className="size-4 text-info" />
    case 'verification_completed':
      return <ShieldAlert className="size-4 text-info" />
    case 'approval_recorded':
      return <ClipboardCheck className="size-4 text-success" />
    case 'packet_assembled':
      return <ClipboardCheck className="size-4 text-accent" />
    case 'case_closed':
      return <XCircle className="size-4 text-muted-foreground" />
    case 'case_created':
    default:
      return <CheckCircle2 className="size-4 text-success" />
  }
}

function getEventTitle(event: CredentialingCaseEvent): string {
  switch (event.eventType) {
    case 'state_transition':
      return 'State Transition'
    case 'document_recorded':
      return 'Document Recorded'
    case 'verification_completed':
      return 'Verification Completed'
    case 'approval_recorded':
      return 'Approval Recorded'
    case 'packet_assembled':
      return 'Packet Assembled'
    case 'case_closed':
      return 'Case Closed'
    case 'case_created':
      return 'Case Created'
    default:
      return formatLabel(event.eventType)
  }
}

function getEventSummary(event: CredentialingCaseEvent): string | null {
  if (event.eventType === 'state_transition') {
    const fromState = typeof event.payload.fromState === 'string' ? event.payload.fromState : null
    const toState = typeof event.payload.toState === 'string' ? event.payload.toState : null
    if (fromState && toState) {
      return `${formatLabel(fromState)} → ${formatLabel(toState)}`
    }
  }
  if (event.eventType === 'document_recorded') {
    const docType = typeof event.payload.docType === 'string' ? event.payload.docType : null
    const status = typeof event.payload.status === 'string' ? event.payload.status : null
    if (docType && status) {
      return `${docType} (${status})`
    }
  }
  if (event.eventType === 'verification_completed') {
    const verificationType = typeof event.payload.verificationType === 'string' ? event.payload.verificationType : null
    const pass = typeof event.payload.pass === 'boolean' ? event.payload.pass : null
    if (verificationType && pass !== null) {
      return `${verificationType} (${pass ? 'pass' : 'fail'})`
    }
  }
  if (event.eventType === 'approval_recorded') {
    const decision = typeof event.payload.decision === 'string' ? event.payload.decision : null
    if (decision) {
      return `Decision: ${formatLabel(decision)}`
    }
  }
  if (event.eventType === 'case_closed') {
    const reason = typeof event.payload.reason === 'string' ? event.payload.reason : null
    if (reason) {
      return `Reason: ${reason}`
    }
  }
  return null
}

export function TimelineEvent({ event }: { event: CredentialingCaseEvent }) {
  const summary = getEventSummary(event)
  return (
    <div className="flex gap-3 rounded-[8px] border border-border/30 bg-background px-3 py-3 shadow-minimal">
      <div className="mt-0.5 shrink-0 rounded-[6px] bg-foreground/5 p-1.5">
        <EventIcon eventType={event.eventType} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium">{getEventTitle(event)}</div>
          {event.eventType === 'verification_completed' && typeof event.payload.pass === 'boolean' ? (
            <Badge variant={event.payload.pass ? 'secondary' : 'destructive'}>
              {event.payload.pass ? 'Pass' : 'Fail'}
            </Badge>
          ) : null}
          {event.eventType === 'approval_recorded' && typeof event.payload.decision === 'string' ? (
            <Badge variant="secondary">{formatLabel(event.payload.decision)}</Badge>
          ) : null}
        </div>
        {summary ? <div className="mt-1 text-sm text-muted-foreground">{summary}</div> : null}
        <div className="mt-1 text-xs text-muted-foreground">
          {event.actorType}:{event.actorId} • {new Date(event.timestamp).toLocaleString()}
        </div>
      </div>
    </div>
  )
}
