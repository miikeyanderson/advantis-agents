import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Database } from '../database.ts'
import type { CredentialingSessionPrincipal } from '../mcp-server.ts'
import { CredentialingMcpServer } from '../mcp-server.ts'
import { FacilityTemplateRepository } from '../repositories/index.ts'

export type TestHarness = {
  workspacePath: string
  db: Database
  server: CredentialingMcpServer
  setPrincipal: (principal: CredentialingSessionPrincipal | null) => void
  getPrincipal: () => CredentialingSessionPrincipal | null
  templateId: string
  cleanup: () => void
}

export function createCredentialingHarness(): TestHarness {
  const workspacePath = mkdtempSync(join(tmpdir(), 'advantis-cred-int-'))
  const db = new Database(':memory:')
  let principal: CredentialingSessionPrincipal | null = {
    actorType: 'human',
    actorId: 'human-1',
    humanUserId: 'human-1',
  }

  const server = new CredentialingMcpServer({
    db,
    workspacePath,
    getSessionPrincipal: () => principal,
  })

  const templates = new FacilityTemplateRepository(db)
  const templateId = templates.create({
    name: 'General Hospital TX',
    jurisdiction: 'TX',
    requiredDocTypes: ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check'],
    requiredVerificationTypes: ['nursys', 'oig_sam'],
  }).id

  return {
    workspacePath,
    db,
    server,
    templateId,
    setPrincipal(next) {
      principal = next
    },
    getPrincipal() {
      return principal
    },
    cleanup() {
      db.close()
      rmSync(workspacePath, { recursive: true, force: true })
    },
  }
}

export async function createCase(h: TestHarness) {
  return h.server.invokeTool('createCase', {
    clinicianName: 'Taylor RN',
    profession: 'RN',
    npi: '1234567890',
    primaryLicenseState: 'TX',
    primaryLicenseNumber: 'RN-123',
    email: 'taylor@example.com',
    phone: '555-1111',
    facilityId: h.templateId,
    startDate: '2026-03-15',
  })
}
