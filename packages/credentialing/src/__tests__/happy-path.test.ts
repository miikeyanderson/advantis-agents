import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { join } from 'node:path'

import { CaseState } from '../types.ts'
import { createCase, createCredentialingHarness, type TestHarness } from './helpers.ts'

describe('Task 6 integration - happy path', () => {
  let h: TestHarness

  beforeEach(() => {
    h = createCredentialingHarness()
  })

  afterEach(() => {
    h.cleanup()
  })

  it('1. full happy path reaches cleared and writes audit trail events', async () => {
    h.server.setVerificationAdapter('oig_sam', {
      name: 'oig_sam-pass',
      async run({ caseId, verificationType }) {
        return {
          source: 'mock:oig_sam-pass',
          pass: true,
          evidence: {
            sourceUrl: `https://mock/${verificationType}/${caseId}`,
            timestamp: new Date().toISOString(),
            responseData: { pass: true },
          },
        }
      },
    })

    const created = await createCase(h)
    const caseId = created.case.id as string

    const docs = ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check'] as const
    for (const docType of docs) {
      const doc = await h.server.invokeTool('recordDocument', {
        caseId,
        docType,
        fileRef: join(h.workspacePath, 'credentialing', caseId, 'docs', `${docType}.pdf`),
        metadata: { uploadedBy: 'clinician' },
      })
      expect(doc.id).toBeString()
    }

    const nursys = await h.server.invokeTool('runVerification', { caseId, verificationType: 'nursys' })
    const oig = await h.server.invokeTool('runVerification', { caseId, verificationType: 'oig_sam' })
    expect(nursys.verification.pass).toBeTrue()
    expect(oig.verification.pass).toBeTrue()

    const transitions = [
      CaseState.documents_requested,
      CaseState.documents_collected,
      CaseState.verification_in_progress,
      CaseState.verification_complete,
      CaseState.packet_assembled,
    ] as const
    for (const targetState of transitions) {
      const result = await h.server.invokeTool('transitionState', { caseId, targetState })
      expect(result.allowed).toBeTrue()
      expect(result.case.state).toBe(targetState)
    }

    await h.server.invokeTool('recordApproval', {
      caseId,
      verificationId: null,
      decision: 'approved',
      notes: 'final submission approved',
    })

    for (const targetState of [CaseState.submitted, CaseState.cleared] as const) {
      const result = await h.server.invokeTool('transitionState', { caseId, targetState })
      expect(result.allowed).toBeTrue()
      expect(result.case.state).toBe(targetState)
    }

    const timeline = await h.server.invokeTool('getCaseTimeline', { caseId })
    expect(timeline.case.state).toBe(CaseState.cleared)
    expect(timeline.events.length).toBe(16)
    expect(timeline.events.every((e: { actorType: string; actorId: string }) => !!e.actorType && !!e.actorId)).toBeTrue()
  })
})
