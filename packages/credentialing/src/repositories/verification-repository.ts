import type { Database } from '../database.ts'
import type { Verification } from '../types.ts'
import { nowIso, parseJsonObject, withRepoError } from './utils.ts'

type VerificationRow = {
  id: string
  caseId: string
  verificationType: string
  source: string
  pass: number | boolean
  evidence: string
  createdAt: string
}

function mapVerificationRow(row: VerificationRow): Verification {
  const evidence = parseJsonObject(row.evidence)
  return {
    id: row.id,
    caseId: row.caseId,
    verificationType: row.verificationType,
    source: row.source,
    pass: Boolean(row.pass),
    evidence: {
      sourceUrl: typeof evidence.sourceUrl === 'string' ? evidence.sourceUrl : '',
      timestamp: typeof evidence.timestamp === 'string' ? evidence.timestamp : '',
      responseData:
        evidence.responseData && typeof evidence.responseData === 'object' && !Array.isArray(evidence.responseData)
          ? (evidence.responseData as Record<string, unknown>)
          : {},
    },
    createdAt: row.createdAt,
  }
}

export class VerificationRepository {
  constructor(private readonly db: Database) {}

  create(data: Omit<Verification, 'id' | 'createdAt'> & { createdAt?: string }): Verification {
    return withRepoError('VerificationRepository', 'create', () => {
      const id = crypto.randomUUID()
      const createdAt = data.createdAt ?? nowIso()
      const verification: Verification = {
        ...data,
        id,
        createdAt,
      }
      this.db.getConnection().prepare(
        `INSERT INTO verifications (id, caseId, verificationType, source, pass, evidence, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        verification.id,
        verification.caseId,
        verification.verificationType,
        verification.source,
        verification.pass ? 1 : 0,
        JSON.stringify(verification.evidence),
        verification.createdAt,
      )
      return verification
    })
  }

  getById(id: string): Verification | null {
    return withRepoError('VerificationRepository', 'getById', () => {
      const row = this.db.getConnection().prepare<VerificationRow>(
        'SELECT * FROM verifications WHERE id = ?',
      ).get(id)
      return row ? mapVerificationRow(row) : null
    })
  }

  getByCaseId(caseId: string): Verification[] {
    return withRepoError('VerificationRepository', 'getByCaseId', () => {
      const rows = this.db.getConnection().prepare<VerificationRow>(
        'SELECT * FROM verifications WHERE caseId = ? ORDER BY createdAt ASC, id ASC',
      ).all(caseId)
      return rows.map(mapVerificationRow)
    })
  }

  getByType(caseId: string, verificationType: string): Verification[] {
    return withRepoError('VerificationRepository', 'getByType', () => {
      const rows = this.db.getConnection().prepare<VerificationRow>(
        `SELECT * FROM verifications
         WHERE caseId = ? AND verificationType = ?
         ORDER BY createdAt ASC, id ASC`,
      ).all(caseId, verificationType)
      return rows.map(mapVerificationRow)
    })
  }
}
