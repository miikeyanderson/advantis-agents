# Credentialing UI -- Implementation Plan

**Goal:** Replace the generic chat shell UI with a credentialing-specific 3-column layout backed by real data through CaseManager IPC, with the DB layer migrated from better-sqlite3 to node:sqlite.

**Scope:**
- In: DB migration, sidebar config, clinician list, case detail (4 tabs), dashboard summary, seed data, session UI deletion, ViewModel layer
- Out: E2E tests, component tests, multi-tenant, server sync, mobile, document upload functionality, real agent orchestration in Agent tab

**Authoritative Spec:** `SPEC.md` (Codex reviewed)
**Shaping Doc:** `.docs/credentialing-ui/SHAPING.md`

**Status:** Reviewed -- aligned with SPEC.md (2026-02-24)

---

## Contract Appendix

All ViewModel contracts, derivation rules, and IPC channels below are copied from SPEC.md and SHAPING.md. If those files and this file ever diverge, SPEC.md wins.

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

### UI Status Bucket Derivation

UI status buckets are derived ViewModel fields computed from FSM states + line item data. They never replace the credentialing FSM.

```
deriveUiStatusBucket(case, lineItems):
  if case.state === 'cleared' -> Cleared
  if case.state === 'closed' -> skip (not shown)
  if hasUnresolvedAdverseFindings(lineItems) -> Blocked
  if hasMissingRequiredItems(lineItems) AND daysUntilStart <= 14 -> At Risk
  if case.state in ['verification_complete', 'packet_assembled'] -> Pending Submission
  if case.state === 'submitted' -> With Facility
  else -> Active
```

Priority order (sort + sidebar): At Risk=0 > Blocked=1 > Pending Submission=2 > With Facility=3 > Active=4 > Cleared=5

### IPC Channels (New for UI)

```
credentialing:get-dashboard   -> toDashboardViewModel()
credentialing:get-case-list   -> toCaseListViewModel()
credentialing:get-case-detail -> toCaseDetailViewModel()
```

### Seed Data (5 clinicians)

| Clinician | FSM State | UI Bucket | Why |
|-----------|-----------|-----------|-----|
| Jane Doe, ICU RN, Memorial TX | documents_requested | At Risk | Missing TB test, start in 5 days |
| John Smith, Med-Surg RN, Memorial TX | verification_in_progress | Blocked | Adverse background finding |
| Sarah Johnson, ED RN, St. Mary's CA | packet_assembled | Pending Submission | All items green |
| Mike Brown, ICU RN, Cedar Sinai CA | submitted | With Facility | Awaiting clearance |
| Amy Chen, Telemetry RN, Houston Med TX | verification_in_progress | Active | On track, no blockers |

---

## Tasks

### Task 1 -- "Replace better-sqlite3 with node:sqlite DatabaseSync"

**Acceptance Criteria:**
- `Database` class in `packages/credentialing/src/database.ts` uses node:sqlite `DatabaseSync` as primary connection, bun:sqlite as fallback (better-sqlite3 removed entirely)
- `NodeSqliteConnectionAdapter` implements `SqliteConnection` interface (exec, pragma, prepare, transaction, close)
- `NodeSqliteStatementAdapter` implements `SqliteStatement` interface (all, get, run)
- `better-sqlite3` is removed from `packages/credentialing/package.json` dependencies
- `bun test` passes for all existing credentialing tests
- Electron credentialing DB initialization succeeds in dev (`bun run electron:dev` launches without DB errors in console)

**Files:** `packages/credentialing/src/database.ts`, `packages/credentialing/package.json`

- [ ] 1. Read `database.ts` to understand BetterSqlite3ConnectionAdapter and BunSqliteConnectionAdapter patterns
- [ ] 2. Create `NodeSqliteConnectionAdapter` class implementing `SqliteConnection` using `node:sqlite` `DatabaseSync`
- [ ] 3. Create `NodeSqliteStatementAdapter` class implementing `SqliteStatement` using `StatementSync`
- [ ] 4. Handle node:sqlite API differences: `DatabaseSync` constructor, `prepare()` returns `StatementSync`, pragma via `exec('PRAGMA ...')`
- [ ] 5. Update `createConnection()` to try node:sqlite first, then bun:sqlite fallback (remove better-sqlite3 branch)
- [ ] 6. Remove `BetterSqlite3ConnectionAdapter` class and `BetterSqlite3` import
- [ ] 7. Remove `better-sqlite3` from `packages/credentialing/package.json`
- [ ] 8. Run `bun test` to verify all existing tests pass
- [ ] 9. Run `bun run electron:dev` and verify credentialing DB initializes without errors in console

### Task 2 -- "Create seed data with 5 clinicians in varied credentialing states"

**Acceptance Criteria:**
- `CaseManager.seedDemoData()` method exists and inserts 5 clinicians with cases using valid FSM states that map to derived UI status buckets
- Seeded `case.state` values are valid credentialing FSM states from `CaseState` enum (not UI bucket names)
- Each clinician has: name, profession (specialty), facility assignment, start date, and state-appropriate data (missing docs, adverse findings, etc.)
- Seed data is idempotent (re-running does not duplicate)
- Seed path preserves domain invariants: case-scoped CaseEvent writes, actor identity injection (actorType: 'system', actorId: 'seed'), no agent-recorded approvals
- Same seed data is exported as test fixtures from a shared location
- `bun test` passes with tests that call `seedDemoData()` twice, verify 5 cases exist (not 10), and assert correct FSM states and derived UI buckets

**Files:** `apps/electron/src/main/case-manager.ts`, `packages/credentialing/src/test-fixtures.ts`

- [ ] 1. Create `packages/credentialing/src/test-fixtures.ts` exporting `SEED_CLINICIANS` and `SEED_CASES` arrays with the 5 clinician/case data sets
- [ ] 2. Add `seedDemoData()` method to `CaseManager` that uses `ClinicianRepository` and `CaseRepository` to insert fixture data
- [ ] 3. Make seed idempotent: check if seed clinicians exist before inserting
- [ ] 4. Jane Doe: ICU RN, Memorial TX, start in 5 days, FSM state: documents_requested (At Risk -- missing TB test + start date <= 14 days)
- [ ] 5. John Smith: Med-Surg RN, Memorial TX, FSM state: verification_in_progress (Blocked -- adverse background finding)
- [ ] 6. Sarah Johnson: ED RN, St. Mary's CA, FSM state: packet_assembled (Pending Submission, all items green)
- [ ] 7. Mike Brown: ICU RN, Cedar Sinai CA, FSM state: submitted (With Facility, awaiting clearance)
- [ ] 8. Amy Chen: Telemetry RN, Houston Med TX, FSM state: verification_in_progress (Active, on track)
- [ ] 9. Write CaseEvent entries for each seed case using actorType: 'system', actorId: 'seed'
- [ ] 10. Write tests: call `seedDemoData()` twice, query cases, assert 5 cases (not 10), verify FSM states and that UI bucket derivation produces expected buckets
- [ ] 11. Run `bun test`

### Task 3 -- "Build ViewModel transformers and IPC handlers"

**Acceptance Criteria:**
- `toDashboardViewModel()` returns: totalFiles, statusBreakdown (counts per derived UI bucket), attentionItems, agentActivity, upcomingStartDates
- `toCaseListViewModel()` returns array of: caseId, clinicianName, profession, facilityName, derivedStatus (UI bucket), daysUntilStart, statusPriority -- sorted by status priority, then days ascending, then last name alpha
- `deriveUiStatusBucket(case, lineItems)` function implements shaping rules: At Risk (missing items + start <= 14 days), Blocked (adverse findings), Pending Submission (verification_complete/packet_assembled + no blockers), With Facility (submitted), Active (other non-terminal + no risk/blocker), Cleared (cleared)
- `toCaseDetailViewModel()` returns: header (name, profession, facility), overview (state, progress, completionByCategory, activeAgents, blockers, quickActions), documents (requirements checklist with statuses), verifications (status rows with timeline data)
- IPC handlers registered for `credentialing:get-dashboard`, `credentialing:get-case-list`, `credentialing:get-case-detail`
- Preload exposes `credentialingGetDashboard()`, `credentialingGetCaseList()`, `credentialingGetCaseDetail()`
- UI status bucket derivation matches shaping rules (14-day At Risk threshold, blocker precedence over Active, Cleared only for terminal state)
- `bun test` passes for ViewModel transformer unit tests (bucket derivation rules, sort order, status priority, count aggregation)

**Files:** `apps/electron/src/main/viewmodels/credentialing-viewmodels.ts`, `apps/electron/src/main/ipc.ts`, `apps/electron/src/preload/index.ts`, `apps/electron/src/shared/types.ts`

- [ ] 1. Define ViewModel types in `shared/types.ts`: `DashboardViewModel`, `CaseListItemViewModel`, `CaseDetailViewModel`, `UiStatusBucket` enum
- [ ] 2. Create `apps/electron/src/main/viewmodels/credentialing-viewmodels.ts`
- [ ] 3. Implement `deriveUiStatusBucket()`: map FSM state + line item data to UI buckets per shaping rules
- [ ] 4. Implement `toCaseListViewModel()`: query cases via CaseManager, derive UI buckets, compute daysUntilStart, assign statusPriority (At Risk=0, Blocked=1, Pending Submission=2, With Facility=3, Active=4, Cleared=5), sort
- [ ] 5. Implement `toDashboardViewModel()`: aggregate case counts by derived UI bucket, compute attention items (start dates <= 7 days, adverse findings, ready packets), stub agent activity
- [ ] 6. Implement `toCaseDetailViewModel()`: build overview, documents checklist, verifications from case data
- [ ] 7. Add IPC handlers in `ipc.ts` for `credentialing:get-dashboard`, `credentialing:get-case-list`, `credentialing:get-case-detail`
- [ ] 8. Add preload methods: `credentialingGetDashboard()`, `credentialingGetCaseList(filters?)`, `credentialingGetCaseDetail(caseId)`
- [ ] 9. Write unit tests for: bucket derivation (14-day threshold, blocker precedence, Cleared terminal), sort order, status priority mapping, count aggregation
- [ ] 10. Run `bun test`

### Task 4 -- "Wire credentialing into NavigationState and Jotai atoms"

**Acceptance Criteria:**
- `CredentialingNavigationState` interface added to `NavigationState` union with `navigator: 'credentialing'`
- `isCredentialingNavigation()` type guard exported from `shared/types.ts`
- `credentialingCasesAtom` (existing) is populated on navigator mount via IPC
- `credentialingSelectedCaseIdAtom` (existing) drives case detail loading
- `credentialingDashboardStateFilterAtom` (existing) filters the list
- Derived atom `credentialingStatusCountsAtom` computes badge counts per derived UI bucket from casesAtom
- `DEFAULT_NAVIGATION_STATE` changed to credentialing navigator
- Route parser updated to handle credentialing routes
- `bun run typecheck:all` passes

**Files:** `apps/electron/src/shared/types.ts`, `apps/electron/src/shared/route-parser.ts`, `apps/electron/src/shared/routes.ts`, `apps/electron/src/renderer/atoms/credentialing.ts`, `apps/electron/src/renderer/contexts/NavigationContext.tsx`

- [ ] 1. Add `CredentialingNavigationState` interface to `shared/types.ts` with navigator, filter (UI bucket or 'all'), details (caseId or null)
- [ ] 2. Add `isCredentialingNavigation()` type guard
- [ ] 3. Update `NavigationState` union to include `CredentialingNavigationState`
- [ ] 4. Change `DEFAULT_NAVIGATION_STATE` to `{ navigator: 'credentialing', filter: 'all', details: null }`
- [ ] 5. Add credentialing routes to `routes.ts` and update `route-parser.ts`
- [ ] 6. Add derived atom `credentialingStatusCountsAtom` in `atoms/credentialing.ts` that reads `credentialingCasesAtom` and returns `Record<UiStatusBucket, number>`
- [ ] 7. Update `NavigationContext.tsx` to handle credentialing navigator
- [ ] 8. Run `bun run typecheck:all`

### Task 5 -- "Add credentialing navigation items to LeftSidebar"

**Acceptance Criteria:**
- LeftSidebar shows "Credentialing Files" as an expandable item with 6 status sub-items (At Risk, Blocked, Pending Submission, With Facility, Active, Cleared)
- Each sub-item shows badge count from `credentialingStatusCountsAtom`
- Clicking a sub-item calls `navigate()` with credentialing route and filter state
- "Settings" item appears below credentialing items
- Active filter is visually highlighted

**Files:** `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

- [ ] 1. Read AppShell.tsx to find where sidebar `links` array is built
- [ ] 2. Replace session-related LinkItems with credentialing LinkItems
- [ ] 3. Add "Credentialing Files" expandable item with onClick navigating to credentialing 'all' filter
- [ ] 4. Add 6 status sub-items: At Risk, Blocked, Pending Submission, With Facility, Active, Cleared -- each with badge count from `credentialingStatusCountsAtom`
- [ ] 5. Add Settings item with onClick navigating to settings
- [ ] 6. Wire active state highlighting based on current navigation state filter
- [ ] 7. Manual QA: verify 6 status labels render, badge counts are numeric, clicking each filter updates the active highlight, Settings item navigates

### Task 6 -- "Build the CredentialingListPanel clinician list"

**Acceptance Criteria:**
- `CredentialingListPanel` component renders a list of clinician rows from `credentialingCasesAtom`
- Rows show: clinician name, specialty, facility, status badge with color, days until start
- List is filtered by `credentialingDashboardStateFilterAtom` (or shows all if 'all')
- Search input at top filters rows by clinician name (case-insensitive substring match)
- Clicking a row sets `credentialingSelectedCaseIdAtom`
- Selected row has visual highlight
- List is sorted: status priority ascending, then daysUntilStart ascending, then lastName alpha

**Files:** `apps/electron/src/renderer/components/app-shell/CredentialingListPanel.tsx`, `apps/electron/src/renderer/components/app-shell/NavigatorPanel.tsx`

- [ ] 1. Create `CredentialingListPanel.tsx` component
- [ ] 2. Read `credentialingCasesAtom` and `credentialingDashboardStateFilterAtom` via Jotai `useAtomValue`
- [ ] 3. Implement status filter: if filter !== 'all', filter cases by derived UI bucket
- [ ] 4. Implement search: local text filter on clinician name
- [ ] 5. Implement sort: statusPriority map, then daysUntilStart, then lastName
- [ ] 6. Render each row with: status icon + color, "Name | Specialty | Facility", "State | X days"
- [ ] 7. Wire row click to set `credentialingSelectedCaseIdAtom`
- [ ] 8. Add selected row highlight (compare selectedCaseIdAtom)
- [ ] 9. Update `NavigatorPanel.tsx` to render `CredentialingListPanel` when navigator is 'credentialing'
- [ ] 10. Use Radix UI + Tailwind + cn() for styling consistent with existing patterns

### Task 7 -- "Build the dashboard summary right panel"

**Acceptance Criteria:**
- When `credentialingSelectedCaseIdAtom` is null, right panel shows `CredentialingDashboard`
- Dashboard displays: total active files count, status breakdown with badge counts, "Requires Your Attention" section, agent activity section, upcoming start dates section
- Data is fetched via `credentialingGetDashboard()` IPC on mount
- Action buttons ("View At-Risk Files", "Review Adverse Findings") set `credentialingDashboardStateFilterAtom` and navigate

**Files:** `apps/electron/src/renderer/components/credentialing/CredentialingDashboard.tsx`, `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx`

- [ ] 1. Create `CredentialingDashboard.tsx` component
- [ ] 2. On mount, call `window.api.credentialingGetDashboard()` and store result in local state
- [ ] 3. Render total files count and status breakdown cards
- [ ] 4. Render "Requires Your Attention" section with attention items from ViewModel
- [ ] 5. Render "Agent Activity (Last 24 Hours)" section
- [ ] 6. Render "Upcoming Start Dates" section
- [ ] 7. Wire action buttons to set `credentialingDashboardStateFilterAtom` and navigate
- [ ] 8. Update `MainContentPanel.tsx`: add `isCredentialingNavigation` branch, show Dashboard when details is null

### Task 8 -- "Build CaseDetailPage with 4-tab clinician detail view"

**Acceptance Criteria:**
- When `credentialingSelectedCaseIdAtom` has a value, right panel shows `CaseDetailPage`
- Header shows clinician name, specialty, facility
- 4 tabs render: Overview, Documents, Verifications, Agent
- Overview tab shows: status banner, progress bar, completion % by category, active agents, blockers, quick actions (rendered as read-only placeholder buttons for v1)
- Documents tab shows: requirements checklist with status badges (uploaded/missing/expired/verified)
- Verifications tab shows: status table (Requirement, Source, Status, Last Checked)
- Agent tab shows: existing `ChatDisplay` component with case context passed as props AND 4 pre-prompt suggestion chips ("What's blocking this file?", "Summarize verifications", "When will this be cleared?", "What should I do next?")
- Data fetched via `credentialingGetCaseDetail(caseId)` IPC on caseId change

**Files:** `apps/electron/src/renderer/components/credentialing/CaseDetailPage.tsx`, `OverviewTab.tsx`, `DocumentsTab.tsx`, `VerificationsTab.tsx`, `AgentTab.tsx`, `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx`

- [ ] 1. Create `CaseDetailPage.tsx` with tab state (useState for activeTab)
- [ ] 2. On caseId change, call `window.api.credentialingGetCaseDetail(caseId)` and store ViewModel
- [ ] 3. Render header: clinician name, specialty, facility from ViewModel
- [ ] 4. Render tab bar with 4 tabs using Radix Tabs or custom tab component
- [ ] 5. Create `OverviewTab.tsx`: status banner (color by state), progress bar, completion % bars by category, active agents list, blockers list, quick action buttons
- [ ] 6. Create `DocumentsTab.tsx`: requirements checklist with status badges, toggle for file browser view (placeholder for v1)
- [ ] 7. Create `VerificationsTab.tsx`: status table with expandable rows showing timeline
- [ ] 8. Create `AgentTab.tsx`: render ChatDisplay with case context, add 4 pre-prompt chip buttons above input
- [ ] 9. Update `MainContentPanel.tsx`: show CaseDetailPage when credentialing details has caseId
- [ ] 10. Render quick action and verification override buttons as disabled placeholders with tooltip "Coming in v2" (do not wire to mutation IPC in this task)

### Task 9 -- "Wire integration flow and add Settings page"

**Acceptance Criteria:**
- App launches and shows credentialing sidebar with badge counts from seed data
- Clicking status filters updates the clinician list in middle column
- Clicking a clinician shows case detail in right panel
- When no clinician selected, dashboard summary is shown
- Settings page renders from sidebar Settings item with placeholder sections (User Profile, Notifications, Default View, Integrations)
- Seed data is auto-loaded on first launch (CaseManager.seedDemoData called during app init)
- No OAuth/onboarding flow files are modified by this plan (C5 verification)
- No files implementing `BaseAgent`, `ClaudeAgent`, `CodexAgent`, or credential encryption are modified (C6 verification)
- `bun run typecheck:all` passes
- `bun test` passes

**Files:** `apps/electron/src/main/index.ts`, `apps/electron/src/renderer/pages/settings/CredentialingSettingsPage.tsx`, `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

- [ ] 1. Wire `CaseManager.seedDemoData()` call during app initialization (after DB init)
- [ ] 2. Wire CredentialingListPanel mount to call `credentialingGetCaseList()` and populate `credentialingCasesAtom`
- [ ] 3. Wire sidebar badge counts to update when casesAtom changes
- [ ] 4. Wire case detail loading on selectedCaseIdAtom change
- [ ] 5. Verify full flow: sidebar filter -> list update -> case selection -> detail view
- [ ] 6. Create `CredentialingSettingsPage.tsx` with placeholder sections: User Profile, Notifications, Default View, Integrations (Not Connected)
- [ ] 7. Wire Settings sidebar item to navigate to credentialing settings page
- [ ] 8. Run `bun run typecheck:all`
- [ ] 9. Run `bun test`
- [ ] 10. Manual QA: full walkthrough of all flows
- [ ] 11. Run `git diff --name-only` and verify no OAuth, onboarding, BaseAgent, ClaudeAgent, CodexAgent, or encryption files were touched

### Task 10 -- "Delete session UI code"

**Acceptance Criteria:**
- `SessionList.tsx` component is deleted
- Session-related sidebar LinkItems are removed from AppShell
- `MainContentPanel` no longer has session navigation branches (isSessionsNavigation removed)
- `SessionsNavigationState` removed from `NavigationState` union
- Session-related atoms (`sessionMetaMapAtom` usage in sidebar) are cleaned up from sidebar code
- App compiles (`bun run typecheck:all` passes)
- App launches into credentialing UI (manual verification: sidebar shows Credentialing Files, not Sessions)

**Files:** `apps/electron/src/renderer/components/app-shell/SessionList.tsx` (delete), `AppShell.tsx`, `MainContentPanel.tsx`, `apps/electron/src/shared/types.ts`

- [ ] 1. Delete `SessionList.tsx`
- [ ] 2. Remove session-related sidebar items from AppShell (status items, label items, view items that reference sessions)
- [ ] 3. Remove `isSessionsNavigation` branch from `MainContentPanel.tsx`
- [ ] 4. Remove `SessionsNavigationState` from `NavigationState` union in `shared/types.ts`
- [ ] 5. Remove `isSessionsNavigation` type guard export
- [ ] 6. Update route-parser to remove session route handling
- [ ] 7. Clean up imports: remove unused session-related imports across touched files
- [ ] 8. Run `bun run typecheck:all` to verify compilation
- [ ] 9. Run `bun test` to verify no test regressions
- [ ] 10. Manual verification: app launches, sidebar shows Credentialing Files (not Sessions), full flow works end-to-end

---

## Task Dependencies

```
Critical path (sequential):
  Task 1 (DB migration)
    -> Task 2 (Seed data)
      -> Task 3 (ViewModel layer)
        -> Task 4 (Navigation + atoms)
          -> Task 5 (Sidebar config)
          -> Task 6 (List panel)
            -> Task 7 (Dashboard)
            -> Task 8 (Case detail)
              -> Task 9 (Integration + Settings)
                -> Task 10 (Delete session UI)
```

---

## Requirements Traceability

| Req | Description | Task(s) | Verification |
|-----|-------------|---------|--------------|
| R0 | App launches into credentialing 3-column layout | T4, T9 | Manual QA |
| R1 | Sidebar with status filters + badge counts | T5 | Manual QA |
| R2 | Clinician list with Name, Specialty, Facility, urgency-sorted | T6 | Manual QA |
| R3 | Dashboard summary when no clinician selected | T7 | Manual QA |
| R4 | 4-tab clinician detail (Overview, Documents, Verifications, Agent) | T8 | Manual QA |
| R5 | DB loads without native compilation deps | T1 | Electron dev launch |
| R6 | 5 seed clinicians in varied states | T2 | Unit tests |
| R7 | All session UI code deleted | T10 | typecheck + manual |
| R8 | ViewModel contracts without DB schema exposure | T3 | Unit tests |
| R9 | Text search on clinician name | T6 | Manual QA |
| R10 | Sort: status priority, days-until-start, last name | T6 | Unit tests |
| R11 | Settings page accessible from sidebar | T9 | Manual QA |
| R12 | Agent tab reuses ChatDisplay with pre-prompt chips | T8 | Manual QA |
| C1 | ViewModel transforms in main process | T3 | Code review |
| C2 | Jotai atoms + React Context (not Zustand) | T4 | Code review |
| C3 | IPC channels follow credentialing:verb-noun | T3 | Code review |
| C4 | CaseManager is single source of truth | T3 | Code review |
| C5 | OAuth/onboarding untouched | T9 | git diff verification |
| C6 | BaseAgent/ClaudeAgent/CodexAgent untouched | T9 | git diff verification |

---

## Safety Rules (non-negotiable)

These rules apply to every task. Agents executing this plan MUST NOT:
- Modify `BaseAgent`, `ClaudeAgent`, `CodexAgent`, or credential encryption
- Modify OAuth/onboarding flow files
- Store UI bucket names as `case.state` values (use valid FSM states only)
- Bypass CaseManager for direct DB access from renderer
- Wire mutation IPC (record-approval, transition-state) in v1 UI tasks
- Introduce Zustand, Redux, vitest, or jest
- Touch `packages/shared` or `packages/core` during DB migration
- Add doc comments on internal types
- Add AI attribution to commits

---

## Verification Protocol

After each task:
1. `bun test` -- all tests pass
2. `bun run typecheck:all` -- no type errors
3. Verify acceptance criteria are met
4. Backend tasks (T1-T3): run unit tests for transformers and DB
5. UI tasks (T5-T8): manual QA checklist items
6. Integration (T9): full flow walkthrough + boundary verification
7. Deletion (T10): typecheck + manual verification of no session remnants

---

## Execution Notes

**Risk areas:**
- T1 (DB migration): node:sqlite DatabaseSync API differs from better-sqlite3. `prepare()` returns `StatementSync` with different method signatures. Transaction API may differ.
- T3 (Bucket derivation): UI status buckets must correctly derive from FSM states + line item data per shaping rules. 14-day threshold and blocker precedence are edge-case-rich.
- T10 (Session deletion): Large surface area of session code to remove. May have hidden dependencies. Run typecheck after each deletion. Must happen AFTER integration (T9) confirms new UI works.
- T8 (Case detail): Agent tab wiring with ChatDisplay needs case context injection. May need to understand ChatDisplay props.

---

## Codex Review History

**Shaping doc review:** 4 FAIL -> 6/6 PASS after fixes (requirements/constraints separation, UI bucket mapping, package boundaries, selection rationale)
**Plan review:** 5 FAIL -> 6/6 PASS after full rewrite (FSM states vs UI buckets, sidebar 6 items, task ordering, atom naming, pre-prompt chips)

Key fixes applied:
- Sidebar 6 items (added Cleared, was 5)
- Seed data uses FSM state names, not UI bucket names
- Task 9 (Integration) before Task 10 (Deletion) -- delete only after new UI confirmed working
- Standardized atom naming: `credentialingDashboardStateFilterAtom` (not `dashboardStateFilter`)
- Task 8 includes pre-prompt chips and disabled quick action placeholders
- C5/C6 boundary verification added to Task 9
