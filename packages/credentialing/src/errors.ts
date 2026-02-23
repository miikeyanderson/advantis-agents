export class CredentialingError extends Error {
  readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'CredentialingError'
    this.cause = cause
  }
}

export class RepositoryError extends CredentialingError {
  readonly repository: string
  readonly operation: string

  constructor(repository: string, operation: string, message: string, cause?: unknown) {
    super(message, cause)
    this.name = 'RepositoryError'
    this.repository = repository
    this.operation = operation
  }
}

export class EntityNotFoundError extends RepositoryError {
  constructor(repository: string, entityId: string) {
    super(repository, 'getById', `${repository} entity not found: ${entityId}`)
    this.name = 'EntityNotFoundError'
  }
}
