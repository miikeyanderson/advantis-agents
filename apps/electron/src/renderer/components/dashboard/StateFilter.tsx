import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CredentialingCaseState } from '../../../shared/types'
import type { DashboardStateFilterValue } from './types'

export const CASE_STATE_OPTIONS: CredentialingCaseState[] = [
  'offer_accepted',
  'documents_requested',
  'documents_collected',
  'verification_in_progress',
  'verification_complete',
  'packet_assembled',
  'submitted',
  'cleared',
  'closed',
]

function formatStateLabel(state: DashboardStateFilterValue): string {
  if (state === 'all') return 'All States'
  return state.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')
}

export function StateFilter({
  value,
  onChange,
}: {
  value: DashboardStateFilterValue
  onChange: (value: DashboardStateFilterValue) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as DashboardStateFilterValue)}>
      <SelectTrigger className="w-[220px] bg-background">
        <SelectValue placeholder="Filter by state" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All States</SelectItem>
        {CASE_STATE_OPTIONS.map((state) => (
          <SelectItem key={state} value={state}>{formatStateLabel(state)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
