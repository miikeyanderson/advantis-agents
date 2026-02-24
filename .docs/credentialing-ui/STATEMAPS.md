# Credentialing UI - State Maps & Architecture Diagrams

**Last updated:** 2026-02-24
**Source of truth:** `.docs/credentialing-ui/SHAPING.md`, `packages/credentialing/src/`

---

## 1. System Context

What Advantis Agents talks to and how.

```mermaid
graph TB
    User["Credentialing Specialist<br/>(Desktop App)"]

    subgraph Advantis["Advantis Agents (Electron 39)"]
        Renderer["React Renderer<br/>Jotai + Radix UI"]
        Main["Main Process<br/>CaseManager + IPC"]
        DB["node:sqlite<br/>DatabaseSync"]
    end

    Anthropic["Anthropic API<br/>(Claude)"]
    OpenAI["OpenAI API<br/>(Codex/GPT)"]
    Copilot["GitHub Copilot<br/>(Device OAuth)"]
    Sentry["Sentry<br/>(Error Tracking)"]

    User -->|"Electron UI"| Renderer
    Renderer -->|"IPC invoke/on"| Main
    Main -->|"SQL"| DB
    Main -->|"REST + OAuth"| Anthropic
    Main -->|"REST + OAuth"| OpenAI
    Main -->|"REST + Device Code"| Copilot
    Main -->|"HTTPS"| Sentry
```

**Notes:**
- Verification sources (NPPES, OIG, SAM.gov) are MCP-tool-dispatched, not hardcoded
- OAuth flows: Claude Max (browser redirect), ChatGPT (token), Copilot (device code)
- DB is local-only, no server sync

---

## 2. Case State Machine

The credentialing FSM from `packages/credentialing/src/state-machine.ts`.
9 states, linear happy path, any non-terminal state can exit to `closed`.

```mermaid
stateDiagram-v2
    [*] --> offer_accepted

    offer_accepted --> documents_requested : request docs
    documents_requested --> documents_collected : all docs received
    documents_collected --> verification_in_progress : start verifications
    verification_in_progress --> verification_complete : all checks pass
    verification_complete --> packet_assembled : assemble packet
    packet_assembled --> submitted : submit to facility
    submitted --> cleared : facility clears

    offer_accepted --> closed : early close
    documents_requested --> closed : early close
    documents_collected --> closed : early close
    verification_in_progress --> closed : early close
    verification_complete --> closed : early close
    packet_assembled --> closed : early close
    submitted --> closed : early close

    cleared --> [*]
    closed --> [*]
```

### UI Status Bucket Derivation

FSM states map to UI display buckets via `deriveUiStatusBucket()`.
These are ViewModel-layer derivations, never stored in DB.

```
FSM State                    + Conditions               = UI Bucket
---------------------------------------------------------------------
cleared                                                   Cleared
any non-terminal             + adverse findings           Blocked
any non-terminal             + missing items + <=14 days  At Risk
verification_complete        + no blockers                Pending Submission
packet_assembled             + no blockers                Pending Submission
submitted                                                 With Facility
offer_accepted               + no risk/blocker flags      Active
documents_requested          + no risk/blocker flags      Active
documents_collected          + no risk/blocker flags      Active
verification_in_progress     + no risk/blocker flags      Active
```

**Priority order (sort + sidebar):**

```
At Risk = 0  >  Blocked = 1  >  Pending Submission = 2
  >  With Facility = 3  >  Active = 4  >  Cleared = 5
```

---

## 3. Data Model (ERD)

All entities from `packages/credentialing/src/types.ts`.

```mermaid
erDiagram
    Clinician ||--o{ Case : "has cases"
    Clinician {
        string id PK
        string name
        string profession
        string npi
        string primaryLicenseState
        string primaryLicenseNumber
        string email
        string phone
        string createdAt
    }

    FacilityTemplate ||--o{ Case : "template for"
    FacilityTemplate {
        string id PK
        string name
        string jurisdiction
        int version
        string[] requiredDocTypes
        string[] requiredVerificationTypes
        string createdAt
        string updatedAt
    }

    Case ||--o{ Document : "requires"
    Case ||--o{ Verification : "checks"
    Case ||--o{ Approval : "needs"
    Case ||--o{ CaseEvent : "audit trail"
    Case {
        string id PK
        string clinicianId FK
        string facilityId FK
        CaseState state
        string startDate
        int templateVersion
        string[] requiredDocTypesSnapshot
        string[] requiredVerificationTypesSnapshot
        string createdAt
        string updatedAt
    }

    Document {
        string id PK
        string caseId FK
        string docType
        enum status "pending | received | verified | rejected"
        string fileRef
        json metadata
        string createdAt
        string updatedAt
    }

    Verification ||--o{ Approval : "reviewed by"
    Verification {
        string id PK
        string caseId FK
        string verificationType
        string source
        boolean pass
        json evidence "sourceUrl + timestamp + responseData"
        string createdAt
    }

    Approval {
        string id PK
        string caseId FK
        string verificationId FK "nullable"
        enum decision "approved | rejected | waiver"
        string reviewer
        string notes
        string createdAt
    }

    CaseEvent {
        string id PK
        string caseId FK
        enum eventType "state_transition | document_recorded | verification_completed | approval_recorded | packet_assembled | case_created | case_closed"
        enum actorType "agent | human | system"
        string actorId
        string evidenceRef
        json payload
        string timestamp
    }
```

**Key relationships:**
- `Clinician` 1:many `Case` (one clinician per facility assignment)
- `FacilityTemplate` 1:many `Case` (template snapshots into case at creation)
- `Case` 1:many `Document`, `Verification`, `Approval`, `CaseEvent`
- `Verification` 0..1:many `Approval` (adverse findings need human review)

---

## 4. Sequence Diagram: Case Selection Flow

The critical user flow: specialist clicks a clinician in the list,
app loads detail from DB via IPC, renders 4-tab view.

```mermaid
sequenceDiagram
    participant User as Specialist
    participant List as CredentialingListPanel
    participant Atoms as Jotai Atoms
    participant IPC as IPC Bridge
    participant Handler as Main Process Handler
    participant CM as CaseManager
    participant DB as node:sqlite

    User->>List: Click clinician row
    List->>Atoms: set credentialingSelectedCaseIdAtom(caseId)

    Note over Atoms: Atom change triggers detail fetch

    Atoms->>IPC: credentialingGetCaseDetail(caseId)
    IPC->>Handler: ipcMain.handle('credentialing:get-case-detail')
    Handler->>CM: getCaseDetail(caseId)
    CM->>DB: SELECT case, clinician, documents, verifications
    DB-->>CM: Raw rows
    CM-->>Handler: Case + Clinician + Documents + Verifications
    Handler->>Handler: toCaseDetailViewModel(data)

    Note over Handler: Derives UI bucket, completion %,<br/>blocker list, agent status

    Handler-->>IPC: CaseDetailViewModel
    IPC-->>Atoms: Update detail atom
    Atoms-->>List: Re-render (highlight selected row)

    Note over User: Right panel switches from<br/>Dashboard to CaseDetailPage

    User->>User: Click tab (Overview/Documents/Verifications/Agent)
```

### Dashboard Load (No Selection)

```mermaid
sequenceDiagram
    participant Panel as MainContentPanel
    participant IPC as IPC Bridge
    participant Handler as Main Process Handler
    participant CM as CaseManager
    participant DB as node:sqlite

    Note over Panel: selectedCaseIdAtom is null

    Panel->>IPC: credentialingGetDashboard()
    IPC->>Handler: ipcMain.handle('credentialing:get-dashboard')
    Handler->>CM: queryCases() + aggregate
    CM->>DB: SELECT all cases with joins
    DB-->>CM: All cases + documents + verifications
    CM-->>Handler: Full case data
    Handler->>Handler: toDashboardViewModel(cases)

    Note over Handler: Counts per bucket, attention items,<br/>agent activity, upcoming starts

    Handler-->>IPC: DashboardViewModel
    IPC-->>Panel: Render dashboard sections
```

---

## 5. Component Architecture

Internal components of Advantis Agents and how they communicate.

```mermaid
graph TB
    subgraph Electron["Electron 39 Application"]
        subgraph RendererProcess["Renderer Process (Vite + React 18)"]
            Shell["AppShell<br/>3-column layout"]
            Sidebar["LeftSidebar<br/>Credentialing Files + Settings"]
            ListPanel["CredentialingListPanel<br/>Search + clinician rows"]
            Dashboard["CredentialingDashboard<br/>Aggregate stats"]
            Detail["CaseDetailPage<br/>4-tab detail view"]
            Atoms["Jotai Atoms<br/>cases, filter, selected, counts"]
            NavCtx["NavigationContext<br/>React Context"]
        end

        Preload["Preload Script<br/>contextBridge API"]

        subgraph MainProcess["Main Process (esbuild + Node 22)"]
            IPCHandlers["IPC Handlers<br/>credentialing:* channels"]
            ViewModels["ViewModel Transformers<br/>toDashboard / toCaseList / toCaseDetail"]
            CaseMgr["CaseManager<br/>Business logic + FSM"]
            Repos["Repositories<br/>Clinician / Case / Document / Verification"]
            Database["Database<br/>node:sqlite DatabaseSync"]
            Agents["Agent System<br/>BaseAgent + Claude/Codex"]
        end
    end

    Shell --> Sidebar
    Shell --> ListPanel
    Shell --> Dashboard
    Shell --> Detail
    Sidebar --> Atoms
    ListPanel --> Atoms
    Dashboard --> Atoms
    Detail --> Atoms
    Atoms --> NavCtx

    Atoms -->|"invoke"| Preload
    Preload -->|"ipcRenderer"| IPCHandlers
    IPCHandlers --> ViewModels
    ViewModels --> CaseMgr
    CaseMgr --> Repos
    Repos --> Database
    CaseMgr --> Agents

    IPCHandlers -->|"webContents.send<br/>(agent events)"| Preload
```

### IPC Channel Map

Existing credentialing channels (registered in `ipc.ts`):

```
Channel                              Direction    Handler
---------------------------------------------------------------
credentialing:query-cases            invoke       CaseManager (tool)
credentialing:create-case            invoke       CaseManager (tool)
credentialing:get-case-timeline      invoke       CaseManager (tool)
credentialing:run-verification       invoke       CaseManager (tool)
credentialing:transition-state       invoke       CaseManager (tool)
credentialing:check-guards           invoke       CaseManager (tool)
credentialing:get-finding-detail     invoke       CaseManager (tool)
credentialing:record-approval        invoke       CaseManager (tool)
credentialing:query-templates        invoke       CaseManager (tool)
credentialing:create-template        invoke       CaseManager (tool)
credentialing:update-template        invoke       CaseManager (tool)
credentialing:spawn-agent            invoke       CaseManager (direct)
credentialing:get-active-agent       invoke       CaseManager (direct)
credentialing:list-case-agents       invoke       CaseManager (direct)
```

New ViewModel channels (added in this feature):

```
Channel                              Direction    Handler
---------------------------------------------------------------
credentialing:get-dashboard          invoke       toDashboardViewModel()
credentialing:get-case-list          invoke       toCaseListViewModel()
credentialing:get-case-detail        invoke       toCaseDetailViewModel()
```

---

## Seed Data Reference

5 clinicians mapping FSM states to UI buckets:

```
Clinician              FSM State                  UI Bucket            Why
---------------------------------------------------------------------------------------
Jane Doe               documents_requested        At Risk              Missing TB, 5d
  ICU RN, Memorial TX
John Smith             verification_in_progress   Blocked              Adverse finding
  Med-Surg RN, Memorial TX
Sarah Johnson          packet_assembled           Pending Submission   All green
  ED RN, St. Mary's CA
Mike Brown             submitted                  With Facility        Awaiting clearance
  ICU RN, Cedar Sinai CA
Amy Chen               verification_in_progress   Active               On track
  Telemetry RN, Houston Med TX
```

---

## Diagram Maintenance

- **Update when:** Entity schema changes, FSM transitions change, new IPC channels added
- **Source files to watch:** `types.ts`, `state-machine.ts`, `ipc.ts`, `case-manager.ts`
- **Rendering:** All Mermaid diagrams render natively on GitHub. For local preview use VS Code Mermaid extension or `mermaid.live`
- **Scope:** Only diagram what's complex or ambiguous. Don't diagram trivial components.
