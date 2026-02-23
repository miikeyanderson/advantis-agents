import { z } from 'zod'

import {
  checkDocumentsCollectedGuard,
  checkPacketAssembledGuard,
  checkVerificationCompleteGuard,
} from '../guards.ts'
import type { ToolHandlerDef } from './types.ts'

const assemblePacketSchema = z.object({
  caseId: z.string(),
})

export function createPacketTools(): ToolHandlerDef[] {
  return [
    {
      name: 'assemblePacket',
      description: 'Assemble a packet manifest when docs/verifications/approvals are complete.',
      schema: assemblePacketSchema,
      mutating: true,
      execute(input, ctx) {
        const parsed = assemblePacketSchema.parse(input)
        const principal = ctx.principal
        if (!principal) throw new Error('Missing authenticated session principal')

        const guardRepos = {
          case: ctx.repos.case,
          document: ctx.repos.document,
          verification: ctx.repos.verification,
          approval: ctx.repos.approval,
        }
        for (const result of [
          checkDocumentsCollectedGuard(parsed.caseId, guardRepos),
          checkVerificationCompleteGuard(parsed.caseId, guardRepos),
          checkPacketAssembledGuard(parsed.caseId, guardRepos),
        ]) {
          if (!result.allowed) {
            throw new Error(`Packet assembly blocked: ${JSON.stringify(result.blockers)}`)
          }
        }

        const tx = ctx.repos.case.transaction(() => {
          const documents = ctx.repos.document.getByCaseId(parsed.caseId)
          const verifications = ctx.repos.verification.getByCaseId(parsed.caseId)
          ctx.repos.caseEvent.create({
            caseId: parsed.caseId,
            eventType: 'packet_assembled',
            actorType: principal.actorType,
            actorId: principal.actorId,
            evidenceRef: null,
            payload: {
              documentCount: documents.length,
              verificationCount: verifications.length,
            },
          })

          return {
            caseId: parsed.caseId,
            manifestVersion: 1,
            documents,
            verifications,
          }
        })
        return tx()
      },
    },
  ]
}

export const packetToolSchemas = {
  assemblePacketSchema,
}
