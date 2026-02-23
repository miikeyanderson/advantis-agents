import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'

import { Database } from './database.ts'
import {
  ApprovalRepository,
  CaseEventRepository,
  CaseRepository,
  ClinicianRepository,
  DocumentRepository,
  FacilityTemplateRepository,
  VerificationRepository,
} from './repositories/index.ts'
import { createCaseTools } from './tools/case-tools.ts'
import { createDocumentTools } from './tools/document-tools.ts'
import {
  createVerificationTools,
  MockVerificationAdapter,
  type VerificationAdapter,
} from './tools/verification-tools.ts'
import { createApprovalTools } from './tools/approval-tools.ts'
import { createTemplateTools } from './tools/template-tools.ts'
import { createPacketTools } from './tools/packet-tools.ts'
import type {
  CredentialingRepositories,
  ToolExecutionContext,
  ToolHandlerDef,
} from './tools/types.ts'

export type CredentialingSessionPrincipal = {
  actorType: 'agent' | 'human' | 'system'
  actorId: string
  humanUserId?: string
}

export type CredentialingMcpServerOptions = {
  db: Database
  workspacePath: string
  getSessionPrincipal: () => CredentialingSessionPrincipal | null
  callLlm?: (prompt: string, input: unknown) => Promise<unknown>
  verificationAdapters?: Record<string, VerificationAdapter>
  allowedTools?: string[]
}

function stripActorIdentity(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input
  }
  const { actorType: _actorType, actorId: _actorId, reviewer: _reviewer, ...rest } =
    input as Record<string, unknown>
  return rest
}

export class CredentialingMcpServer {
  readonly db: Database
  readonly repos: CredentialingRepositories
  readonly workspacePath: string
  readonly getSessionPrincipal: () => CredentialingSessionPrincipal | null
  readonly sdkServer: ReturnType<typeof createSdkMcpServer>
  private readonly handlers = new Map<string, ToolHandlerDef>()
  private readonly callLlm?: (prompt: string, input: unknown) => Promise<unknown>
  private readonly verificationAdapters = new Map<string, VerificationAdapter>()

  constructor(options: CredentialingMcpServerOptions) {
    this.db = options.db
    this.workspacePath = options.workspacePath
    this.getSessionPrincipal = options.getSessionPrincipal
    this.callLlm = options.callLlm
    for (const [key, adapter] of Object.entries(options.verificationAdapters ?? {})) {
      this.verificationAdapters.set(key, adapter)
    }

    this.repos = {
      clinician: new ClinicianRepository(this.db),
      case: new CaseRepository(this.db),
      document: new DocumentRepository(this.db),
      verification: new VerificationRepository(this.db),
      approval: new ApprovalRepository(this.db),
      facilityTemplate: new FacilityTemplateRepository(this.db),
      caseEvent: new CaseEventRepository(this.db),
    }

    const handlerDefs = [
      ...createCaseTools(),
      ...createDocumentTools(),
      ...createVerificationTools({
        getVerificationAdapter: (verificationType) => this.getVerificationAdapter(verificationType),
      }),
      ...createApprovalTools(),
      ...createTemplateTools(),
      ...createPacketTools(),
    ]
    const allowedSet = options.allowedTools ? new Set(options.allowedTools) : null
    for (const def of handlerDefs) {
      if (allowedSet && !allowedSet.has(def.name)) {
        continue
      }
      this.handlers.set(def.name, def)
    }

    this.sdkServer = createSdkMcpServer({
      name: 'credentialing',
      version: '1.0.0',
      // Internal invokeTool() is the source of truth for credentialing behavior/tests.
      // SDK tool bindings are added after the full tool surface (Tasks 4b+) is finalized.
      tools: [],
    })
  }

  async invokeTool(name: string, rawInput: unknown): Promise<any> {
    const def = this.handlers.get(name)
    if (!def) {
      throw new Error(`Unknown credentialing tool: ${name}`)
    }

    const sanitized = stripActorIdentity(rawInput)
    const input = def.schema.parse(sanitized)
    const principal = this.getSessionPrincipal()
    if (def.mutating && !principal) {
      throw new Error('Missing authenticated session principal for mutating credentialing tool')
    }
    const ctx: ToolExecutionContext = {
      db: this.db,
      repos: this.repos,
      workspacePath: this.workspacePath,
      getSessionPrincipal: this.getSessionPrincipal,
      principal,
      callLlm: this.callLlm,
    }
    return await def.execute(input, ctx)
  }

  setVerificationAdapter(verificationType: string, adapter: VerificationAdapter): void {
    this.verificationAdapters.set(verificationType, adapter)
  }

  getToolDefinitions(): Array<Pick<ToolHandlerDef, 'name' | 'description' | 'schema'>> {
    return Array.from(this.handlers.values()).map((def) => ({
      name: def.name,
      description: def.description,
      schema: def.schema,
    }))
  }

  private getVerificationAdapter(verificationType: string): VerificationAdapter {
    const existing = this.verificationAdapters.get(verificationType)
    if (existing) return existing
    const mock = new MockVerificationAdapter(verificationType)
    this.verificationAdapters.set(verificationType, mock)
    return mock
  }
}
