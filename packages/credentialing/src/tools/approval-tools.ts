import { z } from 'zod'

import type { ToolHandlerDef } from './types.ts'

const recordApprovalSchema = z.object({
  caseId: z.string(),
  verificationId: z.string().nullable(),
  decision: z.enum(['approved', 'rejected', 'waiver']),
  notes: z.string(),
})

export function createApprovalTools(): ToolHandlerDef[] {
  return [
    {
      name: 'recordApproval',
      description: 'Record a human approval decision for a finding or case submission.',
      schema: recordApprovalSchema,
      mutating: true,
      execute(input, ctx) {
        const parsed = recordApprovalSchema.parse(input)
        const principal = ctx.principal
        if (!principal) throw new Error('Missing authenticated session principal')
        if (principal.actorType !== 'human') {
          throw new Error('Only human actors can record approvals')
        }

        const reviewer = principal.humanUserId ?? principal.actorId
        const tx = ctx.repos.case.transaction(() => {
          const approval = ctx.repos.approval.create({
            caseId: parsed.caseId,
            verificationId: parsed.verificationId,
            decision: parsed.decision,
            reviewer,
            notes: parsed.notes,
          })
          ctx.repos.caseEvent.create({
            caseId: parsed.caseId,
            eventType: 'approval_recorded',
            actorType: principal.actorType,
            actorId: principal.actorId,
            evidenceRef: approval.id,
            payload: {
              verificationId: approval.verificationId,
              decision: approval.decision,
              reviewer: approval.reviewer,
            },
          })
          return approval
        })
        return tx()
      },
    },
  ]
}

export const approvalToolSchemas = {
  recordApprovalSchema,
}
