-- Migration 019: Idempotent finalize per harmonizationKey (B2, ruling C).
-- Problem: two generation runs for the same tenant produce duplicate clause
-- documents (101 docs, 48 doubled titles on dev). Root cause: insertDocument
-- does a bare INSERT with no conflict handling.
-- Fix: add harmonization_key to m1.documents + partial unique index so
-- ON CONFLICT DO UPDATE makes finalize idempotent per section identity.

ALTER TABLE m1.documents ADD COLUMN IF NOT EXISTS harmonization_key TEXT NULL;

-- Partial unique: one generated document per tenant per harmonization_key.
-- NULL harmonization_key (manually created docs) is exempt (partial index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_m1_documents_tenant_hk
  ON m1.documents (tenant_id, harmonization_key)
  WHERE harmonization_key IS NOT NULL;

-- Backfill: deduplicate existing rows (keep the latest per tenant+title+doc_type,
-- which approximates harmonization_key for pre-migration data). This is safe
-- because all current duplicates come from repeated finalize runs — same title,
-- same content, different ids. The survivor keeps the newer updated_at.
-- NOTE: Run this ONCE in dev to clean the 48 duplicates; prod has zero docs.
-- The backfill is a DO NOTHING on empty tables (staging/prod).

-- Step 1: mark survivors (latest per tenant + title + doc_type)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, title, doc_type
           ORDER BY updated_at DESC
         ) AS rn
  FROM m1.documents
)
DELETE FROM m1.documents
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: for documents that came from finalize (doc_type IN manual/procedure/
-- work_instruction), derive harmonization_key from clause_refs[1] if present.
-- This is a best-effort backfill — new runs will stamp the real key.
UPDATE m1.documents
SET harmonization_key = clause_refs[1]
WHERE doc_type IN ('manual', 'procedure', 'work_instruction')
  AND array_length(clause_refs, 1) > 0
  AND harmonization_key IS NULL;
