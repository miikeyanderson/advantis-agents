export enum CaseState {
  offer_accepted = 'offer_accepted',
  documents_requested = 'documents_requested',
  documents_collected = 'documents_collected',
  verification_in_progress = 'verification_in_progress',
  verification_complete = 'verification_complete',
  packet_assembled = 'packet_assembled',
  submitted = 'submitted',
  cleared = 'cleared',
  closed = 'closed',
}

export enum BlockerType {
  missing_document = 'missing_document',
  failed_verification = 'failed_verification',
  missing_approval = 'missing_approval',
  missing_case_approval = 'missing_case_approval',
}

export interface Clinician {
  id: string
  name: string
  profession: string
  npi: string
  primaryLicenseState: string
  primaryLicenseNumber: string
  email: string
  phone: string
  createdAt: string
}

export interface Case {
  id: string
  clinicianId: string
  facilityId: string
  state: CaseState
  startDate: string | null
  templateVersion: number
  requiredDocTypesSnapshot: string[]
  requiredVerificationTypesSnapshot: string[]
  createdAt: string
  updatedAt: string
}

export interface Document {
  id: string
  caseId: string
  docType: string
  status: 'pending' | 'received' | 'verified' | 'rejected'
  fileRef: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface VerificationEvidence {
  sourceUrl: string
  timestamp: string
  responseData: Record<string, unknown>
}

export interface Verification {
  id: string
  caseId: string
  verificationType: string
  source: string
  pass: boolean
  evidence: VerificationEvidence
  createdAt: string
}

export interface Approval {
  id: string
  caseId: string
  verificationId: string | null
  decision: 'approved' | 'rejected' | 'waiver'
  reviewer: string
  notes: string
  createdAt: string
}

export interface FacilityTemplate {
  id: string
  name: string
  jurisdiction: string
  version: number
  requiredDocTypes: string[]
  requiredVerificationTypes: string[]
  createdAt: string
  updatedAt: string
}

export interface CaseEvent {
  id: string
  caseId: string
  eventType:
    | 'state_transition'
    | 'document_recorded'
    | 'verification_completed'
    | 'approval_recorded'
    | 'packet_assembled'
    | 'case_created'
    | 'case_closed'
  actorType: 'agent' | 'human' | 'system'
  actorId: string
  evidenceRef: string | null
  payload: Record<string, unknown>
  timestamp: string
}

export interface Blocker {
  type: BlockerType
  description: string
  requiredItem: string
  verificationId?: string
  docTypes?: string[]
}

export interface GuardResult {
  allowed: boolean
  blockers: Blocker[]
}
