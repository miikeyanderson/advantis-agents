import { CaseState } from './types.ts'

export interface SeedClinician {
  name: string
  profession: string
  npi: string
  primaryLicenseState: string
  primaryLicenseNumber: string
  email: string
  phone: string
}

export interface SeedCase {
  clinicianIndex: number
  facilityName: string
  facilityJurisdiction: string
  state: CaseState
  startDateOffsetDays: number | null
  requiredDocTypes: string[]
  requiredVerificationTypes: string[]
  documents: Array<{
    docType: string
    status: 'pending' | 'received' | 'verified' | 'rejected'
  }>
  verifications: Array<{
    verificationType: string
    source: string
    pass: boolean
  }>
}

export const SEED_CLINICIANS: SeedClinician[] = [
  {
    name: 'Jane Doe',
    profession: 'ICU RN',
    npi: '1111111111',
    primaryLicenseState: 'TX',
    primaryLicenseNumber: 'RN-TX-001',
    email: 'jane.doe@example.com',
    phone: '555-0001',
  },
  {
    name: 'John Smith',
    profession: 'Med-Surg RN',
    npi: '2222222222',
    primaryLicenseState: 'TX',
    primaryLicenseNumber: 'RN-TX-002',
    email: 'john.smith@example.com',
    phone: '555-0002',
  },
  {
    name: 'Sarah Johnson',
    profession: 'ED RN',
    npi: '3333333333',
    primaryLicenseState: 'CA',
    primaryLicenseNumber: 'RN-CA-001',
    email: 'sarah.johnson@example.com',
    phone: '555-0003',
  },
  {
    name: 'Mike Brown',
    profession: 'ICU RN',
    npi: '4444444444',
    primaryLicenseState: 'CA',
    primaryLicenseNumber: 'RN-CA-002',
    email: 'mike.brown@example.com',
    phone: '555-0004',
  },
  {
    name: 'Amy Chen',
    profession: 'Telemetry RN',
    npi: '5555555555',
    primaryLicenseState: 'TX',
    primaryLicenseNumber: 'RN-TX-003',
    email: 'amy.chen@example.com',
    phone: '555-0005',
  },
]

export const SEED_CASES: SeedCase[] = [
  {
    clinicianIndex: 0,
    facilityName: 'Memorial Hospital TX',
    facilityJurisdiction: 'TX',
    state: CaseState.documents_requested,
    startDateOffsetDays: 5,
    requiredDocTypes: ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check'],
    requiredVerificationTypes: ['nursys', 'oig_sam'],
    documents: [
      { docType: 'rn_license', status: 'verified' },
      { docType: 'bls_cert', status: 'verified' },
      { docType: 'tb_test', status: 'pending' },
      { docType: 'physical', status: 'received' },
      { docType: 'background_check', status: 'received' },
    ],
    verifications: [],
  },
  {
    clinicianIndex: 1,
    facilityName: 'Memorial Hospital TX',
    facilityJurisdiction: 'TX',
    state: CaseState.verification_in_progress,
    startDateOffsetDays: 7,
    requiredDocTypes: ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check'],
    requiredVerificationTypes: ['nursys', 'oig_sam'],
    documents: [
      { docType: 'rn_license', status: 'verified' },
      { docType: 'bls_cert', status: 'verified' },
      { docType: 'tb_test', status: 'verified' },
      { docType: 'physical', status: 'verified' },
      { docType: 'background_check', status: 'received' },
    ],
    verifications: [
      { verificationType: 'nursys', source: 'nursys', pass: true },
      { verificationType: 'oig_sam', source: 'oig_sam', pass: false },
    ],
  },
  {
    clinicianIndex: 2,
    facilityName: "St. Mary's Medical Center CA",
    facilityJurisdiction: 'CA',
    state: CaseState.packet_assembled,
    startDateOffsetDays: 30,
    requiredDocTypes: ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check'],
    requiredVerificationTypes: ['nursys', 'oig_sam'],
    documents: [
      { docType: 'rn_license', status: 'verified' },
      { docType: 'bls_cert', status: 'verified' },
      { docType: 'tb_test', status: 'verified' },
      { docType: 'physical', status: 'verified' },
      { docType: 'background_check', status: 'verified' },
    ],
    verifications: [
      { verificationType: 'nursys', source: 'nursys', pass: true },
      { verificationType: 'oig_sam', source: 'oig_sam', pass: true },
    ],
  },
  {
    clinicianIndex: 3,
    facilityName: 'Cedars-Sinai Medical Center CA',
    facilityJurisdiction: 'CA',
    state: CaseState.submitted,
    startDateOffsetDays: 21,
    requiredDocTypes: ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check'],
    requiredVerificationTypes: ['nursys', 'oig_sam'],
    documents: [
      { docType: 'rn_license', status: 'verified' },
      { docType: 'bls_cert', status: 'verified' },
      { docType: 'tb_test', status: 'verified' },
      { docType: 'physical', status: 'verified' },
      { docType: 'background_check', status: 'verified' },
    ],
    verifications: [
      { verificationType: 'nursys', source: 'nursys', pass: true },
      { verificationType: 'oig_sam', source: 'oig_sam', pass: true },
    ],
  },
  {
    clinicianIndex: 4,
    facilityName: 'Houston Medical Center TX',
    facilityJurisdiction: 'TX',
    state: CaseState.verification_in_progress,
    startDateOffsetDays: 45,
    requiredDocTypes: ['rn_license', 'bls_cert', 'tb_test', 'physical', 'background_check'],
    requiredVerificationTypes: ['nursys', 'oig_sam'],
    documents: [
      { docType: 'rn_license', status: 'verified' },
      { docType: 'bls_cert', status: 'verified' },
      { docType: 'tb_test', status: 'verified' },
      { docType: 'physical', status: 'received' },
      { docType: 'background_check', status: 'received' },
    ],
    verifications: [
      { verificationType: 'nursys', source: 'nursys', pass: true },
    ],
  },
]
