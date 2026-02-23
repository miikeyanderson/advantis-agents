import type { Database } from '../database.ts'
import type { FacilityTemplate } from '../types.ts'
import { nowIso, parseJsonArray, withRepoError } from './utils.ts'

type FacilityTemplateRow = {
  id: string
  name: string
  jurisdiction: string
  version: number
  requiredDocTypes: string
  requiredVerificationTypes: string
  createdAt: string
  updatedAt: string
}

function mapTemplateRow(row: FacilityTemplateRow): FacilityTemplate {
  return {
    ...row,
    requiredDocTypes: parseJsonArray(row.requiredDocTypes),
    requiredVerificationTypes: parseJsonArray(row.requiredVerificationTypes),
  }
}

export class FacilityTemplateRepository {
  constructor(private readonly db: Database) {}

  create(
    data: Omit<FacilityTemplate, 'id' | 'version' | 'createdAt' | 'updatedAt'> & {
      version?: number
      createdAt?: string
      updatedAt?: string
    },
  ): FacilityTemplate {
    return withRepoError('FacilityTemplateRepository', 'create', () => {
      const id = crypto.randomUUID()
      const createdAt = data.createdAt ?? nowIso()
      const updatedAt = data.updatedAt ?? createdAt
      const version = data.version ?? 1

      this.db.getConnection().prepare(
        `INSERT INTO facility_templates (
          id, name, jurisdiction, version, requiredDocTypes, requiredVerificationTypes, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        data.name,
        data.jurisdiction,
        version,
        JSON.stringify(data.requiredDocTypes),
        JSON.stringify(data.requiredVerificationTypes),
        createdAt,
        updatedAt,
      )

      return {
        id,
        name: data.name,
        jurisdiction: data.jurisdiction,
        version,
        requiredDocTypes: [...data.requiredDocTypes],
        requiredVerificationTypes: [...data.requiredVerificationTypes],
        createdAt,
        updatedAt,
      }
    })
  }

  getById(id: string): FacilityTemplate | null {
    return withRepoError('FacilityTemplateRepository', 'getById', () => {
      const row = this.db.getConnection().prepare<FacilityTemplateRow>(
        'SELECT * FROM facility_templates WHERE id = ?',
      ).get(id)
      return row ? mapTemplateRow(row) : null
    })
  }

  list(filters?: { jurisdiction?: string; name?: string }): FacilityTemplate[] {
    return withRepoError('FacilityTemplateRepository', 'list', () => {
      const clauses: string[] = []
      const params: Array<string> = []
      if (filters?.jurisdiction) {
        clauses.push('jurisdiction = ?')
        params.push(filters.jurisdiction)
      }
      if (filters?.name) {
        clauses.push('name LIKE ?')
        params.push(`%${filters.name}%`)
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
      const rows = this.db.getConnection().prepare<FacilityTemplateRow>(
        `SELECT * FROM facility_templates ${where} ORDER BY updatedAt DESC, id DESC`,
      ).all(...params)
      return rows.map(mapTemplateRow)
    })
  }

  update(
    id: string,
    patch: Partial<Pick<FacilityTemplate, 'name' | 'jurisdiction' | 'requiredDocTypes' | 'requiredVerificationTypes'>>,
  ): FacilityTemplate {
    return withRepoError('FacilityTemplateRepository', 'update', () => {
      const existing = this.getById(id)
      if (!existing) {
        throw new Error(`FacilityTemplate not found: ${id}`)
      }
      const updated: FacilityTemplate = {
        ...existing,
        ...patch,
        requiredDocTypes: patch.requiredDocTypes ? [...patch.requiredDocTypes] : existing.requiredDocTypes,
        requiredVerificationTypes: patch.requiredVerificationTypes
          ? [...patch.requiredVerificationTypes]
          : existing.requiredVerificationTypes,
        version: existing.version + 1,
        updatedAt: nowIso(),
      }
      this.db.getConnection().prepare(
        `UPDATE facility_templates SET
          name = ?, jurisdiction = ?, version = ?, requiredDocTypes = ?, requiredVerificationTypes = ?, updatedAt = ?
         WHERE id = ?`,
      ).run(
        updated.name,
        updated.jurisdiction,
        updated.version,
        JSON.stringify(updated.requiredDocTypes),
        JSON.stringify(updated.requiredVerificationTypes),
        updated.updatedAt,
        id,
      )
      return updated
    })
  }
}
