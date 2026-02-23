import type { Database } from '../database.ts'
import type { Clinician } from '../types.ts'
import { withRepoError, nowIso } from './utils.ts'

type ClinicianRow = Clinician

export class ClinicianRepository {
  constructor(private readonly db: Database) {}

  create(data: Omit<Clinician, 'id' | 'createdAt'> & { createdAt?: string }): Clinician {
    return withRepoError('ClinicianRepository', 'create', () => {
      const id = crypto.randomUUID()
      const createdAt = data.createdAt ?? nowIso()
      const clinician: Clinician = {
        id,
        name: data.name,
        profession: data.profession,
        npi: data.npi,
        primaryLicenseState: data.primaryLicenseState,
        primaryLicenseNumber: data.primaryLicenseNumber,
        email: data.email,
        phone: data.phone,
        createdAt,
      }

      this.db.getConnection().prepare(
        `INSERT INTO clinicians (
          id, name, profession, npi, primaryLicenseState, primaryLicenseNumber, email, phone, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        clinician.id,
        clinician.name,
        clinician.profession,
        clinician.npi,
        clinician.primaryLicenseState,
        clinician.primaryLicenseNumber,
        clinician.email,
        clinician.phone,
        clinician.createdAt,
      )

      return clinician
    })
  }

  getById(id: string): Clinician | null {
    return withRepoError('ClinicianRepository', 'getById', () => {
      const row = this.db.getConnection().prepare<ClinicianRow>(
        'SELECT * FROM clinicians WHERE id = ?',
      ).get(id)
      return row ?? null
    })
  }

  list(): Clinician[] {
    return withRepoError('ClinicianRepository', 'list', () => {
      return this.db.getConnection().prepare<ClinicianRow>(
        'SELECT * FROM clinicians ORDER BY createdAt ASC, id ASC',
      ).all()
    })
  }

  update(id: string, patch: Partial<Omit<Clinician, 'id' | 'createdAt'>>): Clinician {
    return withRepoError('ClinicianRepository', 'update', () => {
      const existing = this.getById(id)
      if (!existing) {
        throw new Error(`Clinician not found: ${id}`)
      }
      const next: Clinician = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt }
      this.db.getConnection().prepare(
        `UPDATE clinicians SET
          name = ?, profession = ?, npi = ?, primaryLicenseState = ?,
          primaryLicenseNumber = ?, email = ?, phone = ?
         WHERE id = ?`,
      ).run(
        next.name,
        next.profession,
        next.npi,
        next.primaryLicenseState,
        next.primaryLicenseNumber,
        next.email,
        next.phone,
        id,
      )
      return next
    })
  }
}
