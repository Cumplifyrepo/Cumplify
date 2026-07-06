import { describe, it, expect } from 'vitest';
import { scoreExactMatch, computeF1, computeSetF1, scoreMultiLabel } from '../graders/exact-match.js';
import { scoreSchemaValidation } from '../graders/schema-validator.js';
import { scoreClauseCitation } from '../graders/clause-citation.js';
import { aggregateRubricScores, type RubricScore } from '../graders/rubric.js';

describe('exact-match grader', () => {
  describe('scoreExactMatch (with ANSWER: line protocol)', () => {
    it('returns 1.0 for correct answer line (case-insensitive)', () => {
      expect(scoreExactMatch('Some reasoning...\nANSWER: hazard-q', 'HAZARD-Q')).toBe(1.0);
    });

    it('returns 0.0 for mismatch in answer line', () => {
      expect(scoreExactMatch('ANSWER: nc-triage', 'hazard-q')).toBe(0.0);
    });

    it('returns 0.0 when no ANSWER: line present', () => {
      expect(scoreExactMatch('The answer is hazard-q based on rule R-4.', 'hazard-q')).toBe(0.0);
    });

    it('uses the LAST ANSWER: line when multiple exist', () => {
      expect(scoreExactMatch('ANSWER: wrong\nMore text\nANSWER: hazard-q', 'hazard-q')).toBe(1.0);
    });

    it('ignores prose mentioning the correct label if not in ANSWER: line', () => {
      expect(scoreExactMatch('Based on R-4, hazard-q is the target.\nANSWER: nc-triage', 'hazard-q')).toBe(0.0);
    });
  });

  describe('computeF1', () => {
    it('computes perfect accuracy', () => {
      const result = computeF1(['a', 'b', 'c'], ['a', 'b', 'c']);
      expect(result.accuracy).toBe(1.0);
      expect(result.f1).toBe(1.0);
    });

    it('computes partial accuracy', () => {
      const result = computeF1(['a', 'b', 'x'], ['a', 'b', 'c']);
      expect(result.accuracy).toBeCloseTo(2 / 3);
    });

    it('computes zero accuracy', () => {
      const result = computeF1(['x', 'y', 'z'], ['a', 'b', 'c']);
      expect(result.accuracy).toBe(0);
    });

    it('throws on length mismatch', () => {
      expect(() => computeF1(['a'], ['a', 'b'])).toThrow();
    });
  });
});

describe('multi-label set F1 grader', () => {
  it('returns 1.0 for exact match on 4-queue event', () => {
    expect(computeSetF1(
      'audit-sink, capa-intake, records-q, review-fanout',
      'audit-sink,capa-intake,records-q,review-fanout',
    )).toBe(1.0);
  });

  it('returns 1.0 for single-queue event', () => {
    expect(computeSetF1('nc-triage', 'nc-triage')).toBe(1.0);
  });

  it('returns 1.0 for "none" match', () => {
    expect(computeSetF1('none', 'none')).toBe(1.0);
  });

  it('returns 0.0 when predicted and expected have no overlap', () => {
    expect(computeSetF1('hazard-q', 'nc-triage')).toBe(0.0);
  });

  it('returns partial F1 for partial overlap', () => {
    // predicted: {audit-sink, capa-intake}, expected: {audit-sink, capa-intake, records-q, review-fanout}
    // intersection=2, precision=2/2=1, recall=2/4=0.5, F1=2*1*0.5/(1+0.5)=0.667
    const f1 = computeSetF1('audit-sink, capa-intake', 'audit-sink,capa-intake,records-q,review-fanout');
    expect(f1).toBeCloseTo(2 / 3, 3);
  });

  it('penalizes extra predictions', () => {
    // predicted: {nc-triage, hazard-q}, expected: {nc-triage}
    // intersection=1, precision=1/2=0.5, recall=1/1=1, F1=2*0.5*1/(0.5+1)=0.667
    const f1 = computeSetF1('nc-triage, hazard-q', 'nc-triage');
    expect(f1).toBeCloseTo(2 / 3, 3);
  });

  it('scoreMultiLabel parses ANSWER: line and computes set-F1', () => {
    expect(scoreMultiLabel('Reasoning here...\nANSWER: audit-sink', 'audit-sink')).toBe(1.0);
    expect(scoreMultiLabel('No answer line here', 'audit-sink')).toBe(0.0);
  });

  it('scoreMultiLabel normalizes and dedupes labels from ANSWER: line', () => {
    expect(scoreMultiLabel('ANSWER: Audit-Sink, AUDIT-SINK, records-q', 'audit-sink,records-q')).toBe(1.0);
  });
});

describe('schema-validator grader', () => {
  it('returns 1.0 for valid JSON with all required fields', () => {
    const response = JSON.stringify({ name: 'test', status: 'open', priority: 'high' });
    const schema = { name: 'string', status: 'string', priority: 'string' };
    expect(scoreSchemaValidation(response, schema)).toBe(1.0);
  });

  it('returns partial credit for missing fields', () => {
    const response = JSON.stringify({ name: 'test' });
    const schema = { name: 'string', status: 'string', priority: 'string' };
    expect(scoreSchemaValidation(response, schema)).toBeCloseTo(1 / 3);
  });

  it('returns 0.0 for invalid JSON', () => {
    expect(scoreSchemaValidation('not json at all', { field: 'string' })).toBe(0);
  });

  it('extracts JSON from markdown code blocks', () => {
    const response = '```json\n{"name": "test", "status": "done"}\n```';
    const schema = { name: 'string', status: 'string' };
    expect(scoreSchemaValidation(response, schema)).toBe(1.0);
  });

  it('returns 1.0 when schema has no required fields', () => {
    expect(scoreSchemaValidation('{}', {})).toBe(1.0);
  });
});

describe('clause-citation grader', () => {
  it('returns 1.0 when all expected clauses are cited', () => {
    const response = 'Per ISO 9001 clause 10.2, nonconformity and corrective action requires...';
    expect(scoreClauseCitation(response, ['ISO 9001 10.2'])).toBe(1.0);
  });

  it('returns partial credit for partially cited clauses', () => {
    const response = 'Clause 10.2 applies here but clause 6.1 is also relevant.';
    expect(scoreClauseCitation(response, ['ISO 9001 10.2', 'ISO 9001 8.1', 'ISO 9001 6.1'])).toBeCloseTo(2 / 3);
  });

  it('returns 0.0 when no clauses are cited', () => {
    const response = 'The organization should do things properly.';
    expect(scoreClauseCitation(response, ['ISO 9001 10.2', 'ISO 14001 6.1.3'])).toBe(0);
  });

  it('returns 1.0 for empty expected clauses', () => {
    expect(scoreClauseCitation('anything', [])).toBe(1.0);
  });

  it('matches sub-clause numbers like 6.1.3', () => {
    const response = 'According to 6.1.3, legal and other requirements must be identified.';
    expect(scoreClauseCitation(response, ['ISO 45001 6.1.3'])).toBe(1.0);
  });
});

describe('rubric grader', () => {
  it('aggregates scores and passes when mean >= 4.0', () => {
    const scores: RubricScore[] = [
      { taskId: 't1', candidateModelId: 'm1', dimensions: { accuracy: 5, completeness: 4 }, gradedBy: 'architect', gradedAt: '2026-07-05' },
      { taskId: 't2', candidateModelId: 'm1', dimensions: { accuracy: 4, completeness: 4 }, gradedBy: 'architect', gradedAt: '2026-07-05' },
    ];
    const result = aggregateRubricScores(scores);
    expect(result.meanScore).toBe(4.25);
    expect(result.qualityPass).toBe(true);
    expect(result.hasCatastrophicFailure).toBe(false);
  });

  it('fails when mean < 4.0', () => {
    const scores: RubricScore[] = [
      { taskId: 't1', candidateModelId: 'm1', dimensions: { accuracy: 3, completeness: 3 }, gradedBy: 'architect', gradedAt: '2026-07-05' },
    ];
    const result = aggregateRubricScores(scores);
    expect(result.meanScore).toBe(3.0);
    expect(result.qualityPass).toBe(false);
  });

  it('fails on catastrophic failure (any dimension = 1)', () => {
    const scores: RubricScore[] = [
      { taskId: 't1', candidateModelId: 'm1', dimensions: { accuracy: 5, completeness: 1 }, gradedBy: 'architect', gradedAt: '2026-07-05' },
      { taskId: 't2', candidateModelId: 'm1', dimensions: { accuracy: 5, completeness: 5 }, gradedBy: 'architect', gradedAt: '2026-07-05' },
    ];
    const result = aggregateRubricScores(scores);
    expect(result.meanScore).toBe(4.0);
    expect(result.hasCatastrophicFailure).toBe(true);
    expect(result.qualityPass).toBe(false); // catastrophic failure overrides mean
  });

  it('handles empty scores array', () => {
    const result = aggregateRubricScores([]);
    expect(result.meanScore).toBe(0);
    expect(result.qualityPass).toBe(false);
  });
});
