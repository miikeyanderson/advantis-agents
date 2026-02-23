import { Badge } from '@/components/ui/badge'
import type { CredentialingCase, CredentialingDocument } from '../../../shared/types'

function latestByDocType(documents: CredentialingDocument[]): Map<string, CredentialingDocument> {
  const sorted = [...documents].sort((a, b) => {
    if (a.createdAt === b.createdAt) return b.id.localeCompare(a.id)
    return b.createdAt.localeCompare(a.createdAt)
  })
  const map = new Map<string, CredentialingDocument>()
  for (const doc of sorted) {
    if (!map.has(doc.docType)) {
      map.set(doc.docType, doc)
    }
  }
  return map
}

function isCollected(doc: CredentialingDocument | undefined): boolean {
  if (!doc) return false
  return (doc.status === 'received' || doc.status === 'verified') && !!doc.fileRef
}

export function DocumentChecklist({
  caseRecord,
  documents,
}: {
  caseRecord: CredentialingCase
  documents: CredentialingDocument[]
}) {
  const latest = latestByDocType(documents)

  return (
    <div className="rounded-[8px] border border-border/40 bg-background shadow-minimal overflow-hidden">
      <div className="px-4 py-2 bg-foreground/3 border-b border-border/30">
        <div className="text-sm font-semibold">Document Checklist</div>
        <div className="text-xs text-muted-foreground">Required snapshot vs collected documents</div>
      </div>
      <div className="p-4 grid gap-2">
        {caseRecord.requiredDocTypesSnapshot.map((docType) => {
          const doc = latest.get(docType)
          const collected = isCollected(doc)
          return (
            <div key={docType} className="flex items-center justify-between gap-3 rounded-[6px] border border-border/30 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{docType}</div>
                <div className="text-xs text-muted-foreground">
                  {doc ? `Latest status: ${doc.status}` : 'No document recorded'}
                </div>
              </div>
              <Badge variant={collected ? 'secondary' : 'destructive'} className={collected ? 'bg-success/15 text-success border-success/20' : ''}>
                {collected ? 'Collected' : 'Missing'}
              </Badge>
            </div>
          )
        })}
      </div>
    </div>
  )
}
