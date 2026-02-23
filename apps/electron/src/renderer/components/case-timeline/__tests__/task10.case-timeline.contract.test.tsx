import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import type {
  CredentialingApproval,
  CredentialingCase,
  CredentialingCaseEvent,
  CredentialingDocument,
  CredentialingGuardResult,
  CredentialingVerification,
} from '../../../../shared/types'
import { BlockerBanner } from '../BlockerBanner'
import { CaseTimeline } from '../CaseTimeline'
import { DocumentChecklist } from '../DocumentChecklist'
import { TimelineEvent } from '../TimelineEvent'

const caseRecord: CredentialingCase = {
  id: 'case-1',
  clinicianId: 'clinician-1',
  facilityId: 'facility-1',
  state: 'verification_complete',
  startDate: null,
  templateVersion: 1,
  requiredDocTypesSnapshot: ['rn_license', 'bls_cert'],
  requiredVerificationTypesSnapshot: ['nursys', 'oig_sam'],
  createdAt: '2026-02-23T10:00:00.000Z',
  updatedAt: '2026-02-23T12:00:00.000Z',
}

const documents: CredentialingDocument[] = [
  {
    id: 'doc-1',
    caseId: 'case-1',
    docType: 'rn_license',
    status: 'verified',
    fileRef: '/tmp/license.pdf',
    metadata: {},
    createdAt: '2026-02-23T10:00:00.000Z',
    updatedAt: '2026-02-23T10:30:00.000Z',
  },
]

const verifications: CredentialingVerification[] = [
  {
    id: 'ver-1',
    caseId: 'case-1',
    verificationType: 'nursys',
    source: 'mock:nursys',
    pass: true,
    evidence: {
      sourceUrl: 'https://example.com/nursys',
      timestamp: '2026-02-23T11:00:00.000Z',
      responseData: {},
    },
    createdAt: '2026-02-23T11:00:00.000Z',
  },
  {
    id: 'ver-2',
    caseId: 'case-1',
    verificationType: 'oig_sam',
    source: 'mock:oig',
    pass: false,
    evidence: {
      sourceUrl: 'https://example.com/oig',
      timestamp: '2026-02-23T11:05:00.000Z',
      responseData: {},
    },
    createdAt: '2026-02-23T11:05:00.000Z',
  },
]

const approvals: CredentialingApproval[] = []

const events: CredentialingCaseEvent[] = [
  {
    id: 'evt-1',
    caseId: 'case-1',
    eventType: 'state_transition',
    actorType: 'agent',
    actorId: 'agent-1',
    evidenceRef: null,
    payload: { fromState: 'documents_collected', toState: 'verification_in_progress' },
    timestamp: '2026-02-23T10:45:00.000Z',
  },
  {
    id: 'evt-2',
    caseId: 'case-1',
    eventType: 'case_closed',
    actorType: 'human',
    actorId: 'human-1',
    evidenceRef: null,
    payload: { reason: 'cancelled' },
    timestamp: '2026-02-23T12:30:00.000Z',
  },
]

const guardResult: CredentialingGuardResult = {
  allowed: false,
  blockers: [
    {
      type: 'missing_document',
      description: 'Missing required documents',
      requiredItem: 'documents',
      docTypes: ['bls_cert'],
    },
  ],
}

describe('Task 10 case timeline contracts', () => {
  it('renders timeline event variants including case_closed', () => {
    const html = renderToStaticMarkup(<TimelineEvent event={events[1]} />)
    expect(html).toContain('Case Closed')
    expect(html).toContain('human-1')
  })

  it('renders document checklist against required snapshot', () => {
    const html = renderToStaticMarkup(
      <DocumentChecklist caseRecord={caseRecord} documents={documents} />,
    )
    expect(html).toContain('Document Checklist')
    expect(html).toContain('rn_license')
    expect(html).toContain('bls_cert')
    expect(html).toContain('Missing')
    expect(html).toContain('Collected')
  })

  it('renders blocker banner details', () => {
    const html = renderToStaticMarkup(
      <BlockerBanner caseId="case-1" targetState="packet_assembled" guardResult={guardResult} />,
    )
    expect(html).toContain('Blockers')
    expect(html).toContain('Missing required documents')
    expect(html).toContain('bls_cert')
  })

  it('renders action buttons and review finding controls', () => {
    const html = renderToStaticMarkup(
      <CaseTimeline
        caseRecord={caseRecord}
        events={events}
        documents={documents}
        verifications={verifications}
        approvals={approvals}
        nextState="packet_assembled"
        guardResult={guardResult}
        isBusy={false}
        onRefresh={async () => {}}
        onRunVerification={async () => {}}
        onAdvanceState={async () => {}}
        onReviewFinding={() => {}}
        onBack={() => {}}
      />,
    )

    expect(html).toContain('Run Verification')
    expect(html).toContain('Advance State')
    expect(html).toContain('Review Finding')
    expect(html).toContain('Case Timeline')
  })
})
