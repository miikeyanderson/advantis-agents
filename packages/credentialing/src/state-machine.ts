import type { GuardResult, Case as CredentialingCase, CaseEvent } from './types.ts'
import { CaseState } from './types.ts'
import type {
  ApprovalRepository,
  CaseEventRepository,
  CaseRepository,
  DocumentRepository,
  VerificationRepository,
} from './repositories/index.ts'
import { checkTransitionGuards } from './guards.ts'

export const VALID_TRANSITIONS: Record<CaseState, CaseState[]> = {
  [CaseState.offer_accepted]: [CaseState.documents_requested, CaseState.closed],
  [CaseState.documents_requested]: [CaseState.documents_collected, CaseState.closed],
  [CaseState.documents_collected]: [CaseState.verification_in_progress, CaseState.closed],
  [CaseState.verification_in_progress]: [CaseState.verification_complete, CaseState.closed],
  [CaseState.verification_complete]: [CaseState.packet_assembled, CaseState.closed],
  [CaseState.packet_assembled]: [CaseState.submitted, CaseState.closed],
  [CaseState.submitted]: [CaseState.cleared, CaseState.closed],
  [CaseState.cleared]: [],
  [CaseState.closed]: [],
}

export class GuardError extends Error {
  readonly result: GuardResult

  constructor(message: string, result: GuardResult) {
    super(message)
    this.name = 'GuardError'
    this.result = result
  }
}

type StateMachineRepos = {
  case: CaseRepository
  document: DocumentRepository
  verification: VerificationRepository
  approval: ApprovalRepository
  caseEvent: CaseEventRepository
}

type Actor = Pick<CaseEvent, 'actorType' | 'actorId'>

export class StateMachine {
  constructor(
    private readonly caseId: string,
    private readonly repos: StateMachineRepos,
  ) {}

  async canTransition(targetState: CaseState): Promise<GuardResult> {
    const current = this.repos.case.getById(this.caseId)
    if (!current) {
      return { allowed: false, blockers: [] }
    }

    if (!VALID_TRANSITIONS[current.state].includes(targetState)) {
      return { allowed: false, blockers: [] }
    }

    return checkTransitionGuards(this.caseId, targetState, this.repos)
  }

  async transition(targetState: CaseState, actor: Actor): Promise<CredentialingCase> {
    const current = this.repos.case.getById(this.caseId)
    if (!current) {
      throw new GuardError('Case not found', { allowed: false, blockers: [] })
    }

    if (!VALID_TRANSITIONS[current.state].includes(targetState)) {
      throw new GuardError(`Invalid transition: ${current.state} -> ${targetState}`, {
        allowed: false,
        blockers: [],
      })
    }

    const guardResult = await this.canTransition(targetState)
    if (!guardResult.allowed) {
      throw new GuardError(`Transition blocked: ${current.state} -> ${targetState}`, guardResult)
    }

    const runInTransaction = this.repos.case.transaction(() => {
      const updated = this.repos.case.update(this.caseId, {
        state: targetState,
      })
      this.repos.caseEvent.create({
        caseId: this.caseId,
        eventType: targetState === CaseState.closed ? 'case_closed' : 'state_transition',
        actorType: actor.actorType,
        actorId: actor.actorId,
        evidenceRef: null,
        payload:
          targetState === CaseState.closed
            ? { fromState: current.state, toState: targetState, reason: 'closed' }
            : { fromState: current.state, toState: targetState },
      })
      return updated
    })

    return runInTransaction()
  }
}
