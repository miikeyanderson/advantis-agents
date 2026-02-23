import type { SqliteConnection } from '../database.ts'
import { RepositoryError } from '../errors.ts'

export function nowIso(): string {
  return new Date().toISOString()
}

export function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  const parsed = JSON.parse(value) as unknown
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  return {}
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return []
  const parsed = JSON.parse(value) as unknown
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is string => typeof item === 'string')
  }
  return []
}

export function withRepoError<T>(
  repository: string,
  operation: string,
  fn: () => T,
): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw error
    }
    throw new RepositoryError(repository, operation, `${repository}.${operation} failed`, error)
  }
}

export function requireRow<T>(
  repository: string,
  operation: string,
  row: T | null | undefined,
  message: string,
): T {
  if (row == null) {
    throw new RepositoryError(repository, operation, message)
  }
  return row
}

export function enableForeignKeys(db: SqliteConnection): void {
  db.pragma('foreign_keys = ON')
}
