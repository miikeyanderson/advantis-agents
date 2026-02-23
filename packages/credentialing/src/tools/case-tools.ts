import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import { StateMachine, GuardError } from '../state-machine.ts'
import { CaseState } from '../types.ts'
import type { ToolHandlerDef } from './types.ts'

const createCaseSchema = z.object({
  clinicianName: z.string(),
  profession: z.string(),
  npi: z.string(),
  primaryLicenseState: z.string(),
  primaryLicenseNumber: z.string(),
  email: z.string().email(),
  phone: z.string(),
  facilityId: z.string(),
  startDate: z.string().nullable().optional(),
})

const queryCasesSchema = z.object({
  state: z.nativeEnum(CaseState).optional(),
  facilityId: z.string().optional(),
})

const getCaseTimelineSchema = z.object({
  caseId: z.string(),
})

const transitionStateSchema = z.object({
  caseId: z.string(),
  targetState: z.nativeEnum(CaseState),
})

const checkGuardsSchema = z.object({
  caseId: z.string(),
  targetState: z.nativeEnum(CaseState),
})

export function createCaseTools(): ToolHandlerDef[] {
  return [
    {
      name: 'createCase',
      description: 'Create a clinician and credentialing case from facility template requirements.',
      schema: createCaseSchema,
      mutating: true,
      execute(input, ctx) {
        const parsed = createCaseSchema.parse(input)
        const principal = ctx.principal
        if (!principal) throw new Error('Missing authenticated session principal')

        const tx = ctx.repos.case.transaction(() => {
          const clinician = ctx.repos.clinician.create({
            name: parsed.clinicianName,
            profession: parsed.profession,
            npi: parsed.npi,
            primaryLicenseState: parsed.primaryLicenseState,
            primaryLicenseNumber: parsed.primaryLicenseNumber,
            email: parsed.email,
            phone: parsed.phone,
          })

          const caseRecord = ctx.repos.case.create({
            clinicianId: clinician.id,
            facilityId: parsed.facilityId,
            state: CaseState.offer_accepted,
            startDate: parsed.startDate ?? null,
          })

          const docsDir = join(ctx.workspacePath, 'credentialing', caseRecord.id, 'docs')
          mkdirSync(docsDir, { recursive: true })

          ctx.repos.caseEvent.create({
            caseId: caseRecord.id,
            eventType: 'case_created',
            actorType: principal.actorType,
            actorId: principal.actorId,
            evidenceRef: null,
            payload: {
              clinicianId: clinician.id,
              facilityId: caseRecord.facilityId,
            },
          })

          return { clinician, case: caseRecord }
        })

        return tx()
      },
    },
    {
      name: 'queryCases',
      description: 'Query credentialing cases by optional state and facility filters.',
      schema: queryCasesSchema,
      mutating: false,
      execute(input, ctx) {
        return ctx.repos.case.queryCases(queryCasesSchema.parse(input))
      },
    },
    {
      name: 'getCaseTimeline',
      description: 'Get the full case timeline and supporting records for a case.',
      schema: getCaseTimelineSchema,
      mutating: false,
      execute(input, ctx) {
        const parsed = getCaseTimelineSchema.parse(input)
        return {
          case: ctx.repos.case.getById(parsed.caseId),
          documents: ctx.repos.document.getByCaseId(parsed.caseId),
          verifications: ctx.repos.verification.getByCaseId(parsed.caseId),
          approvals: ctx.repos.approval.getByCaseId(parsed.caseId),
          events: ctx.repos.caseEvent.getTimeline(parsed.caseId),
        }
      },
    },
    {
      name: 'checkGuards',
      description: 'Check transition blockers for a target state.',
      schema: checkGuardsSchema,
      mutating: false,
      async execute(input, ctx) {
        const parsed = checkGuardsSchema.parse(input)
        const machine = new StateMachine(parsed.caseId, {
          case: ctx.repos.case,
          document: ctx.repos.document,
          verification: ctx.repos.verification,
          approval: ctx.repos.approval,
          caseEvent: ctx.repos.caseEvent,
        })
        return machine.canTransition(parsed.targetState)
      },
    },
    {
      name: 'transitionState',
      description: 'Advance a case to the next state if transition guards pass.',
      schema: transitionStateSchema,
      mutating: true,
      async execute(input, ctx) {
        const parsed = transitionStateSchema.parse(input)
        const principal = ctx.principal
        if (!principal) throw new Error('Missing authenticated session principal')
        const machine = new StateMachine(parsed.caseId, {
          case: ctx.repos.case,
          document: ctx.repos.document,
          verification: ctx.repos.verification,
          approval: ctx.repos.approval,
          caseEvent: ctx.repos.caseEvent,
        })

        try {
          const caseRecord = await machine.transition(parsed.targetState, principal)
          return { allowed: true, blockers: [], case: caseRecord }
        } catch (error) {
          if (error instanceof GuardError) {
            return error.result
          }
          throw error
        }
      },
    },
  ]
}

export const caseToolSchemas = {
  createCaseSchema,
  queryCasesSchema,
  getCaseTimelineSchema,
  transitionStateSchema,
  checkGuardsSchema,
}
