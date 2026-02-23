#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'

import { Database } from './database.ts'
import { CredentialingMcpServer, type CredentialingSessionPrincipal } from './mcp-server.ts'

function parseAllowedTools(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed
    }
  } catch {
    // fall through to comma-separated format
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildPrincipalFromEnv(): CredentialingSessionPrincipal | null {
  const actorType = process.env.CREDENTIALING_ACTOR_TYPE
  const actorId = process.env.CREDENTIALING_ACTOR_ID
  if (!actorType || !actorId) return null
  if (actorType !== 'agent' && actorType !== 'human' && actorType !== 'system') {
    return null
  }
  const humanUserId = process.env.CREDENTIALING_HUMAN_USER_ID
  return humanUserId
    ? { actorType, actorId, humanUserId }
    : { actorType, actorId }
}

function toMcpTool(def: { name: string; description: string }): Tool {
  return {
    name: def.name,
    description: def.description,
    inputSchema: {
      type: 'object',
      additionalProperties: true,
    },
  }
}

async function main() {
  const dbPath = process.env.CREDENTIALING_DB_PATH || ':memory:'
  const workspacePath = process.env.CREDENTIALING_WORKSPACE_PATH || process.cwd()
  const allowedTools = parseAllowedTools(process.env.CREDENTIALING_ALLOWED_TOOLS)
  const db = new Database(dbPath)
  const principal = buildPrincipalFromEnv()
  const credentialing = new CredentialingMcpServer({
    db,
    workspacePath,
    allowedTools,
    getSessionPrincipal: () => principal,
  })

  const server = new Server(
    { name: 'advantis-credentialing', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: credentialing.getToolDefinitions().map(toMcpTool),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name
    try {
      const result = await credentialing.invokeTool(name, request.params.arguments ?? {})
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
