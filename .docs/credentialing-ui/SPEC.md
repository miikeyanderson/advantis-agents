# Project Spec: Credentialing UI

## Objective

Replace the generic chat shell UI with a credentialing-specific 3-column layout where specialists triage clinician files by urgency, view real-time agent activity, and interact with case data through a dashboard, document checklist, verification status table, and context-aware AI chat.

## Success Criteria

- App launches into a 3-column credentialing layout with 5 seed clinicians in varied states
- Sidebar filters credentialing files by derived UI status bucket (At Risk, Blocked, Pending Submission, With Facility, Active, Cleared) with badge counts from real DB data
- Clinician list is urgency-sorted (status priority, then days-until-start, then last name)
- Right panel shows aggregate dashboard when no clinician is selected
- Right panel shows 4-tab clinician detail (Overview, Documents, Verifications, Agent) when selected
- Agent tab passes clinician context to ChatDisplay and shows 4 pre-prompt suggestion chips
- DB layer uses node:sqlite DatabaseSync (no native compilation dependency)
- All session UI code is deleted (no parallel implementations)
- All existing credentialing tests pass (`bun test`)
- TypeScript compiles cleanly (`bun run typecheck:all`)

## Tech Stack

```
Runtime:       Bun 1.x (workspace manager + test runner)
Language:      TypeScript 5.x (strict)
Framework:     Electron 39.x (main/renderer/preload)
UI:            React 18 + Vite 6 + Tailwind 4 + Radix UI primitives
State:         Jotai (renderer data atoms) + React Context (navigation)
DB:            node:sqlite DatabaseSync (Node 22.21.1 bundled in Electron 39)
Validation:    Zod 4.x
Build:         esbuild (main/preload), Vite (renderer)
Test:          bun test (bun:test runner)
Lint:          ESLint 9 + @typescript-eslint
```

## Commands

```bash
# Install
bun install

# Dev mode (hot reload)
bun run electron:dev

# Build everything
bun run electron:build

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
│   ├── credentialing/
│   │   └── src/
│   │       ├── database.ts          → MODIFY: node:sqlite adapter
│   │       ├── test-fixtures.ts     → NEW: seed data exports
│   │       ├── types.ts             → Existing entity interfaces
│   │       ├── state-machine.ts     → Existing FSM (read-only)
│   │       ├── repositories/        → Existing CRUD (read-only)
│   │       └── __tests__/           → Existing + new seed/VM tests
│   ├── shared/                      → DO NOT MODIFY
│   ├── core/                        → DO NOT MODIFY
│   └── ui/                          → Shared React components (read-only)
├── apps/
│   └── electron/
│       └── src/
│           ├── main/
│           │   ├── case-manager.ts       → MODIFY: add seedDemoData()
│           │   ├── ipc.ts                → MODIFY: add ViewModel IPC handlers
│           │   ├── viewmodels/           → NEW: credentialing-viewmodels.ts
│           │   └── index.ts             → MODIFY: wire seed on init
│           ├── preload/
│           │   └── index.ts             → MODIFY: expose new IPC methods
│           ├── renderer/
│           │   ├── atoms/
│           │   │   └── credentialing.ts → MODIFY: add derived status counts atom
│           │   ├── contexts/
│           │   │   └── NavigationContext.tsx → MODIFY: credentialing navigator
│           │   ├── components/
│           │   │   ├── app-shell/
│           │   │   │   ├── AppShell.tsx              → MODIFY: sidebar items
│           │   │   │   ├── NavigatorPanel.tsx         → MODIFY: credentialing branch
│           │   │   │   ├── MainContentPanel.tsx       → MODIFY: credentialing branch
│           │   │   │   ├── CredentialingListPanel.tsx → NEW
│           │   │   │   └── SessionList.tsx            → DELETE
│           │   │   └── credentialing/
│           │   │       ├── CredentialingDashboard.tsx  → NEW
│           │   │       ├── CaseDetailPage.tsx          → NEW
│           │   │       ├── OverviewTab.tsx             → NEW
│           │   │       ├── DocumentsTab.tsx            → NEW
│           │   │       ├── VerificationsTab.tsx        → NEW
│           │   │       └── AgentTab.tsx                → NEW
│           │   └── pages/
│           │       └── settings/
│           │           └── CredentialingSettingsPage.tsx → NEW
│           └── shared/
│               └── types.ts → MODIFY: ViewModel types, navigation state
└── .docs/
    └── credentialing-ui/
        ├── SHAPING.md  → Shaping document (reference)
        └── SPEC.md     → This file
```

## Code Style

```typescript
// ViewModel transformers live in main process
// Thin IPC handlers call CaseManager, transform to ViewModels
ipcMain.handle('credentialing:get-case-list', async (event, filters) => {
  const cases = await caseManager.queryCases(filters)
  return cases.map(c => toCaseListViewModel(c))
})

// Renderer reads Jotai atoms, renders ViewModels
// No business logic in renderer
const cases = useAtomValue(credentialingCasesAtom)
const filter = useAtomValue(credentialingDashboardStateFilterAtom)

// Radix UI + Tailwind + cn() for all components
<div className={cn(
  "flex flex-col gap-3 px-4 py-3 rounded-[8px]",
  "border border-border/40 bg-background shadow-minimal",
  isSelected && "ring-2 ring-primary"
)}>

// IPC channel naming: credentialing:verb-noun (kebab-case)
// Atom naming: credentialing[Description]Atom (camelCase)
```

## Git Workflow

- Branch: `feature/credentialing-ui`
- Commits: conventional commits (no AI attribution)
- PRs: require passing `bun test` + `bun run typecheck:all`

## Boundaries

**ALWAYS** (proceed without asking):
- Run `bun test` after any backend change
- Run `bun run typecheck:all` after type changes
- Use Jotai for renderer state (not Zustand/Redux/Context for data)
- Use Radix UI + Tailwind + cn() for component styling
- Route IPC through CaseManager (never bypass to repositories)
- Use valid FSM states for case.state (never UI bucket names)
- Write CaseEvent for every seed data mutation

**ASK FIRST** (pause for approval):
- Adding new dependencies to any package.json
- Changing entity interfaces in `packages/credentialing/src/types.ts`
- Modifying state machine transitions in `state-machine.ts`

**NEVER**:
- Modify BaseAgent, ClaudeAgent, CodexAgent, or credential encryption
- Modify OAuth/onboarding flow files
- Introduce Zustand, Redux, vitest, or jest
- Store UI bucket names as case.state values
- Bypass CaseManager for direct DB access from renderer
- Wire mutation IPC (record-approval, transition-state) in v1 UI tasks
- Add doc comments on internal types
- Add AI attribution to commits
- Touch packages/shared or packages/core during DB migration

## Domain Knowledge

### UI Status Bucket Derivation

UI status buckets are **derived ViewModel fields** computed from FSM states + line item data. They never replace the credentialing FSM.

```
deriveUiStatusBucket(case, lineItems):
  if case.state === 'cleared' → Cleared
  if case.state === 'closed' → skip (not shown)
  if hasUnresolvedAdverseFindings(lineItems) → Blocked
  if hasMissingRequiredItems(lineItems) AND daysUntilStart <= 14 → At Risk
  if case.state in ['verification_complete', 'packet_assembled'] → Pending Submission
  if case.state === 'submitted' → With Facility
  else → Active
```

Priority order (for sort + sidebar): At Risk=0 > Blocked=1 > Pending Submission=2 > With Facility=3 > Active=4 > Cleared=5

### CaseState FSM (existing, read-only)

```
offer_accepted → documents_requested → documents_collected
  → verification_in_progress → verification_complete
  → packet_assembled → submitted → cleared

Any non-terminal state → closed
```

### IPC Architecture

```
Renderer (React)
  │ ipcRenderer.invoke (RPC for user actions)
  │ ipcRenderer.on (events for live agent updates)
  ▼
IPC Handlers (main process)
  │ Thin adapters: validate → CaseManager → ViewModel transform
  ▼
CaseManager
  │ Business logic, state machine, agent coordination
  ▼
Repositories / node:sqlite
```

### Seed Data (5 clinicians)

| Clinician | FSM State | UI Bucket | Why |
|-----------|-----------|-----------|-----|
| Jane Doe, ICU RN, Memorial TX | documents_requested | At Risk | Missing TB test, start in 5 days |
| John Smith, Med-Surg RN, Memorial TX | verification_in_progress | Blocked | Adverse background finding |
| Sarah Johnson, ED RN, St. Mary's CA | packet_assembled | Pending Submission | All items green |
| Mike Brown, ICU RN, Cedar Sinai CA | submitted | With Facility | Awaiting clearance |
| Amy Chen, Telemetry RN, Houston Med TX | verification_in_progress | Active | On track, no blockers |

### ViewModel Contracts

```typescript
interface CaseListItemViewModel {
  caseId: string
  clinicianName: string
  profession: string
  facilityName: string
  derivedStatus: UiStatusBucket
  statusLabel: string
  daysUntilStart: number
  statusPriority: number
  flagIcon: string | null
}

interface DashboardViewModel {
  totalFiles: number
  statusBreakdown: Record<UiStatusBucket, number>
  attentionItems: AttentionItem[]
  agentActivity: AgentActivityItem[]
  upcomingStartDates: StartDateGroup[]
}

interface CaseDetailViewModel {
  header: { name: string; profession: string; facility: string }
  overview: {
    state: CaseState
    derivedStatus: UiStatusBucket
    completionByCategory: Record<string, number>
    activeAgents: AgentStatus[]
    blockers: BlockerItem[]
    quickActions: QuickAction[]
  }
  documents: DocumentChecklistItem[]
  verifications: VerificationRow[]
}

type UiStatusBucket =
  | 'at-risk' | 'blocked' | 'pending-submission'
  | 'with-facility' | 'active' | 'cleared'
```

## UI Specifications

### Layout (3-column)

```
┌──────────┬───────────────────┬──────────────────────────────┐
│ Sidebar  │ Clinician List    │ Dashboard / Case Detail      │
│          │                   │                              │
│ Cred.    │ [Search box]      │ (no selection = dashboard)   │
│ Files    │                   │ (selected = 4-tab detail)    │
│  At Risk │ 🔴 Jane Doe      │                              │
│  Blocked │    ICU RN         │ Tabs: Overview | Documents   │
│  Pending │    Memorial TX    │        Verifications | Agent │
│  w/Facil │    At Risk • 5d   │                              │
│  Active  │                   │                              │
│  Cleared │ ⚠️  John Smith    │                              │
│          │    Med-Surg RN    │                              │
│ Settings │    Memorial TX    │                              │
│          │    Blocked • 7d   │                              │
└──────────┴───────────────────┴──────────────────────────────┘
```

### Sidebar

- "Credentialing Files" expandable with 6 status sub-items + badge counts
- Clicking sub-item sets `credentialingDashboardStateFilterAtom`
- "Settings" nav item below
- Active filter visually highlighted

### Middle Column (CredentialingListPanel)

- Search box at top (case-insensitive substring match on clinician name)
- Sort: statusPriority ascending → daysUntilStart ascending → lastName alpha
- Row format: `Name • Specialty • Facility` / `Status • X days • [flag]`
- Clicking row sets `credentialingSelectedCaseIdAtom`

### Right Panel — No Selection (Dashboard)

- Total active files, status breakdown with counts
- "Requires Your Attention" items (start dates <= 7 days, adverse findings, ready packets)
- Agent activity (last 24h)
- Upcoming start dates grouped by week
- Action buttons navigate to filtered list

### Right Panel — Case Detail (4 tabs)

- Header: `Name • Specialty • Facility` (no label)
- **Overview**: Status banner, progress bar, completion % by category, active agents, blockers, quick actions (disabled placeholders for v1)
- **Documents**: Requirements checklist (status per item) + file browser toggle
- **Verifications**: Status table (Requirement | Source | Status | Last Checked) + expandable timeline rows
- **Agent**: ChatDisplay with case context + 4 pre-prompt chips ("What's blocking this file?", "Summarize verifications", "When will this be cleared?", "What should I do next?")

### Settings Page

- User Profile (name, email, role)
- Notifications (email toggles)
- Default View (launch filter)
- Integrations placeholder (Microsoft Dynamics: Not Connected)

## Testing / Verification

### Unit Tests (bun:test)

- ViewModel transformers: `deriveUiStatusBucket()` with all 6 bucket paths
- Sort order: status priority, days-until-start, last name tiebreaker
- Count aggregation: `toDashboardViewModel()` status breakdown
- Seed idempotency: `seedDemoData()` called twice produces 5 cases (not 10)
- Seed invariants: CaseEvent writes use actorType: 'system', actorId: 'seed'
- Existing tests: all `packages/credentialing/src/__tests__/*.test.ts` continue to pass

### Manual QA Checklist

- [ ] App launches into credentialing sidebar (not sessions)
- [ ] Sidebar shows 6 status filters with numeric badge counts
- [ ] Clicking a filter updates the clinician list
- [ ] Clinician list shows 5 seed clinicians in urgency order
- [ ] Search box filters list by name
- [ ] No selection shows dashboard with status breakdown
- [ ] Clicking clinician shows 4-tab detail view
- [ ] Overview tab shows status banner + completion bars
- [ ] Documents tab shows requirements checklist
- [ ] Verifications tab shows status table
- [ ] Agent tab shows ChatDisplay with 4 pre-prompt chips
- [ ] Settings page renders from sidebar
- [ ] No console errors related to DB initialization

### Boundary Verification

- [ ] `git diff --name-only` shows no OAuth, onboarding, BaseAgent, ClaudeAgent, CodexAgent, or encryption files touched
- [ ] SessionList.tsx is deleted
- [ ] No session navigation branches remain in MainContentPanel

## Tasks

### Task Dependency Order

```
T1 (DB migration)
  └─> T2 (Seed data)
       └─> T3 (ViewModel layer)
            └─> T4 (Navigation + atoms)
                 └─> T5 (Sidebar config)
                 └─> T6 (List panel)
                      └─> T7 (Dashboard)
                      └─> T8 (Case detail)
                           └─> T9 (Integration + Settings)
                                └─> T10 (Delete session UI)
```

### Task 1 — DB Migration (A1)

Replace better-sqlite3 with node:sqlite DatabaseSync.

**Acceptance Criteria:**
- `Database` class in `packages/credentialing/src/database.ts` uses node:sqlite `DatabaseSync` as primary, bun:sqlite as fallback
- `NodeSqliteConnectionAdapter` implements `SqliteConnection` (exec, pragma, prepare, transaction, close)
- `NodeSqliteStatementAdapter` implements `SqliteStatement` (all, get, run)
- `better-sqlite3` removed from `packages/credentialing/package.json`
- `bun test` passes for all existing credentialing tests
- Electron dev launch shows no DB errors in console

**Files:** `packages/credentialing/src/database.ts`, `packages/credentialing/package.json`

**Steps:**
1. Read `database.ts` — understand BetterSqlite3ConnectionAdapter and BunSqliteConnectionAdapter patterns
2. Create `NodeSqliteConnectionAdapter` using `node:sqlite` `DatabaseSync`
3. Create `NodeSqliteStatementAdapter` using `StatementSync`
4. Handle API differences: `DatabaseSync` constructor, `prepare()` returns `StatementSync`, pragma via `exec('PRAGMA ...')`
5. Update `createConnection()`: node:sqlite first, bun:sqlite fallback, remove better-sqlite3 branch
6. Remove `BetterSqlite3ConnectionAdapter` class and import
7. Remove `better-sqlite3` from package.json
8. Run `bun test`
9. Run `bun run electron:dev` — verify DB initializes without errors

### Task 2 — Seed Data + Fixtures (A6)

Create 5 clinicians with varied credentialing states for development and testing.

**Acceptance Criteria:**
- `CaseManager.seedDemoData()` inserts 5 clinicians with valid FSM states mapping to UI buckets
- Seeded `case.state` values are valid CaseState enum values (not UI bucket names)
- Seed is idempotent (calling twice produces 5 cases, not 10)
- Seed preserves domain invariants: CaseEvent writes with actorType: 'system', actorId: 'seed'
- Test fixtures exported from `packages/credentialing/src/test-fixtures.ts`
- `bun test` passes

**Files:** `apps/electron/src/main/case-manager.ts`, `packages/credentialing/src/test-fixtures.ts`

**Steps:**
1. Create `test-fixtures.ts` exporting `SEED_CLINICIANS` and `SEED_CASES`
2. Add `seedDemoData()` to CaseManager using ClinicianRepository + CaseRepository
3. Make idempotent: check existence before insert
4. Jane Doe: ICU RN, Memorial TX, FSM: documents_requested (At Risk — missing TB, 5 days)
5. John Smith: Med-Surg RN, Memorial TX, FSM: verification_in_progress (Blocked — adverse finding)
6. Sarah Johnson: ED RN, St. Mary's CA, FSM: packet_assembled (Pending Submission)
7. Mike Brown: ICU RN, Cedar Sinai CA, FSM: submitted (With Facility)
8. Amy Chen: Telemetry RN, Houston Med TX, FSM: verification_in_progress (Active)
9. Write CaseEvent entries with actorType: 'system', actorId: 'seed'
10. Tests: call twice, assert 5 cases, verify FSM states and derived buckets
11. Run `bun test`

### Task 3 — ViewModel Layer (A8)

Create ViewModel transformers and IPC handlers in main process.

**Acceptance Criteria:**
- `deriveUiStatusBucket()` implements shaping rules (14-day threshold, blocker precedence, Cleared terminal)
- `toDashboardViewModel()` returns totalFiles, statusBreakdown, attentionItems, agentActivity, upcomingStartDates
- `toCaseListViewModel()` returns sorted array with derivedStatus, daysUntilStart, statusPriority
- `toCaseDetailViewModel()` returns header, overview, documents, verifications
- IPC handlers: `credentialing:get-dashboard`, `credentialing:get-case-list`, `credentialing:get-case-detail`
- Preload exposes: `credentialingGetDashboard()`, `credentialingGetCaseList()`, `credentialingGetCaseDetail()`
- `bun test` passes for bucket derivation, sort, aggregation

**Files:** `apps/electron/src/main/viewmodels/credentialing-viewmodels.ts`, `apps/electron/src/main/ipc.ts`, `apps/electron/src/preload/index.ts`, `apps/electron/src/shared/types.ts`

**Steps:**
1. Define ViewModel types + `UiStatusBucket` enum in `shared/types.ts`
2. Create `credentialing-viewmodels.ts`
3. Implement `deriveUiStatusBucket()` per shaping rules
4. Implement `toCaseListViewModel()`: derive buckets, compute daysUntilStart, sort
5. Implement `toDashboardViewModel()`: aggregate counts, attention items, stub agent activity
6. Implement `toCaseDetailViewModel()`: overview, documents checklist, verifications
7. Add IPC handlers in `ipc.ts`
8. Add preload methods
9. Unit tests: bucket derivation (all 6 paths + edge cases), sort order, aggregation
10. Run `bun test`

### Task 4 — Navigation + Jotai Atoms (A2/A8)

Wire credentialing into NavigationState and set up derived atoms.

**Acceptance Criteria:**
- `CredentialingNavigationState` in NavigationState union
- `isCredentialingNavigation()` type guard exported
- Existing atoms populated on mount via IPC
- `credentialingStatusCountsAtom` (derived) computes badge counts per UI bucket
- `DEFAULT_NAVIGATION_STATE` set to credentialing navigator
- `bun run typecheck:all` passes

**Files:** `apps/electron/src/shared/types.ts`, `apps/electron/src/shared/route-parser.ts`, `apps/electron/src/shared/routes.ts`, `apps/electron/src/renderer/atoms/credentialing.ts`, `apps/electron/src/renderer/contexts/NavigationContext.tsx`

**Steps:**
1. Add `CredentialingNavigationState` interface (navigator, filter, details)
2. Add type guard
3. Update NavigationState union
4. Set DEFAULT_NAVIGATION_STATE to credentialing
5. Add routes + update route-parser
6. Add `credentialingStatusCountsAtom` derived from casesAtom
7. Update NavigationContext for credentialing navigator
8. Run `bun run typecheck:all`

### Task 5 — Sidebar Config (A2)

Add credentialing navigation items to LeftSidebar.

**Acceptance Criteria:**
- "Credentialing Files" expandable with 6 status sub-items (At Risk through Cleared)
- Badge counts from `credentialingStatusCountsAtom`
- Clicking sub-item navigates with filter
- Settings item below
- Active filter highlighted

**Files:** `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

**Steps:**
1. Read AppShell.tsx sidebar links
2. Replace session LinkItems with credentialing items
3. Add expandable "Credentialing Files" with 6 status sub-items + badges
4. Add Settings item
5. Wire active state highlighting
6. Manual QA: verify 6 labels, badge counts, filter clicking, Settings navigation

### Task 6 — CredentialingListPanel (A3)

Build the clinician list middle column.

**Acceptance Criteria:**
- Renders clinician rows from `credentialingCasesAtom`
- Rows: name, specialty, facility, status badge, days until start
- Filtered by `credentialingDashboardStateFilterAtom`
- Search input filters by name
- Click sets `credentialingSelectedCaseIdAtom`
- Selected row highlighted
- Sorted: statusPriority → daysUntilStart → lastName

**Files:** `apps/electron/src/renderer/components/app-shell/CredentialingListPanel.tsx`, `NavigatorPanel.tsx`

**Steps:**
1. Create CredentialingListPanel component
2. Read atoms via useAtomValue
3. Implement status filter
4. Implement search filter
5. Implement sort
6. Render rows with Radix UI + Tailwind
7. Wire row click + selected highlight
8. Update NavigatorPanel for credentialing branch

### Task 7 — Dashboard Summary (A5)

Build right panel no-selection state.

**Acceptance Criteria:**
- Shows when `credentialingSelectedCaseIdAtom` is null
- Displays: total files, status breakdown, attention items, agent activity, upcoming dates
- Fetched via `credentialingGetDashboard()` IPC
- Action buttons set filter and navigate

**Files:** `apps/electron/src/renderer/components/credentialing/CredentialingDashboard.tsx`, `MainContentPanel.tsx`

**Steps:**
1. Create CredentialingDashboard component
2. Fetch dashboard ViewModel on mount
3. Render all sections
4. Wire action buttons
5. Add credentialing branch to MainContentPanel

### Task 8 — Case Detail Page (A4)

Build 4-tab clinician detail view.

**Acceptance Criteria:**
- Shows when case is selected
- Header: name, specialty, facility
- 4 tabs: Overview, Documents, Verifications, Agent
- Agent tab has ChatDisplay with context + 4 pre-prompt chips
- Quick actions rendered as disabled placeholders ("Coming in v2")
- Fetched via `credentialingGetCaseDetail(caseId)` IPC

**Files:** `apps/electron/src/renderer/components/credentialing/CaseDetailPage.tsx`, `OverviewTab.tsx`, `DocumentsTab.tsx`, `VerificationsTab.tsx`, `AgentTab.tsx`, `MainContentPanel.tsx`

**Steps:**
1. Create CaseDetailPage with tab state
2. Fetch detail ViewModel on caseId change
3. Render header + tab bar
4. Create OverviewTab (status, progress, agents, blockers, disabled actions)
5. Create DocumentsTab (checklist + file browser toggle placeholder)
6. Create VerificationsTab (status table + expandable timeline)
7. Create AgentTab (ChatDisplay with context + 4 pre-prompt chips)
8. Wire into MainContentPanel

### Task 9 — Integration + Settings (A2)

Wire everything together, add settings page, verify boundaries.

**Acceptance Criteria:**
- App launches with seed data, sidebar badges, working filters
- Full flow: sidebar filter → list update → case selection → detail view
- Settings page with placeholder sections
- No OAuth/onboarding/BaseAgent/ClaudeAgent/CodexAgent files modified (C5, C6)
- `bun run typecheck:all` + `bun test` pass

**Files:** `apps/electron/src/main/index.ts`, `CredentialingSettingsPage.tsx`, `AppShell.tsx`

**Steps:**
1. Wire seedDemoData() on app init
2. Wire list panel mount → IPC → casesAtom
3. Wire sidebar badge updates
4. Wire case detail loading on selection
5. Verify full flow
6. Create CredentialingSettingsPage
7. Wire Settings navigation
8. Run typecheck + tests
9. Manual QA walkthrough
10. Verify `git diff --name-only` shows no boundary violations

### Task 10 — Delete Session UI Code (A7)

Remove old session-based UI after new UI is confirmed working.

**Acceptance Criteria:**
- SessionList.tsx deleted
- Session sidebar items removed
- isSessionsNavigation branch removed from MainContentPanel
- SessionsNavigationState removed from NavigationState union
- `bun run typecheck:all` passes
- App launches into credentialing UI (manual verification)

**Files:** `SessionList.tsx` (DELETE), `AppShell.tsx`, `MainContentPanel.tsx`, `shared/types.ts`

**Steps:**
1. Delete SessionList.tsx
2. Remove session sidebar items from AppShell
3. Remove session branch from MainContentPanel
4. Remove SessionsNavigationState + type guard
5. Remove session routes from route-parser
6. Clean up unused imports
7. Run typecheck
8. Run tests
9. Manual verification: app launches into credentialing UI, full flow works

## Shaping Reference

Full shaping document with requirements, constraints, shapes, fit check, and breadboard wiring at `.docs/credentialing-ui/SHAPING.md`.
