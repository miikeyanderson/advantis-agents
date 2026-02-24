import * as React from 'react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { CaseDetailViewModel } from '../../../shared/types'
import { OverviewTab } from './OverviewTab'
import { DocumentsTab } from './DocumentsTab'
import { VerificationsTab } from './VerificationsTab'
import { AgentTab } from './AgentTab'

type TabId = 'overview' | 'documents' | 'verifications' | 'agent'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'verifications', label: 'Verifications' },
  { id: 'agent', label: 'Agent' },
]

interface CaseDetailPageProps {
  caseId: string
}

export function CaseDetailPage({ caseId }: CaseDetailPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [data, setData] = useState<CaseDetailViewModel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!caseId) return
    setLoading(true)
    setData(null)
    window.electronAPI.credentialingGetCaseDetail(caseId)
      .then((result: CaseDetailViewModel | null) => {
        setData(result)
      })
      .catch((err: unknown) => {
        console.error('[CaseDetailPage] fetch error', err)
      })
      .finally(() => setLoading(false))
  }, [caseId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Loading case...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Failed to load case details</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-border shrink-0">
        <h1 className="text-base font-semibold text-foreground">
          {data.header.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {data.header.profession} &bull; {data.header.facility}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 px-5 border-b border-border shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors relative',
              'hover:text-foreground',
              activeTab === tab.id
                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                : 'text-muted-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'overview' && <OverviewTab overview={data.overview} />}
        {activeTab === 'documents' && <DocumentsTab documents={data.documents} />}
        {activeTab === 'verifications' && <VerificationsTab verifications={data.verifications} />}
        {activeTab === 'agent' && (
          <AgentTab
            caseId={caseId}
            clinicianName={data.header.name}
            profession={data.header.profession}
            facility={data.header.facility}
          />
        )}
      </div>
    </div>
  )
}
