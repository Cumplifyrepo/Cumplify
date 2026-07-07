-- Migration 002: M1 Document Studio tables (module-spec entity names govern)
-- 6 tables: documents, document_versions, document_approvals, document_distribution, policies, ims_scope

CREATE TABLE m1.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  standard TEXT NOT NULL CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001', 'IMS')),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('manual', 'procedure', 'work_instruction', 'policy', 'scope')),
  title TEXT NOT NULL,
  clause_refs TEXT[],
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'obsolete')),
  owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m1.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES m1.documents(id),
  tenant_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  content_ref TEXT NOT NULL,
  change_summary TEXT,
  author_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m1.document_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id UUID NOT NULL REFERENCES m1.document_versions(id),
  tenant_id TEXT NOT NULL,
  approver_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'returned')),
  approved_at TIMESTAMPTZ,
  e_signature_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m1.document_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id UUID NOT NULL REFERENCES m1.document_versions(id),
  tenant_id TEXT NOT NULL,
  audience_role TEXT NOT NULL,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m1.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  standard TEXT NOT NULL CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001')),
  policy_text TEXT NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL,
  approved_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m1.ims_scope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  scope_statement TEXT NOT NULL,
  boundaries TEXT,
  exclusions_9001 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

-- Indexes for tenant-scoped queries
CREATE INDEX idx_m1_documents_tenant ON m1.documents(tenant_id);
CREATE INDEX idx_m1_document_versions_tenant ON m1.document_versions(tenant_id);
CREATE INDEX idx_m1_document_approvals_tenant ON m1.document_approvals(tenant_id);
CREATE INDEX idx_m1_policies_tenant ON m1.policies(tenant_id);
