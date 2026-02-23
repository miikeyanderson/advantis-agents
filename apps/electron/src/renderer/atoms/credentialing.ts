import { atom } from 'jotai'
import type {
  CredentialingCaseListItem,
  CredentialingFacilityTemplate,
  CredentialingTimeline,
  CredentialingGuardResult,
} from '../../shared/types'

export const credentialingSelectedCaseIdAtom = atom<string | null>(null)
export const credentialingDashboardStateFilterAtom = atom<'all' | import('../../shared/types').CredentialingCaseState>('all')
export const credentialingCasesAtom = atom<CredentialingCaseListItem[]>([])
export const credentialingTemplatesAtom = atom<CredentialingFacilityTemplate[]>([])
export const credentialingTimelineAtom = atom<CredentialingTimeline | null>(null)
export const credentialingGuardResultAtom = atom<CredentialingGuardResult | null>(null)
export const credentialingDashboardLoadingAtom = atom(false)
