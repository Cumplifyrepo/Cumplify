/**
 * Grouping matrix — GEN-3 by construction (shared/forked/standard_only ×
 * in-scope sets × exclusions). These tests pin the section-identity
 * convention (`hk` shared / `hk#standard` otherwise) that Task 7's diff
 * alignment depends on.
 */

import { describe, it, expect } from 'vitest';
import { groupSections, type RegistryClause } from '../src/grouping.js';

let n = 0;
function clause(over: Partial<RegistryClause>): RegistryClause {
  n += 1;
  return {
    id: `c-${n}`,
    standard: 'ISO9001',
    clauseNo: '4.1',
    clauseTitle: 'Context',
    intentParaphrase: 'Understand context.',
    annexSlMode: 'shared',
    harmonizationKey: '4.1',
    docType: 'procedure',
    requiredSources: [],
    sortOrder: 10,
    ...over,
  };
}

describe('grouping matrix', () => {
  it('shared: one section covering every in-scope standard with a member row', () => {
    const reg = [
      clause({ standard: 'ISO9001', harmonizationKey: '4.1' }),
      clause({ standard: 'ISO14001', harmonizationKey: '4.1' }),
      clause({ standard: 'ISO45001', harmonizationKey: '4.1' }),
    ];
    const plans = groupSections(reg, ['ISO9001', 'ISO14001', 'ISO45001'], []);
    expect(plans).toHaveLength(1);
    expect(plans[0].sectionKey).toBe('4.1');
    expect(plans[0].standards).toEqual(['ISO14001', 'ISO45001', 'ISO9001']);
    expect(plans[0].clauses).toHaveLength(3);
  });

  it('shared with a NARROWER scope: out-of-scope member rows drop out', () => {
    const reg = [
      clause({ standard: 'ISO9001', harmonizationKey: '4.1' }),
      clause({ standard: 'ISO14001', harmonizationKey: '4.1' }),
    ];
    const plans = groupSections(reg, ['ISO9001'], []);
    expect(plans).toHaveLength(1);
    expect(plans[0].standards).toEqual(['ISO9001']);
    expect(plans[0].clauses).toHaveLength(1);
  });

  it('forked: one section PER STANDARD, distinct section keys on the same spine key', () => {
    const reg = [
      clause({ standard: 'ISO9001', annexSlMode: 'forked', harmonizationKey: '8.1' }),
      clause({ standard: 'ISO14001', annexSlMode: 'forked', harmonizationKey: '8.1' }),
    ];
    const plans = groupSections(reg, ['ISO9001', 'ISO14001'], []);
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.sectionKey).sort()).toEqual(['8.1#ISO14001', '8.1#ISO9001']);
    for (const p of plans) expect(p.standards).toHaveLength(1);
  });

  it('standard_only: own section, keyed per standard', () => {
    const reg = [
      clause({
        standard: 'ISO45001',
        annexSlMode: 'standard_only',
        harmonizationKey: '8.2-emergency',
        clauseNo: '8.2',
      }),
    ];
    const plans = groupSections(reg, ['ISO45001', 'ISO9001'], []);
    expect(plans).toHaveLength(1);
    expect(plans[0].sectionKey).toBe('8.2-emergency#ISO45001');
  });

  it('standard_only clause of an OUT-of-scope standard produces no section', () => {
    const reg = [
      clause({
        standard: 'ISO45001',
        annexSlMode: 'standard_only',
        harmonizationKey: '8.2-emergency',
      }),
    ];
    expect(groupSections(reg, ['ISO9001'], [])).toHaveLength(0);
  });

  it('exclusion of ALL members → na_justified carrying the justification (never omitted)', () => {
    const reg = [
      clause({
        id: 'c-design',
        standard: 'ISO9001',
        harmonizationKey: '8.3',
        clauseNo: '8.3',
        annexSlMode: 'standard_only',
      }),
    ];
    const plans = groupSections(
      reg,
      ['ISO9001'],
      [{ clauseRegistryId: 'c-design', justification: 'No design activity — build-to-print only' }],
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].status).toBe('na_justified');
    expect(plans[0].naJustification).toContain('build-to-print');
    expect(plans[0].naJustification).toContain('ISO9001 8.3');
  });

  it('partial exclusion on a shared section: remaining members keep it pending, standards recomputed', () => {
    const reg = [
      clause({ id: 'c-a', standard: 'ISO9001', harmonizationKey: '6.1' }),
      clause({ id: 'c-b', standard: 'ISO14001', harmonizationKey: '6.1' }),
    ];
    const plans = groupSections(
      reg,
      ['ISO9001', 'ISO14001'],
      [{ clauseRegistryId: 'c-b', justification: 'excluded' }],
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].status).toBe('pending');
    expect(plans[0].standards).toEqual(['ISO9001']);
    expect(plans[0].clauses.map((c) => c.id)).toEqual(['c-a']);
  });

  it('output is ordered by sortOrder then sectionKey (stable assembly order)', () => {
    const reg = [
      clause({ harmonizationKey: '9.1', sortOrder: 91 }),
      clause({ harmonizationKey: '4.1', sortOrder: 41 }),
      clause({ harmonizationKey: '7.5', sortOrder: 75 }),
    ];
    const plans = groupSections(reg, ['ISO9001'], []);
    expect(plans.map((p) => p.sectionKey)).toEqual(['4.1', '7.5', '9.1']);
  });
});
