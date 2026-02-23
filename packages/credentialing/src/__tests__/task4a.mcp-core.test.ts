import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Database } from '../database.ts'
import { CredentialingMcpServer } from '../mcp-server.ts'
import type { CredentialingSessionPrincipal } from '../mcp-server.ts'
import { FacilityTemplateRepository } from '../repositories/index.ts'
import { CaseState } from '../types.ts'

describe('Task 4a core MCP tools', () => {
  let workspacePath: string
  let db: Database
  let server: CredentialingMcpServer
  let principal: CredentialingSessionPrincipal | null
  let seededTemplateId: string

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
    seededTemplateId = templates.create({
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

  it('createCase snapshots requirements, creates docs dir, and strips caller actor identity', async () => {
    const facilityId = seededTemplateId
    const result = await server.invokeTool('createCase', {
      clinicianName: 'Taylor RN',
      profession: 'RN',
      npi: '1234567890',
      primaryLicenseState: 'TX',
      primaryLicenseNumber: 'RN-123',
      email: 'taylor@example.com',
      phone: '555-1111',
      facilityId,
      startDate: '2026-03-01',
      actorType: 'agent',
      actorId: 'spoofed',
    })

    expect(result.case.state).toBe(CaseState.offer_accepted)
    expect(result.case.templateVersion).toBe(1)
    expect(result.case.requiredDocTypesSnapshot).toEqual(['rn_license', 'bls_cert'])
    expect(result.case.requiredVerificationTypesSnapshot).toEqual(['nursys', 'oig_sam'])

    const timeline = await server.invokeTool('getCaseTimeline', { caseId: result.case.id })
    expect(timeline.events.at(-1)?.eventType).toBe('case_created')
    expect(timeline.events.at(-1)?.actorType).toBe('human')
    expect(timeline.events.at(-1)?.actorId).toBe('human-1')

    const docsDir = join(workspacePath, 'credentialing', result.case.id, 'docs')
    expect(existsSync(docsDir)).toBeTrue()
  })

  it('rejects mutating tools when session principal is missing', async () => {
    principal = null
    const facilityId = seededTemplateId

    await expect(
      server.invokeTool('createCase', {
        clinicianName: 'No Principal',
        profession: 'RN',
        npi: '5555555555',
        primaryLicenseState: 'TX',
        primaryLicenseNumber: 'RN-555',
        email: 'none@example.com',
        phone: '555-5555',
        facilityId,
      }),
    ).rejects.toThrow('authenticated session principal')
  })

  it('recordDocument validates canonical fileRef path and writes CaseEvent', async () => {
    const facilityId = seededTemplateId
    const created = await server.invokeTool('createCase', {
      clinicianName: 'Path Test',
      profession: 'RN',
      npi: '6666666666',
      primaryLicenseState: 'TX',
      primaryLicenseNumber: 'RN-666',
      email: 'path@example.com',
      phone: '555-6666',
      facilityId,
    })
    const caseId = created.case.id as string

    const validFileRef = join(workspacePath, 'credentialing', caseId, 'docs', 'rn-license.pdf')
    await server.invokeTool('recordDocument', {
      caseId,
      docType: 'rn_license',
      fileRef: validFileRef,
      metadata: { source: 'upload' },
      actorType: 'agent',
      actorId: 'spoofed-agent',
    })

    await expect(
      server.invokeTool('recordDocument', {
        caseId,
        docType: 'bls_cert',
        fileRef: join(workspacePath, 'credentialing', caseId, '..', 'escape.pdf'),
        metadata: {},
      }),
    ).rejects.toThrow('outside canonical')

    const timeline = await server.invokeTool('getCaseTimeline', { caseId })
    expect(timeline.events.some((e: { eventType: string }) => e.eventType === 'document_recorded')).toBeTrue()
    const latestEvent = timeline.events.at(-1)
    expect(latestEvent?.actorType).toBe('human')
    expect(latestEvent?.actorId).toBe('human-1')
  })

  it('checkGuards and transitionState delegate to state machine and return blockers', async () => {
    const facilityId = seededTemplateId
    const created = await server.invokeTool('createCase', {
      clinicianName: 'Flow Test',
      profession: 'RN',
      npi: '7777777777',
      primaryLicenseState: 'TX',
      primaryLicenseNumber: 'RN-777',
      email: 'flow@example.com',
      phone: '555-7777',
      facilityId,
    })
    const caseId = created.case.id as string

    await server.invokeTool('transitionState', {
      caseId,
      targetState: CaseState.documents_requested,
    })

    const guardResult = await server.invokeTool('checkGuards', {
      caseId,
      targetState: CaseState.documents_collected,
    })
    expect(guardResult.allowed).toBeFalse()
    expect(guardResult.blockers[0].type).toBe('missing_document')

    const transitionAttempt = await server.invokeTool('transitionState', {
      caseId,
      targetState: CaseState.documents_collected,
    })
    expect(transitionAttempt.allowed).toBeFalse()
    expect(transitionAttempt.blockers.length).toBeGreaterThan(0)
  })
})
