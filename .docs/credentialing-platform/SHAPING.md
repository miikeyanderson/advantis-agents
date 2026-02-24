# Credentialing Platform Shaping

**Selected shape:** A — Credentialing as a Source + Workflow Layer
**Status:** Shaped (ready for slicing)
**Context package:** Produced by briefing agent (inline in briefing session)

---

## Frame

### Problem
- Credentialing is manual, repetitive, and error-prone
- Each specialist handles ~15-20 clinicians, mostly clerical work
- No automation for primary source verification or document classification
- Facility-specific requirements are tracked in spreadsheets
- No state machine to enforce process integrity or prevent incomplete submissions

### Outcome
- One clinician flows from offer-accepted to cleared-to-start with minimal human touch
- Agents autonomously collect docs, verify licenses, assemble packets
- Human approves only: adverse findings, waivers, final facility submission
- Template-driven: add new facilities/states without code changes
- 1-2 specialists manage workload of ~12 FTEs via AI agent orchestration

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | A clinician case progresses from offer-accepted to cleared-to-start with explicit state transitions | Core goal |
| R1 | Each state transition is guarded by prerequisite checks (documents collected, verifications complete) | Must-have |
| R2 | Agents can collect documents from clinicians via structured requests | Must-have |
| R3 | Agents can verify licenses and certifications against primary sources (Nursys, OIG/SAM, state boards) | Must-have |
| R4 | Agents can classify and extract data from uploaded documents | Must-have |
| R5 | Adverse findings escalate to human review before the case can proceed | Must-have |
| R6 | Incomplete packets cannot be submitted to facilities | Must-have |
| R7 | Facility-specific requirements are defined as templates, not hardcoded | Must-have |
| R8 | All verification results are persisted with evidence (timestamps, source URLs, response data) | Must-have |
| R9 | Permission gating is enforced for sensitive operations (final submission, waiver approval) | Must-have |
| R10 | A dashboard shows all active cases with their current state and blockers | Must-have |
| R11 | Every case action and decision is recorded as a timestamped event with actor and evidence references, queryable per case | Must-have |
| R12 | Adding a new facility or state does not require code changes | Nice-to-have |
| R13 | Automated steps enforce least-privilege tool access per agent role | Nice-to-have |

## Constraints (C)

| ID | Constraint | Status |
|----|------------|--------|
| C0 | Must integrate without breaking the existing agent backend abstraction (BaseAgent, ClaudeAgent) at `packages/shared/src/agent/base-agent.ts` | Hard |
| C1 | Must register domain MCP tools through the existing source/server-builder pipeline at `packages/shared/src/sources/server-builder.ts` | Hard |
| C2 | Must use the existing credential encryption system (AES-256-GCM) at `packages/shared/src/credentials/` | Hard |
| C3 | Must preserve the existing Electron main/renderer architecture at `apps/electron/` | Hard |
| C4 | MVP persists locally in SQLite only (no server sync) | Hard |

---

## Context Package Traceability

### Verified codebase seams (craft-agents-oss)
- Base agent abstraction extension points confirmed: `packages/shared/src/agent/base-agent.ts` (BaseAgent abstract class)
- MCP source registration + server builder integration seam: `packages/shared/src/sources/server-builder.ts` (SourceServerBuilder)
- PermissionManager extension seam confirmed: `packages/shared/src/agent/core/permission-manager.ts` (evaluateToolCall)
- Electron main/renderer integration entry points confirmed: `apps/electron/src/main/sessions.ts` (SessionManager), `apps/electron/src/main/ipc.ts`
- Credential encryption (AES-256-GCM) reuse seam confirmed: `packages/shared/src/credentials/`

### Assumptions requiring validation before slicing
- Nursys / OIG / SAM access method, auth requirements, and rate limits (mock for MVP)
- State board verification source variability (API vs scraping vs manual)
- Evidence storage format and retention requirements (regulatory)
- Document storage approach (SQLite metadata + file system blobs)
- Final facility submission channels (portal upload, email, VMS API)

### Out-of-scope for MVP (explicit)
- Server sync / multi-user collaboration
- Cross-device syncing
- Non-SQLite persistence backends
- Mobile app
- Multi-tenant architecture

---

## Shapes

### A: Credentialing as a Source + Workflow Layer

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | **Domain types + SQLite persistence** — Clinician, Case, Document, Verification, FacilityTemplate tables in SQLite via better-sqlite3; typed repository layer in `packages/credentialing/` | |
| **A2** | **State machine engine** — Per-clinician FSM (offer-accepted → documents-requested → documents-collected → verification-in-progress → verification-complete → packet-assembled → submitted → cleared) with transition guards that query DB for prerequisites | |
| **A3** | **Domain MCP tools** — MCP server exposing credentialing operations (query cases, update documents, record verifications, transition state) registered via existing source/server-builder pipeline | |
| **A4** | **Agent topology** — 6 named agents (Intake, DocCollector, Verifier, PacketAssembler, QualityReview, Coordinator) with role-specific system prompts and tool subsets, orchestrated by Coordinator agent | |
| **A5** | **Hybrid UI** — Dashboard view (case grid with state/blocker columns) + case timeline view (per-clinician event log), integrated into existing Electron renderer alongside current sidebar/settings | |
| **A6** | **Guardrails** — Approval gates at adverse-finding and final-submission transitions using extended PermissionManager; evidence-required checks before verification records are accepted | |

### B: Thin Wrapper — Agents in Chat Sessions

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **B1** | **Chat-session model** — One chat session per clinician, using existing SessionManager; case state tracked in conversation context | |
| **B2** | **Credentialing skills** — SKILL.md files defining credentialing workflows; agents follow skill instructions to collect, verify, assemble | ⚠️ |
| **B3** | **Single MCP source** — One MCP server with all domain tools; no explicit state machine, agents decide transitions based on prompt instructions | ⚠️ |

---

## Fit Check

| Req | Requirement | A | B |
|-----|-------------|---|---|
| R0 | Explicit state transitions offer-accepted → cleared-to-start | ✅ | ❌ |
| R1 | Guarded state transitions with prerequisite checks | ✅ | ❌ |
| R2 | Agents collect documents via structured requests | ✅ | ✅ |
| R3 | Agents verify against primary sources (Nursys, OIG/SAM) | ✅ | ✅ |
| R4 | Agents classify and extract data from documents | ✅ | ✅ |
| R5 | Adverse findings escalate to human review | ✅ | ❌ |
| R6 | Incomplete packets cannot be submitted | ✅ | ❌ |
| R7 | Facility requirements as templates, not hardcoded | ✅ | ❌ |
| R8 | Verification results persisted with evidence | ✅ | ❌ |
| R9 | Permission gating for sensitive operations | ✅ | ❌ |
| R10 | Dashboard with case state and blockers | ✅ | ❌ |
| R11 | Timestamped event log per case (audit trail) | ✅ | ❌ |
| R12 | Add facility/state without code changes | ✅ | ❌ |
| R13 | Least-privilege tool access per agent role | ✅ | ❌ |

**Constraints verified for both shapes:**

| Constraint | A | B |
|------------|---|---|
| C0 Agent backend preserved | ✅ | ✅ |
| C1 MCP source/server-builder preserved | ✅ | ✅ |
| C2 Credential encryption preserved | ✅ | ✅ |
| C3 Electron architecture preserved | ✅ | ✅ |
| C4 SQLite-local MVP | ✅ | ❌ |

**Notes:**
- B fails R0: No explicit FSM; state lives in conversation context, unreliable for regulated workflows
- B fails R1: Transition guards are prompt-dependent; agents can skip steps
- B fails R5-R6: No structured escalation or completeness enforcement
- B fails R7-R8: JSONL persistence is not structured evidence records
- B fails R9-R11: No PermissionManager extension, no dashboard, no structured audit
- B fails C4: No SQLite persistence designed

---

## Selected Shape: A

### Rationale
Shape A passes all requirements. Shape B fails 12 of 19 requirements — it treats credentialing as a chat problem when it is fundamentally a workflow/state-machine problem. Regulated credentialing requires explicit state tracking, evidence persistence, and transition guards that cannot be reliably achieved through prompt instructions alone. Shape A preserves all existing infrastructure (R9-R12) while adding a purpose-built workflow layer.

### Parts

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | **Domain types + SQLite persistence** — Clinician, Case, Document, Verification, FacilityTemplate tables in SQLite via better-sqlite3; typed repository layer in `packages/credentialing/` | |
| **A2** | **State machine engine** — Per-clinician FSM (offer-accepted → documents-requested → documents-collected → verification-in-progress → verification-complete → packet-assembled → submitted → cleared) with transition guards that query DB for prerequisites | |
| **A3** | **Domain MCP tools** — MCP server exposing credentialing operations (query cases, update documents, record verifications, transition state) registered via existing source/server-builder pipeline | |
| **A4** | **Agent topology** — 6 named agents (Intake, DocCollector, Verifier, PacketAssembler, QualityReview, Coordinator) with role-specific system prompts and tool subsets, orchestrated by Coordinator agent | |
| **A5** | **Hybrid UI** — Dashboard view (case grid with state/blocker columns) + case timeline view (per-clinician event log), integrated into existing Electron renderer alongside current sidebar/settings | |
| **A6** | **Guardrails** — Approval gates at adverse-finding and final-submission transitions using extended PermissionManager; evidence-required checks before verification records are accepted | |

### Detail A: Concrete Affordances

#### Places

| # | Place | Description |
|---|-------|-------------|
| P1 | Dashboard | Case grid showing all active clinician cases with state, blockers, assigned agent |
| P2 | Case Timeline | Per-clinician event log with document status, verification results, state transitions |
| P3 | Approval Modal | Human review for adverse findings or final submission approval |
| P4 | Template Editor | Facility requirement template management (add/edit checklist items) |
| P5 | Backend (SQLite + FSM) | Domain data, state machine, MCP tool handlers |

#### UI Affordances

| # | Place | Affordance | Control | Wires Out | Returns To |
|---|-------|------------|---------|-----------|------------|
| U1 | P1 | Case grid (rows: clinician, state, facility, blocker, agent) | render | — | — |
| U2 | P1 | "New Case" button | click | → N1 | — |
| U3 | P1 | State filter dropdown | select | → N2 | — |
| U4 | P1 | Case row click | click | → P2, N3 | — |
| U5 | P2 | Timeline event list (chronological: doc uploads, verifications, transitions) | render | — | — |
| U6 | P2 | Document checklist (required vs received, per facility template) | render | — | — |
| U7 | P2 | "Run Verification" button | click | → N5 | — |
| U8 | P2 | "Advance State" button (enabled when guards pass) | click | → N6 | — |
| U9 | P2 | Blocker banner (shows what's missing for next transition) | render | — | — |
| U10 | P3 | Adverse finding detail (source, evidence, severity) | render | — | — |
| U11 | P3 | "Approve" / "Reject" / "Request Waiver" buttons | click | → N8 | — |
| U14 | P2 | "Review Finding" button | click | → P3, N13 | — |
| U12 | P4 | Facility template list | render | — | — |
| U13 | P4 | Checklist item editor (add/remove/reorder required documents) | click | → N9 | — |

#### Non-UI Affordances

| # | Place | Affordance | Control | Wires Out | Returns To |
|---|-------|------------|---------|-----------|------------|
| N1 | P5 | `createCase(clinicianData, facilityId)` — inserts Case + loads template requirements | call | → S1, S2, S7 | → U1 |
| N2 | P5 | `queryCases(filters)` — reads cases with state/blocker joins | call | — | → U1 |
| N3 | P5 | `getCaseTimeline(caseId)` — reads events + documents + verifications for case | call | — | → U5, U6, U9 |
| N4 | P5 | `recordDocument(caseId, docType, metadata, fileRef)` — inserts Document record, updates checklist | call | → S3, S7 | → U6 |
| N5 | P5 | `runVerification(caseId, verificationType)` — calls external source (Nursys/OIG/SAM), records result with evidence | call | → N10, S4, S7 | → U5 |
| N6 | P5 | `transitionState(caseId, targetState)` — checks guards, executes transition, logs event | call | → N7, S1, S7 | → U1, U8 |
| N7 | P5 | `checkGuards(caseId, targetState)` — queries required docs, verifications, approvals for target state | call | — | → N6, U9 |
| N8 | P5 | `recordApproval(caseId, decision, notes)` — records human decision on adverse finding or submission | call | → S5, S7 | → N6 |
| N9 | P5 | `updateTemplate(facilityId, checklist)` — updates facility requirement template | call | → S6 | → U12 |
| N12 | P5 | `queryTemplates(filters)` — reads facility templates | call | — | → U12 |
| N13 | P5 | `getFindingDetail(verificationId)` — reads adverse finding with evidence | call | — | → U10 |
| N10 | P5 | External verification sources (Nursys MCP, OIG/SAM API, state board scrapers) — registered via source/server-builder | call | — | → N5 |
| N11 | P5 | `assemblePacket(caseId)` — collects all documents + verifications into submission-ready bundle | call | → S3, S4, S7 | → U5 |

#### Data Stores

| # | Place | Store | Description |
|---|-------|-------|-------------|
| S1 | P5 | `cases` table | Clinician case records with current state, facility, timestamps |
| S2 | P5 | `clinicians` table | Clinician profile data (name, NPI, license numbers, contact) |
| S3 | P5 | `documents` table | Uploaded/collected documents with type, status, file reference, extraction data |
| S4 | P5 | `verifications` table | Verification results with source, evidence blob, timestamp, pass/fail |
| S5 | P5 | `approvals` table | Human approval decisions with reviewer, decision, notes, timestamp |
| S6 | P5 | `facility_templates` table | Facility-specific requirement checklists (required doc types, verification types) |
| S7 | P5 | `case_events` table | Audit log of all case events (state transitions, doc uploads, verifications, approvals) |

#### Wiring Summary (by Place)

**P1 (Dashboard):**
- U2 click → N1 createCase → writes S1, S2 → refreshes U1
- U3 select → N2 queryCases → returns to U1
- U4 click → navigates to P2

**P2 (Case Timeline):**
- On load → N3 getCaseTimeline → populates U5, U6, U9
- U7 click → N5 runVerification → calls N10 external sources → writes S4 → refreshes U5
- U8 click → N6 transitionState → N7 checkGuards → if pass, writes S1 → refreshes U1, U8

**P3 (Approval Modal):**
- On open → displays adverse finding from S4
- U11 click → N8 recordApproval → writes S5 → enables N6 transition

**P5 (Backend):**
- N10 external sources registered as MCP sources via existing server-builder pipeline
- All N handlers exposed as MCP tools via domain MCP server (A3)
- Agent topology (A4): Coordinator agent dispatches to role agents, each with tool subset

---

## Codex Review

**Reviewed by:** Codex (via briefing agent)
**Result:** 3/6 PASS initial → 6/6 PASS after fixes
**Fixes applied:** Separated requirements from constraints (R9-R12,R18 → C0-C4), tightened R15/R17 testability, completed breadboard wiring (S7 audit trail, U14 review finding, N12/N13 query tools), added context package traceability section
**Verified at:** 2026-02-23

---

## Next Steps

This shaping document is ready for:
1. **Slicing** — break breadboarded shape into vertical slices
2. **Plan writing** — continues to planning phase
3. **Big Picture** — create summary document after slicing
