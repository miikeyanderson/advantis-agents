import type { Database } from '../database.ts'
import type { Case } from '../types.ts'
import { CaseState } from '../types.ts'
import { nowIso, parseJsonArray, requireRow, withRepoError } from './utils.ts'

type CaseRow = {
  id: string
  clinicianId: string
  facilityId: string
  state: string
  startDate: string | null
  templateVersion: number
  requiredDocTypesSnapshot: string
  requiredVerificationTypesSnapshot: string
  createdAt: string
  updatedAt: string
}

type TemplateSnapshotRow = {
  version: number
  requiredDocTypes: string
  requiredVerificationTypes: string
}

function mapCaseRow(row: CaseRow): Case {
  return {
    id: row.id,
    clinicianId: row.clinicianId,
    facilityId: row.facilityId,
    state: row.state as CaseState,
    startDate: row.startDate,
    templateVersion: row.templateVersion,
    requiredDocTypesSnapshot: parseJsonArray(row.requiredDocTypesSnapshot),
    requiredVerificationTypesSnapshot: parseJsonArray(row.requiredVerificationTypesSnapshot),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class CaseRepository {
  constructor(private readonly db: Database) {}

  create(
    data: Omit<Case, 'id' | 'templateVersion' | 'requiredDocTypesSnapshot' | 'requiredVerificationTypesSnapshot' | 'createdAt' | 'updatedAt'> & {
      createdAt?: string
      updatedAt?: string
    },
  ): Case {
    return withRepoError('CaseRepository', 'create', () => {
      const templateRow = this.db.getConnection().prepare<TemplateSnapshotRow>(
        `SELECT version, requiredDocTypes, requiredVerificationTypes
         FROM facility_templates WHERE id = ?`,
      ).get(data.facilityId)
      const template = requireRow(
        'CaseRepository',
        'create',
        templateRow,
        `Facility template not found: ${data.facilityId}`,
      )

      const id = crypto.randomUUID()
      const createdAt = data.createdAt ?? nowIso()
      const updatedAt = data.updatedAt ?? createdAt
      const requiredDocTypesSnapshot = parseJsonArray(template.requiredDocTypes)
      const requiredVerificationTypesSnapshot = parseJsonArray(template.requiredVerificationTypes)

      this.db.getConnection().prepare(
        `INSERT INTO cases (
          id, clinicianId, facilityId, state, startDate, templateVersion,
          requiredDocTypesSnapshot, requiredVerificationTypesSnapshot, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        data.clinicianId,
        data.facilityId,
        data.state,
        data.startDate,
        template.version,
        JSON.stringify(requiredDocTypesSnapshot),
        JSON.stringify(requiredVerificationTypesSnapshot),
        createdAt,
        updatedAt,
      )

      return {
        id,
        clinicianId: data.clinicianId,
        facilityId: data.facilityId,
        state: data.state,
        startDate: data.startDate,
        templateVersion: template.version,
        requiredDocTypesSnapshot,
        requiredVerificationTypesSnapshot,
        createdAt,
        updatedAt,
      }
    })
  }

  getById(id: string): Case | null {
    return withRepoError('CaseRepository', 'getById', () => {
      const row = this.db.getConnection().prepare<CaseRow>(
        'SELECT * FROM cases WHERE id = ?',
      ).get(id)
      return row ? mapCaseRow(row) : null
    })
  }

  getByClinicianId(clinicianId: string): Case[] {
    return withRepoError('CaseRepository', 'getByClinicianId', () => {
      const rows = this.db.getConnection().prepare<CaseRow>(
        'SELECT * FROM cases WHERE clinicianId = ? ORDER BY createdAt ASC, id ASC',
      ).all(clinicianId)
      return rows.map(mapCaseRow)
    })
  }

  queryCases(filters: { state?: CaseState; facilityId?: string }): Case[] {
    return withRepoError('CaseRepository', 'queryCases', () => {
      const clauses: string[] = []
      const params: Array<string> = []
      if (filters.state) {
        clauses.push('state = ?')
        params.push(filters.state)
      }
      if (filters.facilityId) {
        clauses.push('facilityId = ?')
        params.push(filters.facilityId)
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
      const rows = this.db.getConnection().prepare<CaseRow>(
        `SELECT * FROM cases ${where} ORDER BY updatedAt DESC, id DESC`,
      ).all(...params)
      return rows.map(mapCaseRow)
    })
  }

  update(
    id: string,
    patch: Partial<Pick<Case, 'state' | 'startDate' | 'updatedAt'>>,
  ): Case {
    return withRepoError('CaseRepository', 'update', () => {
      const existing = this.getById(id)
      if (!existing) {
        throw new Error(`Case not found: ${id}`)
      }
      const updated: Case = {
        ...existing,
        ...patch,
        updatedAt: patch.updatedAt ?? nowIso(),
      }
      this.db.getConnection().prepare(
        `UPDATE cases SET state = ?, startDate = ?, updatedAt = ? WHERE id = ?`,
      ).run(updated.state, updated.startDate, updated.updatedAt, id)
      return updated
    })
  }
}
