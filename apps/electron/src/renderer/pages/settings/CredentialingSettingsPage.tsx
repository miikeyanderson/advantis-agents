import * as React from 'react'
import { useAtom } from 'jotai'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dashboard } from '@/components/dashboard/Dashboard'
import {
  credentialingCasesAtom,
  credentialingDashboardLoadingAtom,
  credentialingDashboardStateFilterAtom,
  credentialingSelectedCaseIdAtom,
  credentialingTemplatesAtom,
} from '@/atoms/credentialing'
import { navigate, routes } from '@/lib/navigate'
import type {
  CredentialingCaseListItem,
  CredentialingCaseState,
  CredentialingFacilityTemplate,
  IpcResponse,
} from '../../../shared/types'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import {
  mapCredentialingCaseToDashboardRow,
  type DashboardCaseRowData,
  type DashboardFacilityOption,
  type NewCaseFormInput,
} from '@/components/dashboard/types'

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

async function enrichDashboardRows(cases: CredentialingCaseListItem[]): Promise<DashboardCaseRowData[]> {
  const rows = await Promise.all(
    cases.map(async (item) => {
      const nextState = NEXT_STATE[item.state]
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
  const [rawCases, setRawCases] = useAtom(credentialingCasesAtom)
  const [templates, setTemplates] = useAtom(credentialingTemplatesAtom)
  const [isLoading, setIsLoading] = useAtom(credentialingDashboardLoadingAtom)
  const [rows, setRows] = React.useState<DashboardCaseRowData[]>([])
  const [error, setError] = React.useState<string | null>(null)

  const facilities = React.useMemo<DashboardFacilityOption[]>(() => {
    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      jurisdiction: template.jurisdiction,
    }))
  }, [templates])

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
    run()
    return () => {
      cancelled = true
    }
  }, [loadCases, loadTemplates])

  const handleCreateCase = React.useCallback(async (input: NewCaseFormInput) => {
    const response = await window.electronAPI.credentialingCreateCase(input)
    const created = unwrap(response, 'Failed to create case')
    setSelectedCaseId(created.case.id)
    navigate(routes.view.settings('credentialing'))
    await loadCases()
    return created
  }, [loadCases, setSelectedCaseId])

  const filteredRows = rows

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
            cases={filteredRows}
            facilities={facilities}
            selectedState={selectedState}
            isLoading={isLoading}
            onRefresh={loadCases}
            onCreateCase={handleCreateCase}
            onSelectCase={(caseId) => {
              setSelectedCaseId(caseId)
              navigate(routes.view.settings('credentialing'))
            }}
            onSelectState={setSelectedState}
          />

          {selectedCaseId ? (
            <div className="rounded-[8px] border border-border/40 bg-background shadow-minimal px-4 py-3">
              <div className="text-sm font-medium">Selected Case</div>
              <div className="mt-1 text-xs text-muted-foreground break-all">
                {selectedCaseId}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Case timeline view is implemented in Task 10 inside this credentialing page.
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
