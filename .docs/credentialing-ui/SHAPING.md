# Credentialing UI Shaping

**Selected shape:** A -- Slot Replacement
**Status:** Shaped (ready for slicing)

---

## Frame

### Problem
- App shows irrelevant session/chat UI for a credentialing product
- better-sqlite3 ABI mismatch prevents credentialing DB from initializing in Electron
- No visual representation of credentialing workflow state

### Outcome
- App launches with seed data showing 5 clinicians in various credentialing states
- Sidebar filters by status (At Risk, Blocked, etc.) with badge counts from real DB data
- Clicking clinician shows full detail across 4 tabs: Overview, Documents, Verifications, Agent
- Real backend data via CaseManager through IPC, ViewModel-shaped in main process
- Old session UI code deleted entirely (Kill the Old Way)

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | App launches into a credentialing-specific 3-column layout with real data | Core goal |
| R1 | Sidebar shows Credentialing Files with clickable status filters and badge counts from DB | Must-have |
| R2 | Middle column shows clinician list grouped by Name, Specialty, Facility, urgency-sorted | Must-have |
| R3 | Right panel shows dashboard summary when no clinician is selected | Must-have |
| R4 | Right panel shows clinician detail with 4 tabs (Overview, Documents, Verifications, Agent) when selected | Must-have |
| R5 | Credentialing data loads in Electron (dev and production builds) without native compilation dependencies | Must-have |
| R6 | Seed data provides 5 clinicians in varied states (At Risk, Blocked, Pending Submission, With Facility, Active) | Must-have |
| R7 | All session UI code is deleted (no parallel implementations) | Must-have |
| R8 | Renderer receives stable dashboard, case-list, and case-detail ViewModel contracts without knowing DB schema | Must-have |
| R9 | Middle column has text search filtering on clinician name | Nice-to-have |
| R10 | Sort order: status priority (At Risk > Blocked > Pending Submission > With Facility > Active > Cleared), then days-until-start ascending, then clinician last name alphabetical | Must-have |
| R11 | Settings page accessible from sidebar with profile, notifications, default view, integrations placeholder | Nice-to-have |
| R12 | Agent tab reuses existing ChatDisplay with clinician context and pre-prompt chips | Nice-to-have |

## Constraints (C)

| ID | Constraint | Status |
|----|------------|--------|
| C1 | ViewModel transformations happen in main process, renderer just renders | Architecture |
| C2 | Renderer state uses Jotai atoms and React Context for navigation (not Zustand) | Architecture |
| C3 | IPC channels follow credentialing:verb-noun kebab-case naming | Convention |
| C4 | CaseManager is the single source of truth for business logic (no direct DB access from renderer) | Architecture |
| C5 | Existing OAuth/onboarding flow remains untouched | Boundary |
| C6 | BaseAgent, ClaudeAgent, CodexAgent, and credential encryption are not modified | Boundary |

---

## Shapes

### A: Slot Replacement

Clone existing patterns (SessionList, LeftSidebar LinkItems, MainContentPanel branching, IPC channels) and adapt them for credentialing-specific content. Delete old session code after new UI is wired.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | **DB migration**: Replace better-sqlite3 with node:sqlite DatabaseSync in `packages/credentialing/src/database.ts` (scoped to credentialing package only). Add NodeSqliteConnectionAdapter implementing SqliteConnection. Update `createConnection()` priority: node:sqlite first, bun:sqlite fallback. Remove better-sqlite3 dependency from `packages/credentialing/package.json`. No changes to packages/shared or packages/core. | |
| **A2** | **Sidebar config**: Add "Credentialing Files" expandable LinkItem to LeftSidebar with status sub-items (At Risk, Blocked, Pending Submission, With Facility, Active, Cleared). Each sub-item sets `dashboardStateFilterAtom`. Badge counts derived from `credentialingCasesAtom`. Add Settings LinkItem. | |
| **A3** | **CredentialingListPanel**: New NavigatorPanel child component. Reads `credentialingCasesAtom` + `dashboardStateFilterAtom`. Renders clinician rows (name, specialty, facility, status badge, days-until-start). Sort by status priority, then days ascending, then last name. Search input filters by clinician name. Clicking a row sets `credentialingSelectedCaseIdAtom`. | |
| **A4** | **CaseDetailPage with 4 tabs**: New MainContentPanel branch for credentialing details. Tabs: Overview (status banner, progress bar, completion %, active agents, blockers, quick actions), Documents (requirements checklist + file browser toggle), Verifications (status table with expandable timeline rows), Agent (ChatDisplay with case context + pre-prompt chips). | |
| **A5** | **Dashboard summary**: Right panel no-selection state. Shows total files, status breakdown with counts, "Requires Your Attention" items, agent activity (last 24h), upcoming start dates. Reads from ViewModel IPC. | |
| **A6** | **Seed data + fixtures**: 5 clinicians with varied states: At Risk (start in 5 days, missing TB test), Blocked (adverse background finding), Pending Submission (all items green), With Facility (submitted, awaiting clearance), Active (verification in progress). Seed method in CaseManager. Same data doubles as test fixtures. Seed path must preserve domain invariants: case-scoped CaseEvent writes, actor identity injection, no agent-recorded approvals. | |
| **A7** | **Delete session UI code**: Remove SessionList, ChatPage as primary view, old sidebar session items, session-related NavigationState branches. Update AppShell to default to credentialing navigator. | |
| **A8** | **ViewModel layer**: New IPC handlers in ipc.ts for ViewModel-shaped responses. Transformers in main process: `toDashboardViewModel()`, `toCaseListViewModel()`, `toCaseDetailViewModel()`. New preload methods. New Jotai atoms for ViewModel state. credentialing:get-dashboard, credentialing:get-case-detail channels. | |

---

### UI Status Bucket Mapping (Derived ViewModel)

UI status buckets are derived fields for display/filtering. They do not replace the credentialing FSM states.

- At Risk: non-terminal case with missing required items AND start date <= 14 days
- Blocked: non-terminal case with unresolved adverse findings or failed verifications
- Pending Submission: case.state in {verification_complete, packet_assembled} with no blockers
- With Facility: case.state = submitted
- Active: case.state in {offer_accepted, documents_requested, documents_collected, verification_in_progress} with no risk/blocker flags
- Cleared: case.state = cleared

---

## Fit Check

| Req | Requirement | Status | A |
|-----|-------------|--------|---|
| R0 | App launches into a credentialing-specific 3-column layout with real data | Core goal | ✅ |
| R1 | Sidebar shows Credentialing Files with clickable status filters and badge counts from DB | Must-have | ✅ |
| R2 | Middle column shows one row per clinician with Name, Specialty, Facility, urgency-sorted | Must-have | ✅ |
| R3 | Right panel shows dashboard summary when no clinician is selected | Must-have | ✅ |
| R4 | Right panel shows clinician detail with 4 tabs (Overview, Documents, Verifications, Agent) when selected | Must-have | ✅ |
| R5 | Credentialing data loads in Electron without native compilation dependencies | Must-have | ✅ |
| R6 | Seed data provides 5 clinicians in varied states | Must-have | ✅ |
| R7 | All session UI code is deleted | Must-have | ✅ |
| R8 | Renderer receives stable ViewModel contracts without knowing DB schema | Must-have | ✅ |
| R9 | Middle column has text search filtering on clinician name | Nice-to-have | ✅ |
| R10 | Sort: status priority, then days-until-start, then clinician last name alpha | Must-have | ✅ |
| R11 | Settings page accessible from sidebar | Nice-to-have | ✅ |
| R12 | Agent tab reuses ChatDisplay with clinician context and pre-prompt chips | Nice-to-have | ✅ |
| C1-C6 | All architecture constraints | - | ✅ |

**Notes:**
- Shape A passes all requirements and constraints. Single shape (Shape B rejected in briefing).
- A1 resolves R5 by replacing better-sqlite3 with node:sqlite (bundled in Electron 39's Node 22.21.1).
- A7 satisfies R7 by explicit deletion phase after new UI is wired.
- A8 satisfies R8 by placing all ViewModel transformers in main process IPC handlers.

---

## Selected Shape: A

### Selection Rationale

Shape A is selected because it reuses the existing Electron shell's architectural patterns (sidebar, navigator panel, main content branching, IPC plumbing) while replacing only the credentialing content in each slot. This minimizes regression risk, preserves OAuth/onboarding, and enables deletion of session UI without running parallel implementations.

Tradeoff accepted: A carries some legacy shell structure (AppShell orchestrator complexity, NavigationContext indirection) instead of redesigning navigation from scratch. This is acceptable because the v1 goal is fast replacement with real credentialing data, not architectural rewrite.

Shape B (incremental overlay keeping both sessions and credentialing) was rejected during briefing — violates "Kill the Old Way" principle.

### Parts

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | DB migration: node:sqlite DatabaseSync adapter, remove better-sqlite3 | |
| **A2** | Sidebar config: Credentialing Files + status filters + Settings | |
| **A3** | CredentialingListPanel: clinician list, urgency-sorted, search | |
| **A4** | CaseDetailPage: 4 tabs (Overview, Documents, Verifications, Agent) | |
| **A5** | Dashboard summary: right panel no-selection state | |
| **A6** | Seed data + test fixtures: 5 clinicians with varied states | |
| **A7** | Delete session UI code: SessionList, ChatPage primary, old sidebar items | |
| **A8** | ViewModel layer: transformers in main, new IPC handlers, new preload methods | |

### Detail A: Concrete Affordances

#### Places

| # | Place | Description |
|---|-------|-------------|
| P1 | App Shell | 3-column layout with resizable panels |
| P1.1 | Left Sidebar | Credentialing Files nav + Settings |
| P1.2 | Navigator Panel | CredentialingListPanel (middle column) |
| P1.3 | Main Content (Dashboard) | Dashboard summary when no case selected |
| P1.4 | Main Content (Case Detail) | 4-tab case detail when case selected |
| P1.4.1 | Overview Tab | Status, progress, agents, blockers |
| P1.4.2 | Documents Tab | Requirements checklist + file browser |
| P1.4.3 | Verifications Tab | Status table + expandable timeline |
| P1.4.4 | Agent Tab | ChatDisplay with case context |
| P2 | Settings Page | User profile, notifications, default view, integrations |
| P3 | Main Process | IPC handlers, ViewModel transformers, CaseManager |

#### UI Affordances

| ID | Place | Affordance | Wires Out |
|----|-------|------------|-----------|
| U1 | P1.1 | "Credentialing Files" expandable nav item | click sets filter to 'all' |
| U2 | P1.1 | Status filter sub-items (At Risk, Blocked, etc.) with badge counts | click -> N2 (sets dashboardStateFilterAtom) |
| U3 | P1.1 | Settings nav item | click -> N14 (navigate to settings) |
| U4 | P1.2 | Search input | type -> N3 (filters clinician list) |
| U5 | P1.2 | Clinician row (name, specialty, facility, status, days) | click -> N4 (sets selectedCaseIdAtom) |
| U6 | P1.3 | Dashboard: total files count | render |
| U7 | P1.3 | Dashboard: status breakdown with counts | render |
| U8 | P1.3 | Dashboard: "Requires Your Attention" items | render |
| U9 | P1.3 | Dashboard: agent activity (last 24h) | render |
| U10 | P1.3 | Dashboard: upcoming start dates | render |
| U11 | P1.3 | Dashboard: action buttons (View At-Risk, Review Adverse) | click -> N2 |
| U12 | P1.4 | Case header (name, specialty, facility) | render |
| U13 | P1.4 | Tab bar (Overview, Documents, Verifications, Agent) | click -> N5 (sets active tab) |
| U14 | P1.4.1 | Status banner with color coding | render |
| U15 | P1.4.1 | State machine progress bar | render |
| U16 | P1.4.1 | Completion % by category with progress bars | render |
| U17 | P1.4.1 | Active agents with status | render |
| U18 | P1.4.1 | Flagged items / blockers list | render |
| U19 | P1.4.1 | Quick actions (pending human decisions) | click -> N6 |
| U20 | P1.4.2 | Requirements checklist (status per line item) | render |
| U21 | P1.4.2 | View/Upload/Request actions per item | click -> N7 |
| U22 | P1.4.2 | Toggle: checklist vs file browser view | click -> N8 |
| U23 | P1.4.3 | Verification status table | render |
| U24 | P1.4.3 | Expandable verification timeline rows | click -> N9 |
| U25 | P1.4.3 | Override actions (Retry, Mark Verified, Flag) | click -> N10 |
| U26 | P1.4.4 | ChatDisplay with case context | render |
| U27 | P1.4.4 | Pre-prompt suggestion chips | click -> N11 |

#### Non-UI Affordances

| ID | Place | Affordance | Wires Out |
|----|-------|------------|-----------|
| N1 | P3 | `credentialing:get-dashboard` IPC handler -> `toDashboardViewModel()` | -> CaseManager queries |
| N2 | P1.1 | `dashboardStateFilterAtom.set()` | -> triggers list re-filter |
| N3 | P1.2 | Search filter (local text match on clinician name) | -> filtered view of credentialingCasesAtom |
| N4 | P1.2 | `credentialingSelectedCaseIdAtom.set()` | -> triggers case detail load |
| N5 | P1.4 | Active tab state (local useState) | -> renders correct tab |
| N6 | P1.4.1 | `credentialing:record-approval` / `credentialing:transition-state` IPC | -> CaseManager |
| N7 | P1.4.2 | Document action IPC (placeholder for v1) | -> CaseManager |
| N8 | P1.4.2 | Documents view mode toggle (local state) | -> re-renders checklist or browser |
| N9 | P1.4.3 | `credentialing:get-case-timeline` IPC | -> CaseManager |
| N10 | P1.4.3 | `credentialing:run-verification` IPC | -> CaseManager |
| N11 | P1.4.4 | Pre-prompt text injection into ChatDisplay | -> sends message |
| N12 | P3 | `credentialing:get-case-list` IPC handler -> `toCaseListViewModel()` | -> CaseManager.queryCases |
| N13 | P3 | `credentialing:get-case-detail` IPC handler -> `toCaseDetailViewModel()` | -> CaseManager |
| N14 | P1.1 | Navigation to settings (sets NavigationState) | -> renders Settings page |
| N15 | P3 | `seedCredentialingData()` in CaseManager | -> inserts 5 clinicians + cases |
| N16 | P3 | `NodeSqliteConnectionAdapter` (node:sqlite DatabaseSync) | -> replaces better-sqlite3 |

#### Wiring

**P1.1 (Left Sidebar):**
- U1 (Credentialing Files click) -> N2 (set filter to 'all') -> N12 (refresh list via IPC)
- U2 (Status filter click) -> N2 (set filter to specific state) -> N12 (refresh list)
- U3 (Settings click) -> N14 (navigate to settings)
- Badge counts: derived atom reads credentialingCasesAtom, groups by state, returns counts -> U2

**P1.2 (Navigator Panel):**
- On mount: N12 (IPC get-case-list) -> credentialingCasesAtom -> renders U5 rows
- U4 (search input) -> N3 (local filter) -> re-renders U5 list
- U5 (clinician row click) -> N4 (set selectedCaseIdAtom) -> triggers N13 (IPC get-case-detail)

**P1.3 (Dashboard):**
- On mount when selectedCaseIdAtom is null: N1 (IPC get-dashboard) -> renders U6-U11
- U11 (action buttons) -> N2 (set filter) -> navigates to filtered list

**P1.4 (Case Detail):**
- On selectedCaseIdAtom change: N13 (IPC get-case-detail) -> renders U12 header
- U13 (tab click) -> N5 (set active tab) -> renders appropriate tab content
- Overview: N13 data -> U14-U19
- Documents: N13 data -> U20-U22
- Verifications: N9 (IPC timeline) -> U23-U25
- Agent: U26 receives case context, U27 (chips) -> N11 -> ChatDisplay

---

## Codex Review

**Reviewed by:** Pending orchestrator Codex review
**Result:** Pending
**Verified at:** --

---

## Next Steps

This shaping document is ready for:
1. **Slicing** -- break breadboarded shape into vertical slices
2. **Plan writing** -- continues to planning phase
3. **Big Picture** -- create summary document after slicing
