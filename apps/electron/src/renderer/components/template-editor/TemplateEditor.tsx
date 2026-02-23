import * as React from 'react'
import { Plus, RefreshCcw, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CredentialingFacilityTemplate } from '../../../shared/types'
import { ChecklistItemEditor } from './ChecklistItemEditor'

type TemplateDraft = {
  name: string
  jurisdiction: string
  requiredDocTypes: string[]
  requiredVerificationTypes: string[]
}

function toDraft(template: CredentialingFacilityTemplate): TemplateDraft {
  return {
    name: template.name,
    jurisdiction: template.jurisdiction,
    requiredDocTypes: [...template.requiredDocTypes],
    requiredVerificationTypes: [...template.requiredVerificationTypes],
  }
}

export function TemplateEditor({
  templates,
  isLoading,
  onRefresh,
  onCreateTemplate,
  onUpdateTemplate,
}: {
  templates: CredentialingFacilityTemplate[]
  isLoading: boolean
  onRefresh: () => Promise<void>
  onCreateTemplate: (input: TemplateDraft) => Promise<unknown>
  onUpdateTemplate: (input: { facilityId: string } & Partial<TemplateDraft>) => Promise<unknown>
}) {
  const [drafts, setDrafts] = React.useState<Record<string, TemplateDraft>>({})
  const [newTemplate, setNewTemplate] = React.useState<TemplateDraft>({
    name: '',
    jurisdiction: '',
    requiredDocTypes: [],
    requiredVerificationTypes: [],
  })
  const [showNew, setShowNew] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, TemplateDraft> = {}
      for (const template of templates) {
        next[template.id] = prev[template.id] ?? toDraft(template)
      }
      return next
    })
  }, [templates])

  return (
    <div className="rounded-[8px] border border-border/40 bg-background shadow-minimal overflow-hidden">
      <div className="px-4 py-3 border-b border-border/30 bg-foreground/3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Template Editor</div>
          <div className="text-xs text-muted-foreground">Facility templates and required document/verification checklists</div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void onRefresh()}>
            <RefreshCcw className="size-3.5" />
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={() => setShowNew((value) => !value)}>
            <Plus className="size-3.5" />
            New Template
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {showNew ? (
          <div className="rounded-[8px] border border-border/40 p-4 space-y-3">
            <div className="text-sm font-medium">Create Template</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Facility name"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate((prev) => ({ ...prev, name: e.target.value }))}
              />
              <Input
                placeholder="Jurisdiction (TX)"
                value={newTemplate.jurisdiction}
                onChange={(e) => setNewTemplate((prev) => ({ ...prev, jurisdiction: e.target.value.toUpperCase() }))}
                maxLength={2}
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <ChecklistItemEditor
                title="Required Documents"
                items={newTemplate.requiredDocTypes}
                onChange={(items) => setNewTemplate((prev) => ({ ...prev, requiredDocTypes: items }))}
              />
              <ChecklistItemEditor
                title="Required Verifications"
                items={newTemplate.requiredVerificationTypes}
                onChange={(items) => setNewTemplate((prev) => ({ ...prev, requiredVerificationTypes: items }))}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={async () => {
                  setBusyId('new')
                  try {
                    await onCreateTemplate(newTemplate)
                    setNewTemplate({ name: '', jurisdiction: '', requiredDocTypes: [], requiredVerificationTypes: [] })
                    setShowNew(false)
                    await onRefresh()
                  } finally {
                    setBusyId(null)
                  }
                }}
                disabled={busyId !== null || !newTemplate.name || !newTemplate.jurisdiction}
              >
                Create Template
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading templates…</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-muted-foreground">No templates available.</div>
        ) : (
          templates.map((template) => {
            const draft = drafts[template.id] ?? toDraft(template)
            return (
              <div key={template.id} className="rounded-[8px] border border-border/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{template.name}</div>
                    <div className="text-xs text-muted-foreground">{template.jurisdiction} • v{template.version}</div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setBusyId(template.id)
                      try {
                        await onUpdateTemplate({
                          facilityId: template.id,
                          name: draft.name,
                          jurisdiction: draft.jurisdiction,
                          requiredDocTypes: draft.requiredDocTypes,
                          requiredVerificationTypes: draft.requiredVerificationTypes,
                        })
                        await onRefresh()
                      } finally {
                        setBusyId(null)
                      }
                    }}
                    disabled={busyId !== null}
                  >
                    <Save className="size-3.5" />
                    Save
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={draft.name}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [template.id]: { ...draft, name: e.target.value } }))}
                  />
                  <Input
                    value={draft.jurisdiction}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [template.id]: { ...draft, jurisdiction: e.target.value.toUpperCase() } }))}
                    maxLength={2}
                  />
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <ChecklistItemEditor
                    title="Required Documents"
                    items={draft.requiredDocTypes}
                    onChange={(items) => setDrafts((prev) => ({ ...prev, [template.id]: { ...draft, requiredDocTypes: items } }))}
                  />
                  <ChecklistItemEditor
                    title="Required Verifications"
                    items={draft.requiredVerificationTypes}
                    onChange={(items) => setDrafts((prev) => ({ ...prev, [template.id]: { ...draft, requiredVerificationTypes: items } }))}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
