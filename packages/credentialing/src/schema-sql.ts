export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS clinicians (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  profession TEXT NOT NULL,
  npi TEXT NOT NULL,
  primaryLicenseState TEXT NOT NULL,
  primaryLicenseNumber TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facility_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  requiredDocTypes TEXT NOT NULL,
  requiredVerificationTypes TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  clinicianId TEXT NOT NULL,
  facilityId TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'offer_accepted' CHECK (
    state IN (
      'offer_accepted',
      'documents_requested',
      'documents_collected',
      'verification_in_progress',
      'verification_complete',
      'packet_assembled',
      'submitted',
      'cleared',
      'closed'
    )
  ),
  startDate TEXT,
  templateVersion INTEGER NOT NULL,
  requiredDocTypesSnapshot TEXT NOT NULL,
  requiredVerificationTypesSnapshot TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (clinicianId) REFERENCES clinicians(id) ON DELETE CASCADE,
  FOREIGN KEY (facilityId) REFERENCES facility_templates(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  docType TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'received', 'verified', 'rejected')),
  fileRef TEXT,
  metadata TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (caseId) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  verificationType TEXT NOT NULL,
  source TEXT NOT NULL,
  pass INTEGER NOT NULL CHECK (pass IN (0, 1)),
  evidence TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (caseId) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  verificationId TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'waiver')),
  reviewer TEXT NOT NULL,
  notes TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (caseId) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (verificationId) REFERENCES verifications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS case_events (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  eventType TEXT NOT NULL CHECK (
    eventType IN (
      'state_transition',
      'document_recorded',
      'verification_completed',
      'approval_recorded',
      'packet_assembled',
      'case_created',
      'case_closed'
    )
  ),
  actorType TEXT NOT NULL CHECK (actorType IN ('agent', 'human', 'system')),
  actorId TEXT NOT NULL,
  evidenceRef TEXT,
  payload TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (caseId) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cases_clinician_id ON cases(clinicianId);
CREATE INDEX IF NOT EXISTS idx_cases_facility_id ON cases(facilityId);
CREATE INDEX IF NOT EXISTS idx_cases_state ON cases(state);
CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(caseId);
CREATE INDEX IF NOT EXISTS idx_verifications_case_id ON verifications(caseId);
CREATE INDEX IF NOT EXISTS idx_case_events_case_id ON case_events(caseId);
`
