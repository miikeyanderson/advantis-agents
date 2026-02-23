import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { CreateSessionOptions, Session } from '../shared/types'
import {
  CaseRepository,
  ClinicianRepository,
  Database,
  FacilityTemplateRepository,
  CaseState,
  type Case,
  type Clinician,
} from '../../../../packages/credentialing/src/index.ts'
import {
  getAgentConfig,
  type AgentRole,
} from '../../../../packages/credentialing/src/agents/index.ts'
import {
  loadSourceConfig,
  saveSourceConfig,
  saveSourceGuide,
  type FolderSourceConfig,
} from '@craft-agent/shared/sources'

type SessionManagerLike = {
  createSession: (workspaceId: string, options?: CreateSessionOptions) => Promise<Session>
}

export type AgentSession = {
  caseId: string
  agentRole: AgentRole
  sessionId: string
  workspaceId: string
  credentialingSourceSlug: string
  toolSubset: string[]
  promptPath: string
  createdAt: number
}

type CaseManagerOptions = {
  defaultWorkspaceId?: string
  defaultWorkspaceRootPath?: string
  credentialingDbPath?: string
}

type WorkspaceContext = {
  workspaceId: string
  workspaceRootPath: string
}

export class CaseManager {
  private readonly clinicians: ClinicianRepository
  private readonly cases: CaseRepository
  private readonly templates: FacilityTemplateRepository
  private readonly caseAgents = new Map<string, AgentSession[]>()
  private defaultWorkspaceId?: string
  private defaultWorkspaceRootPath?: string
  private readonly credentialingDbPath: string

  constructor(
    private readonly sessionManager: SessionManagerLike,
    private readonly db: Database,
    options?: CaseManagerOptions,
  ) {
    this.clinicians = new ClinicianRepository(db)
    this.cases = new CaseRepository(db)
    this.templates = new FacilityTemplateRepository(db)
    this.defaultWorkspaceId = options?.defaultWorkspaceId
    this.defaultWorkspaceRootPath = options?.defaultWorkspaceRootPath
    this.credentialingDbPath = options?.credentialingDbPath ?? join(process.cwd(), 'credentialing.sqlite')
  }

  setDefaultWorkspaceContext(workspaceId: string, workspaceRootPath: string): void {
    this.defaultWorkspaceId = workspaceId
    this.defaultWorkspaceRootPath = workspaceRootPath
  }

  createCase(
    clinicianData: Omit<Clinician, 'id' | 'createdAt'>,
    facilityId: string,
  ): Case {
    const clinician = this.clinicians.create(clinicianData)
    return this.cases.create({
      clinicianId: clinician.id,
      facilityId,
      state: CaseState.offer_accepted,
      startDate: null,
    })
  }

  async spawnAgentForCase(caseId: string, agentRole: AgentRole): Promise<AgentSession> {
    const existingCase = this.cases.getById(caseId)
    if (!existingCase) {
      throw new Error(`Case not found: ${caseId}`)
    }

    const workspace = this.requireWorkspaceContext()
    const agentConfig = getAgentConfig(agentRole)
    const promptPath = resolve(process.cwd(), agentConfig.promptPath)
    if (!existsSync(promptPath)) {
      throw new Error(`Agent prompt not found: ${promptPath}`)
    }

    const sourceSlug = this.ensureCredentialingSource({
      caseId,
      agentRole,
      workspaceRootPath: workspace.workspaceRootPath,
      workspaceId: workspace.workspaceId,
      toolSubset: agentConfig.toolSubset,
    })

    const prompt = readFileSync(promptPath, 'utf8')
    const session = await this.sessionManager.createSession(workspace.workspaceId, {
      name: `Credentialing ${agentRole} · ${caseId.slice(0, 8)}`,
      systemPromptPreset: prompt,
      enabledSourceSlugs: [sourceSlug],
      workingDirectory: workspace.workspaceRootPath,
    })

    const agentSession: AgentSession = {
      caseId,
      agentRole,
      sessionId: session.id,
      workspaceId: workspace.workspaceId,
      credentialingSourceSlug: sourceSlug,
      toolSubset: [...agentConfig.toolSubset],
      promptPath,
      createdAt: Date.now(),
    }

    const existing = this.caseAgents.get(caseId) ?? []
    this.caseAgents.set(caseId, [...existing, agentSession])
    return agentSession
  }

  getActiveCaseAgent(caseId: string): AgentSession | null {
    const sessions = this.caseAgents.get(caseId)
    if (!sessions || sessions.length === 0) return null
    return sessions[sessions.length - 1] ?? null
  }

  listCaseAgents(caseId: string): AgentSession[] {
    return [...(this.caseAgents.get(caseId) ?? [])]
  }

  private requireWorkspaceContext(): WorkspaceContext {
    if (!this.defaultWorkspaceId || !this.defaultWorkspaceRootPath) {
      throw new Error('CaseManager workspace context is not configured')
    }
    return {
      workspaceId: this.defaultWorkspaceId,
      workspaceRootPath: this.defaultWorkspaceRootPath,
    }
  }

  private ensureCredentialingSource(input: {
    caseId: string
    agentRole: AgentRole
    workspaceId: string
    workspaceRootPath: string
    toolSubset: string[]
  }): string {
    const roleSlug = input.agentRole.replace(/[A-Z]/g, (m, idx) => (idx === 0 ? m : `-${m}`)).toLowerCase()
    const sourceSlug = `credentialing-${roleSlug}-${input.caseId.slice(0, 12).toLowerCase()}`
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')

    const actorId = `agent:${input.agentRole}:${input.caseId}`
    const existing = loadSourceConfig(input.workspaceRootPath, sourceSlug)
    const now = Date.now()
    const config: FolderSourceConfig = {
      id: existing?.id ?? `${sourceSlug}_${randomUUID().slice(0, 8)}`,
      name: `Credentialing ${input.agentRole} (${input.caseId.slice(0, 8)})`,
      slug: sourceSlug,
      enabled: true,
      provider: 'advantis',
      type: 'mcp',
      icon: '🩺',
      tagline: `Credentialing tool subset for ${input.agentRole}`,
      connectionStatus: 'untested',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      mcp: {
        transport: 'stdio',
        command: 'bun',
        args: ['run', 'packages/credentialing/src/stdio-entry.ts'],
        env: {
          CREDENTIALING_DB_PATH: this.credentialingDbPath,
          CREDENTIALING_WORKSPACE_PATH: input.workspaceRootPath,
          CREDENTIALING_WORKSPACE_ID: input.workspaceId,
          CREDENTIALING_CASE_ID: input.caseId,
          CREDENTIALING_ALLOWED_TOOLS: JSON.stringify(input.toolSubset),
          CREDENTIALING_ACTOR_TYPE: 'agent',
          CREDENTIALING_ACTOR_ID: actorId,
        },
      },
    }

    saveSourceConfig(input.workspaceRootPath, config)
    if (!existsSync(join(input.workspaceRootPath, 'sources', sourceSlug, 'guide.md'))) {
      saveSourceGuide(input.workspaceRootPath, sourceSlug, {
        raw: `# ${config.name}\n\nCredentialing MCP source for ${input.agentRole} agent sessions.\n`,
      })
    }

    return sourceSlug
  }
}
