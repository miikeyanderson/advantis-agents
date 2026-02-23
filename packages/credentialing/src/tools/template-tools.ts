import { z } from 'zod'

import type { ToolHandlerDef } from './types.ts'

const createTemplateSchema = z.object({
  name: z.string(),
  jurisdiction: z.string(),
  requiredDocTypes: z.array(z.string()),
  requiredVerificationTypes: z.array(z.string()),
})

const updateTemplateSchema = z.object({
  facilityId: z.string(),
  name: z.string().optional(),
  jurisdiction: z.string().optional(),
  requiredDocTypes: z.array(z.string()).optional(),
  requiredVerificationTypes: z.array(z.string()).optional(),
})

const queryTemplatesSchema = z.object({
  facilityId: z.string().optional(),
  jurisdiction: z.string().optional(),
  name: z.string().optional(),
})

export function createTemplateTools(): ToolHandlerDef[] {
  return [
    {
      name: 'createTemplate',
      description: 'Create a facility template (version starts at 1).',
      schema: createTemplateSchema,
      mutating: true,
      execute(input, ctx) {
        const parsed = createTemplateSchema.parse(input)
        return ctx.repos.facilityTemplate.create(parsed)
      },
    },
    {
      name: 'updateTemplate',
      description: 'Update a facility template and bump its version.',
      schema: updateTemplateSchema,
      mutating: true,
      execute(input, ctx) {
        const parsed = updateTemplateSchema.parse(input)
        return ctx.repos.facilityTemplate.update(parsed.facilityId, {
          name: parsed.name,
          jurisdiction: parsed.jurisdiction,
          requiredDocTypes: parsed.requiredDocTypes,
          requiredVerificationTypes: parsed.requiredVerificationTypes,
        })
      },
    },
    {
      name: 'queryTemplates',
      description: 'Query facility templates by optional filters.',
      schema: queryTemplatesSchema,
      mutating: false,
      execute(input, ctx) {
        const parsed = queryTemplatesSchema.parse(input)
        if (parsed.facilityId) {
          const one = ctx.repos.facilityTemplate.getById(parsed.facilityId)
          return one ? [one] : []
        }
        return ctx.repos.facilityTemplate.list({
          jurisdiction: parsed.jurisdiction,
          name: parsed.name,
        })
      },
    },
  ]
}

export const templateToolSchemas = {
  createTemplateSchema,
  updateTemplateSchema,
  queryTemplatesSchema,
}
