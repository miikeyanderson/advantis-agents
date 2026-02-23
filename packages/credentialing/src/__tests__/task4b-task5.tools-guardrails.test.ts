import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Database } from '../database.ts'
import { validateEvidence } from '../guardrails.ts'
import type { CredentialingSessionPrincipal } from '../mcp-server.ts'
import { CredentialingMcpServer } from '../mcp-server.ts'
import { FacilityTemplateRepository } from '../repositories/index.ts'
import { CaseState } from '../types.ts'

describe('Task 4b + Task 5 tools and guardrails', () => {
  let workspacePath: string
  let db: Database
  let server: CredentialingMcpServer
  let principal: CredentialingSessionPrincipal | null
  let templateId: string

  beforeEach(() => {
    workspacePath = mkdtempSync(join(tmpdir(), 'advantis-cred-'))
    db = new Database(':memory:')
    principal = { actorType: 'human', actorId: 'human-1', humanUserId: 'human-1' }
    server = new CredentialingMcpServer({
      db,
      workspacePath,
      getSessionPrincipal: () => principal,
    })
    const templates = new FacilityTemplateRepository(db)
    templateId = templates.create({
      name: 'General Hospital TX',
      jurisdiction: 'TX',
      requiredDocTypes: ['rn_license', 'bls_cert'],
      requiredVerificationTypes: ['nursys', 'oig_sam'],
    }).id

  })

  afterEach(() => {
    db.close()
    rmSync(workspacePath, { recursive: true, force: true })
  })

  async function createCaseForTools() {
    return server.invokeTool('createCase', {
      clinicianName: 'Tool Nurse',
      profession: 'RN',
      npi: '8888888888',
      primaryLicenseState: 'TX',
      primaryLicenseNumber: 'RN-888',
      email: 'tool@example.com',
      phone: '555-8888',
      facilityId: templateId,
    })
  }

  it('validateEvidence requires sourceUrl(valid URL) and timestamp(ISO 8601)', () => {
    expect(validateEvidence({ sourceUrl: 'https://example.com', timestamp: '2026-01-01T00:00:00.000Z' }).valid).toBeTrue()
    const invalid = validateEvidence({ sourceUrl: 'notaurl', timestamp: 'bad' })
    expect(invalid.valid).toBeFalse()
    expect(invalid.errors.length).toBeGreaterThan(0)
  })

  it('runVerification uses adapter evidence validation and writes CaseEvent', async () => {
    const created = await createCaseForTools()
    const caseId = created.case.id as string

    const result = await server.invokeTool('runVerification', {
      caseId,
      verificationType: 'nursys',
    })

    expect(result.verification.verificationType).toBe('nursys')
    expect(result.verification.evidence.sourceUrl).toBeString()

    const timeline = await server.invokeTool('getCaseTimeline', { caseId })
    expect(timeline.events.some((e: { eventType: string }) => e.eventType === 'verification_completed')).toBeTrue()
  })

  it('runVerification rejects invalid evidence from adapter', async () => {
    const created = await createCaseForTools()
    const caseId = created.case.id as string

    server.setVerificationAdapter('broken', {
      name: 'broken',
      async run() {
        return {
          source: 'mock-broken',
          pass: true,
          evidence: { timestamp: '2026-01-01T00:00:00.000Z', responseData: {} },
        }
      },
    })

    await expect(
      server.invokeTool('runVerification', { caseId, verificationType: 'broken' }),
    ).rejects.toThrow('Invalid verification evidence')
  })

  it('recordApproval is human-only and reviewer is set from session.humanUserId', async () => {
    const created = await createCaseForTools()
    const caseId = created.case.id as string
    const verificationResult = await server.invokeTool('runVerification', { caseId, verificationType: 'nursys' })
    const verificationId = verificationResult.verification.id as string

    principal = { actorType: 'agent', actorId: 'agent-1' }
    await expect(
      server.invokeTool('recordApproval', {
        caseId,
        verificationId,
        decision: 'waiver',
        notes: 'agent should fail',
        reviewer: 'spoofed',
      }),
    ).rejects.toThrow('Only human actors can record approvals')

    principal = { actorType: 'human', actorId: 'human-99', humanUserId: 'human-session-id' }
    const approval = await server.invokeTool('recordApproval', {
      caseId,
      verificationId,
      decision: 'waiver',
      notes: 'allowed',
      reviewer: 'spoofed',
    })
    expect(approval.reviewer).toBe('human-session-id')
  })

  it('template tools are non-case-scoped and produce no CaseEvents', async () => {
    const before = (await server.invokeTool('queryTemplates', {})).length
    const createdTemplate = await server.invokeTool('createTemplate', {
      name: 'Regional Clinic CA',
      jurisdiction: 'CA',
      requiredDocTypes: ['rn_license'],
      requiredVerificationTypes: ['nursys'],
    })
    expect(createdTemplate.version).toBe(1)

    const updated = await server.invokeTool('updateTemplate', {
      facilityId: createdTemplate.id,
      requiredVerificationTypes: ['nursys', 'oig_sam'],
    })
    expect(updated.version).toBe(2)

    const afterTemplates = await server.invokeTool('queryTemplates', { jurisdiction: 'CA' })
    expect(afterTemplates.length).toBeGreaterThan(0)
    expect((await server.invokeTool('queryTemplates', {})).length).toBe(before + 1)
  })

  it('assemblePacket and classifyDocument return expected outputs', async () => {
    const created = await createCaseForTools()
    const caseId = created.case.id as string

    await server.invokeTool('recordDocument', {
      caseId,
      docType: 'rn_license',
      fileRef: join(workspacePath, 'credentialing', caseId, 'docs', 'rn-license.pdf'),
      metadata: {},
    })
    await server.invokeTool('recordDocument', {
      caseId,
      docType: 'bls_cert',
      fileRef: join(workspacePath, 'credentialing', caseId, 'docs', 'bls-cert.pdf'),
      metadata: {},
    })
    const v1 = await server.invokeTool('runVerification', { caseId, verificationType: 'nursys' })
    const v2 = await server.invokeTool('runVerification', { caseId, verificationType: 'oig_sam' })
    await server.invokeTool('recordApproval', {
      caseId,
      verificationId: v2.verification.id,
      decision: 'waiver',
      notes: 'clear adverse',
    })

    const timelineBefore = await server.invokeTool('getCaseTimeline', { caseId })
    const doc = timelineBefore.documents[0]
    const classified = await server.invokeTool('classifyDocument', { caseId, documentId: doc.id })
    expect(classified.docType).toBeString()

    // Put case into verification_complete so packet assembly is a valid next transition context.
    server.repos.case.update(caseId, { state: CaseState.verification_complete })
    const packet = await server.invokeTool('assemblePacket', { caseId })
    expect(packet.caseId).toBe(caseId)
    expect(packet.documents.length).toBe(2)
    expect(packet.verifications.length).toBe(2)
    expect(packet.manifestVersion).toBe(1)

    const finding = await server.invokeTool('getFindingDetail', { verificationId: v1.verification.id })
    expect(finding.verification.id).toBe(v1.verification.id)
  })
})
