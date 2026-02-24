# Credentialing Platform — Implementation Plan

**Goal:** Transform craft-agents-oss into Advantis Agents — a credentialing platform where AI agents orchestrate clinician onboarding from offer-accepted to cleared-to-start with minimal human intervention.

**Scope:**
- In: Domain data layer (SQLite), state machine, MCP tools, agent topology, dashboard UI, approval gates
- Out: Real facility API integrations (mock for MVP), server sync, mobile app, multi-tenant

**Authoritative Spec:** `SPEC.md` (Codex reviewed, 5/5 PASS)
**Shaping Doc:** `.docs/shaping/credentialing-platform-shaping.md`

**Status:** Reviewed — aligned with SPEC.md (2026-02-23)

---

## Contract Appendix

All entity definitions, guards, tool schemas, IPC contracts, and safety rules below are copied from SPEC.md. If SPEC.md and this file ever diverge, SPEC.md wins.

### Entity Field Definitions

```typescript
interface Clinician {
  id: string
  name: string
  profession: string              // e.g., 'RN', 'LPN', 'CNA'
  npi: string
  primaryLicenseState: string     // U.S. jurisdiction abbreviation, e.g., 'TX'
  primaryLicenseNumber: string
  email: string
  phone: string
  createdAt: string
}

interface Case {
  id: string
  clinicianId: string             // FK → clinicians.id
  facilityId: string              // FK → facility_templates.id
  state: CaseState
  startDate: string | null        // expected assignment start date
  templateVersion: number         // snapshot of template.version at creation
  requiredDocTypesSnapshot: string[]           // frozen copy of template.requiredDocTypes
  requiredVerificationTypesSnapshot: string[]  // frozen copy of template.requiredVerificationTypes
  createdAt: string
  updatedAt: string
}

interface Document {
  id: string
  caseId: string                  // FK → cases.id
  docType: string                 // e.g., 'rn_license', 'bls_cert', 'tb_test'
  status: 'pending' | 'received' | 'verified' | 'rejected'
  fileRef: string | null          // absolute path to file on disk
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Verification {
  id: string
  caseId: string                  // FK → cases.id
  verificationType: string        // e.g., 'nursys', 'oig_sam'
  source: string
  pass: boolean
  evidence: {
    sourceUrl: string             // REQUIRED — URL of verification source
    timestamp: string             // REQUIRED — ISO 8601
    responseData: Record<string, unknown>
  }
  createdAt: string
}

interface Approval {
  id: string
  caseId: string                  // FK → cases.id
  verificationId: string | null   // FK → verifications.id (null = case-level)
  decision: 'approved' | 'rejected' | 'waiver'
  reviewer: string                // server-injected from session.humanUserId
  notes: string
  createdAt: string
}

interface FacilityTemplate {
  id: string
  name: string                    // e.g., "General Hospital TX"
  jurisdiction: string            // U.S. state abbreviation (NOT "state" — avoids CaseState collision)
  version: number                 // monotonically increasing, bumped on every update
  requiredDocTypes: string[]
  requiredVerificationTypes: string[]
  createdAt: string
  updatedAt: string
}

interface CaseEvent {
  id: string
  caseId: string                  // FK → cases.id
  eventType: 'state_transition' | 'document_recorded' | 'verification_completed'
           | 'approval_recorded' | 'packet_assembled' | 'case_created' | 'case_closed'
  actorType: 'agent' | 'human' | 'system'
  actorId: string
  evidenceRef: string | null      // primary evidence ID; additional refs in payload
  payload: Record<string, unknown>
  timestamp: string
}

enum CaseState {
  offer_accepted = 'offer_accepted',
  documents_requested = 'documents_requested',
  documents_collected = 'documents_collected',
  verification_in_progress = 'verification_in_progress',
  verification_complete = 'verification_complete',
  packet_assembled = 'packet_assembled',
  submitted = 'submitted',
  cleared = 'cleared',           // terminal
  closed = 'closed',             // terminal — reachable from any non-terminal state
}
```

### State Machine Guards

```
documents_collected:
  For each docType in case.requiredDocTypesSnapshot,
  latest Document (ORDER BY createdAt DESC, id DESC)
  has status IN ('received', 'verified') AND fileRef != null

verification_complete:
  All case.requiredVerificationTypesSnapshot have at least
  one Verification record (pass may be true or false —
  adverse findings handled at packet_assembled)

packet_assembled:
  No adverse finding without Approval (decision IN approved/waiver)
  Adverse finding = Verification with pass=false and no corresponding
  Approval where latest decision IN ('approved', 'waiver')

submitted:
  Case-level Approval (verificationId=null, decision='approved')
```

### Approval Model

- Per-finding (tied to verificationId), not per-case
- Only `decision IN ('approved', 'waiver')` clears the adverse-finding blocker; `'rejected'` leaves the finding blocking
- Only humans can record approvals — MCP server enforces via runtime session context
- Case-level approval for final submission uses `verificationId: null`
- Multiple Approval records per finding — latest governs (ORDER BY createdAt DESC, id DESC LIMIT 1)
- `Approval.reviewer` is server-injected from `session.humanUserId`, not caller-provided

### Actor Identity Provenance

```
MCP tool call arrives
  → MCP server reads session context (agentId or humanUserId)
  → Injects actorType ('agent' | 'human') + actorId into CaseEvent
  → Caller CANNOT specify actorType/actorId (stripped if present)
  → recordApproval rejects if actorType !== 'human'
  → recordApproval sets Approval.reviewer = session.humanUserId
  → All mutating MCP tools reject when no session principal present
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

### Document Storage

- SQLite stores metadata only
- File blobs at `{workspacePath}/credentialing/{caseId}/docs/{documentId}.{ext}`
- `fileRef` stores absolute path — server validates it normalizes under canonical directory
- Paths outside canonical directory are rejected
- Multiple Documents per (caseId, docType) — latest governs

### IPC Contracts

```typescript
// All IPC responses
type IpcResponse<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } }

// Blocker types
type BlockerType = 'missing_document' | 'failed_verification' | 'missing_approval' | 'missing_case_approval'

interface Blocker {
  type: BlockerType
  description: string
  requiredItem: string              // docType or verificationType that is blocked
  verificationId?: string           // present for failed_verification / missing_approval
  docTypes?: string[]               // present for missing_document — lists all missing
}

interface GuardResult { allowed: boolean; blockers: Blocker[] }
```

### MCP Tools (13 total)

```
Case Management:     createCase, queryCases, getCaseTimeline
Documents:           recordDocument, classifyDocument
Verification:        runVerification, checkGuards, getFindingDetail
State:               transitionState
Approvals:           recordApproval
Templates:           createTemplate, updateTemplate, queryTemplates
Packet:              assemblePacket
```

- `updateTemplate`, `createTemplate`, `queryTemplates` are NOT case-scoped — no CaseEvents
- All other mutating tools write CaseEvents with actor identity from session

### MCP Tool Zod Schemas

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

// createTemplate (not case-scoped)
z.object({ name: z.string(), jurisdiction: z.string(),
  requiredDocTypes: z.array(z.string()),
  requiredVerificationTypes: z.array(z.string()) })

// updateTemplate (not case-scoped)
z.object({ facilityId: z.string(), name: z.string().optional(), jurisdiction: z.string().optional(),
  requiredDocTypes: z.array(z.string()).optional(),
  requiredVerificationTypes: z.array(z.string()).optional() })

// queryTemplates (not case-scoped)
z.object({ facilityId: z.string().optional(), jurisdiction: z.string().optional(),
  name: z.string().optional() })
```

---

## Tasks

### Task 1 — "Create credentialing package with domain types and SQLite schema"

**Acceptance Criteria:**
- `packages/credentialing/package.json` exists with `better-sqlite3` as dependency
- `packages/credentialing/tsconfig.json` extends root tsconfig
- `src/types.ts` exports all 7 entity interfaces + CaseState enum + BlockerType matching Contract Appendix exactly (including Clinician.profession, primaryLicenseState, primaryLicenseNumber; Case.startDate, templateVersion, requiredDocTypesSnapshot, requiredVerificationTypesSnapshot; FacilityTemplate.jurisdiction, version as number)
- `src/schema.sql` defines 7 tables:
  - `cases.state` TEXT NOT NULL DEFAULT 'offer_accepted'
  - `cases.templateVersion` INTEGER NOT NULL
  - `cases.requiredDocTypesSnapshot` TEXT NOT NULL (JSON array)
  - `cases.requiredVerificationTypesSnapshot` TEXT NOT NULL (JSON array)
  - `facility_templates.jurisdiction` TEXT NOT NULL (not "state")
  - `facility_templates.version` INTEGER NOT NULL DEFAULT 1
  - `verifications.evidence` TEXT NOT NULL (JSON)
  - `case_events.actorType` TEXT NOT NULL CHECK(actorType IN ('agent','human','system'))
  - `case_events.eventType` includes 'case_closed'
  - All tables: `id TEXT PRIMARY KEY`, foreign keys reference parent tables
  - Indexes on `cases(clinicianId)`, `cases(facilityId)`, `cases(state)`, `documents(caseId)`, `verifications(caseId)`, `case_events(caseId)`
- `src/database.ts` exports `Database` class: `constructor(dbPath: string)` runs schema.sql, WAL mode, `close(): void`
- Package builds without errors

**Files:** `packages/credentialing/package.json`, `tsconfig.json`, `src/types.ts`, `src/schema.sql`, `src/database.ts`, `src/index.ts`

- [ ] 1. Create `packages/credentialing/` with package.json (better-sqlite3 dep) and tsconfig.json
- [ ] 2. Define all entity interfaces + CaseState enum + BlockerType in `src/types.ts`
- [ ] 3. Write SQLite schema DDL in `src/schema.sql` with CHECK constraints, indexes, foreign keys
- [ ] 4. Implement `Database` class in `src/database.ts` with WAL mode and schema init
- [ ] 5. Add `src/index.ts` barrel export

### Task 2 — "Implement typed repository layer for all domain entities"

**Acceptance Criteria:**
- Repository classes: CaseRepository, ClinicianRepository, DocumentRepository, VerificationRepository, ApprovalRepository, FacilityTemplateRepository, CaseEventRepository
- Each constructor takes `(db: Database)` — no other signatures
- `CaseRepository.create()` snapshots template requirements onto Case (templateVersion, requiredDocTypesSnapshot, requiredVerificationTypesSnapshot)
- `CaseRepository.queryCases(filters: { state?: CaseState, facilityId?: string })` returns `Case[]`
- `DocumentRepository.getLatestByDocType(caseId: string, docType: string)` returns latest Document (ORDER BY createdAt DESC, id DESC)
- `ApprovalRepository.getLatestByVerificationId(verificationId: string)` returns latest Approval (ORDER BY createdAt DESC, id DESC)
- `CaseEventRepository.getTimeline(caseId: string)` returns `CaseEvent[]` ordered by timestamp ASC
- All create methods return created entity with generated `id`
- All repositories throw typed errors (not raw SQL errors)
- JSON array fields (requiredDocTypesSnapshot, requiredVerificationTypes) parsed on read

**Files:** `packages/credentialing/src/repositories/`

- [ ] 1. Create `ClinicianRepository` with create, getById, update, list
- [ ] 2. Create `CaseRepository` with create (snapshots template), getById, update, queryCases, getByClinicianId
- [ ] 3. Create `DocumentRepository` with create, getById, getByCaseId, getLatestByDocType, updateStatus
- [ ] 4. Create `VerificationRepository` with create, getById, getByCaseId, getByType
- [ ] 5. Create `ApprovalRepository` with create, getByCaseId, getLatestByVerificationId
- [ ] 6. Create `FacilityTemplateRepository` with create, getById, update (bumps version), list
- [ ] 7. Create `CaseEventRepository` with create, getTimeline(caseId)
- [ ] 8. Add barrel export from `repositories/index.ts`

### Task 3 — "Build state machine engine with transition guards"

**Acceptance Criteria:**
- CaseState enum with 9 values (including `closed`)
- `VALID_TRANSITIONS` map: sequential transitions + `closed` reachable from any non-terminal state; no transitions out of `cleared` or `closed`
- `StateMachine` constructor takes `(caseId: string, repos: { case, document, verification, approval, caseEvent })`
- `canTransition(targetState)` returns `GuardResult` with typed `Blocker[]`
- `transition(targetState, actor: { actorType, actorId })` throws `GuardError` if blocked, otherwise updates case state + writes CaseEvent atomically (SQLite transaction)
- Guards use case snapshot fields (requiredDocTypesSnapshot, requiredVerificationTypesSnapshot), NOT live template data
- Guard: `documents_collected` — for each docType in snapshot, latest Document has status IN ('received', 'verified') AND fileRef != null
- Guard: `verification_complete` — all requiredVerificationTypesSnapshot have at least one Verification record (pass may be true or false)
- Guard: `packet_assembled` — no Verification with pass=false lacking an Approval where latest decision IN ('approved', 'waiver')
- Guard: `submitted` — case-level Approval (verificationId=null, decision='approved')
- Transition to `closed` allowed from any non-terminal state with `case_closed` event type

**Files:** `packages/credentialing/src/state-machine.ts`, `packages/credentialing/src/guards.ts`

- [ ] 1. Define CaseState enum (9 values) and VALID_TRANSITIONS map (including closed from any non-terminal)
- [ ] 2. Implement guard functions using snapshot fields, each returning `GuardResult`
- [ ] 3. Implement `StateMachine.canTransition()` composing guards
- [ ] 4. Implement `StateMachine.transition()` with SQLite transaction (case update + event write atomic)
- [ ] 5. Add adverse-finding detection in packet_assembled guard (latest Approval governs)
- [ ] 6. Add close transition logic (any non-terminal → closed, event type case_closed)

### Task 4a — "Create MCP server with core case/document/state tools"

**Acceptance Criteria:**
- `packages/credentialing/src/mcp-server.ts` creates MCP server using `createSdkMcpServer` pattern
- Tools exposed: `createCase`, `queryCases`, `getCaseTimeline`, `recordDocument`, `transitionState`, `checkGuards`
- Each tool has Zod schema matching Contract Appendix
- `createCase`:
  - Creates Clinician + Case in transaction
  - Snapshots template requirements onto Case (templateVersion, requiredDocTypesSnapshot, requiredVerificationTypesSnapshot)
  - Creates docs directory at `{workspacePath}/credentialing/{caseId}/docs/`
  - Writes CaseEvent (type: case_created)
- `recordDocument`:
  - Validates fileRef under canonical path `{workspacePath}/credentialing/{caseId}/docs/`
  - Writes Document + CaseEvent (type: document_recorded)
- `transitionState` delegates to StateMachine, returns blockers on failure
- Actor identity: actorType/actorId runtime-injected from session context, stripped if caller-provided
- All mutating tools reject when no session principal present

**Files:** `packages/credentialing/src/mcp-server.ts`, `packages/credentialing/src/tools/case-tools.ts`, `packages/credentialing/src/tools/document-tools.ts`

- [ ] 1. Create `mcp-server.ts` that instantiates Database and repositories, reads session context
- [ ] 2. Implement actor identity injection (read session, strip caller values, inject actorType/actorId)
- [ ] 3. Implement createCase with template snapshot + docs directory creation + CaseEvent
- [ ] 4. Implement queryCases, getCaseTimeline with Zod schemas
- [ ] 5. Implement recordDocument with fileRef path validation + CaseEvent
- [ ] 6. Implement transitionState and checkGuards — delegates to StateMachine

### Task 4b — "Add verification, approval, template, and packet tools"

**Acceptance Criteria:**
- Additional tools: `runVerification`, `recordApproval`, `assemblePacket`, `createTemplate`, `updateTemplate`, `queryTemplates`, `getFindingDetail`, `classifyDocument`
- `runVerification`: calls mock adapter, records Verification with evidence blob `{ sourceUrl, timestamp, responseData }`, writes CaseEvent; rejects if sourceUrl or timestamp missing
- `recordApproval`: rejects if actorType !== 'human'; sets Approval.reviewer from session.humanUserId (not caller); writes CaseEvent
- `assemblePacket`: checks all docs + verifications complete, produces packet manifest, writes CaseEvent
- `classifyDocument`: uses call_llm pattern, returns docType + metadata
- `createTemplate`: creates new FacilityTemplate (version=1), NOT case-scoped, no CaseEvent
- `updateTemplate`: bumps version, NOT case-scoped, no CaseEvent
- `queryTemplates`: reads templates with optional filters, NOT case-scoped
- Source config file exists at `config.json` with `type: 'stdio'` and fields required by SourceServerBuilder registration flow
- Mock adapters implement same interface as future real adapters (strategy pattern)

**Files:** `packages/credentialing/src/tools/verification-tools.ts`, `approval-tools.ts`, `template-tools.ts`, `packet-tools.ts`, source `config.json`

- [ ] 1. Implement runVerification with mock adapter + guardrails.validateEvidence() (sourceUrl + timestamp required)
- [ ] 2. Implement recordApproval with human-only check + server-injected reviewer
- [ ] 3. Implement assemblePacket with completeness validation
- [ ] 4. Implement createTemplate (new tool — version=1, not case-scoped)
- [ ] 5. Implement updateTemplate (bumps version) and queryTemplates
- [ ] 6. Implement getFindingDetail
- [ ] 7. Implement classifyDocument using call_llm pattern (R4 coverage)
- [ ] 8. Create source config.json for SourceServerBuilder registration
- [ ] 9. Register credentialing as workspace source

### Task 5 — "Extend PermissionManager with credentialing approval gates"

**Acceptance Criteria:**
- `PermissionManager.evaluateToolCall()` recognizes `transitionState` with targetState `submitted` as always requiring human confirmation
- `PermissionManager.evaluateToolCall()` recognizes `recordApproval` with decision `waiver` as always requiring human confirmation
- These checks fire regardless of permission mode (safe, ask, allow-all)
- Evidence validation function exported from `guardrails.ts`: `validateEvidence(evidence: unknown)` returns `{ valid: boolean, errors: string[] }` — requires `sourceUrl` (valid URL) and `timestamp` (ISO 8601)
- Note: evidence validation is wired into runVerification in Task 4b; session principal rejection is wired into mcp-server.ts in Task 4a. This task focuses on PermissionManager gates + the exported guardrail function itself.

**Files:** `packages/shared/src/agent/core/permission-manager.ts`, `packages/credentialing/src/guardrails.ts`

- [ ] 1. Add credentialing operation detection in `evaluateToolCall()`
- [ ] 2. Implement `validateEvidence()` in `guardrails.ts`
- [ ] 3. Wire approval gate into transitionState for submitted state

### Task 6 — "Integration tests: 15 test scenarios"

**Acceptance Criteria:**
All tests run against in-memory SQLite (`:memory:`), no human interaction required.

**Happy Path (1 test):**
1. Creates case → records all 5 required docs (rn_license, bls_cert, tb_test, physical, background_check) → runs 2 verifications (nursys, oig_sam — mock pass) → advances through all 8 states → reaches cleared. Verifies case_events has one event per mutation with correct actorType/actorId/evidenceRef.

**Negative Paths (4 tests):**
2. Missing docs blocks `documents_collected` → returns blocker listing missing docTypes
3. Adverse finding (pass=false, no approval) blocks `packet_assembled`
4. Invalid evidence (missing sourceUrl) rejected by `runVerification`
5. Agent actorType cannot `recordApproval` → rejected

**Additional Tests (10 tests):**
6. Close allowed from every non-terminal state; no transitions out of cleared or closed
7. Caller-supplied actorType/actorId stripped — CaseEvent uses session context
8. Missing session context rejected for all mutating tools
9. Failed verification + waiver approval allows packet_assembled; rejected approval re-blocks
10. Template update affects new cases only — existing case guards use snapshot
11. fileRef outside canonical path rejected by recordDocument
12. classifyDocument returns a docType for an uploaded document
13. createTemplate / queryTemplates work; non-case-scoped tools produce no CaseEvents
14. Approval.reviewer matches session humanUserId, not caller input
15. Agent tool subsets enforce least privilege — each role cannot invoke tools outside AgentConfig.toolSubset

**Files:** `packages/credentialing/src/__tests__/happy-path.test.ts`, `packages/credentialing/src/__tests__/negative-paths.test.ts`, `packages/credentialing/src/__tests__/additional.test.ts`

- [ ] 1. Set up test harness with in-memory SQLite + all repositories + seed template ("General Hospital TX", 5 doc types, 2 verification types)
- [ ] 2. Happy path: create case (verify snapshot), record 5 docs, run 2 verifications, advance all 8 states, verify cleared + audit trail
- [ ] 3. Negative: missing docs blocks documents_collected
- [ ] 4. Negative: adverse finding blocks packet_assembled
- [ ] 5. Negative: invalid evidence rejected
- [ ] 6. Negative: agent cannot recordApproval
- [ ] 7. Close from every non-terminal state; no transitions out of terminals
- [ ] 8. Actor identity stripped — session context used
- [ ] 9. Missing session context rejected
- [ ] 10. Waiver approval clears; rejected re-blocks
- [ ] 11. Snapshot isolation — template update doesn't affect existing case
- [ ] 12. fileRef path validation
- [ ] 13. classifyDocument returns docType
- [ ] 14. Non-case-scoped tools produce no CaseEvents
- [ ] 15. Approval.reviewer matches session humanUserId
- [ ] 16. Agent tool subsets enforce least privilege (R13)

### Task 7 — "Define agent topology with role-specific prompts"

**Acceptance Criteria:**
- Six `.md` prompt files in `packages/credentialing/src/agents/`
- Each prompt specifies: role, exact MCP tool names allowed, behavioral constraints
- Coordinator prompt includes dispatch table: `{ [CaseState]: agentRole }`
- `agents/index.ts` exports `AgentConfig[]` where `AgentConfig = { name: string, promptPath: string, toolSubset: string[] }`

**Files:** `packages/credentialing/src/agents/`

- [ ] 1. Create coordinator.md with state→agent dispatch table
- [ ] 2. Create intake.md (tools: createCase, queryCases)
- [ ] 3. Create doc-collector.md (tools: recordDocument, classifyDocument, queryCases, getCaseTimeline)
- [ ] 4. Create verifier.md (tools: runVerification, checkGuards, queryCases, getCaseTimeline)
- [ ] 5. Create packet-assembler.md (tools: assemblePacket, checkGuards, queryCases)
- [ ] 6. Create quality-review.md (tools: checkGuards, getCaseTimeline, queryCases, getFindingDetail)
- [ ] 7. Create agents/index.ts exporting AgentConfig array

### Task 8 — "Implement CaseManager for agent session management"

**Acceptance Criteria:**
- `CaseManager` wraps `SessionManager` (composition, NOT inheritance)
- `CaseManager.spawnAgentForCase(caseId, agentRole)` creates session with role's system prompt + tool subset
- `CaseManager.getActiveCaseAgent(caseId)` returns `AgentSession | null`
- Tool subset filtering: agent sessions only see MCP tools listed in AgentConfig.toolSubset
- IPC channels: `credentialing:spawn-agent`, `credentialing:get-active-agent`, `credentialing:list-case-agents`
- CaseManager initialized in Electron main process alongside SessionManager

**Files:** `apps/electron/src/main/case-manager.ts`, IPC additions in `apps/electron/src/main/ipc.ts`

- [ ] 1. Create CaseManager class with Map<caseId, { role, sessionId }>
- [ ] 2. Implement spawnAgentForCase using SessionManager.createSession + role prompt injection
- [ ] 3. Implement tool subset filtering via source server config filtering
- [ ] 4. Add IPC handlers for case-agent lifecycle
- [ ] 5. Wire CaseManager init into Electron main startup

### Task 9 — "Build dashboard view (case grid) in Electron renderer"

**Acceptance Criteria:**
- `Dashboard.tsx`: shadcn/ui Table with columns: clinician name, facility, state (colored badge), blockers (count), assigned agent, last updated
- `StateFilter.tsx`: dropdown filters by all 9 CaseState values
- "New Case" button → `NewCaseForm.tsx` modal: clinician name, profession, NPI, primaryLicenseState, primaryLicenseNumber, email, phone, facility (dropdown from templates), startDate
- Row click → `/case/:caseId` route
- Data via `credentialing:query-cases` IPC; create via `credentialing:create-case` IPC

**Files:** `apps/electron/src/renderer/components/dashboard/`

- [ ] 1. Create Dashboard.tsx with case grid table
- [ ] 2. Create CaseRow.tsx with state badge and blocker count
- [ ] 3. Create NewCaseForm.tsx modal (all Clinician fields + facility + startDate)
- [ ] 4. Create StateFilter.tsx dropdown (9 states)
- [ ] 5. Add IPC channels for queryCases and createCase in preload bridge
- [ ] 6. Wire dashboard as new route in renderer

### Task 10 — "Build case timeline view in Electron renderer"

**Acceptance Criteria:**
- `CaseTimeline.tsx`: chronological CaseEvent list for single case
- `TimelineEvent.tsx`: type-specific rendering (state_transition → arrow, document → file icon, verification → pass/fail badge, approval → decision, case_closed → close icon)
- `DocumentChecklist.tsx`: compares `case.requiredDocTypesSnapshot` vs collected Documents with status IN ('received', 'verified')
- `BlockerBanner.tsx`: calls checkGuards IPC, displays Blocker[] if not allowed
- "Run Verification", "Advance State", "Review Finding" action buttons
- "Advance State" enabled when checkGuards.allowed === true

**Files:** `apps/electron/src/renderer/components/case-timeline/`

- [ ] 1. Create CaseTimeline.tsx with event list + document checklist + blocker banner
- [ ] 2. Create TimelineEvent.tsx with eventType-specific rendering (including case_closed)
- [ ] 3. Create DocumentChecklist.tsx comparing snapshot vs collected
- [ ] 4. Create BlockerBanner.tsx with checkGuards IPC call
- [ ] 5. Add action buttons (Run Verification, Advance State, Review Finding)
- [ ] 6. Add IPC channels for timeline, verification, transition, checkGuards

### Task 11 — "Implement approval modal and template editor"

**Acceptance Criteria:**
- `ApprovalModal.tsx`: verification source, evidence summary, pass/fail
- Buttons: Approve, Reject, Request Waiver → `credentialing:record-approval` IPC
- After approval recorded, timeline refreshes and BlockerBanner re-evaluates
- `TemplateEditor.tsx`: lists templates via `credentialing:query-templates` IPC
- "New Template" button (uses documented template IPC channels; add `credentialing:create-template` IPC only if SPEC IPC Contracts are amended)
- Checklist editor: add/remove docType and verificationType strings
- Seed template "General Hospital TX" (jurisdiction: "TX") inserted on first DB init:
  - requiredDocTypes: ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check']
  - requiredVerificationTypes: ['nursys', 'oig_sam']

**Files:** `apps/electron/src/renderer/components/approval-modal/`, `apps/electron/src/renderer/components/template-editor/`

- [ ] 1. Create ApprovalModal.tsx with finding display + decision buttons
- [ ] 2. Wire modal trigger from case timeline Review Finding button
- [ ] 3. Create TemplateEditor.tsx with template list + "New Template" button
- [ ] 4. Create ChecklistItemEditor.tsx for add/remove
- [ ] 5. Add IPC channels for approval + template query/update per SPEC IPC Contracts
- [ ] 6. Create seed template in database init

### Task 12 — "Rebranding: Craft → Advantis Agents"

**Acceptance Criteria:**
- Electron window title: "Advantis Agents"
- Electron builder config references an icon asset file that exists in the repo (placeholder asset permitted)
- User-facing app name strings in electron-builder productName, window title, and renderer shell text are "Advantis Agents"
- README.md updated with Advantis Agents description

**Files:** `apps/electron/electron-builder.yml`, `apps/electron/package.json`, `README.md`

- [ ] 1. Update electron-builder.yml productName and appId
- [ ] 2. Update window title in window-manager.ts
- [ ] 3. Update root README.md
- [ ] 4. Update user-facing "Craft" strings in renderer

---

## Task Dependencies

```
Critical path (sequential):
  Task 1 (types + schema)
    → Task 2 (repositories)
      → Task 3 (state machine + guards)
        → Task 4a (core MCP tools)
          → Task 4b (verification/approval/template/packet tools)
            → Task 5 (guardrails + PermissionManager)
              → Task 6 (15 integration tests)

Parallel opportunities after Task 4b:
  Task 7 (agent prompts) — may start after Task 4b (tool names frozen),
    can run in parallel with Tasks 5-6
  Task 8 (CaseManager) — starts after Task 7 + session seams identified
  Task 9 (dashboard UI) — starts after Task 8
  Task 10 (timeline UI) — starts after Task 9
  Task 11 (approval modal + template editor) — approval modal after Task 10;
    template editor may start after template IPC is available

Task 12 (rebranding) — independent, can run anytime
```

---

## Requirements Traceability

| Req | Description | Task(s) | Test(s) |
|-----|-------------|---------|---------|
| R0 | Explicit state transitions offer→cleared + closed | Task 3 | Happy path, Test 6 |
| R1 | Guarded transitions with prerequisites | Task 3 | Tests 2, 3, 9 |
| R2 | Agents collect docs via structured requests | Task 4a | Happy path |
| R3 | Verify against primary sources | Task 4b | Happy path, Test 4 |
| R4 | Classify and extract doc data | Task 4b | Test 12 |
| R5 | Adverse findings escalate to human | Task 3, 5, 11 | Tests 3, 5, 9 |
| R6 | Incomplete packets cannot submit | Task 3, 4b | Test 2 |
| R7 | Facility requirements as templates | Task 4b, 11 | Test 10, 13 |
| R8 | Verification results with evidence | Task 4b, 5 | Test 4 |
| R9 | Permission gating for sensitive ops | Task 5 | Tests 5, 7, 8, 14 |
| R10 | Dashboard with case state/blockers | Task 9 | UI verification |
| R11 | Timestamped event log per case | Task 1, 4a, 4b, 6 | Happy path |
| R12 | Add facility without code changes | Task 11 | Test 13 |
| R13 | Least-privilege tool access per agent | Task 7, 8 | Test 15 (tool subset enforcement) |
| C0 | Agent backend preserved | All tasks | No BaseAgent modifications |
| C1 | MCP source/server-builder | Task 4b | Source registration |
| C2 | Credential encryption preserved | — | No new credentials in MVP |
| C3 | Electron architecture preserved | Task 8, 9, 10, 11 | IPC verification |
| C4 | SQLite local only | Task 1 | All tests use :memory: |

---

## Safety Rules (non-negotiable)

These rules apply to every task. Agents executing this plan MUST NOT:
- Modify `BaseAgent`, `ClaudeAgent`, `CodexAgent`, or credential encryption
- Store file blobs in SQLite (use filesystem with fileRef pointer)
- Allow agents to record approvals (only humans, enforced by server)
- Skip CaseEvent writes on any case-scoped mutation
- Submit incomplete packets (guards must pass)
- Bypass adverse findings without human approval
- Use inheritance for CaseManager (use composition)
- Add server sync, multi-tenant, or mobile features

---

## Verification Protocol

After each task:
1. `bun test` — all tests pass
2. `bun run typecheck:all` — no type errors
3. Verify acceptance criteria are met
4. Backend tasks (1-6): run integration tests
5. UI tasks (9-11): verify IPC channels with mock data
6. Task 6: all 15 test scenarios pass
7. Final: `bun run electron:build` succeeds

---

## Codex Review History

**Initial review:** 1/6 PASS → 6/6 PASS after restructuring
**SPEC.md review:** 8/8 FAIL → 6/6 FAIL → 5/5 PASS
**This plan (second review):** 2/6 PASS → 6/6 PASS after fixes (2026-02-23)

Key fixes applied across all reviews:
- Per-case requirement snapshots (templateVersion, requiredDocTypesSnapshot, requiredVerificationTypesSnapshot)
- Actor identity provenance (runtime-injected, not caller-provided)
- verification_complete guard: checks record existence, NOT pass=true (critical — enables adverse-finding flow)
- documents_collected guard: excludes rejected, requires fileRef
- Closed state (from any non-terminal) + case_closed event type
- 15 test scenarios (was 5)
- createTemplate tool (13 total, was 12)
- FacilityTemplate.jurisdiction (not "state"), version as number
- Approval precedence: latest record governs (ORDER BY createdAt DESC, id DESC)
- Approval.reviewer server-injected from session.humanUserId
- fileRef canonical path validation
- Rich Blocker interface with verificationId and docTypes fields
- CaseManager API: spawnAgentForCase / getActiveCaseAgent (matches SPEC.md contract)
- Evidence validation wiring clarified (Task 4b wires, Task 5 exports function)
- Dependency chain parallelized (Task 7 after 4b, Task 12 anytime)
- ApprovalModal removed "severity" (not in spec data model)
- create-template IPC flagged as spec extension (not in SPEC IPC Contracts)
- Vague criteria tightened to pass/fail measurable
- R13 test coverage: added Test 15 (tool subset enforcement)
- 15 test scenarios (was 14)
