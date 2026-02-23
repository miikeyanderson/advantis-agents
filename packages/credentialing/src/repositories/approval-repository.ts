import type { Database } from '../database.ts'
import type { Approval } from '../types.ts'
import { nowIso, withRepoError } from './utils.ts'

type ApprovalRow = Approval

export class ApprovalRepository {
  constructor(private readonly db: Database) {}

  create(data: Omit<Approval, 'id' | 'createdAt'> & { createdAt?: string }): Approval {
    return withRepoError('ApprovalRepository', 'create', () => {
      const id = crypto.randomUUID()
      const createdAt = data.createdAt ?? nowIso()
      const approval: Approval = { ...data, id, createdAt }
      this.db.getConnection().prepare(
        `INSERT INTO approvals (id, caseId, verificationId, decision, reviewer, notes, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        approval.id,
        approval.caseId,
        approval.verificationId,
        approval.decision,
        approval.reviewer,
        approval.notes,
        approval.createdAt,
      )
      return approval
    })
  }

  getByCaseId(caseId: string): Approval[] {
    return withRepoError('ApprovalRepository', 'getByCaseId', () => {
      return this.db.getConnection().prepare<ApprovalRow>(
        'SELECT * FROM approvals WHERE caseId = ? ORDER BY createdAt ASC, id ASC',
      ).all(caseId)
    })
  }

  getLatestByVerificationId(verificationId: string): Approval | null {
    return withRepoError('ApprovalRepository', 'getLatestByVerificationId', () => {
      const row = this.db.getConnection().prepare<ApprovalRow>(
        `SELECT * FROM approvals
         WHERE verificationId = ?
         ORDER BY createdAt DESC, id DESC
         LIMIT 1`,
      ).get(verificationId)
      return row ?? null
    })
  }
}
