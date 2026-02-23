export function validateEvidence(evidence: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { valid: false, errors: ['Evidence must be an object'] }
  }

  const record = evidence as Record<string, unknown>

  if (typeof record.sourceUrl !== 'string') {
    errors.push('sourceUrl is required')
  } else {
    try {
      new URL(record.sourceUrl)
    } catch {
      errors.push('sourceUrl must be a valid URL')
    }
  }

  if (typeof record.timestamp !== 'string') {
    errors.push('timestamp is required')
  } else if (Number.isNaN(Date.parse(record.timestamp))) {
    errors.push('timestamp must be a valid ISO 8601 string')
  } else if (!record.timestamp.includes('T')) {
    errors.push('timestamp must be a valid ISO 8601 string')
  }

  return { valid: errors.length === 0, errors }
}
