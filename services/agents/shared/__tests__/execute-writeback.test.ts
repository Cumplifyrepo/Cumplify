/**
 * ExecuteWriteback dispatch tests — pinned to migration schemas (H-4, Task 8R).
 *
 * Validates that dispatchToolWrite SQL matches the actual migration column definitions
 * and CHECK constraints. Tests do NOT call RDS — they validate the SQL strings
 * produced by each tool handler against the schema source-of-truth.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WRITEBACK_CODE = readFileSync(
  resolve(__dirname, '../execute-writeback.ts'), 'utf-8',
);

const MIGRATION_003 = readFileSync(
  resolve(__dirname, '../../../api/migrations/003_m2_capa.sql'), 'utf-8',
);

const MIGRATION_004 = readFileSync(
  resolve(__dirname, '../../../api/migrations/004_m3_audit_studio.sql'), 'utf-8',
);

describe('execute-writeback dispatch: schema pinning', () => {
  describe('capa-open (m2.corrective_actions)', () => {
    it('includes due_date in INSERT (NOT NULL, no default in 003)', () => {
      // Migration defines: due_date TIMESTAMPTZ NOT NULL (no DEFAULT)
      expect(MIGRATION_003).toContain('due_date TIMESTAMPTZ NOT NULL');
      expect(MIGRATION_003).not.toMatch(/due_date\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT/);
      // Writeback INSERT must include due_date
      expect(WRITEBACK_CODE).toMatch(/INSERT INTO m2\.corrective_actions.*due_date/s);
    });

    it('includes created_by in INSERT (NOT NULL in 003)', () => {
      expect(MIGRATION_003).toContain('created_by TEXT NOT NULL');
      expect(WRITEBACK_CODE).toMatch(/INSERT INTO m2\.corrective_actions.*created_by/s);
    });

    it('uses full actor identity (not hardcoded agent name) for created_by', () => {
      // M-2: should use :actor parameter, not a hardcoded 'agent:CAPAGuru'
      expect(WRITEBACK_CODE).not.toMatch(/executeCapaOpen[\s\S]*?'agent:CAPAGuru'/);
      // Should reference the actor parameter
      expect(WRITEBACK_CODE).toMatch(/executeCapaOpen[\s\S]*?:actor/);
    });
  });

  describe('audit-checklist-gen (m3.audit_checklists)', () => {
    it('includes created_by in INSERT (NOT NULL in 004)', () => {
      expect(MIGRATION_004).toContain('created_by TEXT NOT NULL');
      // The checklist INSERT must include created_by
      expect(WRITEBACK_CODE).toMatch(/INSERT INTO m3\.audit_checklists.*created_by/s);
    });
  });

  describe('audit-finding-write (m3.audit_findings)', () => {
    it('CHECK constraint uses underscore values: major_nc, minor_nc', () => {
      expect(MIGRATION_004).toContain("'major_nc'");
      expect(MIGRATION_004).toContain("'minor_nc'");
      expect(MIGRATION_004).toContain("'observation'");
      expect(MIGRATION_004).toContain("'ofi'");
    });

    it('maps hyphenated finding types to underscore at dispatch layer', () => {
      // The code must have a mapping from major-nc → major_nc
      expect(WRITEBACK_CODE).toContain("'major-nc': 'major_nc'");
      expect(WRITEBACK_CODE).toContain("'minor-nc': 'minor_nc'");
    });

    it('calls mapFindingType before SQL execution', () => {
      expect(WRITEBACK_CODE).toMatch(/executeAuditFindingWrite[\s\S]*?mapFindingType/);
    });
  });

  describe('ct-governance-write', () => {
    it('is BLOCKED-ON-DESIGN (no m1.roles_responsibilities in any migration)', () => {
      // Writeback correctly blocks ct-governance-write
      expect(WRITEBACK_CODE).toContain("BLOCKED-ON-DESIGN");
      expect(WRITEBACK_CODE).toMatch(/ct-governance-write[\s\S]*?throw new Error/);
    });
  });

  describe('dispatch switch completeness', () => {
    it('covers all HITL tools declared by handlers', () => {
      const hitlTools = [
        'capa-open',
        'capa-verify-effectiveness',
        'doc-publish',
        'doc-version-control',
        'audit-finding-write',
        'audit-checklist-gen',
        'records-retention-schedule',
        'ct-governance-write',
      ];
      for (const tool of hitlTools) {
        expect(WRITEBACK_CODE).toContain(`case '${tool}':`);
      }
    });

    it('throws on unknown tools (never silently drops)', () => {
      expect(WRITEBACK_CODE).toContain("Unknown writeback tool:");
    });
  });

  describe('DB_NAME configuration (C-3e)', () => {
    it('defaults to postgres (matching api-core DATABASE setting)', () => {
      expect(WRITEBACK_CODE).toContain("DB_NAME = process.env.DB_NAME ?? 'postgres'");
    });
  });

  describe('Aurora resume-retry (M-1)', () => {
    it('wraps BeginTransaction in withResumeRetry', () => {
      expect(WRITEBACK_CODE).toMatch(/withResumeRetry.*BeginTransactionCommand/s);
    });

    it('handles DatabaseResumingException', () => {
      expect(WRITEBACK_CODE).toContain('DatabaseResumingException');
    });
  });

  describe('Audit event emission (H-3)', () => {
    it('uses publish() from eventing publisher (not hand-rolled PutEvents)', () => {
      expect(WRITEBACK_CODE).toContain("from '../../eventing/src/publisher.js'");
      expect(WRITEBACK_CODE).toContain('await publish(');
    });

    it('uses ULID for eventId (not timestamp-based)', () => {
      expect(WRITEBACK_CODE).toContain("import { ulid } from 'ulid'");
      expect(WRITEBACK_CODE).toContain('const eventId = ulid()');
      // The eventId assignment should NOT use Date.now() or timestamp patterns
      const eventIdLine = WRITEBACK_CODE.split('\n').find(l => l.includes('const eventId ='));
      expect(eventIdLine).toContain('ulid()');
      expect(eventIdLine).not.toContain('Date.now');
    });

    it('resolves standard from proposedAction context (not hardcoded ISO9001)', () => {
      expect(WRITEBACK_CODE).toContain('resolveStandard');
      // The emit function should pass opts.standard (a variable), not a literal 'ISO9001'
      // Check that the call to publish uses opts.standard not a hardcoded string
      const emitFnBody = WRITEBACK_CODE.slice(
        WRITEBACK_CODE.indexOf('async function emitWritebackAuditEvent'),
        WRITEBACK_CODE.lastIndexOf('}'),
      );
      // The standard field in the publish call should reference opts.standard
      expect(emitFnBody).toContain('standard: opts.standard');
    });
  });
});
