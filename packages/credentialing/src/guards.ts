import type { GuardResult } from './types.ts'
import { BlockerType, CaseState } from './types.ts'
import type {
  ApprovalRepository,
  CaseRepository,
  DocumentRepository,
  VerificationRepository,
} from './repositories/index.ts'

type GuardRepos = {
  case: CaseRepository
  document: DocumentRepository
  verification: VerificationRepository
  approval: ApprovalRepository
}

function allowed(): GuardResult {
  return { allowed: true, blockers: [] }
}

export function checkDocumentsCollectedGuard(caseId: string, repos: GuardRepos): GuardResult {
  const caseRecord = repos.case.getById(caseId)
  if (!caseRecord) {
    return {
      allowed: false,
      blockers: [
        {
          type: BlockerType.missing_document,
          description: 'Case not found',
          requiredItem: caseId,
        },
      ],
    }
  }

  const missing = caseRecord.requiredDocTypesSnapshot.filter((docType) => {
    const latest = repos.document.getLatestByDocType(caseId, docType)
    if (!latest) return true
    const statusOk = latest.status === 'received' || latest.status === 'verified'
    return !statusOk || latest.fileRef == null
  })

  if (missing.length === 0) return allowed()

  return {
    allowed: false,
    blockers: [
      {
        type: BlockerType.missing_document,
        description: `Missing required documents: ${missing.join(', ')}`,
        requiredItem: missing.join(', '),
        docTypes: missing,
      },
    ],
  }
}

export function checkVerificationCompleteGuard(caseId: string, repos: GuardRepos): GuardResult {
  const caseRecord = repos.case.getById(caseId)
  if (!caseRecord) {
    return {
      allowed: false,
      blockers: [
        {
          type: BlockerType.failed_verification,
          description: 'Case not found',
          requiredItem: caseId,
        },
      ],
    }
  }

  const missingTypes = caseRecord.requiredVerificationTypesSnapshot.filter(
    (verificationType) => repos.verification.getByType(caseId, verificationType).length === 0,
  )

  if (missingTypes.length === 0) return allowed()

  return {
    allowed: false,
    blockers: missingTypes.map((verificationType) => ({
      type: BlockerType.failed_verification,
      description: `Missing verification record for ${verificationType}`,
      requiredItem: verificationType,
    })),
  }
}

export function checkPacketAssembledGuard(caseId: string, repos: GuardRepos): GuardResult {
  const verifications = repos.verification.getByCaseId(caseId)
  const blockers = verifications
    .filter((verification) => verification.pass === false)
    .flatMap((verification) => {
      const latestApproval = repos.approval.getLatestByVerificationId(verification.id)
      const cleared =
        latestApproval != null &&
        (latestApproval.decision === 'approved' || latestApproval.decision === 'waiver')
      if (cleared) return []
      return [
        {
          type: BlockerType.missing_approval,
          description: `Adverse finding requires approval for ${verification.verificationType}`,
          requiredItem: verification.verificationType,
          verificationId: verification.id,
        },
      ]
    })

  return blockers.length === 0 ? allowed() : { allowed: false, blockers }
}

export function checkSubmittedGuard(caseId: string, repos: GuardRepos): GuardResult {
  const latestCaseApproval = repos.approval
    .getByCaseId(caseId)
    .filter((approval) => approval.verificationId === null)
    .sort((a, b) => {
      if (a.createdAt === b.createdAt) return a.id < b.id ? 1 : -1
      return a.createdAt < b.createdAt ? 1 : -1
    })[0]

  if (latestCaseApproval && latestCaseApproval.decision === 'approved') {
    return allowed()
  }

  return {
    allowed: false,
    blockers: [
      {
        type: BlockerType.missing_case_approval,
        description: 'Case-level approval required before submission',
        requiredItem: 'case_approval',
      },
    ],
  }
}

export function checkTransitionGuards(
  caseId: string,
  targetState: CaseState,
  repos: GuardRepos,
): GuardResult {
  switch (targetState) {
    case CaseState.documents_collected:
      return checkDocumentsCollectedGuard(caseId, repos)
    case CaseState.verification_complete:
      return checkVerificationCompleteGuard(caseId, repos)
    case CaseState.packet_assembled:
      return checkPacketAssembledGuard(caseId, repos)
    case CaseState.submitted:
      return checkSubmittedGuard(caseId, repos)
    default:
      return allowed()
  }
}
