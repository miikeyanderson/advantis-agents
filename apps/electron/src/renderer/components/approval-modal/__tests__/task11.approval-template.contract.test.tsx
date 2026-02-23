import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import type {
  CredentialingFacilityTemplate,
  CredentialingFindingDetail,
} from '../../../../shared/types'
import { ApprovalModalContent } from '../ApprovalModal'
import { ChecklistItemEditor } from '@/components/template-editor/ChecklistItemEditor'
import { TemplateEditor } from '@/components/template-editor/TemplateEditor'

const finding: CredentialingFindingDetail = {
  verification: {
    id: 'ver-1',
    caseId: 'case-1',
    verificationType: 'oig_sam',
    source: 'mock:oig',
    pass: false,
    evidence: {
      sourceUrl: 'https://example.com/oig',
      timestamp: '2026-02-23T11:00:00.000Z',
      responseData: { hit: true },
    },
    createdAt: '2026-02-23T11:00:00.000Z',
  },
  latestApproval: null,
}

const templates: CredentialingFacilityTemplate[] = [
  {
    id: 'facility-1',
    name: 'General Hospital TX',
    jurisdiction: 'TX',
    version: 1,
    requiredDocTypes: ['rn_license', 'bls_cert'],
    requiredVerificationTypes: ['nursys', 'oig_sam'],
    createdAt: '2026-02-23T10:00:00.000Z',
    updatedAt: '2026-02-23T10:00:00.000Z',
  },
]

describe('Task 11 approval modal and template editor contracts', () => {
  it('approval modal renders finding details and decision actions', () => {
    const html = renderToStaticMarkup(
      <ApprovalModalContent
        finding={finding}
        isSubmitting={false}
        onDecision={async () => {}}
      />,
    )

    expect(html).toContain('Review Finding')
    expect(html).toContain('oig_sam')
    expect(html).toContain('Approve')
    expect(html).toContain('Reject')
    expect(html).toContain('Request Waiver')
  })

  it('checklist item editor renders add/remove controls', () => {
    const html = renderToStaticMarkup(
      <ChecklistItemEditor
        title="Required Documents"
        items={['rn_license', 'bls_cert']}
        onChange={() => {}}
      />,
    )

    expect(html).toContain('Required Documents')
    expect(html).toContain('Add Item')
    expect(html).toContain('rn_license')
    expect(html).toContain('bls_cert')
  })

  it('template editor renders template list and new template action', () => {
    const html = renderToStaticMarkup(
      <TemplateEditor
        templates={templates}
        isLoading={false}
        onRefresh={async () => {}}
        onCreateTemplate={async () => {}}
        onUpdateTemplate={async () => {}}
      />,
    )

    expect(html).toContain('Template Editor')
    expect(html).toContain('General Hospital TX')
    expect(html).toContain('New Template')
    expect(html).toContain('rn_license')
    expect(html).toContain('oig_sam')
  })
})
