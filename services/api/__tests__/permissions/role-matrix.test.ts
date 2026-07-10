import { describe, it, expect } from 'vitest';
import { canApprove, getApprovalModules, KNOWN_ROLES } from '../../src/permissions/role-matrix.js';

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
});
