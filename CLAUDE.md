# CLAUDE.md

~/Users/mikeyanderson/advantis-agents/AGENTS.md

## Claude Code Specific

### Spec-First Development

Read `.docs/credentialing-platform/SPEC.md` before writing any code. It contains:
- Entity interfaces with exact field definitions
- MCP tool Zod schemas
- IPC payload contracts
- CaseManager API signatures
- Actor identity provenance rules
- Requirement snapshot lifecycle
- Requirements traceability (R0-R13 mapped to tools and tests)

For task ordering and acceptance criteria, read
`.docs/credentialing-platform/IMPLEMENTATION.md`.

### Boundaries

**ALWAYS** (proceed without asking):
- Run `bun test` after any backend change
- Run `bun run typecheck:all` after type changes
- Create CaseEvent for every case-scoped mutation
- Use Zod schemas for all MCP tool inputs
- Use SQLite transactions for multi-write operations

**ASK FIRST** (pause for approval):
- Adding new dependencies to root `package.json`
- Changing state machine enum or transition map after Task 3
- Changing entity schemas after Task 1
- Note: modifying permission-manager.ts and ipc.ts is expected
  during Tasks 5 and 8 respectively

**NEVER**:
- Modify BaseAgent, ClaudeAgent, CodexAgent, or credential encryption
- Store file blobs in SQLite
- Allow agents to record approvals
- Skip CaseEvent writes on case-scoped mutations
- Submit incomplete packets or bypass adverse findings
- Use inheritance for CaseManager
- Add AI attribution to commits
- Add doc comments on internal types
- Add server sync, multi-tenant, or mobile features
