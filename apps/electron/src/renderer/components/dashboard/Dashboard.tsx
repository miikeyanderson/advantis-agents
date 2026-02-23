import * as React from 'react'
import { useMemo, useState } from 'react'
import { Plus, RefreshCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CaseRow } from './CaseRow'
import { NewCaseForm } from './NewCaseForm'
import { StateFilter } from './StateFilter'
import type { DashboardCaseRowData, DashboardFacilityOption, DashboardStateFilterValue, NewCaseFormInput } from './types'

export function Dashboard({
  cases,
  facilities,
  selectedState,
  isLoading,
  onRefresh,
  onCreateCase,
  onSelectCase,
  onSelectState,
}: {
  cases: DashboardCaseRowData[]
  facilities: DashboardFacilityOption[]
  selectedState: DashboardStateFilterValue
  isLoading: boolean
  onRefresh: () => void
  onCreateCase: (input: NewCaseFormInput) => Promise<unknown>
  onSelectCase: (caseId: string) => void
  onSelectState: (state: DashboardStateFilterValue) => void
}) {
  const [newCaseOpen, setNewCaseOpen] = useState(false)

  const emptyLabel = useMemo(() => {
    if (selectedState === 'all') return 'No credentialing cases yet.'
    return `No cases in ${selectedState.replace(/_/g, ' ')}.`
  }, [selectedState])

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-border/40 bg-background shadow-minimal">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Credentialing Dashboard</h2>
            <p className="text-xs text-muted-foreground">
              Track cases from offer accepted through cleared-to-start.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <StateFilter value={selectedState} onChange={onSelectState} />
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCcw className="size-3.5" />
              Refresh
            </Button>
            <Button type="button" size="sm" onClick={() => setNewCaseOpen(true)}>
              <Plus className="size-3.5" />
              New Case
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-[8px] border border-border/40 bg-background shadow-minimal overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clinician</TableHead>
              <TableHead>Facility</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Blockers</TableHead>
              <TableHead>Assigned Agent</TableHead>
              <TableHead>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Loading dashboard…
                </TableCell>
              </TableRow>
            ) : cases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            ) : (
              cases.map((row) => (
                <CaseRow key={row.id} row={row} onSelect={onSelectCase} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <NewCaseForm
        open={newCaseOpen}
        onOpenChange={setNewCaseOpen}
        facilities={facilities}
        onSubmit={async (input) => {
          await onCreateCase(input)
        }}
      />
    </div>
  )
}
