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

describe('Task 2 repositories', () => {
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

  afterEach(() => {
    db.close()
  })

  it('CaseRepository.create snapshots template requirements and returns generated ids', () => {
    const clinician = clinicians.create({
      name: 'Taylor RN',
      profession: 'RN',
      npi: '1234567890',
      primaryLicenseState: 'TX',
      primaryLicenseNumber: 'RN-123',
      email: 'taylor@example.com',
      phone: '555-1000',
    })

    const template = templates.create({
      name: 'General Hospital TX',
      jurisdiction: 'TX',
      requiredDocTypes: ['rn_license', 'bls_cert'],
      requiredVerificationTypes: ['nursys'],
    })

    const createdCase = cases.create({
      clinicianId: clinician.id,
      facilityId: template.id,
      state: CaseState.offer_accepted,
      startDate: '2026-03-01',
    })

    expect(clinician.id).toBeString()
    expect(template.id).toBeString()
    expect(createdCase.id).toBeString()
    expect(createdCase.templateVersion).toBe(1)
    expect(createdCase.requiredDocTypesSnapshot).toEqual(['rn_license', 'bls_cert'])
    expect(createdCase.requiredVerificationTypesSnapshot).toEqual(['nursys'])
  })

  it('returns latest document and latest approval by createdAt DESC, id DESC', () => {
    const clinician = clinicians.create({
      name: 'Jordan RN',
      profession: 'RN',
      npi: '2222222222',
      primaryLicenseState: 'TX',
      primaryLicenseNumber: 'RN-222',
      email: 'jordan@example.com',
      phone: '555-2000',
    })
    const template = templates.create({
      name: 'Template',
      jurisdiction: 'TX',
      requiredDocTypes: ['rn_license'],
      requiredVerificationTypes: ['nursys'],
    })
    const c = cases.create({
      clinicianId: clinician.id,
      facilityId: template.id,
      state: CaseState.offer_accepted,
      startDate: null,
    })

    const d1 = documents.create({
      caseId: c.id,
      docType: 'rn_license',
      status: 'received',
      fileRef: '/tmp/a.pdf',
      metadata: { seq: 1 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const d2 = documents.create({
      caseId: c.id,
      docType: 'rn_license',
      status: 'verified',
      fileRef: '/tmp/b.pdf',
      metadata: { seq: 2 },
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    })

    const v = verifications.create({
      caseId: c.id,
      verificationType: 'nursys',
      source: 'mock',
      pass: false,
      evidence: {
        sourceUrl: 'https://example.com',
        timestamp: '2026-01-01T00:00:00.000Z',
        responseData: {},
      },
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const a1 = approvals.create({
      caseId: c.id,
      verificationId: v.id,
      decision: 'rejected',
      reviewer: 'human-1',
      notes: 'nope',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const a2 = approvals.create({
      caseId: c.id,
      verificationId: v.id,
      decision: 'waiver',
      reviewer: 'human-1',
      notes: 'override',
      createdAt: '2026-01-01T00:00:01.000Z',
    })

    const latestDoc = documents.getLatestByDocType(c.id, 'rn_license')
    const latestApproval = approvals.getLatestByVerificationId(v.id)
    expect(latestDoc).not.toBeNull()
    expect(latestApproval).not.toBeNull()

    expect([d1.id, d2.id]).toContain(latestDoc!.id)
    expect(latestDoc!.metadata).toEqual({ seq: 2 })
    expect([a1.id, a2.id]).toContain(latestApproval!.id)
    expect(latestApproval!.decision).toBe('waiver')
  })

  it('returns case timeline ordered by timestamp asc and parses JSON payload', () => {
    const clinician = clinicians.create({
      name: 'Alex RN',
      profession: 'RN',
      npi: '3333333333',
      primaryLicenseState: 'TX',
      primaryLicenseNumber: 'RN-333',
      email: 'alex@example.com',
      phone: '555-3000',
    })
    const template = templates.create({
      name: 'Template',
      jurisdiction: 'TX',
      requiredDocTypes: [],
      requiredVerificationTypes: [],
    })
    const c = cases.create({
      clinicianId: clinician.id,
      facilityId: template.id,
      state: CaseState.offer_accepted,
      startDate: null,
    })

    caseEvents.create({
      caseId: c.id,
      eventType: 'case_created',
      actorType: 'human',
      actorId: 'h1',
      evidenceRef: null,
      payload: { order: 2 },
      timestamp: '2026-01-01T00:00:02.000Z',
    })
    caseEvents.create({
      caseId: c.id,
      eventType: 'state_transition',
      actorType: 'system',
      actorId: 's1',
      evidenceRef: null,
      payload: { order: 1 },
      timestamp: '2026-01-01T00:00:01.000Z',
    })

    const timeline = caseEvents.getTimeline(c.id)
    expect(timeline.map((event) => event.timestamp)).toEqual([
      '2026-01-01T00:00:01.000Z',
      '2026-01-01T00:00:02.000Z',
    ])
    expect(timeline[0]?.payload).toEqual({ order: 1 })
  })

  it('bumps facility template version monotonically on update and parses arrays on read', () => {
    const template = templates.create({
      name: 'General Hospital TX',
      jurisdiction: 'TX',
      requiredDocTypes: ['rn_license'],
      requiredVerificationTypes: ['nursys'],
    })

    const updated = templates.update(template.id, {
      requiredDocTypes: ['rn_license', 'bls_cert'],
    })

    expect(updated.version).toBe(2)
    expect(updated.requiredDocTypes).toEqual(['rn_license', 'bls_cert'])

    const updatedAgain = templates.update(template.id, {
      jurisdiction: 'CA',
      requiredVerificationTypes: ['nursys', 'oig_sam'],
    })
    expect(updatedAgain.version).toBe(3)
    expect(updatedAgain.jurisdiction).toBe('CA')
    expect(updatedAgain.requiredVerificationTypes).toEqual(['nursys', 'oig_sam'])
  })
})
