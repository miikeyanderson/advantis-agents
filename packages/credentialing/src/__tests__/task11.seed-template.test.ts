import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { Database, FacilityTemplateRepository } from '../index.ts'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('Task 11 seed template initialization', () => {
  it('seeds General Hospital TX on first database init and does not duplicate on reopen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'advantis-credentialing-'))
    tempDirs.push(dir)
    const dbPath = join(dir, 'credentialing.sqlite')

    const firstDb = new Database(dbPath)
    const firstRepo = new FacilityTemplateRepository(firstDb)
    const firstTemplates = firstRepo.list()
    const seeded = firstTemplates.find((template) => template.name === 'General Hospital TX')

    expect(seeded).toBeDefined()
    expect(seeded?.jurisdiction).toBe('TX')
    expect(seeded?.requiredDocTypes).toEqual([
      'rn_license',
      'bls_cert',
      'tb_test',
      'physical',
      'background_check',
    ])
    expect(seeded?.requiredVerificationTypes).toEqual(['nursys', 'oig_sam'])
    firstDb.close()

    const secondDb = new Database(dbPath)
    const secondRepo = new FacilityTemplateRepository(secondDb)
    const secondMatches = secondRepo.list({ name: 'General Hospital TX' })
    expect(secondMatches).toHaveLength(1)
    secondDb.close()
  })
})
