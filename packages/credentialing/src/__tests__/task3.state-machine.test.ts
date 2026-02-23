import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { CaseState, Database } from '../index.ts'
import {
  ApprovalRepository,
  CaseEventRepository,
  CaseRepository,
  ClinicianRepository,
  DocumentRepository,
  FacilityTemplateRepository,
  VerificationRepository,
} from '../repositories/index.ts'
import { GuardError, StateMachine, VALID_TRANSITIONS } from '../state-machine.ts'

describe('Task 3 state machine and guards', () => {
  let db: Database
  let clinicians: ClinicianRepository
  let cases: CaseRepository
  let documents: DocumentRepository
  let verifications: VerificationRepository
  let approvals: ApprovalRepository
  let templates: FacilityTemplateRepository
  let caseEvents: CaseEventRepository

  beforeEach(() => {
    db = new Database(':memory:')
    clinicians = new ClinicianRepository(db)
    cases = new CaseRepository(db)
    documents = new DocumentRepository(db)
    verifications = new VerificationRepository(db)
    approvals = new ApprovalRepository(db)
    templates = new FacilityTemplateRepository(db)
    caseEvents = new CaseEventRepository(db)
  })

  afterEach(() => db.close())

  function createCaseFixture() {
    const clinician = clinicians.create({
      name: 'Case Nurse',
      profession: 'RN',
      npi: '4444444444',
      primaryLicenseState: 'TX',
      primaryLicenseNumber: 'RN-444',
      email: 'case@example.com',
      phone: '555-4444',
    })
    const template = templates.create({
      name: 'General Hospital TX',
      jurisdiction: 'TX',
      requiredDocTypes: ['rn_license', 'bls_cert'],
      requiredVerificationTypes: ['nursys', 'oig_sam'],
    })
    return cases.create({
      clinicianId: clinician.id,
      facilityId: template.id,
      state: CaseState.offer_accepted,
      startDate: null,
    })
  }

  function createMachine(caseId: string) {
    return new StateMachine(caseId, {
      case: cases,
      document: documents,
      verification: verifications,
      approval: approvals,
      caseEvent: caseEvents,
    })
  }

  it('allows closed from any non-terminal state and blocks terminal transitions', async () => {
    for (const state of [
      CaseState.offer_accepted,
      CaseState.documents_requested,
      CaseState.documents_collected,
      CaseState.verification_in_progress,
      CaseState.verification_complete,
      CaseState.packet_assembled,
      CaseState.submitted,
    ]) {
      expect(VALID_TRANSITIONS[state]).toContain(CaseState.closed)
    }
    expect(VALID_TRANSITIONS[CaseState.cleared]).toEqual([])
    expect(VALID_TRANSITIONS[CaseState.closed]).toEqual([])
  })

  it('documents_collected guard uses latest document status and fileRef from snapshots', async () => {
    const c = createCaseFixture()
    cases.update(c.id, { state: CaseState.documents_requested })
    const machine = createMachine(c.id)

    let result = await machine.canTransition(CaseState.documents_collected)
    expect(result.allowed).toBeFalse()
    expect(`${result.blockers[0]?.type}`).toBe('missing_document')
    expect(result.blockers[0]?.docTypes).toEqual(['rn_license', 'bls_cert'])

    documents.create({
      caseId: c.id,
      docType: 'rn_license',
      status: 'received',
      fileRef: '/tmp/rn.pdf',
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    documents.create({
      caseId: c.id,
      docType: 'bls_cert',
      status: 'received',
      fileRef: '/tmp/bls.pdf',
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    documents.create({
      caseId: c.id,
      docType: 'bls_cert',
      status: 'rejected',
      fileRef: '/tmp/bls-rej.pdf',
      metadata: {},
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })

    result = await machine.canTransition(CaseState.documents_collected)
    expect(result.allowed).toBeFalse()
    expect(result.blockers[0]?.docTypes).toEqual(['bls_cert'])

    documents.create({
      caseId: c.id,
      docType: 'bls_cert',
      status: 'verified',
      fileRef: '/tmp/bls-fixed.pdf',
      metadata: {},
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    })

    result = await machine.canTransition(CaseState.documents_collected)
    expect(result.allowed).toBeTrue()
  })

  it('verification_complete ignores pass/fail but packet_assembled enforces latest approval decision', async () => {
    const c = createCaseFixture()
    cases.update(c.id, { state: CaseState.verification_in_progress })
    const machine = createMachine(c.id)

    verifications.create({
      caseId: c.id,
      verificationType: 'nursys',
      source: 'mock',
      pass: false,
      evidence: { sourceUrl: 'https://a', timestamp: '2026-01-01T00:00:00.000Z', responseData: {} },
    })
    let result = await machine.canTransition(CaseState.verification_complete)
    expect(result.allowed).toBeFalse()

    const adverse = verifications.create({
      caseId: c.id,
      verificationType: 'oig_sam',
      source: 'mock',
      pass: false,
      evidence: { sourceUrl: 'https://b', timestamp: '2026-01-01T00:00:00.000Z', responseData: {} },
    })

    result = await machine.canTransition(CaseState.verification_complete)
    expect(result.allowed).toBeTrue()

    cases.update(c.id, { state: CaseState.verification_complete })
    result = await machine.canTransition(CaseState.packet_assembled)
    expect(result.allowed).toBeFalse()
    expect(result.blockers.some((b) => b.type === 'missing_approval')).toBeTrue()

    approvals.create({
      caseId: c.id,
      verificationId: adverse.id,
      decision: 'waiver',
      reviewer: 'human-1',
      notes: 'waived',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    result = await machine.canTransition(CaseState.packet_assembled)
    expect(result.allowed).toBeFalse() // still blocked because nursys adverse lacks approval

    const nursys = verifications.getByType(c.id, 'nursys')[0]!
    approvals.create({
      caseId: c.id,
      verificationId: nursys.id,
      decision: 'waiver',
      reviewer: 'human-1',
      notes: 'waived',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    result = await machine.canTransition(CaseState.packet_assembled)
    expect(result.allowed).toBeTrue()

    approvals.create({
      caseId: c.id,
      verificationId: adverse.id,
      decision: 'rejected',
      reviewer: 'human-1',
      notes: 're-block',
      createdAt: '2026-01-02T00:00:00.000Z',
    })
    result = await machine.canTransition(CaseState.packet_assembled)
    expect(result.allowed).toBeFalse()
  })

  it('submitted guard requires case-level approval and transition writes atomic event', async () => {
    const c = createCaseFixture()
    // Fast-forward state for guard check
    const atPacket = cases.update(c.id, { state: CaseState.packet_assembled })
    const machine = createMachine(atPacket.id)

    let result = await machine.canTransition(CaseState.submitted)
    expect(result.allowed).toBeFalse()
    expect(`${result.blockers[0]?.type}`).toBe('missing_case_approval')

    approvals.create({
      caseId: c.id,
      verificationId: null,
      decision: 'approved',
      reviewer: 'human-2',
      notes: 'submit ok',
    })

    result = await machine.canTransition(CaseState.submitted)
    expect(result.allowed).toBeTrue()

    const transitioned = await machine.transition(CaseState.submitted, {
      actorType: 'human',
      actorId: 'human-2',
    })

    expect(transitioned.state).toBe(CaseState.submitted)
    const timeline = caseEvents.getTimeline(c.id)
    expect(timeline.at(-1)?.eventType).toBe('state_transition')
    expect(timeline.at(-1)?.payload).toEqual({
      fromState: CaseState.packet_assembled,
      toState: CaseState.submitted,
    })
  })

  it('close transition emits case_closed and GuardError when blocked', async () => {
    const c = createCaseFixture()
    const machine = createMachine(c.id)

    await expect(
      machine.transition(CaseState.documents_collected, {
        actorType: 'agent',
        actorId: 'agent-1',
      }),
    ).rejects.toBeInstanceOf(GuardError)

    const closed = await machine.transition(CaseState.closed, {
      actorType: 'human',
      actorId: 'human-1',
    })
    expect(closed.state).toBe(CaseState.closed)
    expect(caseEvents.getTimeline(c.id).at(-1)?.eventType).toBe('case_closed')
  })
})
