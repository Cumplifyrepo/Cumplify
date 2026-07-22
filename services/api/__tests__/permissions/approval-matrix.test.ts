/**
 * RS-6 approval-matrix unit pins (architecture §8).
 * THE INVARIANT: the matrix NARROWS approvers; it can never widen beyond the
 * role-matrix floor nor bypass SoD — the floor check runs FIRST in the
 * approval Lambda, so a matrix entry granting a floor-denied role changes
 * nothing (pinned here at the module level and asserted in ordering).
 */

import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TABLE_NAME = 'CumplifyCore';
});
import {
  approveAllowedByMatrix,
  defaultStepsFor,
  governancePk,
  matrixSk,
  resolveArtifactType,
  type ApprovalMatrixEntry,
} from '../../src/permissions/approval-matrix.js';
import { canApprove } from '../../src/permissions/role-matrix.js';

const entry = (steps: ApprovalMatrixEntry['steps']): ApprovalMatrixEntry => ({
  artifactType: 'capa',
  standard: null,
  steps,
  version: 1,
});

describe('approval-matrix — keys', () => {
  it('builds governance PK and matrix SK (standard + ANY fallback)', () => {
    expect(governancePk('t-1')).toBe('TENANT#t-1#GOVERNANCE');
    expect(matrixSk('capa', 'ISO9001')).toBe('APPROVALMATRIX#capa#ISO9001');
    expect(matrixSk('capa', null)).toBe('APPROVALMATRIX#capa#ANY');
  });
});

describe('approval-matrix — narrowing semantics', () => {
  it('no entry → no narrowing (floor alone governs)', () => {
    expect(approveAllowedByMatrix(null, 'quality-manager')).toBe(true);
  });

  it('entry narrows: only listed approve-roles pass', () => {
    const e = entry([
      { roleSlug: 'top-management', action: 'approve' },
      { roleSlug: 'quality-manager', action: 'review' },
    ]);
    expect(approveAllowedByMatrix(e, 'top-management')).toBe(true);
    // QM is only a REVIEWER in this entry — narrowed out of approval
    expect(approveAllowedByMatrix(e, 'quality-manager')).toBe(false);
  });

  it('entry with no approve step is invalid-but-safe: falls back to no narrowing', () => {
    const e = entry([{ roleSlug: 'quality-manager', action: 'review' }]);
    expect(approveAllowedByMatrix(e, 'employee')).toBe(true);
  });

  it('THE FLOOR INVARIANT: a matrix grant to a floor-denied role cannot help — floor runs first', () => {
    // employee has no M2 write → canApprove floor already 403s before the
    // matrix is consulted; this pins the module-level facts the ordering
    // relies on.
    expect(canApprove('employee', 'M2')).toBe(false);
    const e = entry([{ roleSlug: 'employee', action: 'approve' }]);
    // matrix alone would say yes — which is exactly why enforcement order
    // (floor → SoD → matrix) is load-bearing and pinned in hitl-approval.
    expect(approveAllowedByMatrix(e, 'employee')).toBe(true);
  });
});

describe('approval-matrix — artifact-type resolution', () => {
  it('explicit artifactType wins', () => {
    expect(resolveArtifactType({ artifactType: 'audit_finding' })).toBe('audit_finding');
  });
  it('falls back to the writeback tool mapping', () => {
    expect(resolveArtifactType({ proposedAction: { tool: 'capa-open' } })).toBe('capa');
    expect(resolveArtifactType({ proposedAction: { tool: 'doc-publish' } })).toBe('document');
  });
  it('unknown → null (no narrowing applied)', () => {
    expect(resolveArtifactType({ proposedAction: { tool: 'unknown-tool' } })).toBeNull();
    expect(resolveArtifactType({})).toBeNull();
  });
});

describe('approval-matrix — Part-13 computed defaults', () => {
  it('capa defaults = roles with M2 write, as approve steps (never fabricated)', () => {
    const steps = defaultStepsFor('capa');
    const roles = steps.map((s) => s.roleSlug);
    expect(roles).toContain('quality-manager');
    expect(roles).toContain('management-rep');
    expect(roles).not.toContain('employee');
    expect(steps.every((s) => s.action === 'approve')).toBe(true);
    // every default role really holds the floor permission
    for (const r of roles) expect(canApprove(r, 'M2')).toBe(true);
  });

  it('audit_finding defaults include internal-auditor (M3 write)', () => {
    expect(defaultStepsFor('audit_finding').map((s) => s.roleSlug)).toContain('internal-auditor');
  });

  it('unknown artifact type → empty defaults', () => {
    expect(defaultStepsFor('not-a-thing')).toEqual([]);
  });
});
