import { describe, expect, it } from 'bun:test'
import { CaseState } from '../../../../../packages/credentialing/src/types.ts'
import type { Approval, Case, Document, Verification } from '../../../../../packages/credentialing/src/types.ts'
import { deriveUiStatusBucket, toCaseListViewModel, toDashboardViewModel } from '../viewmodels/credentialing-viewmodels.ts'

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-1',
    clinicianId: 'clin-1',
    facilityId: 'fac-1',
    state: CaseState.offer_accepted,
    startDate: null,
    templateVersion: 1,
    requiredDocTypesSnapshot: ['rn_license', 'tb_test'],
    requiredVerificationTypesSnapshot: ['nursys'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeDoc(docType: string, status: Document['status'] = 'pending'): Document {
  return {
    id: `doc-${docType}`,
    caseId: 'case-1',
    docType,
    status,
    fileRef: status === 'pending' ? null : `credentialing/case-1/docs/${docType}.pdf`,
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeVerification(pass: boolean): Verification {
  return {
    id: 'v-1',
    caseId: 'case-1',
    verificationType: 'nursys',
    source: 'nursys',
    pass,
    evidence: { sourceUrl: '', timestamp: '', responseData: {} },
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeApproval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: 'a-1',
    caseId: 'case-1',
    verificationId: 'v-1',
    decision: 'waiver',
    reviewer: 'reviewer-1',
    notes: 'Approved for demo',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function futureDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

describe('deriveUiStatusBucket', () => {
  it('returns cleared for cleared state', () => {
    const c = makeCase({ state: CaseState.cleared })
    expect(deriveUiStatusBucket(c, [], [])).toBe('cleared')
  })

  it('returns blocked when adverse verification finding exists', () => {
    const c = makeCase({ state: CaseState.verification_in_progress })
    const docs = [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'verified')]
    const verifs = [makeVerification(false)]
    expect(deriveUiStatusBucket(c, docs, verifs)).toBe('blocked')
  })

  it('returns at-risk when missing required docs and start in 14 days or less', () => {
    const c = makeCase({
      state: CaseState.documents_requested,
      startDate: futureDate(10),
    })
    const docs = [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'pending')]
    expect(deriveUiStatusBucket(c, docs, [])).toBe('at-risk')
  })

  it('returns active (not at-risk) when missing docs but start is more than 14 days away', () => {
    const c = makeCase({
      state: CaseState.documents_requested,
      startDate: futureDate(20),
    })
    const docs = [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'pending')]
    expect(deriveUiStatusBucket(c, docs, [])).toBe('active')
  })

  it('returns pending-submission for packet_assembled state with no blockers', () => {
    const c = makeCase({ state: CaseState.packet_assembled, startDate: futureDate(30) })
    const docs = [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'verified')]
    expect(deriveUiStatusBucket(c, docs, [])).toBe('pending-submission')
  })

  it('returns pending-submission for verification_complete state with no blockers', () => {
    const c = makeCase({ state: CaseState.verification_complete, startDate: futureDate(30) })
    const docs = [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'verified')]
    expect(deriveUiStatusBucket(c, docs, [])).toBe('pending-submission')
  })

  it('treats adverse findings with waiver approval as not blocked', () => {
    const c = makeCase({ state: CaseState.verification_complete, startDate: futureDate(30) })
    const docs = [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'verified')]
    const verifs = [makeVerification(false)]
    const approvals = [makeApproval({ verificationId: 'v-1', decision: 'waiver' })]
    expect(deriveUiStatusBucket(c, docs, verifs, approvals)).toBe('pending-submission')
  })

  it('returns with-facility for submitted state', () => {
    const c = makeCase({ state: CaseState.submitted })
    expect(deriveUiStatusBucket(c, [], [])).toBe('with-facility')
  })

  it('returns active for other states with no risk/blockers', () => {
    const c = makeCase({ state: CaseState.verification_in_progress, startDate: futureDate(30) })
    const docs = [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'verified')]
    expect(deriveUiStatusBucket(c, docs, [])).toBe('active')
  })

  it('blocked takes priority over at-risk', () => {
    const c = makeCase({
      state: CaseState.verification_in_progress,
      startDate: futureDate(5),
    })
    const docs = [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'pending')]
    const verifs = [makeVerification(false)]
    expect(deriveUiStatusBucket(c, docs, verifs)).toBe('blocked')
  })
})

describe('toCaseListViewModel sort order', () => {
  it('sorts by statusPriority ascending, then daysUntilStart, then lastName', () => {
    const items = [
      {
        case: makeCase({ id: 'c1', state: CaseState.submitted, startDate: futureDate(10) }),
        documents: [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'verified')],
        verifications: [],
        facilityName: 'Facility A',
        clinicianName: 'Bob Zane',
        clinicianProfession: 'RN',
      },
      {
        case: makeCase({ id: 'c2', state: CaseState.documents_requested, startDate: futureDate(5) }),
        documents: [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'pending')],
        verifications: [],
        facilityName: 'Facility B',
        clinicianName: 'Alice Aaron',
        clinicianProfession: 'RN',
      },
      {
        case: makeCase({ id: 'c3', state: CaseState.verification_in_progress, startDate: futureDate(30) }),
        documents: [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'verified')],
        verifications: [makeVerification(false)],
        facilityName: 'Facility C',
        clinicianName: 'Carol Smith',
        clinicianProfession: 'RN',
      },
    ]

    const sorted = toCaseListViewModel(items)
    expect(sorted[0]?.caseId).toBe('c2') // at-risk = 0
    expect(sorted[1]?.caseId).toBe('c3') // blocked = 1
    expect(sorted[2]?.caseId).toBe('c1') // with-facility = 3
  })

  it('filters out closed cases', () => {
    const items = [
      {
        case: makeCase({ id: 'c1', state: CaseState.closed }),
        documents: [],
        verifications: [],
        facilityName: 'F',
        clinicianName: 'Jane Doe',
        clinicianProfession: 'RN',
      },
      {
        case: makeCase({ id: 'c2', state: CaseState.submitted }),
        documents: [],
        verifications: [],
        facilityName: 'F',
        clinicianName: 'John Smith',
        clinicianProfession: 'RN',
      },
    ]
    const vms = toCaseListViewModel(items)
    expect(vms).toHaveLength(1)
    expect(vms[0]?.caseId).toBe('c2')
  })
})

describe('toDashboardViewModel status breakdown', () => {
  it('correctly counts status buckets', () => {
    const items = [
      {
        case: makeCase({ id: 'c1', state: CaseState.submitted }),
        documents: [],
        verifications: [],
        facilityName: 'F',
        clinicianName: 'Mike Brown',
        clinicianProfession: 'RN',
      },
      {
        case: makeCase({ id: 'c2', state: CaseState.cleared }),
        documents: [],
        verifications: [],
        facilityName: 'F',
        clinicianName: 'Amy Chen',
        clinicianProfession: 'RN',
      },
      {
        case: makeCase({ id: 'c3', state: CaseState.verification_in_progress, startDate: futureDate(30) }),
        documents: [makeDoc('rn_license', 'verified'), makeDoc('tb_test', 'verified')],
        verifications: [],
        facilityName: 'F',
        clinicianName: 'Sarah Johnson',
        clinicianProfession: 'RN',
      },
    ]

    const vm = toDashboardViewModel(items)
    expect(vm.totalFiles).toBe(3)
    expect(vm.statusBreakdown['with-facility']).toBe(1)
    expect(vm.statusBreakdown['cleared']).toBe(1)
    expect(vm.statusBreakdown['active']).toBe(1)
    expect(vm.statusBreakdown['at-risk']).toBe(0)
    expect(vm.statusBreakdown['blocked']).toBe(0)
  })
})
