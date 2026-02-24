import * as React from 'react'
import { useState, useMemo, useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Search, AlertTriangle, XCircle, Clock, Building2, Activity, CircleCheck, FileCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  credentialingCaseListAtom,
} from '@/atoms/credentialing'
import type { CaseListItemViewModel, UiStatusBucket } from '../../../shared/types'
import {
  useNavigation,
  useNavigationState,
  isCredentialingNavigation,
  routes,
} from '@/contexts/NavigationContext'
import { STATUS_ICON_CLASSES, STATUS_BADGE_CLASSES } from '../credentialing/status-styles'

function getStatusIcon(status: UiStatusBucket): React.ReactNode {
  const iconClass = cn('h-3.5 w-3.5 shrink-0', STATUS_ICON_CLASSES[status])
  const icons: Record<UiStatusBucket, React.ReactNode> = {
    'at-risk':            <AlertTriangle className={iconClass} />,
    'blocked':            <XCircle className={iconClass} />,
    'pending-submission': <Clock className={iconClass} />,
    'with-facility':      <Building2 className={iconClass} />,
    'active':             <Activity className={iconClass} />,
    'cleared':            <CircleCheck className={iconClass} />,
  }
  return icons[status]
}

function getLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts[parts.length - 1] ?? fullName
}

export function CredentialingListPanel() {
  const cases = useAtomValue(credentialingCaseListAtom)
  const setCaseList = useSetAtom(credentialingCaseListAtom)
  const navState = useNavigationState()
  const { navigate } = useNavigation()

  const uiFilter: UiStatusBucket | 'all' = isCredentialingNavigation(navState)
    ? navState.filter
    : 'all'
  const selectedCaseId = isCredentialingNavigation(navState)
    ? navState.details?.caseId ?? null
    : null

  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    window.electronAPI.credentialingGetCaseList()
      .then((result: CaseListItemViewModel[]) => {
        setCaseList(result)
      })
      .catch((err: unknown) => {
        console.error('[CredentialingListPanel] fetch error', err)
      })
  }, [setCaseList])

  const filteredAndSorted = useMemo(() => {
    let result: CaseListItemViewModel[] = [...cases]

    // Apply UI status filter
    if (uiFilter !== 'all') {
      result = result.filter(c => c.derivedStatus === uiFilter)
    }

    // Apply search filter (case-insensitive substring on clinician name)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(c => c.clinicianName.toLowerCase().includes(q))
    }

    // Sort: statusPriority asc, daysUntilStart asc, lastName alpha
    result.sort((a, b) => {
      if (a.statusPriority !== b.statusPriority) {
        return a.statusPriority - b.statusPriority
      }
      if (a.daysUntilStart !== b.daysUntilStart) {
        return a.daysUntilStart - b.daysUntilStart
      }
      return getLastName(a.clinicianName).localeCompare(getLastName(b.clinicianName))
    })

    return result
  }, [cases, uiFilter, searchQuery])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search Box */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-[6px] bg-background shadow-minimal">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search clinicians..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 pb-4">
          {filteredAndSorted.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <FileCheck className="h-8 w-8 opacity-30" />
              <p className="text-sm">No clinician files found</p>
            </div>
          )}
          {filteredAndSorted.map(c => {
            const isSelected = c.caseId === selectedCaseId
            const badge = STATUS_BADGE_CLASSES[c.derivedStatus]
            return (
              <button
                key={c.caseId}
                onClick={() => navigate(routes.view.credentialing(uiFilter, c.caseId))}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-[8px] mb-1 transition-colors",
                  "hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isSelected && "bg-foreground/[0.07] ring-1 ring-foreground/10"
                )}
              >
                {/* Row line 1: name, specialty, facility */}
                <div className="flex items-center gap-1.5 mb-1">
                  {getStatusIcon(c.derivedStatus)}
                  <span className="text-sm font-medium text-foreground truncate flex-1">
                    {c.clinicianName}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate pl-5 mb-1.5">
                  {c.profession} &middot; {c.facilityName}
                </div>
                {/* Row line 2: status badge, days */}
                <div className="flex items-center gap-2 pl-5">
                  <span className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-xs font-medium",
                    badge.bg, badge.color
                  )}>
                    {c.statusLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.daysUntilStart}d
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
