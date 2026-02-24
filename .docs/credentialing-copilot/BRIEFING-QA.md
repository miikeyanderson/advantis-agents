# Briefing Q&A: Credentialing Copilot (Agent Tab)

## User's Initial Request

We're building Advantis Agents — a credentialing-specific desktop app (Electron 39, TypeScript, node:sqlite). We repurposed a generic AI chat shell into a 3-column credentialing case management UI:

- **Left sidebar**: Status filters (At Risk, Blocked, Pending, With Facility, Active, Cleared) with badge counts
- **Middle panel**: Clinician list (search, filter, sort by status priority)
- **Right panel**: Case detail with 4 tabs (Overview, Documents, Verifications, Agent)

The UI shell is complete and working. But everything is static — seed data, placeholder buttons, a non-functional chat tab. Nothing actually does anything.

### What Exists (backend)

The credentialing package (`packages/credentialing/`) already has:
- State machine with FSM transitions (offer_accepted -> documents_requested -> ... -> cleared)
- Repositories: CaseRepository, ClinicianRepository, DocumentRepository, VerificationRepository, CaseEventRepository, ApprovalRepository
- CaseManager with query methods, seed data, agent spawning scaffold
- MCP tools (defined but not wired to real agent sessions)
- Guard system for state transitions (checks required docs, verifications, approvals)

### What Needs to Happen

Make the Agent tab in the case detail view actually work — wire it to real AI agent sessions that can:
1. **Document Collection Agent**: Request missing docs from clinician, track what's received, update document status
2. **Verification Agent**: Run primary source verifications (license lookup, OIG/SAM exclusion check), record pass/fail
3. **Case Coordinator Agent**: Orchestrate the full credentialing workflow — advance state machine, flag blockers, assemble packets

The Agent tab should become the primary interaction surface — a credentialing specialist chats with the AI agent about a specific case, and the agent takes actions (transitions state, records verifications, flags issues) through MCP tools.

### Key Constraint

The existing agent infrastructure (BaseAgent, ClaudeAgent, CodexAgent) in the codebase MUST NOT be modified. We build on top of it. The MCP tools in `packages/credentialing/` are the interface between agents and case data.

---

## Round 1: Core Architecture Questions

### Q1: What does 'working Agent tab' look like for V1?

**Answer: Chat + Action Buttons (Cursor-style)**

Detailed Specification: Credentialing Copilot (Claude Cowork for Credentialing)

#### 1. Leverage Existing Craft Agents Architecture

What You Already Have:
- Rich Formatting Infrastructure:
  - StreamingMarkdown component with block-level memoization for performance
  - Markdown renderer with code highlighting (Shiki integration)
  - Tool use visualization system (auth cards, approval flows)
  - Permission modes: safe (Explore), ask (Ask to Edit), allow-all (Auto)
  - Three-tier permission system with custom rules per workspace

- Agent System:
  - base-agent.ts: Core agent orchestration logic
  - claude-agent.ts: Claude Agent SDK wrapper (109KB of logic)
  - mode-manager.ts: Permission mode handling
  - llm-tool.ts: LLM tool definitions and MCP integration
  - session-scoped-tools.ts: Tool lifecycle management per session

- Session Management:
  - JSONL-based persistence (~/.craft-agent/workspaces/{id}/sessions/)
  - Status workflow system (Todo -> In Progress -> Needs Review -> Done)
  - Flagging, labeling, and archiving
  - Deep linking support (craftagents:// URLs)

- MCP Integration:
  - Full MCP server support (stdio, HTTP)
  - Credential management with AES-256-GCM encryption
  - Source configuration system (MCP servers, REST APIs, local files)
  - Tool response summarization for large outputs (60KB threshold)

#### 3. Detailed UI/UX Spec for Agent Tab

##### 3A. Chat Interface with Action Buttons (Cursor-style)

Component Structure:
```typescript
// Reuse existing Craft Agents chat infrastructure
import { StreamingMarkdown } from '@craft-agent/renderer/components/markdown'
import { AuthRequestCard } from '@craft-agent/renderer/components/chat' // Adapt for action approval

interface CredentialingChatProps {
  caseId: number
  clinician: ClinicianViewModel
  session: Session // Craft Agents session object
  onActionApprove: (actionId: string) => Promise<void>
  onActionReject: (actionId: string, reason: string) => Promise<void>
}

export function CredentialingChat({ caseId, clinician, session }: CredentialingChatProps) {
  // ... implementation
}
```

Message Format - Agent Turn Structure:
```tsx
interface AgentTurn {
  id: string
  role: 'assistant'
  content: {
    type: 'text' | 'thinking' | 'tool_use' | 'action_suggestion'
    text?: string // Markdown text
    actions?: ActionButton[] // New for credentialing
  }[]
  timestamp: Date
}

interface ActionButton {
  id: string
  label: string // e.g., "Send urgent reminder to Jane for TB test"
  description: string // Additional context shown on hover
  toolName: string // MCP tool to execute: "send_email", "update_line_item", etc.
  toolInput: Record<string, unknown> // Pre-filled tool parameters
  requiresApproval: boolean // Always true for credentialing
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed'
  result?: string // Populated after execution
}
```

Rendering Logic:
```tsx
function AgentMessageWithActions({ turn }: { turn: AgentTurn }) {
  return (
    <div className="agent-message">
      {turn.content.map((block, i) => {
        if (block.type === 'text') {
          return (
            <StreamingMarkdown
              key={i}
              content={block.text}
              isStreaming={turn.isStreaming}
              mode="minimal"
            />
          )
        }

        if (block.type === 'action_suggestion') {
          return (
            <div key={i} className="action-buttons-container">
              <p className="action-header">Recommended actions:</p>
              {block.actions.map((action) => (
                <ActionButton
                  key={action.id}
                  action={action}
                  onApprove={() => handleActionApprove(action)}
                  onReject={() => handleActionReject(action)}
                />
              ))}
            </div>
          )
        }
      })}
    </div>
  )
}

function ActionButton({ action, onApprove, onReject }: ActionButtonProps) {
  return (
    <Card className="action-card">
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{action.label}</p>
            <p className="text-sm text-muted-foreground">{action.description}</p>
            <Badge variant="outline" className="mt-1">
              {action.toolName}
            </Badge>
          </div>

          {action.status === 'pending' && (
            <div className="flex gap-2">
              <Button onClick={onApprove} size="sm">
                <Check className="w-4 h-4 mr-1" />
                Approve
              </Button>
              <Button onClick={onReject} variant="ghost" size="sm">
                <X className="w-4 h-4 mr-1" />
                Reject
              </Button>
            </div>
          )}

          {action.status === 'executing' && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}

          {action.status === 'completed' && (
            <Badge variant="success">
              <Check className="w-4 h-4 mr-1" />
              Done
            </Badge>
          )}

          {action.status === 'failed' && (
            <Badge variant="destructive">
              <AlertCircle className="w-4 h-4 mr-1" />
              Failed
            </Badge>
          )}
        </div>

        {action.result && (
          <Alert className="mt-2">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{action.result}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
```

Example Agent Response (Markdown with Actions):
```
I've analyzed Jane's file. Here's what I found:

- License verified via Nursys (TX RN #123456, active until 08/2027)
- BLS cert verified via AHA (expires 06/2026)
- TB test result is missing - due in 2 days (02/26/2026)
- Reference #2 hasn't responded after 2 follow-up emails

<action_suggestion>
[
  {
    "id": "act_001",
    "label": "Send urgent reminder to Jane for TB test",
    "description": "Email Jane with 48-hour deadline and attach TB test requirements PDF",
    "toolName": "send_email",
    "toolInput": {
      "to": "jane.doe@email.com",
      "template": "tb_test_urgent_reminder",
      "caseId": 123,
      "attachments": ["tb_test_requirements.pdf"]
    },
    "requiresApproval": true,
    "status": "pending"
  },
  {
    "id": "act_002",
    "label": "Call Reference #2 directly",
    "description": "Show phone number and talking points for specialist to call manually",
    "toolName": "show_contact_info",
    "toolInput": {
      "referenceId": 456,
      "includeScript": true
    },
    "requiresApproval": false,
    "status": "pending"
  }
]
</action_suggestion>

Would you like me to take these actions? Click "Approve" on each button above.
```

---

### Q2: How should agent sessions relate to cases?

**Answer: Architecture Mapping - Session = Case (Persistent per clinician/assignment)**

#### 2. Architecture Mapping: Craft Agents -> Credentialing

Reuse Strategy:

| Craft Agents Concept | Credentialing Equivalent | How to Adapt |
|---|---|---|
| Session | Credentialing Case (one per clinician/assignment) | Each clinician's file is a session. Session title = "Jane Doe - ICU RN - Memorial TX" |
| Workspace | Credentialing Department | One workspace per agency or team. Stores all cases, sources (Dynamics, Nursys, etc.), skills (verification routines) |
| Status Workflow | Credentialing State Machine | Replace Todo/In Progress/Done with: At Risk, Blocked, Pending Submission, With Facility, Active, Cleared, On Hold |
| Skills | Credentialing Agent Prompts | Store specialized prompts: "Document Classifier", "License Verifier", "Reference Chaser" |
| Sources (MCP) | External Integrations | Microsoft Dynamics (MCP or REST), Nursys API, Background check vendors, Email/SMS |
| Permission Modes | Human-in-the-Loop Controls | Default to ask mode. Auto-approve routine tasks (allow-all rules for doc classification), require approval for adverse findings |
| Hooks | Automation Triggers | LabelAdd hook for "urgent" -> notify specialist. SchedulerTick for daily compliance checks. PostToolUse for audit logging |

---

### Q3: Single unified agent vs three specialized agents?

**Answer: Single unified agent with all credentialing MCP tools**

(User chose single unified agent approach, confirmed in the detailed spec with one `CredentialingAgent` class that extends `ClaudeAgent`.)

---

### Q4: Real-time update expectation?

**Answer: Toast + Stale Marking**

##### 3E. Real-Time Updates (Toast + Stale Marking)

```typescript
// When agent executes an action (tool use)
async function executeAgentAction(action: ActionButton): Promise<void> {
  action.status = 'executing'
  updateUI()

  try {
    const tool = credentialingTools.find(t => t.name === action.toolName)
    const result = await tool.handler(action.toolInput)

    action.status = 'completed'
    action.result = result.message
    updateUI()

    showToast({
      type: result.success ? 'success' : 'error',
      title: result.success ? 'Action Completed' : 'Action Failed',
      message: result.message,
      duration: 5000
    })

    markTabsStale(action.toolInput.caseId, inferStaleTabsFromTool(action.toolName))

    await caseEventService.create({
      caseId: action.toolInput.caseId,
      eventType: 'agent_action_executed',
      agentName: 'CredentialingAgent',
      details: `Executed ${action.toolName}: ${result.message}`,
      metadata: { actionId: action.id, toolName: action.toolName, result }
    })

  } catch (error) {
    action.status = 'failed'
    action.result = error.message
    updateUI()

    showToast({
      type: 'error',
      title: 'Action Failed',
      message: error.message,
      duration: 8000
    })
  }
}

function inferStaleTabsFromTool(toolName: string): string[] {
  const tabMap: Record<string, string[]> = {
    'classify_document': ['documents', 'overview'],
    'verify_license': ['verifications', 'overview'],
    'send_email': ['timeline'],
    'update_line_item_status': ['overview', 'documents', 'verifications'],
    'submit_packet_to_facility': ['overview'],
    'check_sanctions': ['verifications']
  }
  return tabMap[toolName] || ['overview']
}

function DocumentsTab({ caseId }: { caseId: number }) {
  const [documents, setDocuments] = useState([])
  const isStale = useTabStaleFlag(caseId, 'documents')

  useEffect(() => {
    if (isStale) {
      refetchDocuments()
      clearStaleFlag(caseId, 'documents')
    }
  }, [isStale])

  async function refetchDocuments() {
    const fresh = await documentService.getAllForCase(caseId)
    setDocuments(fresh)
  }
}
```

---

## Round 2: Clarification Questions

### Q5: Codebase reference - Craft Agents vs Advantis Agents?

**Answer: Craft Agents IS the base (fork)**

Advantis Agents was forked from Craft Agents (lukilabs/craft-agents-oss).

What was KEPT from Craft Agents:
```
apps/electron/                     # Full Electron app shell
  src/main/                        # Main process, IPC, window management
  src/preload/                     # Context bridge
  src/renderer/                    # React UI foundation
    components/chat/               # AuthRequestCard (renamed to ActionApprovalCard)
    components/markdown/           # StreamingMarkdown
    components/ui/                 # shadcn components
    hooks/                         # useSession, useAgent
packages/core/                     # Core types
packages/shared/                   # Business logic
  src/agent/                       # Agent orchestration
    base-agent.ts                  # Core agent loop
    claude-agent.ts                # Claude SDK integration
    llm-tool.ts                    # Tool system
  src/sessions/                    # JSONL session persistence
  src/config/                      # Workspace/preferences
  src/credentials/                 # AES-256-GCM credential storage
```

What was ADDED for credentialing:
```
apps/electron/src/main/
  database.ts                      # SQLite via better-sqlite3
  dynamics-sync.ts                 # MS Dynamics integration
apps/electron/src/renderer/components/credentialing/
  CredentialingFileView.tsx
  CredentialingChat.tsx
  OverviewTab.tsx
  DocumentsTab.tsx
  VerificationsTab.tsx
apps/electron/src/renderer/views/
  Credentialing.tsx                # Main view
packages/credentialing/            # Domain logic
  src/mcp-tools/
    case-tools.ts
    document-tools.ts
    verification-tools.ts
    communication-tools.ts
    submission-tools.ts
  src/services/
    nursys.service.ts
    oig-sam.service.ts
    background-check.service.ts
    email.service.ts
    vms.service.ts
  src/db/
    schema.sql
    migrations/
    repositories/
packages/shared/src/agent/
  credentialing-agent.ts           # Extends ClaudeAgent
  credentialing-context.ts         # Context builder
```

---

### Q6: V1 scope - real external services or mocked?

**Answer: Real everything for V1**

Wire all external integrations for V1. Full end-to-end with real APIs (Nursys, OIG/SAM, email, VMS).

---

### Q7: Tool source - existing MCP tools or new tool set?

**Answer: Build new credentialing-specific tool set**

The existing MCP tools in packages/credentialing/ need replacement. Build the tools from the spec:
- `get_case_data` - Retrieve full credentialing file data
- `classify_document` - Classify uploaded documents into requirement categories
- `verify_license` - Verify RN/LPN license via Nursys or state BON
- `send_email` - Send email to clinician, reference, or facility contact
- `update_line_item_status` - Update status of credentialing requirement line items
- `submit_packet_to_facility` - Submit completed packet to facility VMS/MSP
- `check_sanctions` - Check OIG LEIE, SAM.gov, and state exclusion lists

#### Tool Registration in Main Process

```typescript
// apps/electron/src/main/setup-credentialing.ts

import { app, ipcMain } from 'electron'
import path from 'path'
import Database from 'better-sqlite3'
import { credentialingTools } from '@advantis/credentialing/mcp-tools'
import { CredentialingAgent } from '@advantis/shared/agent/credentialing-agent'
import { WorkspaceManager } from '@advantis/shared/config'

let db: Database.Database
let agent: CredentialingAgent

export async function setupCredentialing() {
  // 1. Initialize SQLite database
  const dbPath = path.join(app.getPath('userData'), 'credentialing.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // Run migrations
  const schema = require('@advantis/credentialing/db/schema.sql')
  db.exec(schema)

  // 2. Initialize workspace for credentialing
  const workspace = await WorkspaceManager.getOrCreate('credentialing')

  // 3. Register all credentialing MCP tools
  for (const tool of credentialingTools) {
    await workspace.registerTool({
      ...tool,
      handler: (input) => tool.handler(input, { db })
    })
  }

  // 4. Create credentialing agent instance
  agent = new CredentialingAgent({
    workspace,
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022',
    db
  })

  // 5. Set up IPC handlers
  setupIPCHandlers()
}

function setupIPCHandlers() {
  ipcMain.handle('credentialing:init-session', async (event, caseId: number) => {
    try {
      const session = await agent.initSessionForCase(caseId)
      return { success: true, session }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('credentialing:send-message', async (event, sessionId: string, message: string) => {
    try {
      const response = await agent.sendMessage(sessionId, message)
      return { success: true, response }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('credentialing:approve-action', async (event, actionId: string) => {
    try {
      const result = await agent.executeAction(actionId)
      event.sender.send('credentialing:action-completed', {
        actionId,
        success: result.success,
        message: result.message
      })
      return { success: true, result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('credentialing:get-case', async (event, caseId: number) => {
    const case_ = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId)
    const lineItems = db.prepare('SELECT * FROM credential_line_items WHERE case_id = ?').all(caseId)
    const events = db.prepare('SELECT * FROM case_events WHERE case_id = ? ORDER BY timestamp DESC LIMIT 20').all(caseId)
    return { case: case_, lineItems, events }
  })
}
```

#### Agent Prompt Engineering (Context Injection)

```typescript
// packages/shared/src/agent/credentialing-context.ts

export function buildCredentialingAgentPrompt(context: CredentialingContext): string {
  return `
You are a credentialing agent helping travel nurse staffing specialists manage clinician files.

**Your role:**
- Analyze credentialing files to identify blockers and missing items
- Suggest specific, actionable steps to move files toward clearance
- Execute approved actions using MCP tools
- Provide clear explanations in your responses

**Current Context:**
${formatClinicianContext(context.clinician)}
${formatAssignmentContext(context.assignment)}
${formatRecentEvents(context.events)}
${formatOutstandingItems(context.lineItems)}

**Available Tools:**
${formatAvailableTools(context.tools)}

**Human-in-the-Loop Rules:**
- ALWAYS suggest actions as clickable buttons with the <action_suggestion> tag
- NEVER execute actions without explicit approval (buttons)
- For routine tasks (document classification, verification lookups): suggest with "requiresApproval": true but expect quick approval
- For high-impact actions (submitting packets, marking cleared, handling adverse findings): emphasize risk and wait for explicit approval

**Response Format:**
1. Start with a brief analysis (2-3 sentences)
2. List verification status with icons (verified, pending, missing)
3. Suggest actions as <action_suggestion> JSON blocks
4. End with a conversational prompt ("What would you like me to do next?")

Be concise, action-oriented, and always provide next steps.
`
}
```

#### Session Context Management (Fresh on Tab Open)

```typescript
export async function initializeAgentSession(caseId: number): Promise<Session> {
  let session = await sessionService.findByCaseId(caseId)

  if (!session) {
    session = await sessionService.create({
      workspaceId: getCurrentWorkspaceId(),
      title: await generateSessionTitle(caseId),
      status: 'active',
      metadata: {
        caseId,
        sessionType: 'credentialing',
        createdBy: 'specialist'
      }
    })
  }

  const contextSummary = await buildContextSummaryForCase(caseId)

  await session.prependSystemMessage({
    role: 'system',
    content: buildCredentialingAgentPrompt(contextSummary),
    metadata: { hidden: true, timestamp: new Date() }
  })

  return session
}

async function buildContextSummaryForCase(caseId: number): Promise<CredentialingContext> {
  const [caseData, events, lineItems] = await Promise.all([
    caseManager.getCaseData(caseId),
    caseEventService.getRecent(caseId, { limit: 20, days: 7 }),
    lineItemService.getAllForCase(caseId)
  ])

  return {
    clinician: caseData.clinician,
    assignment: caseData.assignment,
    events: events.map(e => ({
      timestamp: e.timestamp,
      eventType: e.eventType,
      details: e.details,
      agentName: e.agentName
    })),
    lineItems: lineItems.map(item => ({
      id: item.id,
      requirementName: item.requirementName,
      status: item.status,
      isOverdue: item.dueDate && new Date(item.dueDate) < new Date(),
      dueDate: item.dueDate
    })),
    tools: credentialingTools.map(t => ({ name: t.name, description: t.description }))
  }
}
```

---

## Summary of Decisions

| Decision | Choice |
|---|---|
| Interaction model | Chat + Action Buttons (Cursor-style) |
| Session management | Persistent per case, fresh context injected per turn |
| Agent architecture | Single unified agent with all MCP tools |
| Real-time updates | Toast + Stale tab marking |
| Codebase relationship | Forked from Craft Agents (lukilabs/craft-agents-oss) |
| V1 external integrations | Real everything (Nursys, OIG/SAM, email, VMS) |
| Tool source | Build new credentialing-specific tool set |

---

## Round 3: Implementation Details

### Q8: What currently exists vs what's aspirational from the spec?

**Answer: Spec is aspirational (target architecture)**

Current State (what EXISTS):
```
packages/credentialing/src/db/
  schema.sql                        # EXISTS: SQLite schema
  repositories/
    case.repository.ts              # EXISTS: DB access layer
    line-item.repository.ts
    document.repository.ts
apps/electron/src/renderer/views/
  CredentialingShell.tsx             # EXISTS: Basic shell UI
```

What needs to be BUILT (from the spec):
```
packages/shared/src/agent/
  credentialing-agent.ts            # BUILD: Extends ClaudeAgent
  credentialing-context.ts          # BUILD: Context builder
packages/credentialing/src/
  mcp-tools/                        # BUILD: All credentialing MCP tools
    index.ts, case-tools.ts, document-tools.ts,
    verification-tools.ts, communication-tools.ts, submission-tools.ts
  services/                         # BUILD: External API services
    nursys.service.ts, oig-sam.service.ts,
    email.service.ts, document-classifier.service.ts
apps/electron/src/main/
  setup-credentialing.ts            # BUILD: Main process setup
  credentialing-ipc.ts              # BUILD: IPC handlers
apps/electron/src/renderer/components/credentialing/
  CredentialingChat.tsx             # BUILD: Chat component
  ActionButton.tsx                  # BUILD: Action approval buttons
  OverviewTab.tsx                   # BUILD: Case overview
  DocumentsTab.tsx                  # BUILD: Document management
  VerificationsTab.tsx              # BUILD: Verification tracking
```

#### IPC Setup (Renderer <-> Main Communication)

```typescript
// apps/electron/src/main/credentialing-ipc.ts
export function setupCredentialingIPC(db: Database, mainWindow: BrowserWindow) {
  const config = getAnthropicConfig()
  agent = new CredentialingAgent({ apiKey: config.apiKey, model: config.model, db })

  // Forward stream events to renderer
  agent.on('stream', (data) => mainWindow.webContents.send('credentialing:stream', data))
  agent.on('stream-complete', (data) => mainWindow.webContents.send('credentialing:stream-complete', data))
  agent.on('error', (data) => mainWindow.webContents.send('credentialing:error', data))

  // IPC handlers
  ipcMain.handle('credentialing:init-session', ...)
  ipcMain.handle('credentialing:send-message', ...)
  ipcMain.handle('credentialing:approve-action', ...)
}
```

#### Preload Bridge

```typescript
// apps/electron/src/preload/index.ts (additions)
contextBridge.exposeInMainWorld('electron', {
  credentialing: {
    initSession: (caseId) => ipcRenderer.invoke('credentialing:init-session', caseId),
    sendMessage: (sessionId, message) => ipcRenderer.invoke('credentialing:send-message', sessionId, message),
    approveAction: (actionId) => ipcRenderer.invoke('credentialing:approve-action', actionId),
    onStream: (callback) => { ipcRenderer.on('credentialing:stream', (event, data) => callback(data)); return () => ipcRenderer.removeAllListeners('credentialing:stream') },
    onStreamComplete: (callback) => { ... },
    onActionCompleted: (callback) => { ... },
    onError: (callback) => { ... }
  }
})
```

---

### Q9: Streaming implementation?

**Answer: Stream text token-by-token, then action buttons appear after stream completes**

Full CredentialingAgent class with streaming:

```typescript
// packages/shared/src/agent/credentialing-agent.ts

export class CredentialingAgent extends EventEmitter {
  private anthropic: Anthropic
  private db: Database
  private sessions: Map<string, SessionState> = new Map()

  async sendMessage(sessionId: string, userMessage: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    session.messages.push({ role: 'user', content: userMessage })

    const stream = await this.anthropic.messages.stream({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192,
      messages: session.messages,
      tools: credentialingTools.map(t => ({
        name: t.name, description: t.description, input_schema: t.inputSchema
      })),
      stream: true
    })

    // Stream tokens to renderer
    stream.on('text', (text) => {
      this.emit('stream', { sessionId, chunk: { type: 'text_delta', content: text } })
    })

    // Convert tool_use blocks to action buttons (NOT auto-executed)
    stream.on('content_block_stop', (block) => {
      if (block.type === 'tool_use') {
        const action = this.toolUseToAction(block)
        session.pendingActions.push(action)
      }
    })

    stream.on('message_stop', () => {
      // Emit actions after text stream completes
      if (session.pendingActions.length > 0) {
        this.emit('stream', { sessionId, chunk: { type: 'actions_ready', actions: session.pendingActions } })
      }
      this.emit('stream-complete', { sessionId })
    })
  }

  // Tool use -> human-approvable action button
  private toolUseToAction(toolUse: any): Action {
    return {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      label: this.generateActionLabel(toolUse.name, toolUse.input),
      description: this.generateActionDescription(toolUse.name, toolUse.input),
      toolName: toolUse.name,
      toolInput: toolUse.input,
      status: 'pending',
      requiresApproval: true
    }
  }

  // Execute only after human approval
  async executeAction(actionId: string): Promise<ActionResult> {
    // Find action, execute tool handler, return result
  }
}
```

Full CredentialingChat renderer component with streaming support also provided (token-by-token text accumulation, auto-scroll, action button rendering).

---

### Q10: Error handling strategy?

**Answer: Agent explains + retries with exponential backoff**

- Tools use `withRetry()` wrapper: 3 attempts, exponential backoff (1s -> 2s -> 4s, max 10s)
- Retryable errors: ECONNRESET, ETIMEDOUT, ECONNREFUSED, 429, 503
- Each retry logged as CaseEvent (audit trail)
- After all retries exhausted: friendly error message returned to agent with actionable next steps for the specialist
- Non-retryable errors fail fast with logging

```typescript
const RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', '429', '503']
}
```

---

### Q11: Anthropic API key setup?

**Answer: Company API key (env var or config file), with future gateway path**

V1 setup:
- `ANTHROPIC_API_KEY` env var for dev
- Fallback to `anthropic-config.json` in userData for prod builds
- Single company-wide key shared by all specialists
- Model: claude-3-5-sonnet-20241022, max_tokens: 8192

Future production path:
- Internal API gateway at `https://api.advantis-internal.com/ai`
- Gateway handles: auth, rate limiting, usage tracking per specialist, cost allocation
- Electron app sends to gateway, gateway adds real API key server-side

```typescript
export function getAnthropicConfig(): AnthropicConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY || loadFromConfigFile()
  return {
    apiKey,
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 8192,
    baseUrl: process.env.ANTHROPIC_BASE_URL  // Optional proxy URL
  }
}
```

---

## Updated Summary of Decisions

| Decision | Choice |
|---|---|
| Interaction model | Chat + Action Buttons (Cursor-style) |
| Session management | Persistent per case, fresh context injected per turn |
| Agent architecture | Single unified agent with all MCP tools |
| Real-time updates | Toast + Stale tab marking |
| Codebase relationship | Forked from Craft Agents (lukilabs/craft-agents-oss) |
| V1 external integrations | Real everything (Nursys, OIG/SAM, email, VMS) |
| Tool source | Build new credentialing-specific tool set |
| Current state | Mostly aspirational - DB layer + shell UI exist, rest needs building |
| Streaming | Token-by-token via StreamingMarkdown, action buttons after stream ends |
| Error handling | Retry 3x with backoff, then agent explains failure with alternatives |
| API auth | Company API key (env var/config file), future gateway |
