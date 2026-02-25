# CLI + Shared Core for Dynamics/Dataverse (Existing Electron App)

> **Status:** Draft — awaiting approval before implementation
> **Date:** 2026-02-25
> **Authors:** @miikeyanderson

---

## 1. Problem / Context

The Advantis Agents credentialing platform currently runs as an Electron desktop
app with a local SQLite database for case workflow. Clinician, facility, and
assignment data lives (or will live) in **Microsoft Dynamics 365 / Dataverse**
as the system of record, but the app has no integration layer to query or mutate
that data.

Today:

- The Electron app manages credentialing cases locally (7 entities, 13 MCP
  tools, full state machine).
- There is no programmatic way for engineers, scripts, or agents to interact
  with Dynamics/Dataverse from the terminal.
- The existing Microsoft OAuth module (`packages/shared/src/auth/microsoft-oauth.ts`)
  supports Graph API scopes but not Dataverse-specific scopes.
- Dataverse entities have **not been created yet** — we need to define the
  entity mapping as part of this work.

We need:

1. A **shared Node module** (`packages/core-dynamics`) that encapsulates all
   Dynamics 365 / Dataverse Web API interaction: auth, HTTP, entity CRUD.
2. A **CLI application** (`apps/cli`) that engineers and agents can use to
   query and mutate Dataverse records from the terminal.
3. A plan to **refactor the Electron app** so it imports `core-dynamics` for
   any Dataverse data operations, keeping the local SQLite credentialing
   workflow untouched.

---

## 2. Goals and Non-goals

### Goals

| # | Goal |
|---|------|
| G1 | Ship a `@craft-agent/core-dynamics` package that handles auth, token lifecycle, and typed CRUD against the Dataverse Web API |
| G2 | Ship an `advantis` CLI (`apps/cli`) with commands for clinicians, facilities, assignments, cases, and notes |
| G3 | Define a recommended Dataverse custom entity schema (`adv_*` prefix) and include it in the spec |
| G4 | Use the existing PKCE-based interactive browser OAuth flow for CLI auth (consistent with Electron) |
| G5 | Design `core-dynamics` so the Electron app can import it directly for Dataverse reads/writes |
| G6 | Token caching to disk so users don't re-auth on every CLI invocation |
| G7 | Support both table (human) and JSON (machine/agent) output formats in the CLI |

### Non-goals

| # | Non-goal |
|---|----------|
| N1 | Replacing the local SQLite credentialing workflow — that stays as-is |
| N2 | Real-time sync between Dataverse and SQLite (future work) |
| N3 | Multi-tenant or SaaS deployment |
| N4 | Device-code or client-credentials auth flows (can add later) |
| N5 | Admin operations (user management, security role assignment) |
| N6 | Mobile support |

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Consumers                                 │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │  apps/cli     │    │apps/electron │    │  Future: agents,  │  │
│  │  (commander)  │    │  (Electron)  │    │  workers, sync    │  │
│  └──────┬───────┘    └──────┬───────┘    └────────┬──────────┘  │
│         │                   │                      │             │
│         └──────────┬────────┴──────────────────────┘             │
│                    │                                             │
│         ┌──────────▼──────────┐                                  │
│         │ packages/            │                                  │
│         │   core-dynamics      │                                  │
│         │                      │                                  │
│         │  • DynamicsClient    │                                  │
│         │  • DynamicsAuth      │                                  │
│         │  • Entity services   │                                  │
│         │  • Zod schemas       │                                  │
│         └──────────┬──────────┘                                  │
│                    │                                             │
└────────────────────┼─────────────────────────────────────────────┘
                     │  HTTPS  (OData v4)
                     ▼
           ┌─────────────────────┐
           │  Dynamics 365 /     │
           │  Dataverse Web API  │
           │  {env}.crm.dynamics │
           │  .com/api/data/v9.2 │
           └─────────────────────┘
```

### Key boundaries

- **`packages/core-dynamics`** — zero UI dependencies, pure Node/Bun. Handles
  OAuth token lifecycle, HTTP, typed entity operations. Exports a
  `DynamicsClient` class and per-entity service objects.
- **`apps/cli`** — thin shell over `core-dynamics`. Commander-based. Formats
  output. Reads config. No business logic.
- **`apps/electron`** — already built. Will import `core-dynamics` to pull
  clinician/facility data from Dataverse into the UI and feed it into the
  local credentialing workflow.

---

## 4. Core Module Design (`packages/core-dynamics`)

### 4.1 Config

Config is resolved in priority order:

1. **Constructor options** (highest priority — used by Electron)
2. **Environment variables** (used by CLI and CI)
3. **Config file** `~/.craft-agent/dynamics.json` (persistent user config)

```typescript
// packages/core-dynamics/src/config.ts

import { z } from 'zod';

export const DynamicsConfigSchema = z.object({
  /** Azure AD tenant ID (GUID or domain) */
  tenantId: z.string().min(1),
  /** Entra ID app registration client ID */
  clientId: z.string().uuid(),
  /** Dataverse environment URL, e.g. https://org1234.crm.dynamics.com */
  environmentUrl: z.string().url(),
  /** Optional: client secret for server-to-server (future) */
  clientSecret: z.string().optional(),
});

export type DynamicsConfig = z.infer<typeof DynamicsConfigSchema>;
```

Environment variable mapping:

| Config key | Env var | Example |
|---|---|---|
| `tenantId` | `DYNAMICS_TENANT_ID` | `a1b2c3d4-...` |
| `clientId` | `DYNAMICS_CLIENT_ID` | `e5f6g7h8-...` |
| `environmentUrl` | `DYNAMICS_ENVIRONMENT_URL` | `https://advantis.crm.dynamics.com` |
| `clientSecret` | `DYNAMICS_CLIENT_SECRET` | *(optional)* |

Config file location: `{CONFIG_DIR}/dynamics.json` where `CONFIG_DIR` is
the existing `~/.craft-agent/` path from `packages/shared/src/config/paths.ts`.

### 4.2 Auth (OAuth2 with PKCE)

Reuses the existing PKCE pattern from `packages/shared/src/auth/microsoft-oauth.ts`
but targets **Dataverse scopes** instead of Graph scopes.

```typescript
// packages/core-dynamics/src/auth.ts

export class DynamicsAuth {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: number = 0;
  private readonly tokenCachePath: string;

  constructor(private readonly config: DynamicsConfig) {
    this.tokenCachePath = join(CONFIG_DIR, 'dynamics-tokens.json');
    this.loadCachedTokens();
  }

  /** Dataverse delegated scope */
  get scopes(): string[] {
    return [
      `${this.config.environmentUrl}/.default`,
      'offline_access',
    ];
  }

  /** Get a valid access token, refreshing or re-authing as needed */
  async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }
    if (this.refreshToken) {
      return this.refreshWithToken();
    }
    return this.interactiveLogin();
  }

  /** Interactive browser login (PKCE) — same pattern as microsoft-oauth.ts */
  private async interactiveLogin(): Promise<string> { /* ... */ }

  /** Refresh using stored refresh token */
  private async refreshWithToken(): Promise<string> { /* ... */ }

  /** Persist tokens to disk (encrypted at rest via existing credential storage) */
  private persistTokens(): void { /* ... */ }

  /** Load cached tokens from disk */
  private loadCachedTokens(): void { /* ... */ }
}
```

**Auth endpoints** (tenant-specific, not "common"):

```
Authorization: https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize
Token:         https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
```

**Token caching**: Tokens are written to `~/.craft-agent/dynamics-tokens.json`.
The file stores `{ accessToken, refreshToken, expiresAt }`. On next CLI
invocation, `DynamicsAuth` loads cached tokens, checks expiry, and silently
refreshes if needed — no browser popup unless the refresh token has expired.

### 4.3 HTTP Client

```typescript
// packages/core-dynamics/src/http.ts

export class DynamicsHttp {
  private readonly baseUrl: string;  // e.g. https://org.crm.dynamics.com/api/data/v9.2

  constructor(
    private readonly auth: DynamicsAuth,
    environmentUrl: string,
  ) {
    this.baseUrl = `${environmentUrl.replace(/\/$/, '')}/api/data/v9.2`;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> { /* ... */ }
  async post<T>(path: string, body: unknown): Promise<T> { /* ... */ }
  async patch(path: string, body: unknown): Promise<void> { /* ... */ }
  async delete(path: string): Promise<void> { /* ... */ }
}
```

All methods:

- Call `auth.getToken()` before every request (handles refresh transparently)
- Set `Authorization: Bearer {token}` and `OData-MaxVersion: 4.0`
- Set `Content-Type: application/json; charset=utf-8`
- Parse OData error responses into typed `DynamicsApiError`
- Retry on 429 (rate limit) with `Retry-After` header, up to 3 times
- Throw `DynamicsApiError` with status code, Dataverse error code, and message

### 4.4 Public API Surface

```typescript
// packages/core-dynamics/src/index.ts  (barrel export)

export { DynamicsClient } from './client.ts';
export { DynamicsAuth } from './auth.ts';
export { DynamicsConfig, DynamicsConfigSchema, resolveConfig } from './config.ts';
export * from './entities/index.ts';
export * from './errors.ts';
```

#### DynamicsClient (facade)

```typescript
export class DynamicsClient {
  readonly clinicians: ClinicianService;
  readonly facilities: FacilityService;
  readonly assignments: AssignmentService;
  readonly cases: CredentialingCaseService;
  readonly notes: NoteService;

  constructor(config: DynamicsConfig) {
    const auth = new DynamicsAuth(config);
    const http = new DynamicsHttp(auth, config.environmentUrl);
    this.clinicians = new ClinicianService(http);
    this.facilities = new FacilityService(http);
    this.assignments = new AssignmentService(http);
    this.cases = new CredentialingCaseService(http);
    this.notes = new NoteService(http);
  }
}
```

#### Entity Services

Each service maps to a Dataverse entity set and exposes typed methods:

**ClinicianService**

```typescript
class ClinicianService {
  list(filter?: { status?: string; search?: string }): Promise<DvClinician[]>
  get(id: string): Promise<DvClinician>
  create(data: CreateClinicianInput): Promise<DvClinician>
  update(id: string, data: Partial<CreateClinicianInput>): Promise<void>
}
```

**FacilityService**

```typescript
class FacilityService {
  list(filter?: { state?: string; search?: string }): Promise<DvFacility[]>
  get(id: string): Promise<DvFacility>
}
```

**AssignmentService**

```typescript
class AssignmentService {
  list(filter?: { clinicianId?: string; facilityId?: string }): Promise<DvAssignment[]>
  get(id: string): Promise<DvAssignment>
  create(data: CreateAssignmentInput): Promise<DvAssignment>
}
```

**CredentialingCaseService**

```typescript
class CredentialingCaseService {
  list(filter?: { clinicianId?: string; status?: string }): Promise<DvCredentialingCase[]>
  get(id: string): Promise<DvCredentialingCase>
  updateStatus(id: string, status: string): Promise<void>
}
```

**NoteService**

```typescript
class NoteService {
  list(filter: { clinicianId?: string; caseId?: string }): Promise<DvNote[]>
  add(data: { clinicianId?: string; caseId?: string; text: string }): Promise<DvNote>
}
```

### 4.5 Error Handling

```typescript
// packages/core-dynamics/src/errors.ts

export class DynamicsError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DynamicsError';
  }
}

export class DynamicsAuthError extends DynamicsError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'DynamicsAuthError';
  }
}

export class DynamicsApiError extends DynamicsError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'DynamicsApiError';
  }
}
```

### 4.6 Logging Strategy

- Use `console.error` for auth/HTTP debug output (stderr, not stdout)
- Respect `DYNAMICS_LOG_LEVEL` env var (`silent | error | warn | info | debug`)
- **Never log tokens or secrets** — log only request URL, status code, timing
- In the CLI, stdout is reserved for command output (table/JSON)

---

## 5. CLI Design (`apps/cli`)

### 5.1 Command Structure

```
advantis <resource> <action> [options]
```

| Command | Description |
|---------|-------------|
| `advantis clinicians list [--status active\|inactive] [--search "name"]` | List clinicians from Dataverse |
| `advantis clinicians show <id>` | Show one clinician with detail |
| `advantis facilities list [--state TX] [--search "name"]` | List facilities |
| `advantis facilities show <id>` | Show one facility with assignments |
| `advantis assignments list --clinician <id>` | List assignments for a clinician |
| `advantis assignments list --facility <id>` | List assignments for a facility |
| `advantis cases list [--clinician <id>] [--status <status>]` | List credentialing cases |
| `advantis cases show <id>` | Show case detail |
| `advantis cases update-status <id> --status <newStatus>` | Update case status |
| `advantis notes add --clinician <id> --text "..."` | Add a note to a clinician |
| `advantis notes add --case <id> --text "..."` | Add a note to a case |
| `advantis notes list --clinician <id>` | List notes for a clinician |
| `advantis auth login` | Force interactive login |
| `advantis auth status` | Show current auth state |
| `advantis auth logout` | Clear cached tokens |
| `advantis config show` | Print resolved config |
| `advantis config set <key> <value>` | Set a config value in dynamics.json |

**Global flags** (available on all commands):

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of table |
| `--env-url <url>` | Override Dataverse environment URL |
| `--verbose` | Enable debug logging to stderr |

### 5.2 Config Resolution

The CLI resolves config in this order:

1. CLI flags (`--env-url`, etc.)
2. Environment variables (`DYNAMICS_TENANT_ID`, etc.)
3. Config file (`~/.craft-agent/dynamics.json`)
4. Fail with a clear error message listing what's missing

```typescript
// apps/cli/src/config.ts

import { resolveConfig } from '@craft-agent/core-dynamics';

export function loadCliConfig(flags: Record<string, string>): DynamicsConfig {
  return resolveConfig({
    environmentUrl: flags['env-url'],
    // ... other flag overrides
  });
}
```

### 5.3 Output Formatting

```typescript
// apps/cli/src/format.ts

export function printTable(rows: Record<string, unknown>[], columns: string[]): void {
  // Column-aligned table to stdout
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

export function printResult(data: unknown, opts: { json: boolean; columns: string[] }): void {
  if (opts.json) return printJson(data);
  if (Array.isArray(data)) return printTable(data, opts.columns);
  printJson(data);  // fallback for single objects
}
```

### 5.4 Sample CLI Interaction

```bash
# Login (first time)
$ advantis auth login
Opening browser for Microsoft sign-in...
✓ Authenticated as mike@advantis.com

# List clinicians
$ advantis clinicians list --status active
ID                                    Name              NPI         License   State
────────────────────────────────────  ────────────────  ──────────  ────────  ─────
a1b2c3d4-e5f6-7890-abcd-ef1234567890  Dr. Jane Smith   1234567890  RN12345   TX
b2c3d4e5-f6a7-8901-bcde-f12345678901  Dr. John Doe     0987654321  MD54321   CA

# Show one clinician as JSON (for piping to agent)
$ advantis clinicians show a1b2c3d4 --json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Dr. Jane Smith",
  "npi": "1234567890",
  ...
}

# List cases for a clinician
$ advantis cases list --clinician a1b2c3d4
ID          Clinician       Facility         Status               Updated
──────────  ──────────────  ───────────────  ───────────────────  ──────────
case-001    Dr. Jane Smith  General Hospital offer_accepted       2026-02-20
case-002    Dr. Jane Smith  St. Mary's       verification_in_pro  2026-02-18

# Add a note
$ advantis notes add --clinician a1b2c3d4 --text "License renewal due March 2026"
✓ Note added (note-id: n1a2b3c4)
```

---

## 6. Electron Integration Plan

### 6.1 Current State

The Electron app's `CaseManager` talks directly to local SQLite via
repositories. It has no Dataverse integration. The existing Microsoft OAuth
in `packages/shared` is for Graph API only (Outlook, OneDrive, etc.).

### 6.2 Integration Approach

**Phase 1: Import core-dynamics alongside existing repos** (no breaking changes)

```typescript
// apps/electron/src/main/case-manager.ts  (additions only)

import { DynamicsClient, resolveConfig } from '@craft-agent/core-dynamics';

export class CaseManager {
  // ... existing repo fields stay the same ...
  private dynamicsClient: DynamicsClient | null = null;

  /** Lazy-init Dynamics client when config is available */
  getDynamicsClient(): DynamicsClient {
    if (!this.dynamicsClient) {
      const config = resolveConfig(); // from env/config file
      this.dynamicsClient = new DynamicsClient(config);
    }
    return this.dynamicsClient;
  }

  /** Pull clinician data from Dataverse (new method) */
  async fetchClinicianFromDynamics(clinicianId: string) {
    const client = this.getDynamicsClient();
    return client.clinicians.get(clinicianId);
  }

  /** Search Dataverse for facilities (new method) */
  async searchFacilitiesFromDynamics(query: string) {
    const client = this.getDynamicsClient();
    return client.facilities.list({ search: query });
  }
}
```

**Phase 2: Wire into IPC handlers**

```typescript
// apps/electron/src/main/ipc.ts  (new handlers)

ipcMain.handle('dynamics:clinicians:list', async (_event, filter) => {
  const client = caseManager.getDynamicsClient();
  return client.clinicians.list(filter);
});

ipcMain.handle('dynamics:facilities:list', async (_event, filter) => {
  const client = caseManager.getDynamicsClient();
  return client.facilities.list(filter);
});
```

**Phase 3: (Future) Hydrate local cases from Dataverse**

When creating a new credentialing case, the Electron UI could search Dataverse
for the clinician, pull their data, and pass it to `createCase` — replacing
manual data entry.

### 6.3 What Does NOT Change

- SQLite database schema and repositories
- State machine and guards
- MCP tools and agent topology
- Existing credentialing IPC handlers
- The `packages/credentialing` package itself

---

## 7. Dataverse Entity Mapping (Recommended)

Since entities don't exist yet, here's the recommended custom entity schema.

### 7.1 Entity Definitions

All custom entities use the `adv_` publisher prefix.

| Dataverse Entity (logical) | Entity Set (plural) | Display Name | Description |
|---|---|---|---|
| `adv_clinician` | `adv_clinicians` | Clinician | Healthcare provider record |
| `adv_facility` | `adv_facilities` | Facility | Hospital / healthcare facility |
| `adv_assignment` | `adv_assignments` | Assignment | Clinician ↔ Facility link |
| `adv_credentialingcase` | `adv_credentialingcases` | Credentialing Case | Credentialing workflow instance |
| `adv_note` | `adv_notes` | Note | Free-text annotation on clinician or case |

### 7.2 Column Definitions

**adv_clinician**

| Column (logical) | Type | Description |
|---|---|---|
| `adv_clinicianid` | Uniqueidentifier (PK) | Auto-generated |
| `adv_name` | String(200) | Full name |
| `adv_profession` | String(100) | e.g. "Registered Nurse" |
| `adv_npi` | String(10) | National Provider Identifier |
| `adv_primarylicensestate` | String(2) | Two-letter state code |
| `adv_primarylicensenumber` | String(50) | License number |
| `adv_email` | String(200) | Contact email |
| `adv_phone` | String(20) | Contact phone |
| `adv_status` | Choice | active / inactive / pending |
| `createdon` | DateTime | System-managed |
| `modifiedon` | DateTime | System-managed |

**adv_facility**

| Column (logical) | Type | Description |
|---|---|---|
| `adv_facilityid` | Uniqueidentifier (PK) | Auto-generated |
| `adv_name` | String(200) | Facility name |
| `adv_jurisdiction` | String(2) | State/jurisdiction code |
| `adv_address` | String(500) | Full address |
| `adv_city` | String(100) | City |
| `adv_state` | String(2) | State |
| `adv_zipcode` | String(10) | ZIP code |
| `adv_phone` | String(20) | Main phone |
| `adv_status` | Choice | active / inactive |
| `createdon` | DateTime | System-managed |

**adv_assignment**

| Column (logical) | Type | Description |
|---|---|---|
| `adv_assignmentid` | Uniqueidentifier (PK) | Auto-generated |
| `adv_clinicianid` | Lookup(adv_clinician) | FK to clinician |
| `adv_facilityid` | Lookup(adv_facility) | FK to facility |
| `adv_startdate` | DateOnly | Assignment start |
| `adv_enddate` | DateOnly | Assignment end (null = ongoing) |
| `adv_role` | String(100) | Role at facility |
| `adv_status` | Choice | active / inactive / completed |
| `createdon` | DateTime | System-managed |

**adv_credentialingcase**

| Column (logical) | Type | Description |
|---|---|---|
| `adv_credentialingcaseid` | Uniqueidentifier (PK) | Auto-generated |
| `adv_clinicianid` | Lookup(adv_clinician) | FK to clinician |
| `adv_facilityid` | Lookup(adv_facility) | FK to facility |
| `adv_status` | Choice | Maps to CaseState enum values |
| `adv_startdate` | DateOnly | Expected start date |
| `adv_localcaseid` | String(36) | Reference to local SQLite case ID |
| `createdon` | DateTime | System-managed |
| `modifiedon` | DateTime | System-managed |

**adv_note**

| Column (logical) | Type | Description |
|---|---|---|
| `adv_noteid` | Uniqueidentifier (PK) | Auto-generated |
| `adv_clinicianid` | Lookup(adv_clinician) | FK to clinician (nullable) |
| `adv_credentialingcaseid` | Lookup(adv_credentialingcase) | FK to case (nullable) |
| `adv_text` | Memo(4000) | Note content |
| `adv_author` | String(200) | Who wrote it |
| `createdon` | DateTime | System-managed |

### 7.3 Dataverse Web API URL Patterns

```
Base: {environmentUrl}/api/data/v9.2

GET    /adv_clinicians                              → list clinicians
GET    /adv_clinicians({id})                        → get one clinician
POST   /adv_clinicians                              → create clinician
PATCH  /adv_clinicians({id})                        → update clinician
GET    /adv_clinicians?$filter=adv_status eq 1      → filter by status

GET    /adv_facilities                              → list facilities
GET    /adv_facilities({id})                        → get one facility

GET    /adv_assignments?$filter=_adv_clinicianid_value eq {id}
                                                     → assignments by clinician

GET    /adv_credentialingcases?$filter=_adv_clinicianid_value eq {id}
                                                     → cases by clinician
PATCH  /adv_credentialingcases({id})                → update case status

POST   /adv_notes                                   → create note
GET    /adv_notes?$filter=_adv_clinicianid_value eq {id}
                                                     → notes for clinician
```

### 7.4 TypeScript ↔ Dataverse Mapping

```typescript
// packages/core-dynamics/src/entities/clinician.ts

/** What the Dataverse Web API returns */
export interface DvClinicianRaw {
  adv_clinicianid: string;
  adv_name: string;
  adv_profession: string;
  adv_npi: string;
  adv_primarylicensestate: string;
  adv_primarylicensenumber: string;
  adv_email: string;
  adv_phone: string;
  adv_status: number;          // Choice value: 1=active, 2=inactive, 3=pending
  createdon: string;
  modifiedon: string;
}

/** Clean TypeScript interface for consumers */
export interface DvClinician {
  id: string;
  name: string;
  profession: string;
  npi: string;
  primaryLicenseState: string;
  primaryLicenseNumber: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

/** Map raw Dataverse row → clean TS object */
export function mapClinician(raw: DvClinicianRaw): DvClinician {
  return {
    id: raw.adv_clinicianid,
    name: raw.adv_name,
    profession: raw.adv_profession,
    npi: raw.adv_npi,
    primaryLicenseState: raw.adv_primarylicensestate,
    primaryLicenseNumber: raw.adv_primarylicensenumber,
    email: raw.adv_email,
    phone: raw.adv_phone,
    status: STATUS_MAP[raw.adv_status] ?? 'pending',
    createdAt: raw.createdon,
    updatedAt: raw.modifiedon,
  };
}

const STATUS_MAP: Record<number, 'active' | 'inactive' | 'pending'> = {
  1: 'active',
  2: 'inactive',
  3: 'pending',
};
```

---

## 8. Microsoft 365 / Dynamics Setup (High Level)

### 8.1 Entra ID App Registration

1. **Register a new app** in Azure portal → Entra ID → App registrations
2. **Name**: `Advantis Agents – Dynamics Integration`
3. **Supported account types**: Single tenant (this org only)
4. **Redirect URI**: `http://localhost:19836/callback` (for PKCE interactive)
5. **API permissions** → Add:
   - `Dynamics CRM` → `user_impersonation` (Delegated)
   - `Microsoft Graph` → `User.Read` (Delegated)
   - `offline_access` (Delegated, for refresh tokens)
6. **No client secret needed** for the public client PKCE flow
7. **Token configuration**: Enable `offline_access` scope
8. Record: `Application (client) ID` → `DYNAMICS_CLIENT_ID`
9. Record: `Directory (tenant) ID` → `DYNAMICS_TENANT_ID`

### 8.2 Dataverse Setup

1. **Create custom entities** per Section 7.2 above
2. **Create an Application User** in Dataverse admin (optional for future
   server-to-server)
3. **Assign a Security Role** that grants read/write to `adv_*` entities
4. Record: Dataverse org URL → `DYNAMICS_ENVIRONMENT_URL`

### 8.3 Config → Code Mapping

| Azure/Dataverse value | Config key | Where it's used |
|---|---|---|
| Application (client) ID | `clientId` | OAuth authorize + token requests |
| Directory (tenant) ID | `tenantId` | OAuth endpoint URLs |
| Org URL | `environmentUrl` | API base URL + token scope |

---

## 9. Security Considerations

### 9.1 Secret Storage

| Context | Storage | Notes |
|---|---|---|
| Dev (local) | `.env` file (gitignored) | Standard for dev |
| CLI (user machine) | `~/.craft-agent/dynamics.json` | Config only, no secrets |
| CLI tokens | `~/.craft-agent/dynamics-tokens.json` | File permissions 0600 |
| Production / CI | Azure Key Vault or CI secrets | For server-to-server (future) |
| Electron | Existing credential storage from `packages/shared` | Uses OS keychain |

### 9.2 Token Security

- **Never log tokens**: All HTTP logging redacts the `Authorization` header
- **Token file permissions**: Written with `0o600` (owner read/write only)
- **Token lifetime**: Dataverse access tokens expire in ~1 hour; refresh tokens
  last up to 90 days
- **Logout clears all**: `advantis auth logout` deletes the token file

### 9.3 Input Validation

- All CLI inputs validated with Zod before reaching `core-dynamics`
- OData `$filter` values are URL-encoded, not string-interpolated
- Entity IDs validated as UUIDs to prevent injection via OData paths

---

## 10. Future Extensions

| Extension | Effort | Description |
|---|---|---|
| Device-code auth | Small | Add `--auth-flow device-code` for headless/SSH use |
| Client credentials | Small | Add `clientSecret` support for CI/automation |
| Background sync worker | Medium | Periodic Dataverse → SQLite sync for offline |
| More entities | Small | Insurances, education, work history |
| Webhook listener | Medium | Dataverse webhook → local event for real-time sync |
| Agent CLI integration | Medium | Let credentialing agents call `advantis` commands via MCP tools |
| Bulk operations | Small | `advantis clinicians import --csv data.csv` |

---

---

# Implementation Plan

## A. Proposed Folder / Package Structure

```
advantis-agents/
├── packages/
│   ├── core-dynamics/               ← NEW shared module
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts             ← barrel export
│   │       ├── client.ts            ← DynamicsClient facade
│   │       ├── auth.ts              ← DynamicsAuth (PKCE + token cache)
│   │       ├── http.ts              ← DynamicsHttp (OData HTTP layer)
│   │       ├── config.ts            ← resolveConfig + DynamicsConfigSchema
│   │       ├── errors.ts            ← DynamicsError, DynamicsApiError, DynamicsAuthError
│   │       ├── logger.ts            ← stderr logger with level control
│   │       ├── entities/
│   │       │   ├── index.ts         ← re-exports
│   │       │   ├── clinician.ts     ← DvClinician types + ClinicianService + mapper
│   │       │   ├── facility.ts      ← DvFacility types + FacilityService + mapper
│   │       │   ├── assignment.ts    ← DvAssignment types + AssignmentService + mapper
│   │       │   ├── case.ts          ← DvCredentialingCase types + CaseService + mapper
│   │       │   └── note.ts          ← DvNote types + NoteService + mapper
│   │       └── __tests__/
│   │           ├── config.test.ts
│   │           ├── http.test.ts     ← mocked HTTP tests
│   │           ├── clinician.test.ts
│   │           └── mapper.test.ts
│   ├── credentialing/               ← EXISTING (no changes)
│   ├── shared/                      ← EXISTING (minor: export CONFIG_DIR)
│   └── ...
├── apps/
│   ├── cli/                         ← NEW CLI app
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts             ← entry point (commander program)
│   │       ├── config.ts            ← CLI config resolution
│   │       ├── format.ts            ← table + JSON output
│   │       ├── commands/
│   │       │   ├── clinicians.ts    ← clinicians list/show
│   │       │   ├── facilities.ts    ← facilities list/show
│   │       │   ├── assignments.ts   ← assignments list
│   │       │   ├── cases.ts         ← cases list/show/update-status
│   │       │   ├── notes.ts         ← notes list/add
│   │       │   ├── auth.ts          ← auth login/status/logout
│   │       │   └── config-cmd.ts    ← config show/set
│   │       └── __tests__/
│   │           └── format.test.ts
│   ├── electron/                    ← EXISTING (minor additions)
│   │   └── src/main/
│   │       ├── case-manager.ts      ← add getDynamicsClient()
│   │       └── ipc.ts              ← add dynamics:* IPC handlers
│   └── ...
```

## B. Package Details

### B.1 `packages/core-dynamics`

**package.json**

```json
{
  "name": "@craft-agent/core-dynamics",
  "version": "0.0.1",
  "license": "Apache-2.0",
  "description": "Shared Dynamics 365 / Dataverse integration for Advantis Agents",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "bun run tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

**Key files to implement** (in order):

| # | File | Purpose | Key exports |
|---|------|---------|-------------|
| 1 | `src/errors.ts` | Error hierarchy | `DynamicsError`, `DynamicsApiError`, `DynamicsAuthError` |
| 2 | `src/logger.ts` | stderr logger | `log.debug()`, `log.info()`, `log.error()` |
| 3 | `src/config.ts` | Config resolution | `DynamicsConfigSchema`, `resolveConfig()` |
| 4 | `src/auth.ts` | OAuth2 PKCE + token cache | `DynamicsAuth` |
| 5 | `src/http.ts` | OData HTTP layer | `DynamicsHttp` |
| 6 | `src/entities/clinician.ts` | Clinician service | `ClinicianService`, `DvClinician`, `mapClinician` |
| 7 | `src/entities/facility.ts` | Facility service | `FacilityService`, `DvFacility` |
| 8 | `src/entities/assignment.ts` | Assignment service | `AssignmentService`, `DvAssignment` |
| 9 | `src/entities/case.ts` | Case service | `CredentialingCaseService`, `DvCredentialingCase` |
| 10 | `src/entities/note.ts` | Note service | `NoteService`, `DvNote` |
| 11 | `src/entities/index.ts` | Barrel | Re-exports |
| 12 | `src/client.ts` | Facade | `DynamicsClient` |
| 13 | `src/index.ts` | Package barrel | Everything |

### B.2 `apps/cli`

**package.json**

```json
{
  "name": "@craft-agent/cli",
  "version": "0.0.1",
  "license": "Apache-2.0",
  "description": "Advantis Agents CLI for Dynamics 365 / Dataverse",
  "type": "module",
  "bin": {
    "advantis": "./src/index.ts"
  },
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test",
    "typecheck": "bun run tsc --noEmit"
  },
  "dependencies": {
    "commander": "^13.0.0"
  },
  "devDependencies": {}
}
```

**Key files to implement:**

| # | File | Purpose |
|---|------|---------|
| 1 | `src/format.ts` | Table + JSON output formatting |
| 2 | `src/config.ts` | CLI flag → config resolution |
| 3 | `src/commands/auth.ts` | `auth login\|status\|logout` |
| 4 | `src/commands/clinicians.ts` | `clinicians list\|show` |
| 5 | `src/commands/facilities.ts` | `facilities list\|show` |
| 6 | `src/commands/assignments.ts` | `assignments list` |
| 7 | `src/commands/cases.ts` | `cases list\|show\|update-status` |
| 8 | `src/commands/notes.ts` | `notes list\|add` |
| 9 | `src/commands/config-cmd.ts` | `config show\|set` |
| 10 | `src/index.ts` | Entry point, register all commands |

### B.3 Electron (minimal changes)

| File | Change |
|------|--------|
| `apps/electron/src/main/case-manager.ts` | Add `getDynamicsClient()` method + `fetchClinicianFromDynamics()` |
| `apps/electron/src/main/ipc.ts` | Add `dynamics:clinicians:list`, `dynamics:facilities:list` IPC handlers |

---

## C. TypeScript Snippets

### C.1 Core Dynamics Client (auth + GET)

```typescript
// packages/core-dynamics/src/auth.ts

import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { DynamicsConfig } from './config.ts';
import { DynamicsAuthError } from './errors.ts';
import { log } from './logger.ts';

const CALLBACK_PORT = 19836;

interface TokenCache {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

export class DynamicsAuth {
  private cache: TokenCache | null = null;
  private readonly tokenPath: string;
  private readonly authorizeUrl: string;
  private readonly tokenUrl: string;

  constructor(private readonly config: DynamicsConfig, configDir: string) {
    this.tokenPath = join(configDir, 'dynamics-tokens.json');
    this.authorizeUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`;
    this.tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
    this.loadCachedTokens();
  }

  get scopes(): string[] {
    return [`${this.config.environmentUrl}/.default`, 'offline_access'];
  }

  async getToken(): Promise<string> {
    // 1. Return cached token if still valid (with 60s buffer)
    if (this.cache && Date.now() < this.cache.expiresAt - 60_000) {
      return this.cache.accessToken;
    }

    // 2. Try refresh if we have a refresh token
    if (this.cache?.refreshToken) {
      try {
        log.debug('Refreshing Dynamics token...');
        return await this.refresh(this.cache.refreshToken);
      } catch {
        log.info('Refresh failed, falling back to interactive login');
      }
    }

    // 3. Interactive PKCE login
    return this.interactiveLogin();
  }

  async interactiveLogin(): Promise<string> {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('hex');

    // Start local callback server
    const { code, redirectUri } = await this.startCallbackAndOpenBrowser(
      challenge, state
    );

    // Exchange code for tokens
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      scope: this.scopes.join(' '),
    });

    const resp = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new DynamicsAuthError(`Token exchange failed: ${text}`);
    }

    const data = await resp.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    this.cache = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    this.persistTokens();
    return this.cache.accessToken;
  }

  clearTokens(): void {
    this.cache = null;
    try {
      const { unlinkSync } = require('node:fs');
      unlinkSync(this.tokenPath);
    } catch { /* file may not exist */ }
  }

  private async refresh(refreshToken: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: this.scopes.join(' '),
    });

    const resp = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!resp.ok) throw new DynamicsAuthError('Token refresh failed');

    const data = await resp.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    this.cache = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    this.persistTokens();
    return this.cache.accessToken;
  }

  private persistTokens(): void {
    if (!this.cache) return;
    const dir = dirname(this.tokenPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.tokenPath, JSON.stringify(this.cache), { mode: 0o600 });
  }

  private loadCachedTokens(): void {
    try {
      if (!existsSync(this.tokenPath)) return;
      const raw = readFileSync(this.tokenPath, 'utf-8');
      this.cache = JSON.parse(raw);
    } catch {
      this.cache = null;
    }
  }

  private async startCallbackAndOpenBrowser(
    challenge: string,
    state: string,
  ): Promise<{ code: string; redirectUri: string }> {
    // Implementation: spin up a temporary HTTP server on CALLBACK_PORT,
    // build the authorize URL, open it with the user's default browser,
    // wait for the redirect with the auth code.
    // This mirrors the pattern in packages/shared/src/auth/microsoft-oauth.ts
    throw new Error('Stub — see full implementation');
  }
}
```

```typescript
// packages/core-dynamics/src/http.ts

import type { DynamicsAuth } from './auth.ts';
import { DynamicsApiError } from './errors.ts';
import { log } from './logger.ts';

export class DynamicsHttp {
  private readonly baseUrl: string;

  constructor(
    private readonly auth: DynamicsAuth,
    environmentUrl: string,
  ) {
    this.baseUrl = `${environmentUrl.replace(/\/$/, '')}/api/data/v9.2`;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const token = await this.auth.getToken();
    log.debug(`GET ${url.pathname}`);

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw DynamicsApiError.fromResponse(resp.status, body);
    }

    return resp.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const token = await this.auth.getToken();
    log.debug(`POST ${path}`);

    const resp = await fetch(`${this.baseUrl}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw DynamicsApiError.fromResponse(resp.status, text);
    }

    return resp.json() as Promise<T>;
  }

  async patch(path: string, body: unknown): Promise<void> {
    const token = await this.auth.getToken();
    log.debug(`PATCH ${path}`);

    const resp = await fetch(`${this.baseUrl}/${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw DynamicsApiError.fromResponse(resp.status, text);
    }
  }
}
```

### C.2 Sample Entity Service

```typescript
// packages/core-dynamics/src/entities/clinician.ts

import { z } from 'zod';
import type { DynamicsHttp } from '../http.ts';

// --- Types ---

export interface DvClinicianRaw {
  adv_clinicianid: string;
  adv_name: string;
  adv_profession: string;
  adv_npi: string;
  adv_primarylicensestate: string;
  adv_primarylicensenumber: string;
  adv_email: string;
  adv_phone: string;
  adv_status: number;
  createdon: string;
  modifiedon: string;
}

export interface DvClinician {
  id: string;
  name: string;
  profession: string;
  npi: string;
  primaryLicenseState: string;
  primaryLicenseNumber: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

const STATUS_MAP: Record<number, DvClinician['status']> = {
  1: 'active', 2: 'inactive', 3: 'pending',
};

const REVERSE_STATUS: Record<string, number> = {
  active: 1, inactive: 2, pending: 3,
};

export function mapClinician(raw: DvClinicianRaw): DvClinician {
  return {
    id: raw.adv_clinicianid,
    name: raw.adv_name,
    profession: raw.adv_profession,
    npi: raw.adv_npi,
    primaryLicenseState: raw.adv_primarylicensestate,
    primaryLicenseNumber: raw.adv_primarylicensenumber,
    email: raw.adv_email,
    phone: raw.adv_phone,
    status: STATUS_MAP[raw.adv_status] ?? 'pending',
    createdAt: raw.createdon,
    updatedAt: raw.modifiedon,
  };
}

// --- Zod schema for input validation ---

export const ListCliniciansFilterSchema = z.object({
  status: z.enum(['active', 'inactive', 'pending']).optional(),
  search: z.string().optional(),
}).optional();

export const CreateClinicianInputSchema = z.object({
  name: z.string().min(1),
  profession: z.string().min(1),
  npi: z.string().length(10),
  primaryLicenseState: z.string().length(2),
  primaryLicenseNumber: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
});

export type CreateClinicianInput = z.infer<typeof CreateClinicianInputSchema>;

// --- Service ---

interface ODataCollection<T> {
  value: T[];
  '@odata.count'?: number;
}

export class ClinicianService {
  constructor(private readonly http: DynamicsHttp) {}

  async list(filter?: z.infer<typeof ListCliniciansFilterSchema>): Promise<DvClinician[]> {
    const params: Record<string, string> = {
      $orderby: 'adv_name asc',
    };

    const filters: string[] = [];
    if (filter?.status) {
      filters.push(`adv_status eq ${REVERSE_STATUS[filter.status]}`);
    }
    if (filter?.search) {
      filters.push(`contains(adv_name,'${filter.search}')`);
    }
    if (filters.length > 0) {
      params.$filter = filters.join(' and ');
    }

    const resp = await this.http.get<ODataCollection<DvClinicianRaw>>(
      'adv_clinicians', params
    );
    return resp.value.map(mapClinician);
  }

  async get(id: string): Promise<DvClinician> {
    const raw = await this.http.get<DvClinicianRaw>(`adv_clinicians(${id})`);
    return mapClinician(raw);
  }

  async create(data: CreateClinicianInput): Promise<DvClinician> {
    const body = {
      adv_name: data.name,
      adv_profession: data.profession,
      adv_npi: data.npi,
      adv_primarylicensestate: data.primaryLicenseState,
      adv_primarylicensenumber: data.primaryLicenseNumber,
      adv_email: data.email,
      adv_phone: data.phone,
      adv_status: 3, // pending
    };
    const raw = await this.http.post<DvClinicianRaw>('adv_clinicians', body);
    return mapClinician(raw);
  }

  async update(id: string, data: Partial<CreateClinicianInput>): Promise<void> {
    const body: Record<string, unknown> = {};
    if (data.name) body.adv_name = data.name;
    if (data.profession) body.adv_profession = data.profession;
    if (data.npi) body.adv_npi = data.npi;
    if (data.primaryLicenseState) body.adv_primarylicensestate = data.primaryLicenseState;
    if (data.primaryLicenseNumber) body.adv_primarylicensenumber = data.primaryLicenseNumber;
    if (data.email) body.adv_email = data.email;
    if (data.phone) body.adv_phone = data.phone;
    await this.http.patch(`adv_clinicians(${id})`, body);
  }
}
```

### C.3 Sample CLI Command

```typescript
// apps/cli/src/commands/clinicians.ts

import { Command } from 'commander';
import { DynamicsClient } from '@craft-agent/core-dynamics';
import { printResult } from '../format.ts';
import { loadCliConfig } from '../config.ts';

export function registerClinicianCommands(program: Command): void {
  const cmd = program.command('clinicians').description('Manage clinicians in Dynamics');

  cmd
    .command('list')
    .description('List clinicians')
    .option('--status <status>', 'Filter by status (active|inactive|pending)')
    .option('--search <name>', 'Search by name')
    .action(async (opts) => {
      const config = loadCliConfig(program.opts());
      const client = new DynamicsClient(config);

      const clinicians = await client.clinicians.list({
        status: opts.status,
        search: opts.search,
      });

      printResult(clinicians, {
        json: program.opts().json,
        columns: ['id', 'name', 'npi', 'primaryLicenseState', 'status'],
      });
    });

  cmd
    .command('show <id>')
    .description('Show clinician details')
    .action(async (id: string) => {
      const config = loadCliConfig(program.opts());
      const client = new DynamicsClient(config);

      const clinician = await client.clinicians.get(id);
      printResult(clinician, {
        json: program.opts().json,
        columns: Object.keys(clinician),
      });
    });
}
```

```typescript
// apps/cli/src/index.ts

#!/usr/bin/env bun
import { Command } from 'commander';
import { registerClinicianCommands } from './commands/clinicians.ts';
import { registerFacilityCommands } from './commands/facilities.ts';
import { registerAssignmentCommands } from './commands/assignments.ts';
import { registerCaseCommands } from './commands/cases.ts';
import { registerNoteCommands } from './commands/notes.ts';
import { registerAuthCommands } from './commands/auth.ts';
import { registerConfigCommands } from './commands/config-cmd.ts';

const program = new Command()
  .name('advantis')
  .description('Advantis Agents CLI – Dynamics 365 / Dataverse')
  .version('0.0.1')
  .option('--json', 'Output as JSON')
  .option('--env-url <url>', 'Override Dataverse environment URL')
  .option('--verbose', 'Enable debug logging');

registerAuthCommands(program);
registerConfigCommands(program);
registerClinicianCommands(program);
registerFacilityCommands(program);
registerAssignmentCommands(program);
registerCaseCommands(program);
registerNoteCommands(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
```

### C.4 Sample Electron Data Call

```typescript
// apps/electron/src/main/case-manager.ts  (new method additions)

import { DynamicsClient, resolveConfig, type DvClinician } from '@craft-agent/core-dynamics';

// Inside CaseManager class:

private dynamicsClient: DynamicsClient | null = null;

getDynamicsClient(): DynamicsClient {
  if (!this.dynamicsClient) {
    const config = resolveConfig();
    this.dynamicsClient = new DynamicsClient(config);
  }
  return this.dynamicsClient;
}

/** Search Dynamics for a clinician by NPI and pull their data */
async lookupClinicianFromDynamics(npi: string): Promise<DvClinician | null> {
  const client = this.getDynamicsClient();
  const results = await client.clinicians.list({ search: npi });
  return results.find(c => c.npi === npi) ?? null;
}

/**
 * Create a case by first pulling clinician data from Dynamics,
 * then creating the local credentialing case.
 */
async createCaseFromDynamics(dvClinicianId: string, facilityId: string): Promise<Case> {
  const client = this.getDynamicsClient();
  const dvClinician = await client.clinicians.get(dvClinicianId);

  // Create local clinician + case using existing repo logic
  return this.createCase(
    {
      name: dvClinician.name,
      profession: dvClinician.profession,
      npi: dvClinician.npi,
      primaryLicenseState: dvClinician.primaryLicenseState,
      primaryLicenseNumber: dvClinician.primaryLicenseNumber,
      email: dvClinician.email,
      phone: dvClinician.phone,
    },
    facilityId,
  );
}
```

---

## D. Implementation Order

| Phase | Task | Depends on | Deliverable |
|-------|------|-----------|-------------|
| 1 | Scaffold `packages/core-dynamics` (package.json, tsconfig, errors, logger, config) | — | Config resolution works, types compile |
| 2 | Implement `DynamicsAuth` (PKCE login, token cache, refresh) | Phase 1 | Can authenticate and get a Dataverse token |
| 3 | Implement `DynamicsHttp` (GET/POST/PATCH with auth) | Phase 2 | Can make raw OData calls |
| 4 | Implement entity services (clinician, facility, assignment, case, note) | Phase 3 | `DynamicsClient` facade works end-to-end |
| 5 | Scaffold `apps/cli` (commander, config, format, auth commands) | Phase 1 | `advantis auth login` works |
| 6 | Implement CLI resource commands (clinicians, facilities, etc.) | Phase 4–5 | Full CLI works |
| 7 | Add Electron integration (getDynamicsClient, IPC handlers) | Phase 4 | Electron can call Dataverse |
| 8 | Tests (unit tests for mappers, config; integration tests for HTTP with mocks) | Phase 4 | CI passes |

## E. New Dependencies

| Package | Version | Where | Purpose |
|---------|---------|-------|---------|
| `commander` | `^13.0.0` | `apps/cli` | CLI argument parsing |

No new dependencies are needed for `packages/core-dynamics` — it uses Node
built-ins (`crypto`, `fs`, `http`) and `zod` (already in the workspace root).
