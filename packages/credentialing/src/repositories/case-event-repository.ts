import type { Database } from '../database.ts'
import type { CaseEvent } from '../types.ts'
import { nowIso, parseJsonObject, withRepoError } from './utils.ts'

type CaseEventRow = {
  id: string
  caseId: string
  eventType: CaseEvent['eventType']
  actorType: CaseEvent['actorType']
  actorId: string
  evidenceRef: string | null
  payload: string
  timestamp: string
}

function mapCaseEventRow(row: CaseEventRow): CaseEvent {
  return {
    ...row,
    payload: parseJsonObject(row.payload),
  }
}

export class CaseEventRepository {
  constructor(private readonly db: Database) {}

  create(data: Omit<CaseEvent, 'id' | 'timestamp'> & { timestamp?: string }): CaseEvent {
    return withRepoError('CaseEventRepository', 'create', () => {
      const id = crypto.randomUUID()
      const timestamp = data.timestamp ?? nowIso()
      const event: CaseEvent = { ...data, id, timestamp }
      this.db.getConnection().prepare(
        `INSERT INTO case_events (id, caseId, eventType, actorType, actorId, evidenceRef, payload, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        event.id,
        event.caseId,
        event.eventType,
        event.actorType,
        event.actorId,
        event.evidenceRef,
        JSON.stringify(event.payload),
        event.timestamp,
      )
      return event
    })
  }

  getTimeline(caseId: string): CaseEvent[] {
    return withRepoError('CaseEventRepository', 'getTimeline', () => {
      const rows = this.db.getConnection().prepare<CaseEventRow>(
        `SELECT * FROM case_events
         WHERE caseId = ?
         ORDER BY timestamp ASC, id ASC`,
      ).all(caseId)
      return rows.map(mapCaseEventRow)
    })
  }
}
