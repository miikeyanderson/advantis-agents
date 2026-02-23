import * as React from 'react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DashboardFacilityOption, NewCaseFormInput } from './types'

const EMPTY_FORM: NewCaseFormInput = {
  clinicianName: '',
  profession: 'RN',
  npi: '',
  primaryLicenseState: '',
  primaryLicenseNumber: '',
  email: '',
  phone: '',
  facilityId: '',
  startDate: null,
}

export function NewCaseForm({
  open,
  onOpenChange,
  facilities,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  facilities: DashboardFacilityOption[]
  onSubmit: (input: NewCaseFormInput) => Promise<unknown>
}) {
  const [form, setForm] = useState<NewCaseFormInput>(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setForm((current) => ({
        ...EMPTY_FORM,
        facilityId: current.facilityId || facilities[0]?.id || '',
      }))
    }
  }, [open, facilities])

  const setField = <K extends keyof NewCaseFormInput>(key: K, value: NewCaseFormInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await onSubmit(form)
      onOpenChange(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Case</DialogTitle>
          <DialogDescription>
            Create a credentialing case and snapshot the facility requirements.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="clinicianName">Clinician Name</Label>
              <Input id="clinicianName" value={form.clinicianName} onChange={(e) => setField('clinicianName', e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profession">Profession</Label>
              <Input id="profession" value={form.profession} onChange={(e) => setField('profession', e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="npi">NPI</Label>
              <Input id="npi" value={form.npi} onChange={(e) => setField('npi', e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={form.startDate ?? ''}
                onChange={(e) => setField('startDate', e.target.value || null)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="primaryLicenseState">Primary License State</Label>
              <Input
                id="primaryLicenseState"
                value={form.primaryLicenseState}
                onChange={(e) => setField('primaryLicenseState', e.target.value.toUpperCase())}
                maxLength={2}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="primaryLicenseNumber">Primary License Number</Label>
              <Input
                id="primaryLicenseNumber"
                value={form.primaryLicenseNumber}
                onChange={(e) => setField('primaryLicenseNumber', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Facility</Label>
            <Select
              value={form.facilityId}
              onValueChange={(value) => setField('facilityId', value)}
              disabled={facilities.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={facilities.length === 0 ? 'No templates available' : 'Select facility'} />
              </SelectTrigger>
              <SelectContent>
                {facilities.map((facility) => (
                  <SelectItem key={facility.id} value={facility.id}>
                    {facility.name} ({facility.jurisdiction})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || facilities.length === 0 || !form.facilityId}>
              {isSubmitting ? 'Creating…' : 'Create Case'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
