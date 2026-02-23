import type { z } from 'zod'

import type { CredentialingSessionPrincipal } from '../mcp-server.ts'
import type { Database } from '../database.ts'
import type {
  ApprovalRepository,
  CaseEventRepository,
  CaseRepository,
  ClinicianRepository,
  DocumentRepository,
  FacilityTemplateRepository,
  VerificationRepository,
} from '../repositories/index.ts'

export type CredentialingRepositories = {
  clinician: ClinicianRepository
  case: CaseRepository
  document: DocumentRepository
  verification: VerificationRepository
  approval: ApprovalRepository
  facilityTemplate: FacilityTemplateRepository
  caseEvent: CaseEventRepository
}

export type ToolEnvironment = {
  db: Database
  repos: CredentialingRepositories
  workspacePath: string
  getSessionPrincipal: () => CredentialingSessionPrincipal | null
  callLlm?: (prompt: string, input: unknown) => Promise<unknown>
}

export type ToolExecutionContext = ToolEnvironment & {
  principal: CredentialingSessionPrincipal | null
}

type ToolExecuteFn<TInput> = {
  bivarianceHack: (input: TInput, ctx: ToolExecutionContext) => Promise<unknown> | unknown
}['bivarianceHack']

export type ToolHandlerDef<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string
  description: string
  schema: TSchema
  mutating: boolean
  execute: ToolExecuteFn<z.infer<TSchema>>
}
