import { resolve, sep } from 'node:path'
import { z } from 'zod'

import type { ToolHandlerDef } from './types.ts'

const recordDocumentSchema = z.object({
  caseId: z.string(),
  docType: z.string(),
  fileRef: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const classifyDocumentSchema = z.object({
  caseId: z.string(),
  documentId: z.string(),
})

function assertFileRefUnderCanonicalDir(workspacePath: string, caseId: string, fileRef: string): void {
  const canonicalDir = resolve(workspacePath, 'credentialing', caseId, 'docs')
  const normalized = resolve(fileRef)
  const prefix = canonicalDir.endsWith(sep) ? canonicalDir : `${canonicalDir}${sep}`
  if (normalized !== canonicalDir && !normalized.startsWith(prefix)) {
    throw new Error(`fileRef is outside canonical docs directory: ${normalized}`)
  }
}

export function createDocumentTools(): ToolHandlerDef[] {
  return [
    {
      name: 'recordDocument',
      description: 'Record a document for a case and write an audit event.',
      schema: recordDocumentSchema,
      mutating: true,
      execute(input, ctx) {
        const parsed = recordDocumentSchema.parse(input)
        const principal = ctx.principal
        if (!principal) throw new Error('Missing authenticated session principal')

        if (parsed.fileRef) {
          assertFileRefUnderCanonicalDir(ctx.workspacePath, parsed.caseId, parsed.fileRef)
        }

        const status = parsed.fileRef ? 'received' : 'pending'
        const tx = ctx.repos.case.transaction(() => {
          const document = ctx.repos.document.create({
            caseId: parsed.caseId,
            docType: parsed.docType,
            status,
            fileRef: parsed.fileRef,
            metadata: parsed.metadata ?? {},
          })
          ctx.repos.caseEvent.create({
            caseId: parsed.caseId,
            eventType: 'document_recorded',
            actorType: principal.actorType,
            actorId: principal.actorId,
            evidenceRef: document.id,
            payload: {
              docType: document.docType,
              status: document.status,
              fileRef: document.fileRef,
            },
          })
          return document
        })
        return tx()
      },
    },
    {
      name: 'classifyDocument',
      description: 'Classify an uploaded document using call_llm pattern or deterministic fallback.',
      schema: classifyDocumentSchema,
      mutating: false,
      async execute(input, ctx) {
        const parsed = classifyDocumentSchema.parse(input)
        const document = ctx.repos.document.getById(parsed.documentId)
        if (!document) {
          throw new Error(`Document not found: ${parsed.documentId}`)
        }
        const llmResult = ctx.callLlm
          ? await ctx.callLlm('classify_document', {
              caseId: parsed.caseId,
              documentId: parsed.documentId,
              metadata: document.metadata,
              fileRef: document.fileRef,
            })
          : null

        if (llmResult && typeof llmResult === 'object') {
          const maybeDocType = (llmResult as Record<string, unknown>).docType
          if (typeof maybeDocType === 'string') {
            return {
              docType: maybeDocType,
              metadata:
                (llmResult as Record<string, unknown>).metadata &&
                typeof (llmResult as Record<string, unknown>).metadata === 'object'
                  ? ((llmResult as Record<string, unknown>).metadata as Record<string, unknown>)
                  : {},
            }
          }
        }

        return {
          docType: document.docType,
          metadata: {
            classifier: 'mock',
          },
        }
      },
    },
  ]
}

export const documentToolSchemas = {
  recordDocumentSchema,
  classifyDocumentSchema,
}
