import * as React from 'react'
import { useAtom } from 'jotai'

import {
  credentialingCasesAtom,
  credentialingDashboardLoadingAtom,
  credentialingDashboardStateFilterAtom,
  credentialingGuardResultAtom,
  credentialingSelectedCaseIdAtom,
  credentialingTemplatesAtom,
  credentialingTimelineAtom,
} from '@/atoms/credentialing'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { CaseTimeline } from '@/components/case-timeline/CaseTimeline'
import { Dashboard } from '@/components/dashboard/Dashboard'
import {
  mapCredentialingCaseToDashboardRow,
  type DashboardCaseRowData,
  type DashboardFacilityOption,
  type NewCaseFormInput,
} from '@/components/dashboard/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { navigate, routes } from '@/lib/navigate'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import type {
  CredentialingCaseListItem,
  CredentialingCaseState,
  CredentialingFacilityTemplate,
  CredentialingGuardResult,
  CredentialingTimeline,
  IpcResponse,
} from '../../../shared/types'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'credentialing',
}

const NEXT_STATE: Partial<Record<CredentialingCaseState, CredentialingCaseState>> = {
  offer_accepted: 'documents_requested',
  documents_requested: 'documents_collected',
  documents_collected: 'verification_in_progress',
  verification_in_progress: 'verification_complete',
  verification_complete: 'packet_assembled',
  packet_assembled: 'submitted',
  submitted: 'cleared',
}

function unwrap<T>(response: IpcResponse<T>, fallback: string): T {
  if (!response.success) {
    throw new Error(response.error.message || fallback)
  }
  return response.data
}

function getNextState(state: CredentialingCaseState): CredentialingCaseState | null {
  return NEXT_STATE[state] ?? null
}

function pickNextVerificationType(timeline: CredentialingTimeline): string | null {
  const caseRecord = timeline.case
  if (!caseRecord) return null
  const completed = new Set(timeline.verifications.map((v) => v.verificationType))
  const missing = caseRecord.requiredVerificationTypesSnapshot.find((type) => !completed.has(type))
  if (missing) return missing
  return caseRecord.requiredVerificationTypesSnapshot[0] ?? null
}

async function enrichDashboardRows(cases: CredentialingCaseListItem[]): Promise<DashboardCaseRowData[]> {
  const rows = await Promise.all(
    cases.map(async (item) => {
      const nextState = getNextState(item.state)
      let blockerCount = 0
      let assignedAgentRole: string | null = null

      if (nextState) {
        const guardResponse = await window.electronAPI.credentialingCheckGuards(item.id, nextState)
        if (guardResponse.success) {
          blockerCount = guardResponse.data.blockers.length
        }
      }

      const activeAgentResponse = await window.electronAPI.credentialingGetActiveAgent(item.id)
      if (activeAgentResponse.success) {
        assignedAgentRole = activeAgentResponse.data?.agentRole ?? null
      }

      return mapCredentialingCaseToDashboardRow({ item, blockerCount, assignedAgentRole })
    }),
  )

  return rows
}

export default function CredentialingSettingsPage() {
  const [selectedState, setSelectedState] = useAtom(credentialingDashboardStateFilterAtom)
  const [selectedCaseId, setSelectedCaseId] = useAtom(credentialingSelectedCaseIdAtom)
  const [, setRawCases] = useAtom(credentialingCasesAtom)
  const [templates, setTemplates] = useAtom(credentialingTemplatesAtom)
  const [timeline, setTimeline] = useAtom(credentialingTimelineAtom)
  const [guardResult, setGuardResult] = useAtom(credentialingGuardResultAtom)
  const [isLoading, setIsLoading] = useAtom(credentialingDashboardLoadingAtom)

  const [rows, setRows] = React.useState<DashboardCaseRowData[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [isTimelineBusy, setIsTimelineBusy] = React.useState(false)
  const [selectedFindingId, setSelectedFindingId] = React.useState<string | null>(null)

  const facilities = React.useMemo<DashboardFacilityOption[]>(() => {
    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      jurisdiction: template.jurisdiction,
    }))
  }, [templates])

  const selectedRow = React.useMemo(
    () => (selectedCaseId ? rows.find((row) => row.id === selectedCaseId) ?? null : null),
    [rows, selectedCaseId],
  )

  const loadTemplates = React.useCallback(async () => {
    const response = await window.electronAPI.credentialingQueryTemplates({})
    const data = unwrap<CredentialingFacilityTemplate[]>(response, 'Failed to load templates')
    setTemplates(data)
  }, [setTemplates])

  const loadCases = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await window.electronAPI.credentialingQueryCases(
        selectedState === 'all' ? {} : { state: selectedState },
      )
      const data = unwrap<CredentialingCaseListItem[]>(response, 'Failed to load cases')
      setRawCases(data)
      setRows(await enrichDashboardRows(data))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }, [selectedState, setIsLoading, setRawCases])

  const loadTimelineAndGuards = React.useCallback(async (caseId: string) => {
    const timelineResponse = await window.electronAPI.credentialingGetCaseTimeline(caseId)
    const timelineData = unwrap<CredentialingTimeline>(timelineResponse, 'Failed to load case timeline')
    setTimeline(timelineData)

    const caseRecord = timelineData.case
    if (!caseRecord) {
      setGuardResult(null)
      return timelineData
    }

    const nextState = getNextState(caseRecord.state)
    if (!nextState) {
      setGuardResult(null)
      return timelineData
    }

    const guardResponse = await window.electronAPI.credentialingCheckGuards(caseId, nextState)
    const guardData = unwrap<CredentialingGuardResult>(guardResponse, 'Failed to check guards')
    setGuardResult(guardData)
    return timelineData
  }, [setGuardResult, setTimeline])

  const refreshSelectedCase = React.useCallback(async () => {
    if (!selectedCaseId) return
    setIsTimelineBusy(true)
    try {
      await loadTimelineAndGuards(selectedCaseId)
      await loadCases()
    } finally {
      setIsTimelineBusy(false)
    }
  }, [loadCases, loadTimelineAndGuards, selectedCaseId])

  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        await loadTemplates()
        if (cancelled) return
        await loadCases()
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [loadCases, loadTemplates])

  React.useEffect(() => {
    if (!selectedCaseId) {
      setTimeline(null)
      setGuardResult(null)
      setSelectedFindingId(null)
      return
    }
    setIsTimelineBusy(true)
    void loadTimelineAndGuards(selectedCaseId)
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
      .finally(() => {
        setIsTimelineBusy(false)
      })
  }, [loadTimelineAndGuards, selectedCaseId, setGuardResult, setTimeline])

  const handleCreateCase = React.useCallback(async (input: NewCaseFormInput) => {
    const response = await window.electronAPI.credentialingCreateCase(input)
    const created = unwrap(response, 'Failed to create case')
    setSelectedCaseId(created.case.id)
    navigate(routes.view.settings('credentialing'))
    await loadCases()
    return created
  }, [loadCases, setSelectedCaseId])

  const handleRunVerification = React.useCallback(async () => {
    if (!selectedCaseId || !timeline) return
    const nextVerificationType = pickNextVerificationType(timeline)
    if (!nextVerificationType) return
    setIsTimelineBusy(true)
    try {
      const response = await window.electronAPI.credentialingRunVerification(selectedCaseId, nextVerificationType)
      unwrap(response, 'Failed to run verification')
      await loadTimelineAndGuards(selectedCaseId)
      await loadCases()
    } finally {
      setIsTimelineBusy(false)
    }
  }, [loadCases, loadTimelineAndGuards, selectedCaseId, timeline])

  const handleAdvanceState = React.useCallback(async () => {
    if (!selectedCaseId || !timeline?.case) return
    const nextState = getNextState(timeline.case.state)
    if (!nextState) return
    setIsTimelineBusy(true)
    try {
      const response = await window.electronAPI.credentialingTransitionState(selectedCaseId, nextState)
      unwrap(response, 'Failed to transition state')
      await loadTimelineAndGuards(selectedCaseId)
      await loadCases()
    } finally {
      setIsTimelineBusy(false)
    }
  }, [loadCases, loadTimelineAndGuards, selectedCaseId, timeline])

  const selectedCaseRecord = timeline?.case ?? null
  const nextState = selectedCaseRecord ? getNextState(selectedCaseRecord.state) : null

  return (
    <div className="h-full flex flex-col min-w-0 overflow-hidden">
      <PanelHeader title="Credentialing" />
      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-7xl p-4 space-y-4">
          {error ? (
            <div className="rounded-[8px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-minimal">
              {error}
            </div>
          ) : null}

          <Dashboard
            cases={rows}
            facilities={facilities}
            selectedState={selectedState}
            isLoading={isLoading}
            onRefresh={loadCases}
            onCreateCase={handleCreateCase}
            onSelectCase={(caseId) => {
              setSelectedCaseId(caseId)
              setSelectedFindingId(null)
              navigate(routes.view.settings('credentialing'))
            }}
            onSelectState={setSelectedState}
          />

          {selectedCaseRecord ? (
            <CaseTimeline
              caseRecord={selectedCaseRecord}
              events={timeline?.events ?? []}
              documents={timeline?.documents ?? []}
              verifications={timeline?.verifications ?? []}
              approvals={timeline?.approvals ?? []}
              nextState={nextState}
              guardResult={guardResult}
              isBusy={isTimelineBusy}
              onRefresh={refreshSelectedCase}
              onRunVerification={handleRunVerification}
              onAdvanceState={handleAdvanceState}
              onReviewFinding={(verificationId) => {
                setSelectedFindingId(verificationId)
              }}
              onBack={() => {
                setSelectedCaseId(null)
                setSelectedFindingId(null)
              }}
            />
          ) : selectedCaseId ? (
            <div className="rounded-[8px] border border-border/40 bg-background shadow-minimal px-4 py-3 text-sm text-muted-foreground">
              Loading case timeline for {selectedRow?.clinicianName ?? selectedCaseId}…
            </div>
          ) : null}

          {selectedFindingId ? (
            <div className="rounded-[8px] border border-border/40 bg-background shadow-minimal px-4 py-3 text-sm text-muted-foreground">
              Selected finding: {selectedFindingId}. Approval modal is wired in Task 11.
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
