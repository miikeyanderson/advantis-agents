import { z } from 'zod'

import { validateEvidence } from '../guardrails.ts'
import type { Verification } from '../types.ts'
import type { ToolHandlerDef } from './types.ts'

export interface VerificationAdapter {
  name: string
  run(input: { caseId: string; verificationType: string }): Promise<{
    source: string
    pass: boolean
    evidence: unknown
  }>
}

export class MockVerificationAdapter implements VerificationAdapter {
  readonly name: string

  constructor(name: string) {
    this.name = name
  }

  async run(input: { caseId: string; verificationType: string }) {
    const pass = input.verificationType !== 'oig_sam'
    return {
      source: `mock:${this.name}`,
      pass,
      evidence: {
        sourceUrl: `https://mock.verify/${encodeURIComponent(input.verificationType)}/${encodeURIComponent(input.caseId)}`,
        timestamp: new Date().toISOString(),
        responseData: {
          adapter: this.name,
          verificationType: input.verificationType,
          caseId: input.caseId,
          pass,
        },
      },
    }
  }
}

const runVerificationSchema = z.object({
  caseId: z.string(),
  verificationType: z.string(),
})

const getFindingDetailSchema = z.object({
  verificationId: z.string(),
})

type VerificationToolOptions = {
  getVerificationAdapter: (verificationType: string) => VerificationAdapter
}

export function createVerificationTools(options: VerificationToolOptions): ToolHandlerDef[] {
  return [
    {
      name: 'runVerification',
      description: 'Run a verification against a mock adapter and persist evidence.',
      schema: runVerificationSchema,
      mutating: true,
      async execute(input, ctx) {
        const parsed = runVerificationSchema.parse(input)
        const principal = ctx.principal
        if (!principal) throw new Error('Missing authenticated session principal')

        const adapter = options.getVerificationAdapter(parsed.verificationType)
        const adapterResult = await adapter.run(parsed)
        const evidenceCheck = validateEvidence(adapterResult.evidence)
        if (!evidenceCheck.valid) {
          throw new Error(`Invalid verification evidence: ${evidenceCheck.errors.join('; ')}`)
        }

        const evidence = adapterResult.evidence as Verification['evidence']
        const tx = ctx.repos.case.transaction(() => {
          const verification = ctx.repos.verification.create({
            caseId: parsed.caseId,
            verificationType: parsed.verificationType,
            source: adapterResult.source,
            pass: adapterResult.pass,
            evidence,
          })
          ctx.repos.caseEvent.create({
            caseId: parsed.caseId,
            eventType: 'verification_completed',
            actorType: principal.actorType,
            actorId: principal.actorId,
            evidenceRef: verification.id,
            payload: {
              verificationType: verification.verificationType,
              source: verification.source,
              pass: verification.pass,
            },
          })
          return { verification }
        })
        return tx()
      },
    },
    {
      name: 'getFindingDetail',
      description: 'Get verification finding detail plus latest approval.',
      schema: getFindingDetailSchema,
      mutating: false,
      execute(input, ctx) {
        const parsed = getFindingDetailSchema.parse(input)
        const verification = ctx.repos.verification.getById(parsed.verificationId)
        if (!verification) {
          throw new Error(`Verification not found: ${parsed.verificationId}`)
        }
        return {
          verification,
          latestApproval: ctx.repos.approval.getLatestByVerificationId(parsed.verificationId),
        }
      },
    },
  ]
}

export const verificationToolSchemas = {
  runVerificationSchema,
  getFindingDetailSchema,
}
