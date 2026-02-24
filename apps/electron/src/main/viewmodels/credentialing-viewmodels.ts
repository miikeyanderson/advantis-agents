import type { CaseManager } from '../case-manager'
import type {
  Approval,
  Case,
  Document,
  Verification,
} from '../../../../../packages/credentialing/src/types.ts'
import { CaseState } from '../../../../../packages/credentialing/src/types.ts'
import type {
  UiStatusBucket,
  CaseListItemViewModel,
  DashboardViewModel,
  CaseDetailViewModel,
  AttentionItem,
  StartDateGroup,
  DocumentChecklistItem,
  VerificationRow,
  BlockerItem,
  QuickAction,
  AgentStatus,
} from '../../shared/types'

const STATUS_PRIORITY: Record<UiStatusBucket, number> = {
  'at-risk': 0,
  'blocked': 1,
  'pending-submission': 2,
  'with-facility': 3,
  'active': 4,
  'cleared': 5,
}

const STATUS_LABELS: Record<UiStatusBucket, string> = {
  'at-risk': 'At Risk',
  'blocked': 'Blocked',
  'pending-submission': 'Pending Submission',
  'with-facility': 'With Facility',
  'active': 'Active',
  'cleared': 'Cleared',
}

const STATUS_FLAG_ICONS: Record<UiStatusBucket, string | null> = {
  'at-risk': '🔴',
  'blocked': '⚠️',
  'pending-submission': '📋',
  'with-facility': '🏥',
  'active': null,
  'cleared': '✅',
}

function hasUnresolvedAdverseFindings(
  verifications: Verification[],
  approvals: Approval[] = [],
): boolean {
  const latestDecisionByVerificationId = new Map<string, Approval['decision']>()
  for (const approval of approvals) {
    if (!approval.verificationId) continue
    latestDecisionByVerificationId.set(approval.verificationId, approval.decision)
  }

  return verifications.some((verification) => {
    if (verification.pass) return false
    const decision = latestDecisionByVerificationId.get(verification.id)
    return decision !== 'approved' && decision !== 'waiver'
  })
}

function hasMissingRequiredItems(caseData: Case, documents: Document[]): boolean {
  const requiredDocs = caseData.requiredDocTypesSnapshot
  for (const docType of requiredDocs) {
    const doc = documents.find(d => d.docType === docType)
    const hasUsableDoc =
      !!doc &&
      (doc.status === 'received' || doc.status === 'verified') &&
      !!doc.fileRef

    if (!hasUsableDoc) {
      return true
    }
  }
  return false
}

function computeDaysUntilStart(startDate: string | null): number {
  if (!startDate) return 999
  const start = new Date(startDate).getTime()
  const now = Date.now()
  return Math.ceil((start - now) / (1000 * 60 * 60 * 24))
}

export function deriveUiStatusBucket(
  caseData: Case,
  documents: Document[],
  verifications: Verification[],
  approvals: Approval[] = [],
): UiStatusBucket {
  if (caseData.state === CaseState.cleared) return 'cleared'
  if (caseData.state === CaseState.closed) return 'active' // closed not shown, fallback
  if (hasUnresolvedAdverseFindings(verifications, approvals)) return 'blocked'
  const daysUntilStart = computeDaysUntilStart(caseData.startDate)
  if (hasMissingRequiredItems(caseData, documents) && daysUntilStart <= 14) return 'at-risk'
  if (
    caseData.state === CaseState.verification_complete ||
    caseData.state === CaseState.packet_assembled
  ) return 'pending-submission'
  if (caseData.state === CaseState.submitted) return 'with-facility'
  return 'active'
}

type CaseWithRelated = {
  case: Case
  documents: Document[]
  verifications: Verification[]
  approvals?: Approval[]
  facilityName: string
  clinicianName: string
  clinicianProfession: string
}

export function toCaseListViewModel(
  items: CaseWithRelated[],
): CaseListItemViewModel[] {
  const vms: CaseListItemViewModel[] = items
    .filter(item => item.case.state !== CaseState.closed)
    .map(item => {
      const derivedStatus = deriveUiStatusBucket(
        item.case,
        item.documents,
        item.verifications,
        item.approvals,
      )
      const daysUntilStart = computeDaysUntilStart(item.case.startDate)
      return {
        caseId: item.case.id,
        clinicianName: item.clinicianName,
        profession: item.clinicianProfession,
        facilityName: item.facilityName,
        derivedStatus,
        statusLabel: STATUS_LABELS[derivedStatus],
        daysUntilStart,
        statusPriority: STATUS_PRIORITY[derivedStatus],
        flagIcon: STATUS_FLAG_ICONS[derivedStatus],
      }
    })

  // Sort: statusPriority asc, daysUntilStart asc, lastName alpha
  vms.sort((a, b) => {
    if (a.statusPriority !== b.statusPriority) return a.statusPriority - b.statusPriority
    if (a.daysUntilStart !== b.daysUntilStart) return a.daysUntilStart - b.daysUntilStart
    const aLast = a.clinicianName.split(' ').pop() ?? ''
    const bLast = b.clinicianName.split(' ').pop() ?? ''
    return aLast.localeCompare(bLast)
  })

  return vms
}

export function toDashboardViewModel(
  items: CaseWithRelated[],
): DashboardViewModel {
  const activeItems = items.filter(item => item.case.state !== CaseState.closed)

  const statusBreakdown: Record<UiStatusBucket, number> = {
    'at-risk': 0,
    'blocked': 0,
    'pending-submission': 0,
    'with-facility': 0,
    'active': 0,
    'cleared': 0,
  }

  const attentionItems: AttentionItem[] = []
  const upcomingGroups = new Map<string, StartDateGroup>()

  for (const item of activeItems) {
    const bucket = deriveUiStatusBucket(
      item.case,
      item.documents,
      item.verifications,
      item.approvals,
    )
    statusBreakdown[bucket]++

    const days = computeDaysUntilStart(item.case.startDate)

    if (bucket === 'at-risk') {
      attentionItems.push({
        caseId: item.case.id,
        clinicianName: item.clinicianName,
        reason: `Start date in ${days} days with missing documents`,
        urgency: 'high',
      })
    } else if (bucket === 'blocked') {
      attentionItems.push({
        caseId: item.case.id,
        clinicianName: item.clinicianName,
        reason: 'Adverse finding requires review',
        urgency: 'medium',
      })
    } else if (bucket === 'pending-submission' && days <= 7) {
      attentionItems.push({
        caseId: item.case.id,
        clinicianName: item.clinicianName,
        reason: 'Packet ready for submission',
        urgency: 'low',
      })
    }

    if (item.case.startDate && days > 0 && days <= 28) {
      const weekStart = new Date(item.case.startDate)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const weekLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const group = upcomingGroups.get(weekLabel) ?? { weekLabel, cases: [] }
      group.cases.push({
        caseId: item.case.id,
        clinicianName: item.clinicianName,
        startDate: item.case.startDate,
      })
      upcomingGroups.set(weekLabel, group)
    }
  }

  return {
    totalFiles: activeItems.length,
    statusBreakdown,
    attentionItems,
    agentActivity: [],
    upcomingStartDates: Array.from(upcomingGroups.values()),
  }
}

export function toCaseDetailViewModel(
  item: CaseWithRelated,
  caseManager: CaseManager,
): CaseDetailViewModel {
  const derivedStatus = deriveUiStatusBucket(
    item.case,
    item.documents,
    item.verifications,
    item.approvals,
  )

  const docsByType = new Map(item.documents.map(d => [d.docType, d]))
  const documents: DocumentChecklistItem[] = item.case.requiredDocTypesSnapshot.map(docType => {
    const doc = docsByType.get(docType)
    return {
      docType,
      label: docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      status: doc?.status ?? 'pending',
    }
  })

  const verifications: VerificationRow[] = item.verifications.map(v => ({
    verificationType: v.verificationType,
    source: v.source,
    pass: v.pass,
    lastChecked: v.createdAt,
  }))

  const totalDocs = item.case.requiredDocTypesSnapshot.length
  const verifiedDocs = documents.filter(d => d.status === 'verified').length
  const completionByCategory: Record<string, number> = {
    Documents: totalDocs > 0 ? Math.round((verifiedDocs / totalDocs) * 100) : 0,
    Verifications: item.verifications.length > 0
      ? Math.round((item.verifications.filter(v => v.pass).length / item.verifications.length) * 100)
      : 0,
  }

  const activeAgentSession = caseManager.getActiveCaseAgent(item.case.id)
  const activeAgents: AgentStatus[] = activeAgentSession
    ? [{
        agentRole: activeAgentSession.agentRole,
        sessionId: activeAgentSession.sessionId,
        createdAt: activeAgentSession.createdAt,
      }]
    : []

  const blockers: BlockerItem[] = item.verifications
    .filter((verification) =>
      hasUnresolvedAdverseFindings([verification], item.approvals ?? []),
    )
    .map(v => ({
      type: 'failed_verification',
      description: `${v.verificationType} verification failed`,
      requiredItem: v.verificationType,
    }))

  const quickActions: QuickAction[] = [
    { label: 'Transition State', disabled: true },
    { label: 'Record Approval', disabled: true },
    { label: 'Spawn Agent', disabled: true },
  ]

  return {
    header: {
      name: item.clinicianName,
      profession: item.clinicianProfession,
      facility: item.facilityName,
    },
    overview: {
      state: item.case.state as import('../../shared/types').CredentialingCaseState,
      derivedStatus,
      completionByCategory,
      activeAgents,
      blockers,
      quickActions,
    },
    documents,
    verifications,
  }
}

export async function buildCaseWithRelated(
  caseData: Case,
  caseManager: CaseManager,
): Promise<CaseWithRelated> {
  const clinician = caseManager.getClinicianById(caseData.clinicianId)
  const facility = caseManager.getFacilityTemplateById(caseData.facilityId)
  const documents = caseManager.getDocumentsByCaseId(caseData.id)
  const verifications = caseManager.getVerificationsByCaseId(caseData.id)
  const approvals = caseManager.getApprovalsByCaseId(caseData.id)

  return {
    case: caseData,
    documents,
    verifications,
    approvals,
    facilityName: facility?.name ?? 'Unknown Facility',
    clinicianName: clinician?.name ?? 'Unknown Clinician',
    clinicianProfession: clinician?.profession ?? '',
  }
}

/*
## Codex Review
1. Type safety: PASS - Removed credentialing route `as any` usage and tightened
   credentialing statusBucket IPC/preload filter typing to `UiStatusBucket`.
2. IPC contract: PASS - Preload credentialing ViewModel bridge methods match the
   ipcMain handlers and return ViewModel-only shapes (no raw domain entities).
3. State derivation: PASS - `deriveUiStatusBucket()` now respects unresolved
   adverse findings via approvals and requires usable document `fileRef` values
   for required-doc completeness, aligning better with FSM guard semantics.
4. Navigation: PASS - Credentialing route parsing/building now preserves filter
   segments (`credentialing/{filter}` and `/case/{id}`), and persistence key
   parsing supports credentialing states/details.
5. Data integrity: PASS - Demo seeding now assigns file refs to non-pending docs
   and adds case-level approval records for submitted/cleared demo cases.
6. Renderer patterns: PASS - Removed stale local credentialing filter/selection
   atoms from the new navigator flow; list/dashboard now derive from and drive
   `NavigationState` via routes.
7. Architecture: PASS - Main process remains the ViewModel boundary and renderer
   consumes only shared ViewModel types across IPC for the credentialing UI.
*/
