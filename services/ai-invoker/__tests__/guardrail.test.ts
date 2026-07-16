/**
 * Guardrail seat-routing tests (spec-40 Task 4, design §4.4 / BC-5).
 *
 * The doc-composer seat — and ONLY the doc-composer seat — routes to the
 * DocGenGuardrail (no PII anonymization, ACC-9). Every other seat keeps the
 * agent guardrail. A routing regression here silently redacts tenant names
 * out of generated manuals (docgen→agent) or drops PII anonymization from
 * agent traffic (agent→docgen), so both directions are pinned.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildGuardrailConfig } from '../src/guardrail.js';
import type { SeatId } from '../src/types.js';

const AGENT_SEATS: SeatId[] = [
  'workhorse',
  'lightweight',
  'guru-9001',
  'guru-14001',
  'guru-45001',
  'micro',
  'snapshot',
  'editor-ai',
  'pain-distiller',
  'legal-ledger',
];

const ENV_KEYS = [
  'GUARDRAIL_ID',
  'GUARDRAIL_VERSION',
  'DOCGEN_GUARDRAIL_ID',
  'DOCGEN_GUARDRAIL_VERSION',
] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.GUARDRAIL_ID = 'agent-guardrail-id';
  process.env.GUARDRAIL_VERSION = '1';
  process.env.DOCGEN_GUARDRAIL_ID = 'docgen-guardrail-id';
  process.env.DOCGEN_GUARDRAIL_VERSION = '2';
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('buildGuardrailConfig seat routing (BC-5)', () => {
  it('doc-composer routes to DOCGEN_GUARDRAIL_*', () => {
    expect(buildGuardrailConfig('doc-composer')).toEqual({
      guardrailIdentifier: 'docgen-guardrail-id',
      guardrailVersion: '2',
    });
  });

  it.each(AGENT_SEATS)('%s routes to the agent guardrail — never docgen', (seat) => {
    expect(buildGuardrailConfig(seat)).toEqual({
      guardrailIdentifier: 'agent-guardrail-id',
      guardrailVersion: '1',
    });
  });

  it('doc-composer with DOCGEN_GUARDRAIL_ID unset returns undefined — it must NOT fall back to the agent guardrail (that would anonymize tenant names)', () => {
    delete process.env.DOCGEN_GUARDRAIL_ID;
    expect(buildGuardrailConfig('doc-composer')).toBeUndefined();
  });

  it('agent seat with GUARDRAIL_ID unset returns undefined (dev/test)', () => {
    delete process.env.GUARDRAIL_ID;
    expect(buildGuardrailConfig('workhorse')).toBeUndefined();
  });

  it('version defaults to DRAFT per seat when its version var is unset', () => {
    delete process.env.DOCGEN_GUARDRAIL_VERSION;
    expect(buildGuardrailConfig('doc-composer')!.guardrailVersion).toBe('DRAFT');
    delete process.env.GUARDRAIL_VERSION;
    expect(buildGuardrailConfig('workhorse')!.guardrailVersion).toBe('DRAFT');
  });
});
