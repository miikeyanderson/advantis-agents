import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CreateSessionOptions, Session } from '../../shared/types'
import { CaseManager } from '../case-manager'
import {
  ApprovalRepository,
  CaseRepository,
  CaseState,
  ClinicianRepository,
  Database,
  FacilityTemplateRepository,
} from '../../../../../packages/credentialing/src/index.ts'
import { loadSourceConfig } from '../../../../../packages/shared/src/sources/index.ts'

class FakeSessionManager {
  calls: Array<{ workspaceId: string; options?: CreateSessionOptions }> = []

  async createSession(workspaceId: string, options?: CreateSessionOptions): Promise<Session> {
    this.calls.push({ workspaceId, options })
    return {
      id: `session-${this.calls.length}`,
      workspaceId,
      workspaceName: 'Test Workspace',
      lastMessageAt: Date.now(),
      messages: [],
      isProcessing: false,
      permissionMode: options?.permissionMode ?? 'ask',
      workingDirectory: undefined,
      sessionFolderPath: '/tmp/session',
    }
  }
}

describe('CaseManager', () => {
  let workspaceRootPath: string
  let db: Database

  beforeEach(() => {
    workspaceRootPath = mkdtempSync(join(tmpdir(), 'advantis-case-manager-'))
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
    rmSync(workspaceRootPath, { recursive: true, force: true })
  })

  async function seedCase(): Promise<string> {
    const templates = new FacilityTemplateRepository(db)
    const clinicians = new ClinicianRepository(db)
    const cases = new CaseRepository(db)
    const approvals = new ApprovalRepository(db)
    void approvals // ensure imports compile for package barrel coverage

    const template = templates.create({
      name: 'General Hospital TX',
      jurisdiction: 'TX',
      requiredDocTypes: ['rn_license'],
      requiredVerificationTypes: ['nursys'],
    })
    const clinician = clinicians.create({
      name: 'Taylor RN',
      profession: 'RN',
      npi: '1234567890',
      primaryLicenseState: 'TX',
      primaryLicenseNumber: 'RN-123',
      email: 'taylor@example.com',
      phone: '555-1111',
    })
    const created = cases.create({
      clinicianId: clinician.id,
      facilityId: template.id,
      state: CaseState.offer_accepted,
      startDate: '2026-03-15',
    })
    return created.id
  }

  it('spawns a role-specific agent session with prompt injection + filtered credentialing source', async () => {
    const fakeSessionManager = new FakeSessionManager()
    const caseManager = new CaseManager(fakeSessionManager, db, {
      defaultWorkspaceId: 'ws-1',
      defaultWorkspaceRootPath: workspaceRootPath,
      credentialingDbPath: join(workspaceRootPath, 'credentialing.sqlite'),
    })
    const caseId = await seedCase()

    const agentSession = await caseManager.spawnAgentForCase(caseId, 'Verifier')

    expect(agentSession.caseId).toBe(caseId)
    expect(agentSession.agentRole).toBe('Verifier')
    expect(agentSession.sessionId).toBe('session-1')
    expect(agentSession.toolSubset).toEqual([
      'runVerification',
      'checkGuards',
      'queryCases',
      'getCaseTimeline',
    ])

    expect(fakeSessionManager.calls).toHaveLength(1)
    expect(fakeSessionManager.calls[0]?.workspaceId).toBe('ws-1')
    expect(fakeSessionManager.calls[0]?.options?.enabledSourceSlugs).toEqual([
      agentSession.credentialingSourceSlug,
    ])
    expect(fakeSessionManager.calls[0]?.options?.systemPromptPreset).toContain('# Verifier')

    const sourceConfig = loadSourceConfig(workspaceRootPath, agentSession.credentialingSourceSlug)
    expect(sourceConfig).not.toBeNull()
    expect(sourceConfig?.mcp?.transport).toBe('stdio')
    expect(sourceConfig?.mcp?.env?.CREDENTIALING_CASE_ID).toBe(caseId)
    expect(sourceConfig?.mcp?.env?.CREDENTIALING_ALLOWED_TOOLS).toBe(
      JSON.stringify(agentSession.toolSubset),
    )
  })

  it('tracks active and historical agents per case', async () => {
    const fakeSessionManager = new FakeSessionManager()
    const caseManager = new CaseManager(fakeSessionManager, db, {
      defaultWorkspaceId: 'ws-1',
      defaultWorkspaceRootPath: workspaceRootPath,
      credentialingDbPath: join(workspaceRootPath, 'credentialing.sqlite'),
    })
    const caseId = await seedCase()

    expect(caseManager.getActiveCaseAgent(caseId)).toBeNull()
    expect(caseManager.listCaseAgents(caseId)).toEqual([])

    const first = await caseManager.spawnAgentForCase(caseId, 'DocCollector')
    const second = await caseManager.spawnAgentForCase(caseId, 'Verifier')

    expect(caseManager.getActiveCaseAgent(caseId)?.sessionId).toBe(second.sessionId)
    expect(caseManager.listCaseAgents(caseId).map((s) => s.sessionId)).toEqual([
      first.sessionId,
      second.sessionId,
    ])
  })
})
