import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { join } from 'node:path'

import { AGENT_CONFIGS, getAgentConfig, isToolAllowedForAgent } from '../agents/index.ts'
import { CaseState } from '../types.ts'
import { createCase, createCredentialingHarness, type TestHarness } from './helpers.ts'

describe('Task 6 integration - additional scenarios', () => {
  let h: TestHarness

  beforeEach(() => {
    h = createCredentialingHarness()
  })

  afterEach(() => {
    h.cleanup()
  })

  async function seedReadyForVerification(caseId: string) {
    for (const docType of ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check']) {
      await h.server.invokeTool('recordDocument', {
        caseId,
        docType,
        fileRef: join(h.workspacePath, 'credentialing', caseId, 'docs', `${docType}.pdf`),
        metadata: {},
      })
    }
    h.server.repos.case.update(caseId, { state: CaseState.verification_in_progress })
  }

  it('6. close from every non-terminal state; no transitions out of terminals', async () => {
    const states = [
      CaseState.offer_accepted,
      CaseState.documents_requested,
      CaseState.documents_collected,
      CaseState.verification_in_progress,
      CaseState.verification_complete,
      CaseState.packet_assembled,
      CaseState.submitted,
    ] as const
    for (const state of states) {
      const created = await createCase(h)
      const caseId = created.case.id as string
      h.server.repos.case.update(caseId, { state })
      const result = await h.server.invokeTool('transitionState', { caseId, targetState: CaseState.closed })
      expect(result.allowed).toBeTrue()
      expect(result.case.state).toBe(CaseState.closed)
    }

    for (const terminal of [CaseState.cleared, CaseState.closed] as const) {
      const created = await createCase(h)
      const caseId = created.case.id as string
      h.server.repos.case.update(caseId, { state: terminal })
      const result = await h.server.invokeTool('transitionState', { caseId, targetState: CaseState.closed })
      expect(result.allowed).toBeFalse()
    }
  })

  it('7. caller actor identity is stripped and session context is used', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    await h.server.invokeTool('recordDocument', {
      caseId,
      docType: 'rn_license',
      fileRef: join(h.workspacePath, 'credentialing', caseId, 'docs', 'rn_license.pdf'),
      metadata: {},
      actorType: 'agent',
      actorId: 'spoofed',
    })
    const timeline = await h.server.invokeTool('getCaseTimeline', { caseId })
    const event = timeline.events.at(-1)
    expect(event.actorType).toBe('human')
    expect(event.actorId).toBe('human-1')
  })

  it('8. missing session context rejected for mutating tools', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    h.setPrincipal(null)

    for (const [toolName, input] of [
      ['recordDocument', { caseId, docType: 'rn_license', fileRef: null, metadata: {} }],
      ['runVerification', { caseId, verificationType: 'nursys' }],
      ['transitionState', { caseId, targetState: CaseState.documents_requested }],
      ['recordApproval', { caseId, verificationId: null, decision: 'approved', notes: 'x' }],
      ['assemblePacket', { caseId }],
      ['createTemplate', { name: 'X', jurisdiction: 'TX', requiredDocTypes: [], requiredVerificationTypes: [] }],
      ['updateTemplate', { facilityId: h.templateId, jurisdiction: 'CA' }],
    ] as const) {
      await expect(h.server.invokeTool(toolName, input)).rejects.toThrow('session principal')
    }
  })

  it('9. waiver clears adverse finding; rejected re-blocks', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    await seedReadyForVerification(caseId)
    const v1 = await h.server.invokeTool('runVerification', { caseId, verificationType: 'nursys' })
    const v2 = await h.server.invokeTool('runVerification', { caseId, verificationType: 'oig_sam' })
    h.server.repos.case.update(caseId, { state: CaseState.verification_complete })

    await h.server.invokeTool('recordApproval', {
      caseId,
      verificationId: v1.verification.id,
      decision: 'waiver',
      notes: 'clear',
    })
    await h.server.invokeTool('recordApproval', {
      caseId,
      verificationId: v2.verification.id,
      decision: 'waiver',
      notes: 'clear',
    })
    let guard = await h.server.invokeTool('checkGuards', { caseId, targetState: CaseState.packet_assembled })
    expect(guard.allowed).toBeTrue()

    h.server.repos.approval.create({
      caseId,
      verificationId: v2.verification.id,
      decision: 'rejected',
      reviewer: 'human-1',
      notes: 're-block',
      createdAt: '2099-01-01T00:00:00.999Z',
    })
    guard = await h.server.invokeTool('checkGuards', { caseId, targetState: CaseState.packet_assembled })
    expect(guard.allowed).toBeFalse()
  })

  it("10. snapshot isolation - template updates don't affect existing case", async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    await h.server.invokeTool('updateTemplate', {
      facilityId: h.templateId,
      requiredDocTypes: ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check', 'fit_test'],
    })
    await h.server.invokeTool('transitionState', { caseId, targetState: CaseState.documents_requested })

    for (const docType of ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check']) {
      await h.server.invokeTool('recordDocument', {
        caseId,
        docType,
        fileRef: join(h.workspacePath, 'credentialing', caseId, 'docs', `${docType}.pdf`),
        metadata: {},
      })
    }
    const guard = await h.server.invokeTool('checkGuards', { caseId, targetState: CaseState.documents_collected })
    expect(guard.allowed).toBeTrue()
  })

  it('11. fileRef path validation rejects paths outside canonical docs dir', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    await expect(
      h.server.invokeTool('recordDocument', {
        caseId,
        docType: 'rn_license',
        fileRef: join(h.workspacePath, 'credentialing', caseId, '..', 'escape.pdf'),
        metadata: {},
      }),
    ).rejects.toThrow('outside canonical')
  })

  it('12. classifyDocument returns a docType', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    const doc = await h.server.invokeTool('recordDocument', {
      caseId,
      docType: 'rn_license',
      fileRef: join(h.workspacePath, 'credentialing', caseId, 'docs', 'rn_license.pdf'),
      metadata: {},
    })
    const classified = await h.server.invokeTool('classifyDocument', { caseId, documentId: doc.id })
    expect(classified.docType).toBeString()
  })

  it('13. non-case-scoped tools produce no CaseEvents', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    const before = (await h.server.invokeTool('getCaseTimeline', { caseId })).events.length
    const template = await h.server.invokeTool('createTemplate', {
      name: 'No Events Template',
      jurisdiction: 'WA',
      requiredDocTypes: ['rn_license'],
      requiredVerificationTypes: ['nursys'],
    })
    await h.server.invokeTool('queryTemplates', { facilityId: template.id })
    await h.server.invokeTool('updateTemplate', { facilityId: template.id, jurisdiction: 'OR' })
    const after = (await h.server.invokeTool('getCaseTimeline', { caseId })).events.length
    expect(after).toBe(before)
  })

  it('14. Approval.reviewer matches session humanUserId', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    const verification = await h.server.invokeTool('runVerification', { caseId, verificationType: 'nursys' })
    h.setPrincipal({ actorType: 'human', actorId: 'human-actor', humanUserId: 'human-user-id' })
    const approval = await h.server.invokeTool('recordApproval', {
      caseId,
      verificationId: verification.verification.id,
      decision: 'approved',
      notes: 'ok',
      reviewer: 'spoof',
    })
    expect(approval.reviewer).toBe('human-user-id')
  })

  it('15. agent tool subsets enforce least privilege', async () => {
    expect(AGENT_CONFIGS).toHaveLength(6)
    expect(getAgentConfig('Intake').toolSubset).toEqual(['createCase', 'queryCases'])

    expect(isToolAllowedForAgent('DocCollector', 'recordDocument')).toBeTrue()
    expect(isToolAllowedForAgent('DocCollector', 'recordApproval')).toBeFalse()
    expect(isToolAllowedForAgent('Verifier', 'runVerification')).toBeTrue()
    expect(isToolAllowedForAgent('Verifier', 'assemblePacket')).toBeFalse()
    expect(isToolAllowedForAgent('PacketAssembler', 'assemblePacket')).toBeTrue()
    expect(isToolAllowedForAgent('PacketAssembler', 'recordApproval')).toBeFalse()
    expect(isToolAllowedForAgent('QualityReview', 'getFindingDetail')).toBeTrue()
    expect(isToolAllowedForAgent('QualityReview', 'transitionState')).toBeFalse()
  })
})
