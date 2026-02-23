import type { Database } from '../database.ts'
import type { Document } from '../types.ts'
import { nowIso, parseJsonObject, withRepoError } from './utils.ts'

type DocumentRow = {
  id: string
  caseId: string
  docType: string
  status: Document['status']
  fileRef: string | null
  metadata: string
  createdAt: string
  updatedAt: string
}

function mapDocumentRow(row: DocumentRow): Document {
  return {
    ...row,
    metadata: parseJsonObject(row.metadata),
  }
}

export class DocumentRepository {
  constructor(private readonly db: Database) {}

  create(
    data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string },
  ): Document {
    return withRepoError('DocumentRepository', 'create', () => {
      const id = crypto.randomUUID()
      const createdAt = data.createdAt ?? nowIso()
      const updatedAt = data.updatedAt ?? createdAt
      this.db.getConnection().prepare(
        `INSERT INTO documents (id, caseId, docType, status, fileRef, metadata, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        data.caseId,
        data.docType,
        data.status,
        data.fileRef,
        JSON.stringify(data.metadata),
        createdAt,
        updatedAt,
      )
      return {
        id,
        caseId: data.caseId,
        docType: data.docType,
        status: data.status,
        fileRef: data.fileRef,
        metadata: data.metadata,
        createdAt,
        updatedAt,
      }
    })
  }

  getById(id: string): Document | null {
    return withRepoError('DocumentRepository', 'getById', () => {
      const row = this.db.getConnection().prepare<DocumentRow>(
        'SELECT * FROM documents WHERE id = ?',
      ).get(id)
      return row ? mapDocumentRow(row) : null
    })
  }

  getByCaseId(caseId: string): Document[] {
    return withRepoError('DocumentRepository', 'getByCaseId', () => {
      const rows = this.db.getConnection().prepare<DocumentRow>(
        'SELECT * FROM documents WHERE caseId = ? ORDER BY createdAt ASC, id ASC',
      ).all(caseId)
      return rows.map(mapDocumentRow)
    })
  }

  getLatestByDocType(caseId: string, docType: string): Document | null {
    return withRepoError('DocumentRepository', 'getLatestByDocType', () => {
      const row = this.db.getConnection().prepare<DocumentRow>(
        `SELECT * FROM documents
         WHERE caseId = ? AND docType = ?
         ORDER BY createdAt DESC, id DESC
         LIMIT 1`,
      ).get(caseId, docType)
      return row ? mapDocumentRow(row) : null
    })
  }

  updateStatus(id: string, status: Document['status'], fileRef?: string | null): Document {
    return withRepoError('DocumentRepository', 'updateStatus', () => {
      const existing = this.getById(id)
      if (!existing) {
        throw new Error(`Document not found: ${id}`)
      }
      const updatedAt = nowIso()
      const nextFileRef = fileRef === undefined ? existing.fileRef : fileRef
      this.db.getConnection().prepare(
        'UPDATE documents SET status = ?, fileRef = ?, updatedAt = ? WHERE id = ?',
      ).run(status, nextFileRef, updatedAt, id)
      return { ...existing, status, fileRef: nextFileRef, updatedAt }
    })
  }
}
