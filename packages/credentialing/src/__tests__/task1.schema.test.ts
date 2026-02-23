import { afterEach, describe, expect, it } from 'bun:test'

import { CaseState, Database } from '../index.ts'

describe('Task 1 credentialing package scaffold', () => {
  let db: Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  it('exports the full CaseState enum including terminal closed', () => {
    expect(`${CaseState.offer_accepted}`).toBe('offer_accepted')
    expect(`${CaseState.cleared}`).toBe('cleared')
    expect(`${CaseState.closed}`).toBe('closed')
    expect(Object.values(CaseState)).toHaveLength(9)
  })

  it('initializes all 7 domain tables and required indexes', () => {
    db = new Database(':memory:')
    const raw = db.getConnection()

    const tableRows = raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>

    expect(tableRows.map((row) => row.name)).toEqual([
      'approvals',
      'case_events',
      'cases',
      'clinicians',
      'documents',
      'facility_templates',
      'verifications',
    ])

    const indexRows = raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>

    expect(indexRows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_case_events_case_id',
        'idx_cases_clinician_id',
        'idx_cases_facility_id',
        'idx_cases_state',
        'idx_documents_case_id',
        'idx_verifications_case_id',
      ]),
    )
  })
})
