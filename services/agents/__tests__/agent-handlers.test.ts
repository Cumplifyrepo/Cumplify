/**
 * Per-agent handler unit tests (H-4, Task 8R).
 * Verifies: each handler passes invokeFn to toolLoop, uses correct HITL tools,
 * correct agent/module/feature, and does NOT import invoke() from ai-invoker.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const AGENTS_DIR = resolve(__dirname, '..');

const SQS_AGENTS = [
  {
    dir: 'capa-guru',
    agent: 'CAPAGuru',
    module: 'M2',
    hitlTools: ['capa-open', 'capa-verify-effectiveness'],
  },
  {
    dir: 'doc-studio',
    agent: 'DocStudio',
    module: 'M1',
    hitlTools: ['doc-publish', 'doc-version-control'],
  },
  {
    dir: 'lead-auditor',
    agent: 'LeadAuditor',
    module: 'M3',
    hitlTools: ['audit-finding-write', 'audit-checklist-gen'],
  },
  {
    dir: 'control-tower',
    agent: 'ControlTower',
    module: 'cross-standard',
    hitlTools: ['ct-governance-write'],
  },
  {
    dir: 'records-vault',
    agent: 'RecordsVault',
    module: 'M4',
    hitlTools: ['records-retention-schedule'],
  },
];

const GURU_AGENTS = [
  { dir: 'guru-9001', agent: 'ISO9001Guru' },
  { dir: 'guru-14001', agent: 'ISO14001Guru' },
  { dir: 'guru-45001', agent: 'ISO45001Guru' },
];

describe('SQS consumer agent handlers (C-1 compliance)', () => {
  for (const { dir, agent, hitlTools } of SQS_AGENTS) {
    describe(agent, () => {
      const handlerCode = readFileSync(resolve(AGENTS_DIR, dir, 'handler.ts'), 'utf-8');

      it('imports createInvokeFn from invoke-transport (NOT invoke from ai-invoker)', () => {
        expect(handlerCode).toContain("from '../shared/invoke-transport.js'");
        expect(handlerCode).not.toContain("from '../../ai-invoker/src/index.js'");
      });

      it('passes invokeFn to toolLoop', () => {
        expect(handlerCode).toContain('invokeFn');
        // Must appear inside the toolLoop opts object
        expect(handlerCode).toMatch(/toolLoop\([\s\S]*invokeFn/);
      });

      it(`declares HITL tools: ${hitlTools.join(', ')}`, () => {
        for (const tool of hitlTools) {
          expect(handlerCode).toContain(`'${tool}'`);
        }
      });

      it(`sets agent = '${agent}'`, () => {
        expect(handlerCode).toContain(`agent: '${agent}'`);
      });
    });
  }
});

describe('Guru agent handlers (C-1 compliance)', () => {
  for (const { dir, agent } of GURU_AGENTS) {
    describe(agent, () => {
      const handlerCode = readFileSync(resolve(AGENTS_DIR, dir, 'handler.ts'), 'utf-8');

      it('imports createInvokeFn from invoke-transport (NOT invoke from ai-invoker)', () => {
        expect(handlerCode).toContain("from '../shared/invoke-transport.js'");
        expect(handlerCode).not.toContain("from '../../ai-invoker/src/index.js'");
      });

      it('does NOT import invoke() directly', () => {
        // Should not have a bare `import { invoke }` from ai-invoker
        expect(handlerCode).not.toMatch(
          /import\s*\{[^}]*invoke[^}]*\}\s*from\s*['"]\.\.\/\.\.\/ai-invoker/,
        );
      });

      it('uses invokeFn (Lambda transport) for model calls', () => {
        expect(handlerCode).toContain('invokeFn');
      });
    });
  }
});

describe('No direct ai-invoker import across all agents/', () => {
  const allDirs = [...SQS_AGENTS.map((a) => a.dir), ...GURU_AGENTS.map((a) => a.dir)];

  it('NEGATIVE: no handler.ts imports invoke from ai-invoker/src/index', () => {
    const violations: string[] = [];
    for (const dir of allDirs) {
      const code = readFileSync(resolve(AGENTS_DIR, dir, 'handler.ts'), 'utf-8');
      if (code.includes("from '../../ai-invoker/src/index.js'")) {
        violations.push(`${dir}/handler.ts: imports directly from ai-invoker`);
      }
    }
    expect(violations).toEqual([]);
  });
});
