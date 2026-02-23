import { readFileSync } from 'node:fs'
import BetterSqlite3 from 'better-sqlite3'
import { Database as BunSqliteDatabase, type SQLQueryBindings } from 'bun:sqlite'

export interface SqliteStatement<Row = unknown> {
  all(...params: SQLQueryBindings[]): Row[]
  get(...params: SQLQueryBindings[]): Row | undefined
  run(...params: SQLQueryBindings[]): unknown
}

export interface SqliteConnection {
  exec(sql: string): void
  pragma(statement: string): unknown
  prepare<Row = unknown>(sql: string): SqliteStatement<Row>
  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult
  close(): void
}

class BetterSqlite3ConnectionAdapter implements SqliteConnection {
  constructor(private readonly db: BetterSqlite3.Database) {}

  exec(sql: string): void {
    this.db.exec(sql)
  }

  pragma(statement: string): unknown {
    return this.db.pragma(statement)
  }

  prepare<Row = unknown>(sql: string): SqliteStatement<Row> {
    return this.db.prepare(sql) as unknown as SqliteStatement<Row>
  }

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult {
    return this.db.transaction(fn) as (...args: TArgs) => TResult
  }

  close(): void {
    this.db.close()
  }
}

class BunSqliteStatementAdapter<Row = unknown> implements SqliteStatement<Row> {
  constructor(private readonly statement: ReturnType<BunSqliteDatabase['query']>) {}

  all(...params: SQLQueryBindings[]): Row[] {
    return this.statement.all(...params) as Row[]
  }

  get(...params: SQLQueryBindings[]): Row | undefined {
    return this.statement.get(...params) as Row | undefined
  }

  run(...params: SQLQueryBindings[]): unknown {
    return this.statement.run(...params)
  }
}

class BunSqliteConnectionAdapter implements SqliteConnection {
  constructor(private readonly db: BunSqliteDatabase) {}

  exec(sql: string): void {
    this.db.exec(sql)
  }

  pragma(statement: string): unknown {
    this.db.exec(`PRAGMA ${statement}`)
    return undefined
  }

  prepare<Row = unknown>(sql: string): SqliteStatement<Row> {
    return new BunSqliteStatementAdapter<Row>(this.db.query(sql))
  }

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult {
    return this.db.transaction(fn)
  }

  close(): void {
    this.db.close()
  }
}

export class CredentialingDatabaseError extends Error {
  readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'CredentialingDatabaseError'
    this.cause = cause
  }
}

export class Database {
  private readonly connection: SqliteConnection

  constructor(dbPath: string) {
    try {
      this.connection = this.createConnection(dbPath)
      this.connection.pragma('foreign_keys = ON')
      this.connection.pragma('journal_mode = WAL')
      this.connection.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
      this.seedInitialTemplates()
    } catch (error) {
      throw new CredentialingDatabaseError('Failed to initialize credentialing database', error)
    }
  }

  getConnection(): SqliteConnection {
    return this.connection
  }

  private createConnection(dbPath: string): SqliteConnection {
    let primaryError: unknown
    try {
      return new BetterSqlite3ConnectionAdapter(new BetterSqlite3(dbPath))
    } catch (error) {
      primaryError = error
    }

    try {
      return new BunSqliteConnectionAdapter(new BunSqliteDatabase(dbPath))
    } catch {
      if (primaryError instanceof Error) {
        throw primaryError
      }
      throw primaryError
    }
  }

  private seedInitialTemplates(): void {
    type CountRow = { count: number }
    const countRow = this.connection.prepare<CountRow>(
      'SELECT COUNT(*) as count FROM facility_templates',
    ).get()
    const count = typeof countRow?.count === 'number' ? countRow.count : 0
    if (count > 0) {
      return
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.connection.prepare(
      `INSERT INTO facility_templates (
        id, name, jurisdiction, version, requiredDocTypes, requiredVerificationTypes, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      'General Hospital TX',
      'TX',
      1,
      JSON.stringify(['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check']),
      JSON.stringify(['nursys', 'oig_sam']),
      now,
      now,
    )
  }

  close(): void {
    try {
      this.connection.close()
    } catch (error) {
      throw new CredentialingDatabaseError('Failed to close credentialing database', error)
    }
  }
}
