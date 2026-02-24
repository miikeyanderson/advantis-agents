# Project Spec: Advantis Agents

## Objective

Transform the craft-agents-oss Electron app into a travel nurse credentialing platform where AI agents orchestrate clinician onboarding from offer-accepted to cleared-to-start, enabling 1-2 specialists to manage the workload of ~12 FTEs.

## Success Criteria

- A clinician case progresses through all 8 states (offer_accepted → cleared) with explicit, guarded transitions; cases can also be closed from any non-terminal state
- Agents autonomously collect documents, verify licenses, classify uploads, and assemble packets
- Human approves only: adverse findings, waivers, final facility submission
- Facility requirements are template-driven (no code changes to add a facility)
- Every mutation produces a timestamped CaseEvent with actor and evidence references
- Incomplete packets cannot be submitted; adverse findings cannot be bypassed without human sign-off
- All integration tests (happy path + 4 negative paths) pass against in-memory SQLite

## Tech Stack

```
Runtime:       Bun 1.x (workspace manager + test runner)
Language:      TypeScript 5.x (strict)
Framework:     Electron 39.x (main/renderer/preload)
UI:            React 18 + Vite 6 + Tailwind 4 + shadcn/ui (Radix primitives)
State:         Jotai (renderer state)
DB:            better-sqlite3 (local, WAL mode)
Agent SDK:     @anthropic-ai/claude-agent-sdk 0.2.x
MCP:           @modelcontextprotocol/sdk 1.24.x
Validation:    Zod 4.x
Build:         esbuild (main/preload), Vite (renderer)
Test:          bun test
Lint:          ESLint 9 + @typescript-eslint
Package:       electron-builder 26.x
```

## Commands

```bash
# Install
bun install

# Build everything
bun run electron:build

# Start (build + launch)
bun run electron:start

# Dev mode (hot reload)
bun run electron:dev

# Test
bun test

# Typecheck
bun run typecheck:all

# Lint
bun run lint
```

## Project Structure

```
advantis-agents/
├── packages/
│   ├── core/                → Shared types (AgentEvent, Message, Session)
│   ├── shared/              → Agent backends, sources, sessions, hooks, config
│   │   └── src/
│   │       ├── agent/       → BaseAgent, ClaudeAgent, PermissionManager
│   │       ├── sources/     → MCP/API source definitions, SourceServerBuilder
│   │       ├── sessions/    → JSONL session persistence
│   │       ├── hooks-simple/→ Event-driven automation
│   │       ├── credentials/ → AES-256-GCM encrypted credential storage
│   │       └── config/      → StoredConfig, LlmConnections
│   ├── credentialing/       → NEW: Domain package (this spec)
│   │   └── src/
│   │       ├── types.ts          → Entity interfaces
│   │       ├── schema.sql        → SQLite DDL (7 tables)
│   │       ├── database.ts       → Database class (WAL, schema init)
│   │       ├── state-machine.ts  → CaseState enum, StateMachine class
│   │       ├── guards.ts         → Transition guard functions
│   │       ├── guardrails.ts     → Evidence validation, approval checks
│   │       ├── mcp-server.ts     → MCP server with all domain tools
│   │       ├── repositories/     → Typed CRUD for all 7 entities
│   │       ├── tools/            → Tool handler modules
│   │       ├── agents/           → 6 agent prompt files + AgentConfig
│   │       └── __tests__/        → Integration tests
│   └── ui/                  → Shared React components
├── apps/
│   └── electron/
│       └── src/
│           ├── main/        → SessionManager, CaseManager (NEW), IPC handlers
│           ├── preload/     → Context bridge (typed IPC)
│           └── renderer/    → React UI
│               └── components/
│                   ├── app-shell/      → Existing shell, sidebar, settings
│                   ├── dashboard/      → NEW: Case grid, state filter, new case form
│                   ├── case-timeline/  → NEW: Event list, doc checklist, blockers
│                   ├── approval-modal/ → NEW: Adverse finding review
│                   └── template-editor/→ NEW: Facility template management
└── .docs/
    ├── shaping/    → credentialing-platform-shaping.md
    └── plans/      → credentialing-platform-plan.md
```

## Data Model

### Entities (7 tables)

```typescript
interface Clinician {
  id: string
  name: string
  profession: string          // e.g., 'RN', 'LPN', 'CNA'
  npi: string
  primaryLicenseState: string // e.g., 'TX' — U.S. jurisdiction abbreviation
  primaryLicenseNumber: string
  email: string
  phone: string
  createdAt: string
}

interface Case {
  id: string
  clinicianId: string       // FK → clinicians.id
  facilityId: string        // FK → facility_templates.id
  state: CaseState
  startDate: string | null  // expected assignment start date
  templateVersion: number   // snapshot of template.version at case creation
  requiredDocTypesSnapshot: string[]     // frozen copy of template.requiredDocTypes
  requiredVerificationTypesSnapshot: string[]  // frozen copy of template.requiredVerificationTypes
  createdAt: string
  updatedAt: string
}

interface Document {
  id: string
  caseId: string            // FK → cases.id
  docType: string           // e.g., 'rn_license', 'bls_cert', 'tb_test'
  status: 'pending' | 'received' | 'verified' | 'rejected'
  fileRef: string | null    // path to file on disk
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Verification {
  id: string
  caseId: string            // FK → cases.id
  verificationType: string  // e.g., 'nursys', 'oig_sam'
  source: string
  pass: boolean
  evidence: {
    sourceUrl: string       // REQUIRED — URL of verification source
    timestamp: string       // REQUIRED — ISO 8601
    responseData: Record<string, unknown>
  }
  createdAt: string
}

interface Approval {
  id: string
  caseId: string            // FK → cases.id
  verificationId: string | null  // FK → verifications.id (null = case-level)
  decision: 'approved' | 'rejected' | 'waiver'
  reviewer: string          // human specialist identifier
  notes: string
  createdAt: string
}

interface FacilityTemplate {
  id: string
  name: string              // e.g., "General Hospital TX"
  jurisdiction: string      // U.S. state abbreviation, e.g., "TX" (renamed from "state" to avoid CaseState collision)
  version: number           // monotonically increasing, bumped on every update
  requiredDocTypes: string[]
  requiredVerificationTypes: string[]
  createdAt: string
  updatedAt: string
}

interface CaseEvent {
  id: string
  caseId: string            // FK → cases.id
  eventType: 'state_transition' | 'document_recorded' | 'verification_completed'
           | 'approval_recorded' | 'packet_assembled' | 'case_created' | 'case_closed'
  actorType: 'agent' | 'human' | 'system'
  actorId: string
  evidenceRef: string | null    // primary evidence ID (e.g., verificationId, documentId); additional refs stored in payload
  payload: Record<string, unknown>
  timestamp: string
}
```

### CaseState Enum

```typescript
enum CaseState {
  offer_accepted = 'offer_accepted',
  documents_requested = 'documents_requested',
  documents_collected = 'documents_collected',
  verification_in_progress = 'verification_in_progress',
  verification_complete = 'verification_complete',
  packet_assembled = 'packet_assembled',
  submitted = 'submitted',
  cleared = 'cleared',   // terminal
  closed = 'closed',     // terminal
}
```

### State Machine

```
offer_accepted
  → documents_requested
    → documents_collected        GUARD: for each docType in case.requiredDocTypesSnapshot, latest Document has status IN ('received', 'verified') and fileRef != null
      → verification_in_progress
        → verification_complete  GUARD: all case.requiredVerificationTypesSnapshot have at least one Verification record (pass may be true or false — adverse findings handled at packet_assembled)
          → packet_assembled     GUARD: no adverse finding without Approval (decision IN approved/waiver)
            → submitted          GUARD: case-level Approval (decision='approved')
              → cleared

Terminal states (no outgoing transitions):
  cleared                       Successfully completed credentialing
  closed                        Can be set from ANY non-terminal state (cancellation, rejection, withdrawal)
```

- Transitions are sequential only (no skipping)
- `canTransition()` returns `{ allowed, blockers[] }` with typed blocker descriptions
- `transition()` updates case state + writes CaseEvent atomically (SQLite transaction)
- Adverse finding = Verification with `pass=false` and no corresponding Approval with `decision IN ('approved', 'waiver')`

### Approval Model

- Per-finding (tied to verificationId), not per-case
- Only `decision IN ('approved', 'waiver')` clears the adverse-finding blocker; `'rejected'` leaves the finding blocking
- Only humans can record approvals — the MCP server enforces this via runtime session context (actorType injected, not caller-provided)
- Case-level approval for final submission uses `verificationId: null`
- A single finding can have multiple Approval records — the latest record governs (ORDER BY createdAt DESC, id DESC LIMIT 1); only if that latest decision is IN ('approved', 'waiver') does it clear the blocker

### Document Storage

- SQLite stores metadata only
- File blobs live at `{workspacePath}/credentialing/{caseId}/docs/{documentId}.{ext}` (workspacePath resolved from SessionManager config at runtime)
- `fileRef` stores the absolute filesystem path — server validates it normalizes under the canonical `{workspacePath}/credentialing/{caseId}/docs/` directory; paths outside are rejected
- On case creation, the docs directory is created if it doesn't exist
- Multiple Documents may exist for the same (caseId, docType) — the latest Document (ORDER BY createdAt DESC, id DESC LIMIT 1) governs transition guards

## Agent Topology

```
Coordinator
├── Intake          → createCase, queryCases
├── DocCollector    → recordDocument, classifyDocument, queryCases, getCaseTimeline
├── Verifier        → runVerification, checkGuards, queryCases, getCaseTimeline
├── PacketAssembler → assemblePacket, checkGuards, queryCases
└── QualityReview   → checkGuards, getCaseTimeline, queryCases, getFindingDetail
```

- Each agent has a `.md` system prompt defining role, allowed tools, and behavioral constraints
- Coordinator dispatches based on `CaseState → agentRole` mapping
- `CaseManager` wraps `SessionManager` (composition, not inheritance) to spawn agent sessions per case
- Tool subset filtering: agent sessions only see their allowed MCP tools

## MCP Tools (13 domain tools)

```
Case Management:     createCase, queryCases, getCaseTimeline
Documents:           recordDocument, classifyDocument
Verification:        runVerification, checkGuards, getFindingDetail
State:               transitionState
Approvals:           recordApproval
Templates:           createTemplate, updateTemplate, queryTemplates
Packet:              assemblePacket
```

- Registered as workspace source at `~/.craft-agent/workspaces/{id}/sources/credentialing/config.json` (type: `stdio`)
- Uses `createSdkMcpServer` pattern from existing codebase
- All tool inputs validated with Zod schemas
- All case-scoped mutating tools write a CaseEvent — actorType/actorId are runtime-injected by the MCP server from the authenticated session context, never caller-provided
- `updateTemplate` and `queryTemplates` are NOT case-scoped and do NOT write CaseEvents
- External verifications use mock adapters for MVP (deterministic mock responses, no real external calls)

## IPC Contracts

All IPC responses follow:
```typescript
{ success: boolean, data?: T, error?: { code: string, message: string } }
```

Blocker payload from checkGuards:
```typescript
{ allowed: boolean, blockers: { type: BlockerType, description: string, requiredItem: string }[] }
// BlockerType = 'missing_document' | 'failed_verification' | 'missing_approval' | 'missing_case_approval'
```

IPC channels:
```
credentialing:query-cases
credentialing:create-case
credentialing:get-case-timeline
credentialing:run-verification
credentialing:transition-state
credentialing:check-guards
credentialing:record-approval
credentialing:query-templates
credentialing:update-template
credentialing:spawn-agent
credentialing:get-active-agent
credentialing:list-case-agents
```

## UI Views

### Dashboard (P1)
- Case grid table (shadcn/ui Table): clinician name, facility, state badge, blocker count, assigned agent, last updated
- State filter dropdown
- "New Case" button → modal with clinician fields + facility selector
- Row click → navigates to case timeline

### Case Timeline (P2)
- Chronological CaseEvent list with type-specific rendering
- Document checklist (template requirements vs collected)
- Blocker banner (calls checkGuards, displays missing items)
- "Run Verification" button
- "Advance State" button (enabled when guards pass)
- "Review Finding" button (visible on adverse verifications)

### Approval Modal (P3)
- Displays verification source, evidence summary, pass/fail
- Approve / Reject / Request Waiver buttons
- Triggered from "Review Finding" in timeline

### Template Editor (P4)
- Facility template list
- Add/remove docType and verificationType strings per template
- Seed: "General Hospital TX" with ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check'] + ['nursys', 'oig_sam']

## Code Style

```typescript
// Naming: PascalCase types/classes, camelCase functions/variables
// Repositories: constructor injection of Database instance
// Errors: typed errors (not raw SQL errors)
// IDs: string UUIDs generated at creation time
// Timestamps: ISO 8601 strings
// JSON in SQLite: TEXT columns with JSON.parse/stringify

// Example repository pattern:
export class CaseRepository {
  constructor(private db: Database) {}

  create(data: Omit<Case, 'id' | 'createdAt' | 'updatedAt'>): Case {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      'INSERT INTO cases (id, clinicianId, facilityId, state, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.clinicianId, data.facilityId, data.state, now, now]
    )
    return { id, ...data, createdAt: now, updatedAt: now }
  }

  queryCases(filters: { state?: CaseState; facilityId?: string }): Case[] {
    // Build WHERE clause from filters
  }
}
```

```tsx
// React component pattern (shadcn/ui + Tailwind):
export function CaseRow({ case: c, onClick }: { case: Case; onClick: () => void }) {
  return (
    <TableRow onClick={onClick} className="cursor-pointer hover:bg-muted/50">
      <TableCell>{c.clinicianName}</TableCell>
      <TableCell><StateBadge state={c.state} /></TableCell>
      <TableCell>{c.blockerCount > 0 && <Badge variant="destructive">{c.blockerCount}</Badge>}</TableCell>
    </TableRow>
  )
}
```

## Git Workflow

```
Branch:   feature/[task-name]     (e.g., feature/domain-types)
Commits:  conventional commits    (feat:, fix:, chore:, test:)
PRs:      require passing tests + typecheck
```

## Testing

```bash
# Run all tests
bun test

# Run credentialing tests only
bun test packages/credentialing

# Test files
packages/credentialing/src/__tests__/happy-path.test.ts
packages/credentialing/src/__tests__/negative-paths.test.ts
```

### Happy Path Test
Creates case → records all required docs (seed template = 5: rn_license, bls_cert, tb_test, physical, background_check) → runs 2 verifications (nursys, oig_sam — deterministic mock pass) → advances through all 8 states → reaches cleared. Verifies case_events audit trail completeness (one event per mutation).

### Negative Path Tests
1. Missing docs blocks `documents_collected` transition → returns blocker listing missing docTypes
2. Adverse finding blocks `packet_assembled` → Verification with pass=false and no Approval with decision IN (approved, waiver)
3. Invalid evidence rejected by `runVerification` → missing sourceUrl throws validation error
4. Agent cannot `recordApproval` → actorType='agent' is rejected (session context is agent)

### Additional Required Tests
5. Close allowed from every non-terminal state; no transitions out of cleared or closed
6. Caller-supplied actorType/actorId stripped — CaseEvent uses session context
7. Missing session context rejected for all mutating tools
8. Failed verification + waiver approval allows packet_assembled; rejected approval re-blocks
9. Template update affects new cases only — existing case guards use snapshot
10. fileRef outside canonical path is rejected by recordDocument
11. classifyDocument returns a docType for an uploaded document
12. createTemplate / queryTemplates work; non-case-scoped tools produce no CaseEvents
13. Approval.reviewer matches session humanUserId, not caller input

All tests run against in-memory SQLite (`:memory:`), no human interaction required.

## Boundaries

### ALWAYS (proceed without asking)
- Run `bun test` after any backend change
- Run `bun run typecheck:all` after type changes
- Create CaseEvent for every mutation
- Validate evidence blobs before recording verifications
- Use Zod schemas for all MCP tool inputs
- Use SQLite transactions for multi-write operations
- Follow existing patterns from `packages/shared/` for new code in `packages/credentialing/`

### ASK FIRST (pause for approval)
- Adding new dependencies to root `package.json`
- Changing the state machine's state enum or transition map after Task 3 is complete
- Changing entity schemas after Task 1 is complete
- Note: modifying `permission-manager.ts` and `ipc.ts` is expected during Tasks 5 and 8 respectively — no approval needed for those planned changes

### NEVER
- Modify `BaseAgent`, `ClaudeAgent`, or `CodexAgent` classes
- Modify the credential encryption system (`packages/shared/src/credentials/`)
- Store file blobs in SQLite (use filesystem with fileRef pointer)
- Allow agents to record approvals (actorType must be 'human')
- Skip CaseEvent writes on any case-scoped mutation
- Submit incomplete packets (guards must pass)
- Bypass adverse finding review without human approval
- Add "Co-Authored-By: Claude" to commits
- Add doc comments on internal types
- Add server sync, multi-tenant, or mobile features (out of scope)
- Use inheritance for CaseManager (use composition)

## Constraints & Domain Knowledge

### Codebase Seams (verified integration points)
- **Agent backend**: `packages/shared/src/agent/base-agent.ts` → BaseAgent abstract class. Do not modify. CaseManager wraps SessionManager instead.
- **MCP sources**: `packages/shared/src/sources/server-builder.ts` → SourceServerBuilder. Register credentialing as workspace source with stdio type.
- **Permissions**: `packages/shared/src/agent/core/permission-manager.ts` → `evaluateToolCall()`. Extend to recognize credentialing-sensitive operations.
- **Sessions**: `apps/electron/src/main/sessions.ts` → SessionManager. CaseManager wraps this via composition.
- **IPC**: `apps/electron/src/main/ipc.ts` → Add credentialing IPC handlers alongside existing ones.
- **Credentials**: `packages/shared/src/credentials/` → AES-256-GCM. Reuse as-is, no new credentials stored in MVP.

### Domain Pitfalls
- State machine transitions must be atomic (case update + event write in one SQLite transaction) to prevent audit drift
- Evidence blobs require both `sourceUrl` and `timestamp` — never record a verification without them
- Approval model is per-finding (verificationId), not per-case — this prevents blanket approvals
- Document `fileRef` paths must be stable (don't move files after recording)
- FacilityTemplate arrays (requiredDocTypes, requiredVerificationTypes) are stored as JSON TEXT in SQLite — parse on read

### MVP Assumptions (mock for now)
- External verification sources (Nursys, OIG/SAM, state boards) return deterministic mock responses — no real external API calls in MVP
- Document classification uses `call_llm` pattern (LLM-based for MVP)
- No real VMS/MSP portal integration
- Single workspace, single user
- Mock adapters implement the same interface as future real adapters (strategy pattern for easy swap)

### Out of Scope (explicit)
- Server sync / multi-user collaboration
- Cross-device syncing
- Non-SQLite persistence backends
- Mobile app
- Multi-tenant architecture
- Real facility API integrations

## Task Dependency Order

```
1 (types+schema) → 2 (repos) → 3 (FSM) → 4a (core tools) → 4b (verification/approval tools)
  → 5 (guardrails) → 6 (tests) → 7 (agent prompts) → 8 (CaseManager)
    → 9 (dashboard) → 10 (timeline) → 11 (approval modal + template editor)

12 (rebranding) — independent, can run anytime
```

## Verification

After implementing each task:
1. Run `bun test` — all tests pass
2. Run `bun run typecheck:all` — no type errors
3. Verify acceptance criteria from plan are met
4. For backend tasks (1-6): run integration tests
5. For UI tasks (9-11): verify IPC channels work with mock data
6. For Task 6 specifically: all test scenarios pass (1 happy + 4 negative + 9 additional)
7. Final verification: `bun run electron:build` succeeds

## Contract Appendix

### CaseManager API (wraps SessionManager via composition)

```typescript
class CaseManager {
  constructor(private sessionManager: SessionManager, private db: Database) {}

  createCase(clinicianData: Omit<Clinician, 'id' | 'createdAt'>, facilityId: string): Case
  // Snapshots template requirements onto Case at creation time

  spawnAgentForCase(caseId: string, agentRole: AgentRole): AgentSession
  // Creates agent session with role-specific tool subset

  getActiveCaseAgent(caseId: string): AgentSession | null
  listCaseAgents(caseId: string): AgentSession[]
}
```

### MCP Tool Input Schemas (Zod)

```typescript
// createCase
z.object({ clinicianName: z.string(), profession: z.string(), npi: z.string(),
  primaryLicenseState: z.string(), primaryLicenseNumber: z.string(),
  email: z.string().email(), phone: z.string(), facilityId: z.string(),
  startDate: z.string().nullable().optional() })

// recordDocument
z.object({ caseId: z.string(), docType: z.string(), fileRef: z.string().nullable(),
  metadata: z.record(z.unknown()).optional() })

// classifyDocument
z.object({ caseId: z.string(), documentId: z.string() })

// runVerification
z.object({ caseId: z.string(), verificationType: z.string() })

// transitionState
z.object({ caseId: z.string(), targetState: z.nativeEnum(CaseState) })

// recordApproval (actorType/actorId injected by server, not in schema)
z.object({ caseId: z.string(), verificationId: z.string().nullable(),
  decision: z.enum(['approved', 'rejected', 'waiver']), notes: z.string() })

// updateTemplate (not case-scoped — does NOT write CaseEvent)
z.object({ facilityId: z.string(), name: z.string().optional(), jurisdiction: z.string().optional(),
  requiredDocTypes: z.array(z.string()).optional(),
  requiredVerificationTypes: z.array(z.string()).optional() })

// createTemplate (not case-scoped — does NOT write CaseEvent)
z.object({ name: z.string(), jurisdiction: z.string(),
  requiredDocTypes: z.array(z.string()),
  requiredVerificationTypes: z.array(z.string()) })

// queryTemplates (not case-scoped)
z.object({ facilityId: z.string().optional(), jurisdiction: z.string().optional(),
  name: z.string().optional() })
```

### IPC Payload Contracts

```typescript
// All IPC responses
type IpcResponse<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } }

// Blocker (used in checkGuards response)
type BlockerType = 'missing_document' | 'failed_verification' | 'missing_approval' | 'missing_case_approval'
interface Blocker {
  type: BlockerType
  description: string
  requiredItem: string            // the docType or verificationType that is blocked
  verificationId?: string         // present when type is 'failed_verification' or 'missing_approval'
  docTypes?: string[]             // present when type is 'missing_document' — lists all missing
}

// checkGuards response
interface GuardResult { allowed: boolean; blockers: Blocker[] }
```

### Actor Identity Provenance

```
MCP tool call arrives
  → MCP server reads session context (agentId or humanUserId)
  → Injects actorType ('agent' | 'human') + actorId into CaseEvent
  → Caller CANNOT specify actorType/actorId (stripped if present)
  → recordApproval rejects if actorType !== 'human'
  → recordApproval sets Approval.reviewer = session.humanUserId (not caller-provided)
  → All mutating MCP tools reject when no authenticated session principal is present
```

### Requirement Snapshot Lifecycle

```
createCase(clinicianData, facilityId)
  → reads FacilityTemplate for facilityId
  → copies requiredDocTypes → case.requiredDocTypesSnapshot
  → copies requiredVerificationTypes → case.requiredVerificationTypesSnapshot
  → sets case.templateVersion = template.version (integer)
  → ALL guards evaluate against snapshot fields, never live template
  → Template edits affect only future cases, never existing ones
```

## Requirements Traceability

| Req | Description | Spec Section | Tool(s) | Test(s) |
|-----|-------------|-------------|---------|---------|
| R0 | Explicit state transitions offer→cleared | State Machine, CaseState Enum | transitionState | Happy path, Test 5 |
| R1 | Guarded transitions with prerequisites | State Machine guards | checkGuards, transitionState | Tests 1, 2, 8 |
| R2 | Agents collect docs via structured requests | Agent Topology (DocCollector) | recordDocument | Happy path |
| R3 | Verify against primary sources | Agent Topology (Verifier) | runVerification | Happy path, Test 3 |
| R4 | Classify and extract doc data | Agent Topology (DocCollector) | classifyDocument | Test 11 |
| R5 | Adverse findings escalate to human | Approval Model | recordApproval | Tests 2, 4, 8 |
| R6 | Incomplete packets cannot submit | State Machine guards | checkGuards, transitionState | Test 1 |
| R7 | Facility requirements as templates | FacilityTemplate, Snapshot Lifecycle | createTemplate, updateTemplate | Test 9, 12 |
| R8 | Verification results with evidence | Verification entity, Domain Pitfalls | runVerification | Test 3 |
| R9 | Permission gating for sensitive ops | Actor Identity Provenance | recordApproval | Tests 4, 6, 7, 13 |
| R10 | Dashboard with case state/blockers | UI Views (Dashboard) | queryCases, checkGuards | UI verification |
| R11 | Timestamped event log per case | CaseEvent entity | getCaseTimeline | Happy path |
| R12 | Add facility without code changes | Template tools | createTemplate | Test 12 |
| R13 | Least-privilege tool access per agent | Agent Topology (tool subsets) | CaseManager.spawnAgentForCase | Agent prompt tests |

## Reference Documents

- **Shaping doc**: `.docs/shaping/credentialing-platform-shaping.md` — requirements, constraints, breadboard, fit check
- **Task plan**: `.docs/plans/credentialing-platform-plan.md` — 13 tasks with acceptance criteria and contract appendix
