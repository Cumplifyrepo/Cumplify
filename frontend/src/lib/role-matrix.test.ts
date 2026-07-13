import { describe, it, expect } from 'vitest';
import { normalizeRole, canApprove, canSeeAdmin, roleLabel, KNOWN_ROLES } from './role-matrix';

describe('role-matrix', () => {
  describe('normalizeRole', () => {
    it('maps PascalCase Cognito groups to kebab-case slugs', () => {
      expect(normalizeRole('QualityManager')).toBe('quality-manager');
      expect(normalizeRole('IMSLead')).toBe('management-rep');
      expect(normalizeRole('TopManagement')).toBe('top-management');
      expect(normalizeRole('EHSManager')).toBe('ehs-manager');
      expect(normalizeRole('DocumentController')).toBe('document-controller');
      expect(normalizeRole('Employee')).toBe('employee');
    });

    it('passes through already-normalized slugs', () => {
      expect(normalizeRole('quality-manager')).toBe('quality-manager');
      expect(normalizeRole('internal-auditor')).toBe('internal-auditor');
    });

    it('unknown roles pass through unchanged', () => {
      expect(normalizeRole('mystery-role')).toBe('mystery-role');
    });
  });

  describe('canApprove (per-module)', () => {
    it('quality-manager can approve M1, M2, M3, M4, M5', () => {
      expect(canApprove('quality-manager', 'M1')).toBe(true);
      expect(canApprove('quality-manager', 'M2')).toBe(true);
      expect(canApprove('quality-manager', 'M3')).toBe(true);
      expect(canApprove('quality-manager', 'M4')).toBe(true);
      expect(canApprove('quality-manager', 'M5')).toBe(true);
    });

    it('quality-manager cannot approve M8, M9, M10', () => {
      expect(canApprove('quality-manager', 'M8')).toBe(false);
      expect(canApprove('quality-manager', 'M9')).toBe(false);
      expect(canApprove('quality-manager', 'M10')).toBe(false);
    });

    it('document-controller can only approve M1', () => {
      expect(canApprove('document-controller', 'M1')).toBe(true);
      expect(canApprove('document-controller', 'M2')).toBe(false);
      expect(canApprove('document-controller', 'M3')).toBe(false);
    });

    it('internal-auditor can only approve M3', () => {
      expect(canApprove('internal-auditor', 'M3')).toBe(true);
      expect(canApprove('internal-auditor', 'M1')).toBe(false);
    });

    it('management-rep can approve all modules', () => {
      for (let i = 1; i <= 13; i++) {
        expect(canApprove('management-rep', `M${i}`)).toBe(true);
      }
    });

    it('employee can only approve M10', () => {
      expect(canApprove('employee', 'M10')).toBe(true);
      expect(canApprove('employee', 'M1')).toBe(false);
    });

    it('external-auditor cannot approve anything', () => {
      expect(canApprove('external-auditor', 'M1')).toBe(false);
      expect(canApprove('external-auditor', 'M3')).toBe(false);
    });

    it('unknown role defaults to deny', () => {
      expect(canApprove('mystery-role', 'M1')).toBe(false);
    });

    it('accepts PascalCase Cognito group names', () => {
      expect(canApprove('QualityManager', 'M2')).toBe(true);
      expect(canApprove('IMSLead', 'M5')).toBe(true);
      expect(canApprove('Employee', 'M10')).toBe(true);
      expect(canApprove('Employee', 'M1')).toBe(false);
    });
  });

  describe('canSeeAdmin', () => {
    it('admin roles can see settings', () => {
      expect(canSeeAdmin('quality-manager')).toBe(true);
      expect(canSeeAdmin('management-rep')).toBe(true);
      expect(canSeeAdmin('QualityManager')).toBe(true);
    });

    it('non-admin roles cannot see settings', () => {
      expect(canSeeAdmin('employee')).toBe(false);
      expect(canSeeAdmin('internal-auditor')).toBe(false);
      expect(canSeeAdmin('Employee')).toBe(false);
    });
  });

  describe('roleLabel', () => {
    it('converts slugs to title case', () => {
      expect(roleLabel('quality-manager')).toBe('Quality Manager');
      expect(roleLabel('QualityManager')).toBe('Quality Manager');
    });
  });

  describe('KNOWN_ROLES', () => {
    it('includes all 12 roles', () => {
      expect(KNOWN_ROLES.length).toBe(12);
    });
  });
});
