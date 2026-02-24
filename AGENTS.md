# AGENTS.md

## Project

Advantis Agents is a travel nurse credentialing platform. AI agents
orchestrate clinician onboarding from offer-accepted to cleared-to-start,
replacing ~12 FTE credentialing specialists with 1-2 human supervisors.

Built on craft-agents-oss (Electron desktop app + MCP + Claude SDK).

## Architecture

```
advantis-agents/
  apps/electron/            Electron app (main/renderer/preload)
  packages/shared/          Agent backends, MCP sources, sessions, hooks
  packages/core/            Shared types (AgentEvent, Message, Session)
  packages/credentialing/   Domain package (state machine, repos, MCP tools)
  packages/ui/              Shared React components
```

### Boundaries

`packages/shared/` and `packages/core/` are inherited infrastructure.
Do NOT modify: BaseAgent, ClaudeAgent, CodexAgent, credential encryption.

`packages/credentialing/` is the new domain package. All credentialing
logic lives here: types, SQLite schema, repositories, state machine,
guards, guardrails, MCP server, tool handlers, agent prompts, tests.

### Key Abstractions

- CaseManager wraps SessionManager via composition (never inheritance)
- StateMachine enforces 9-state FSM with transition guards
- MCP server exposes 13 domain tools as workspace source (stdio)
- Repositories provide typed CRUD over 7 SQLite tables
- 6 agent roles (Coordinator, Intake, DocCollector, Verifier,
  PacketAssembler, QualityReview) with tool subsets

## Tech Stack

- Runtime: Bun 1.x
- Language: TypeScript 5.x (strict mode)
- Framework: Electron 39.x
- UI: React 18 + Vite 6 + Tailwind 4 + shadcn/ui (Radix)
- State: Jotai
- DB: better-sqlite3 (local, WAL mode)
- Validation: Zod 4.x
- MCP: @modelcontextprotocol/sdk 1.24.x
- Build: esbuild (main/preload), Vite (renderer)
- Test: bun test
- Lint: ESLint 9 + @typescript-eslint
- Package: electron-builder 26.x

## Commands

```bash
bun install                      # install dependencies
bun test                         # run all tests
bun test packages/credentialing  # credentialing tests only
bun run typecheck:all            # typecheck all packages
bun run lint                     # lint all packages
bun run electron:build           # build electron app
bun run electron:dev             # dev mode with hot reload
bun run electron:start           # build + launch
```

## State Machine

```
offer_accepted
  -> documents_requested
    -> documents_collected
      -> verification_in_progress
        -> verification_complete
          -> packet_assembled
            -> submitted
              -> cleared (terminal)

closed (terminal, reachable from any non-terminal state)
```

### Transition Guards

- documents_collected: each required docType has a Document with
  status IN (received, verified) and fileRef != null
- verification_complete: each required verificationType has at least
  one Verification record
- packet_assembled: no adverse finding (pass=false) without an
  Approval where decision IN (approved, waiver)
- submitted: case-level Approval (verificationId=null, decision=approved)

Guards evaluate against per-case requirement snapshots frozen at case
creation, never live FacilityTemplate data.

## Data Model (7 tables)

- clinicians: name, profession, npi, license info, contact
- cases: clinicianId, facilityId, state, snapshots of template requirements
- documents: caseId, docType, status, fileRef, metadata
- verifications: caseId, verificationType, source, pass, evidence blob
- approvals: caseId, verificationId, decision, reviewer, notes
- facility_templates: name, jurisdiction, version, required doc/verification types
- case_events: caseId, eventType, actorType, actorId, evidenceRef, payload

## Safety Rules

These rules are non-negotiable regardless of which AI tool is being used.

### Never Do

- Modify BaseAgent, ClaudeAgent, CodexAgent, or credential encryption
- Store file blobs in SQLite (use filesystem with fileRef pointer)
- Allow agents to record approvals (only humans, enforced by server)
- Skip CaseEvent writes on any case-scoped mutation
- Submit incomplete packets (guards must pass)
- Bypass adverse findings without human approval
- Use inheritance for CaseManager (use composition)
- Add server sync, multi-tenant, or mobile features (out of scope)

### Actor Identity

Actor identity (actorType + actorId) is runtime-injected by the MCP
server from authenticated session context. Callers cannot specify it.
recordApproval rejects if actorType is not 'human'.
Approval.reviewer is set from session humanUserId, not caller input.

### Document Storage

SQLite stores metadata only. File blobs live at:
{workspacePath}/credentialing/{caseId}/docs/{documentId}.{ext}

fileRef paths are validated to be under the canonical directory.

## Code Conventions

- PascalCase types/classes, camelCase functions/variables
- Constructor injection for repositories (Database instance)
- String UUIDs, ISO 8601 timestamps
- JSON arrays stored as TEXT in SQLite, parsed on read
- Zod schemas for all MCP tool inputs
- SQLite transactions for multi-write operations (state + event atomic)
- Typed errors, not raw SQL errors

## Frontend Skill Requirement

For any frontend-related work in this repository, you must use the
`advantis-frontend-design` skill before making changes. This includes
building, modifying, or reviewing UI components, pages, layouts, cards,
panels, overlays, onboarding flows, and frontend PRs.

Skill file path:

`/Users/mikeyanderson/advantis-agents/skills/advantis-frontend-design/SKILL.md`

## Testing

14 test scenarios against in-memory SQLite (:memory:):
- 1 happy path (full 8-state progression with 5 docs + 2 verifications)
- 4 negative paths (missing docs, adverse finding, invalid evidence,
  agent approval rejection)
- 9 additional (close from all states, actor provenance, approval
  lifecycle, snapshot isolation, path validation, template tools,
  classify document)

Run `bun test` after any backend change.

## Git Workflow

```
Branch:  feature/[task-name]
Commits: conventional commits (feat:, fix:, chore:, test:)
```

No AI attribution in commits. No doc comments on internal types.

## Reference Documents

- SPEC.md: Full implementation spec with entity interfaces, tool schemas,
  IPC contracts, UI views, contract appendix, requirements traceability
- .docs/shaping/credentialing-platform-shaping.md: Requirements + shapes
- .docs/plans/credentialing-platform-plan.md: 13-task implementation plan

Read SPEC.md before writing any code.
