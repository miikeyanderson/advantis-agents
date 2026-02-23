import type {
  CredentialingCaseListItem,
  CredentialingCaseState,
  CredentialingCreateCaseInput,
} from '../../../shared/types'

export type DashboardStateFilterValue = 'all' | CredentialingCaseState

export interface DashboardFacilityOption {
  id: string
  name: string
  jurisdiction: string
}

export interface DashboardCaseRowData {
  id: string
  clinicianName: string
  facilityName: string
  state: CredentialingCaseState
  blockerCount: number
  assignedAgentRole: string | null
  lastUpdatedAt: string
}

export type NewCaseFormInput = CredentialingCreateCaseInput

export function mapCredentialingCaseToDashboardRow(input: {
  item: CredentialingCaseListItem
  blockerCount: number
  assignedAgentRole: string | null
  facilityFallbackName?: string
}): DashboardCaseRowData {
  return {
    id: input.item.id,
    clinicianName: input.item.clinicianName ?? input.item.clinicianId,
    facilityName: input.item.facilityName ?? input.facilityFallbackName ?? input.item.facilityId,
    state: input.item.state,
    blockerCount: input.blockerCount,
    assignedAgentRole: input.assignedAgentRole,
    lastUpdatedAt: input.item.updatedAt,
  }
}
