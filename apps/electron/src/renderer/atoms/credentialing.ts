import { atom } from 'jotai'
import type {
  CredentialingCaseListItem,
  CredentialingCaseState,
  CredentialingFacilityTemplate,
  CredentialingTimeline,
  CredentialingGuardResult,
  UiStatusBucket,
  CaseListItemViewModel,
} from '../../shared/types'

/** Legacy filter atom used by CredentialingSettingsPage (FSM states) */
export const credentialingDashboardStateFilterAtom = atom<'all' | CredentialingCaseState>('all')
export const credentialingCasesAtom = atom<CredentialingCaseListItem[]>([])
export const credentialingTemplatesAtom = atom<CredentialingFacilityTemplate[]>([])
export const credentialingTimelineAtom = atom<CredentialingTimeline | null>(null)
export const credentialingGuardResultAtom = atom<CredentialingGuardResult | null>(null)
export const credentialingDashboardLoadingAtom = atom(false)

/** ViewModel case list from IPC (used by new credentialing navigator) */
export const credentialingCaseListAtom = atom<CaseListItemViewModel[]>([])

/** Status counts derived from credentialingCaseListAtom */
export const credentialingStatusCountsAtom = atom<Record<UiStatusBucket | 'all', number>>((get) => {
  const cases = get(credentialingCaseListAtom)
  const counts: Record<UiStatusBucket | 'all', number> = {
    all: cases.length,
    'at-risk': 0,
    blocked: 0,
    'pending-submission': 0,
    'with-facility': 0,
    active: 0,
    cleared: 0,
  }
  for (const c of cases) {
    counts[c.derivedStatus] = (counts[c.derivedStatus] ?? 0) + 1
  }
  return counts
})
