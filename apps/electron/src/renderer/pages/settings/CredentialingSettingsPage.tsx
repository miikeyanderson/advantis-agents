import * as React from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DetailsPageMeta } from '@/lib/navigation-registry'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'credentialing',
}

interface SettingsSectionProps {
  title: string
  description: string
  badge?: string
}

function SettingsSection({ title, description, badge }: SettingsSectionProps) {
  return (
    <div className="rounded-[10px] border border-border/40 bg-background shadow-minimal p-5">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {badge && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-xs font-medium bg-muted text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

export default function CredentialingSettingsPage() {
  return (
    <div className="h-full flex flex-col min-w-0 overflow-hidden">
      <PanelHeader title="Credentialing Settings" />
      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-2xl p-6 space-y-4">
          <SettingsSection
            title="User Profile"
            description="Configure your identity as a credentialing coordinator. Set your name, title, and contact information shown on submissions."
            badge="Coming in v2"
          />
          <SettingsSection
            title="Notifications"
            description="Control alerts for at-risk files, blocked verifications, upcoming start dates, and agent activity summaries."
            badge="Coming in v2"
          />
          <SettingsSection
            title="Default View"
            description="Choose which status filter is shown when you open the credentialing navigator. Defaults to All Files."
            badge="Coming in v2"
          />
          <SettingsSection
            title="Integrations"
            description="Connect external systems for automated verification lookups, NPDB queries, and facility roster sync."
            badge="Not Connected"
          />
        </div>
      </ScrollArea>
    </div>
  )
}
