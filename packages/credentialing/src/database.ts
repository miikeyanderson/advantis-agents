import { createRequire } from 'node:module'
import { join } from 'node:path'
import { SCHEMA_SQL } from './schema-sql.ts'

type SqliteBinding = string | number | bigint | Uint8Array | null

interface BunSqliteQuery {
  all(...params: SqliteBinding[]): unknown[]
  get(...params: SqliteBinding[]): unknown
  run(...params: SqliteBinding[]): unknown
}

interface BunSqliteDatabaseLike {
  exec(sql: string): void
  query(sql: string): BunSqliteQuery
  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult
  close(): void
}

type BunSqliteDatabaseConstructor = new (path: string) => BunSqliteDatabaseLike

export interface SqliteStatement<Row = unknown> {
  all(...params: SqliteBinding[]): Row[]
  get(...params: SqliteBinding[]): Row | undefined
  run(...params: SqliteBinding[]): unknown
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

interface NodeStatementSync {
  all(...params: SqliteBinding[]): unknown[]
  get(...params: SqliteBinding[]): unknown
  run(...params: SqliteBinding[]): { changes: number; lastInsertRowid: number | bigint }
}

interface NodeDatabaseSync {
  exec(sql: string): void
  prepare(sql: string): NodeStatementSync
  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult
  close(): void
}

type NodeDatabaseSyncConstructor = new (path: string) => NodeDatabaseSync

class NodeSqliteStatementAdapter<Row = unknown> implements SqliteStatement<Row> {
  constructor(private readonly stmt: NodeStatementSync) {}

  all(...params: SqliteBinding[]): Row[] {
    return this.stmt.all(...params) as Row[]
  }

  get(...params: SqliteBinding[]): Row | undefined {
    return this.stmt.get(...params) as Row | undefined
  }

  run(...params: SqliteBinding[]): unknown {
    return this.stmt.run(...params)
  }
}

class NodeSqliteConnectionAdapter implements SqliteConnection {
  private transactionDepth = 0
  private savepointCounter = 0

  constructor(private readonly db: NodeDatabaseSync) {}

  exec(sql: string): void {
    this.db.exec(sql)
  }

  pragma(statement: string): unknown {
    this.db.exec(`PRAGMA ${statement}`)
    return undefined
  }

  prepare<Row = unknown>(sql: string): SqliteStatement<Row> {
    return new NodeSqliteStatementAdapter<Row>(this.db.prepare(sql))
  }

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult {
    return (...args: TArgs): TResult => {
      const isOuterTransaction = this.transactionDepth === 0
      const savepointName = isOuterTransaction
        ? null
        : `sp_${++this.savepointCounter}`

      if (isOuterTransaction) {
        this.db.exec('BEGIN')
      } else {
        this.db.exec(`SAVEPOINT ${savepointName}`)
      }

      this.transactionDepth += 1

      try {
        const result = fn(...args)
        this.transactionDepth -= 1

        if (isOuterTransaction) {
          this.db.exec('COMMIT')
        } else {
          this.db.exec(`RELEASE SAVEPOINT ${savepointName}`)
        }

        return result
      } catch (error) {
        this.transactionDepth -= 1
        try {
          if (isOuterTransaction) {
            this.db.exec('ROLLBACK')
          } else {
            this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`)
            this.db.exec(`RELEASE SAVEPOINT ${savepointName}`)
          }
        } catch {
          // Preserve the original error from the transactional callback.
        }
        throw error
      }
    }
  }

  close(): void {
    this.db.close()
  }
}

class BunSqliteStatementAdapter<Row = unknown> implements SqliteStatement<Row> {
  constructor(private readonly statement: BunSqliteQuery) {}

  all(...params: SqliteBinding[]): Row[] {
    return this.statement.all(...params) as Row[]
  }

  get(...params: SqliteBinding[]): Row | undefined {
    return this.statement.get(...params) as Row | undefined
  }

  run(...params: SqliteBinding[]): unknown {
    return this.statement.run(...params)
  }
}

class BunSqliteConnectionAdapter implements SqliteConnection {
  constructor(private readonly db: BunSqliteDatabaseLike) {}

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
      this.connection.exec(SCHEMA_SQL)
      this.seedInitialTemplates()
    } catch (error) {
      throw new CredentialingDatabaseError('Failed to initialize credentialing database', error)
    }
  }

  getConnection(): SqliteConnection {
    return this.connection
  }

  private createConnection(dbPath: string): SqliteConnection {
    try {
      const NodeDatabase = loadNodeSqliteDatabase()
      return new NodeSqliteConnectionAdapter(new NodeDatabase(dbPath))
    } catch {
      // fall through to bun:sqlite
    }

    try {
      const BunSqliteDatabase = loadBunSqliteDatabase()
      return new BunSqliteConnectionAdapter(new BunSqliteDatabase(dbPath))
    } catch (error) {
      throw error
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

function loadNodeSqliteDatabase(): NodeDatabaseSyncConstructor {
  const req = createRequire(join(process.cwd(), 'package.json'))
  const nodeSqlite = req('node:sqlite') as { DatabaseSync?: NodeDatabaseSyncConstructor }
  if (!nodeSqlite.DatabaseSync) {
    throw new Error('node:sqlite DatabaseSync not available')
  }
  return nodeSqlite.DatabaseSync
}

function loadBunSqliteDatabase(): BunSqliteDatabaseConstructor {
  const require = createRequire(join(process.cwd(), 'package.json'))
  const bunSqliteModule = require('bun:sqlite') as {
    Database?: BunSqliteDatabaseConstructor
  }
  if (!bunSqliteModule.Database) {
    throw new Error('bun:sqlite Database export not available')
  }
  return bunSqliteModule.Database
}
