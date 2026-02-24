import * as React from 'react'
import { Panel } from './Panel'
import { useAppShellContext } from '@/context/AppShellContext'
import { StoplightProvider } from '@/context/StoplightContext'
import {
  useNavigationState,
  isSourcesNavigation,
  isSettingsNavigation,
  isSkillsNavigation,
  isCredentialingNavigation,
} from '@/contexts/NavigationContext'
import { CaseDetailPage } from '@/components/credentialing/CaseDetailPage'
import { SourceInfoPage } from '@/pages'
import SkillInfoPage from '@/pages/SkillInfoPage'
import { getSettingsPageComponent } from '@/pages/settings/settings-pages'

export interface MainContentPanelProps {
  isFocusedMode?: boolean
  className?: string
}

export function MainContentPanel({
  isFocusedMode = false,
  className,
}: MainContentPanelProps) {
  const navState = useNavigationState()
  const { activeWorkspaceId } = useAppShellContext()

  const wrapWithStoplight = (content: React.ReactNode) => (
    <StoplightProvider value={isFocusedMode}>
      {content}
    </StoplightProvider>
  )

  // Settings navigator - uses component map from settings-pages.ts
  if (isSettingsNavigation(navState)) {
    const SettingsPageComponent = getSettingsPageComponent(navState.subpage)
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <SettingsPageComponent />
      </Panel>
    )
  }

  // Sources navigator - show source info or empty state
  if (isSourcesNavigation(navState)) {
    if (navState.details) {
      return wrapWithStoplight(
        <Panel variant="grow" className={className}>
          <SourceInfoPage
            sourceSlug={navState.details.sourceSlug}
            workspaceId={activeWorkspaceId || ''}
          />
        </Panel>
      )
    }
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">No sources configured</p>
        </div>
      </Panel>
    )
  }

  // Skills navigator - show skill info or empty state
  if (isSkillsNavigation(navState)) {
    if (navState.details?.type === 'skill') {
      return wrapWithStoplight(
        <Panel variant="grow" className={className}>
          <SkillInfoPage
            skillSlug={navState.details.skillSlug}
            workspaceId={activeWorkspaceId || ''}
          />
        </Panel>
      )
    }
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">No skills configured</p>
        </div>
      </Panel>
    )
  }

  // Credentialing navigator - show dashboard or case detail
  if (isCredentialingNavigation(navState)) {
    if (navState.details?.type === 'case') {
      return wrapWithStoplight(
        <Panel variant="grow" className={className}>
          <CaseDetailPage caseId={navState.details.caseId} />
        </Panel>
      )
    }
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
          <p className="text-sm font-medium text-foreground">Select a clinician file</p>
          <p className="text-xs">Choose a case from the list to view details and run agents</p>
        </div>
      </Panel>
    )
  }

  // Fallback
  return wrapWithStoplight(
    <Panel variant="grow" className={className}>
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a view to get started</p>
      </div>
    </Panel>
  )
}
