import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { join } from 'node:path'

import { CaseState } from '../types.ts'
import { createCase, createCredentialingHarness, type TestHarness } from './helpers.ts'

describe('Task 6 integration - negative paths', () => {
  let h: TestHarness

  beforeEach(() => {
    h = createCredentialingHarness()
  })

  afterEach(() => {
    h.cleanup()
  })

  it('2. missing docs blocks documents_collected', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    await h.server.invokeTool('transitionState', { caseId, targetState: CaseState.documents_requested })
    await h.server.invokeTool('recordDocument', {
      caseId,
      docType: 'rn_license',
      fileRef: join(h.workspacePath, 'credentialing', caseId, 'docs', 'rn_license.pdf'),
      metadata: {},
    })

    const guard = await h.server.invokeTool('checkGuards', { caseId, targetState: CaseState.documents_collected })
    expect(guard.allowed).toBeFalse()
    expect(guard.blockers[0].type).toBe('missing_document')
    expect(guard.blockers[0].docTypes).toEqual([
      'bls_cert',
      'tb_test',
      'physical',
      'background_check',
    ])
  })

  it('3. adverse finding blocks packet_assembled', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    for (const docType of ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check']) {
      await h.server.invokeTool('recordDocument', {
        caseId,
        docType,
        fileRef: join(h.workspacePath, 'credentialing', caseId, 'docs', `${docType}.pdf`),
        metadata: {},
      })
    }
    await h.server.invokeTool('runVerification', { caseId, verificationType: 'nursys' })
    await h.server.invokeTool('runVerification', { caseId, verificationType: 'oig_sam' }) // default adverse
    h.server.repos.case.update(caseId, { state: CaseState.verification_complete })

    const guard = await h.server.invokeTool('checkGuards', { caseId, targetState: CaseState.packet_assembled })
    expect(guard.allowed).toBeFalse()
    expect(guard.blockers.some((b: { type: string }) => b.type === 'missing_approval')).toBeTrue()
  })

  it('4. invalid evidence rejected', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    h.server.setVerificationAdapter('nursys', {
      name: 'broken',
      async run() {
        return {
          source: 'broken',
          pass: true,
          evidence: { sourceUrl: 'https://ok.example.com' },
        }
      },
    })
    await expect(
      h.server.invokeTool('runVerification', { caseId, verificationType: 'nursys' }),
    ).rejects.toThrow('Invalid verification evidence')
  })

  it('5. agent cannot recordApproval', async () => {
    const created = await createCase(h)
    const caseId = created.case.id as string
    const verification = await h.server.invokeTool('runVerification', { caseId, verificationType: 'nursys' })
    h.setPrincipal({ actorType: 'agent', actorId: 'agent-1' })
    await expect(
      h.server.invokeTool('recordApproval', {
        caseId,
        verificationId: verification.verification.id,
        decision: 'approved',
        notes: 'should fail',
      }),
    ).rejects.toThrow('Only human actors can record approvals')
  })
})
