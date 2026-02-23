import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { DashboardCaseRowData } from './types'

function stateBadgeVariant(state: DashboardCaseRowData['state']): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === 'cleared') return 'default'
  if (state === 'closed') return 'outline'
  if (state === 'submitted' || state === 'packet_assembled') return 'secondary'
  return 'outline'
}

function stateBadgeClasses(state: DashboardCaseRowData['state']): string {
  if (state === 'cleared') return 'bg-success text-background border-transparent'
  if (state === 'closed') return 'text-muted-foreground border-foreground/15'
  if (state === 'submitted') return 'bg-info text-foreground border-transparent'
  return ''
}

function formatState(state: DashboardCaseRowData['state']): string {
  return state.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')
}

function formatUpdated(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return date.toLocaleString()
}

export function CaseRow({ row, onSelect }: { row: DashboardCaseRowData; onSelect: (caseId: string) => void }) {
  return (
    <TableRow
      className="cursor-pointer hover:bg-foreground/3"
      onClick={() => onSelect(row.id)}
      data-case-id={row.id}
    >
      <TableCell className="font-medium">{row.clinicianName}</TableCell>
      <TableCell>{row.facilityName}</TableCell>
      <TableCell>
        <Badge variant={stateBadgeVariant(row.state)} className={cn(stateBadgeClasses(row.state))}>
          {formatState(row.state)}
        </Badge>
      </TableCell>
      <TableCell>
        {row.blockerCount > 0 ? (
          <Badge variant="destructive">{row.blockerCount}</Badge>
        ) : (
          <Badge variant="secondary">0</Badge>
        )}
      </TableCell>
      <TableCell>{row.assignedAgentRole ?? 'Unassigned'}</TableCell>
      <TableCell className="text-muted-foreground">{formatUpdated(row.lastUpdatedAt)}</TableCell>
    </TableRow>
  )
}
