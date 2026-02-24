import type { UiStatusBucket, DocumentChecklistItem } from '../../../shared/types'

export const STATUS_BADGE_CLASSES: Record<UiStatusBucket, { label: string; color: string; bg: string }> = {
  'at-risk':            { label: 'At Risk',            color: 'text-destructive',      bg: 'bg-destructive/10' },
  'blocked':            { label: 'Blocked',            color: 'text-info',             bg: 'bg-info/10' },
  'pending-submission': { label: 'Pending Submission', color: 'text-muted-foreground', bg: 'bg-foreground/5' },
  'with-facility':      { label: 'With Facility',      color: 'text-accent',           bg: 'bg-accent/10' },
  'active':             { label: 'Active',             color: 'text-success',          bg: 'bg-success/10' },
  'cleared':            { label: 'Cleared',            color: 'text-muted-foreground', bg: 'bg-foreground/5' },
}

export const STATUS_ICON_CLASSES: Record<UiStatusBucket, string> = {
  'at-risk':            'text-destructive',
  'blocked':            'text-info',
  'pending-submission': 'text-muted-foreground',
  'with-facility':      'text-accent',
  'active':             'text-success',
  'cleared':            'text-muted-foreground',
}

export const STATUS_BANNER_CLASSES: Record<UiStatusBucket, { color: string; banner: string }> = {
  'at-risk':            { color: 'text-destructive',      banner: 'bg-destructive/10 border-destructive/20' },
  'blocked':            { color: 'text-info',             banner: 'bg-info/10 border-info/20' },
  'pending-submission': { color: 'text-muted-foreground', banner: 'bg-foreground/5 border-foreground/10' },
  'with-facility':      { color: 'text-accent',           banner: 'bg-accent/10 border-accent/20' },
  'active':             { color: 'text-success',          banner: 'bg-success/10 border-success/20' },
  'cleared':            { color: 'text-muted-foreground', banner: 'bg-muted/40 border-border' },
}

export const URGENCY_CLASSES: Record<string, string> = {
  high:   'text-destructive',
  medium: 'text-info',
  low:    'text-muted-foreground',
}

export const DOC_STATUS_CLASSES: Record<DocumentChecklistItem['status'], { label: string; color: string; dot: string }> = {
  pending:  { label: 'Pending',  color: 'text-muted-foreground', dot: 'bg-muted-foreground/40' },
  received: { label: 'Received', color: 'text-accent',           dot: 'bg-accent' },
  verified: { label: 'Verified', color: 'text-success',          dot: 'bg-success' },
  rejected: { label: 'Rejected', color: 'text-destructive',      dot: 'bg-destructive' },
}

export const PASS_FAIL_CLASSES = {
  pass: { text: 'text-success', dot: 'bg-success' },
  fail: { text: 'text-destructive', dot: 'bg-destructive' },
}
