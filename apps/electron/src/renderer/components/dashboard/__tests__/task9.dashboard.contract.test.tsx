import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { SETTINGS_PAGES } from '../../../../shared/settings-registry'
import { SETTINGS_ICONS } from '@/components/icons/SettingsIcons'
import { IPC_CHANNELS } from '../../../../shared/types'
import { Dashboard } from '../Dashboard'
import { CASE_STATE_OPTIONS } from '../StateFilter'
import type { DashboardCaseRowData, DashboardFacilityOption } from '../types'

const sampleCase: DashboardCaseRowData = {
  id: 'case-1',
  clinicianName: 'Alex RN',
  facilityName: 'General Hospital TX',
  state: 'documents_requested',
  blockerCount: 2,
  assignedAgentRole: 'DocCollector',
  lastUpdatedAt: '2026-02-23T12:00:00.000Z',
}

const facilities: DashboardFacilityOption[] = [
  { id: 'facility-1', name: 'General Hospital TX', jurisdiction: 'TX' },
]

describe('Task 9 dashboard contracts', () => {
  it('registers credentialing as a settings subpage with an icon', () => {
    expect(SETTINGS_PAGES.some((page) => page.id === 'credentialing')).toBe(true)
    expect('credentialing' in SETTINGS_ICONS).toBe(true)
  })

  it('exposes credentialing dashboard IPC channels', () => {
    expect(IPC_CHANNELS.CREDENTIALING_QUERY_CASES).toBe('credentialing:query-cases')
    expect(IPC_CHANNELS.CREDENTIALING_CREATE_CASE).toBe('credentialing:create-case')
    expect(IPC_CHANNELS.CREDENTIALING_QUERY_TEMPLATES).toBe('credentialing:query-templates')
  })

  it('state filter options include all 9 case states including closed', () => {
    expect(CASE_STATE_OPTIONS).toHaveLength(9)
    expect(CASE_STATE_OPTIONS).toContain('closed')
    expect(CASE_STATE_OPTIONS[0]).toBe('offer_accepted')
  })

  it('dashboard renders required table columns and new case action', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        cases={[sampleCase]}
        facilities={facilities}
        selectedState="all"
        isLoading={false}
        onRefresh={() => {}}
        onCreateCase={async () => ({ id: 'case-2' })}
        onSelectCase={() => {}}
        onSelectState={() => {}}
      />,
    )

    expect(html).toContain('Clinician')
    expect(html).toContain('Facility')
    expect(html).toContain('State')
    expect(html).toContain('Blockers')
    expect(html).toContain('Assigned Agent')
    expect(html).toContain('Last Updated')
    expect(html).toContain('New Case')
  })
})
