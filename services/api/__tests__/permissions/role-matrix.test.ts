import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canApprove,
  getApprovalModules,
  KNOWN_ROLES,
  normalizeRole,
  resolveModule,
  TOOL_MODULES,
} from '../../src/permissions/role-matrix.js';

describe('role-matrix', () => {
  describe('canApprove', () => {
    it('management-rep can approve all M1–M13', () => {
      for (let i = 1; i <= 13; i++) {
        expect(canApprove('management-rep', `M${i}`)).toBe(true);
      }
    });

    it('quality-manager can approve M1,M2,M3,M4,M5,M7,M11,M12,M13', () => {
      const expected = ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M11', 'M12', 'M13'];
      for (const m of expected) {
        expect(canApprove('quality-manager', m), `quality-manager → ${m}`).toBe(true);
      }
      expect(canApprove('quality-manager', 'M6')).toBe(false);
      expect(canApprove('quality-manager', 'M8')).toBe(false);
      expect(canApprove('quality-manager', 'M9')).toBe(false);
      expect(canApprove('quality-manager', 'M10')).toBe(false);
    });

    it('ehs-manager can approve M5,M7,M8,M9,M10,M11', () => {
      const expected = ['M5', 'M7', 'M8', 'M9', 'M10', 'M11'];
      for (const m of expected) {
        expect(canApprove('ehs-manager', m), `ehs-manager → ${m}`).toBe(true);
      }
      expect(canApprove('ehs-manager', 'M1')).toBe(false);
      expect(canApprove('ehs-manager', 'M2')).toBe(false);
    });

    it('document-controller can approve M1 only', () => {
      expect(canApprove('document-controller', 'M1')).toBe(true);
      expect(canApprove('document-controller', 'M2')).toBe(false);
      expect(canApprove('document-controller', 'M3')).toBe(false);
    });

    it('internal-auditor can approve M3 only', () => {
      expect(canApprove('internal-auditor', 'M3')).toBe(true);
      expect(canApprove('internal-auditor', 'M1')).toBe(false);
      expect(canApprove('internal-auditor', 'M5')).toBe(false);
    });

    it('external-auditor cannot approve anything', () => {
      for (let i = 1; i <= 13; i++) {
        expect(canApprove('external-auditor', `M${i}`)).toBe(false);
      }
    });

    it('employee can approve M10 only (incident reporting)', () => {
      expect(canApprove('employee', 'M10')).toBe(true);
      expect(canApprove('employee', 'M1')).toBe(false);
    });

    it('top-management can approve M1 only (policies)', () => {
      expect(canApprove('top-management', 'M1')).toBe(true);
      expect(canApprove('top-management', 'M2')).toBe(false);
    });

    it('unknown role returns false', () => {
      expect(canApprove('nonexistent-role', 'M1')).toBe(false);
    });

    it('unknown module returns false', () => {
      expect(canApprove('management-rep', 'M99')).toBe(false);
    });
  });

  describe('getApprovalModules', () => {
    it('returns empty array for unknown role', () => {
      expect(getApprovalModules('fake')).toEqual([]);
    });

    it('returns 13 modules for management-rep', () => {
      expect(getApprovalModules('management-rep')).toHaveLength(13);
    });
  });

  describe('KNOWN_ROLES', () => {
    it('contains 12 roles', () => {
      expect(KNOWN_ROLES).toHaveLength(12);
    });

    it('includes expected roles', () => {
      expect(KNOWN_ROLES).toContain('quality-manager');
      expect(KNOWN_ROLES).toContain('ehs-manager');
      expect(KNOWN_ROLES).toContain('employee');
      expect(KNOWN_ROLES).toContain('partner-consultant');
    });
  });

  describe('normalizeRole (BUG-11a: Cognito group names vs matrix slugs)', () => {
    // Every group IdentityStack deploys (identity-stack.ts groups list) must
    // resolve to a matrix key — PreTokenGen stamps the group name verbatim.
    const DEPLOYED_GROUPS = [
      'TopManagement',
      'IMSLead',
      'QualityManager',
      'EHSManager',
      'DocumentController',
    ];

    it('maps every deployed Cognito group to a known matrix role', () => {
      for (const g of DEPLOYED_GROUPS) {
        expect(KNOWN_ROLES, `group ${g} → ${normalizeRole(g)}`).toContain(normalizeRole(g));
      }
    });

    it('IMSLead is Part 13 Role 2 (management-rep), not a naive kebab-casing', () => {
      expect(normalizeRole('IMSLead')).toBe('management-rep');
    });

    it('maps the PreTokenGen no-group fallback', () => {
      expect(normalizeRole('Employee')).toBe('employee');
    });

    it('passes matrix slugs through unchanged', () => {
      for (const r of KNOWN_ROLES) expect(normalizeRole(r)).toBe(r);
    });

    it('canApprove accepts raw group names (the live claim shape)', () => {
      expect(canApprove('QualityManager', 'M2')).toBe(true);
      expect(canApprove('IMSLead', 'M13')).toBe(true);
      expect(canApprove('Employee', 'M2')).toBe(false);
      expect(canApprove('Employee', 'M10')).toBe(true);
    });

    it('unknown roles still deny', () => {
      expect(canApprove('Hacker', 'M1')).toBe(false);
      expect(canApprove('', 'M1')).toBe(false);
    });
  });

  describe('resolveModule + TOOL_MODULES (BUG-11b: items carry no module field)', () => {
    it('prefers an explicit module field', () => {
      expect(resolveModule({ module: 'M5', proposedAction: { tool: 'capa-open' } })).toBe('M5');
    });

    it('resolves the module from the proposed tool when module is absent', () => {
      expect(resolveModule({ proposedAction: { tool: 'capa-open' } })).toBe('M2');
      expect(resolveModule({ proposedAction: { tool: 'doc-version-control' } })).toBe('M1');
      expect(resolveModule({ proposedAction: { tool: 'audit-checklist-gen' } })).toBe('M3');
      expect(resolveModule({ proposedAction: { tool: 'records-retention-schedule' } })).toBe('M4');
    });

    it("unknown tools resolve to 'unknown' (denies for every role)", () => {
      expect(resolveModule({ proposedAction: { tool: 'not-a-tool' } })).toBe('unknown');
      expect(resolveModule({})).toBe('unknown');
      for (const r of KNOWN_ROLES) expect(canApprove(r, 'unknown')).toBe(false);
    });

    it('every tool in the writeback dispatch has a module mapping (sync pin)', () => {
      // Ground truth: the switch(action.tool) cases in execute-writeback.ts.
      // If a tool is added there without a TOOL_MODULES entry, its approvals
      // silently 403 — this pin fails the build instead.
      const src = readFileSync(
        join(__dirname, '../../../agents/shared/execute-writeback.ts'),
        'utf8',
      );
      const tools = [...src.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1]);
      expect(tools.length).toBeGreaterThanOrEqual(8);
      for (const t of tools) {
        expect(TOOL_MODULES[t], `tool '${t}' missing from TOOL_MODULES`).toBeDefined();
      }
    });

    it('every TOOL_MODULES value is a module some role can approve', () => {
      for (const [tool, mod] of Object.entries(TOOL_MODULES)) {
        expect(canApprove('management-rep', mod), `${tool} → ${mod}`).toBe(true);
      }
    });
  });
});
