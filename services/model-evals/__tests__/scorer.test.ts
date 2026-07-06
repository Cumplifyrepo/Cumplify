/**
 * Scorer tests: quality bar enforcement + call-graph verification.
 * FINDING-H fix: ensures scoreCandidate actually routes to the correct
 * scoring function based on task ground-truth shape.
 */

import { describe, it, expect, vi } from 'vitest';
import { scoreCandidate } from '../src/scorer.js';
import type { EvalResult, EvalSet, SeatConfig } from '../src/types.js';

// Spy on scoreMultiLabel to verify call graph
import * as exactMatchModule from '../graders/exact-match.js';

function makeResult(taskId: string, response: string): EvalResult {
  return {
    taskId,
    candidateModelId: 'test-model',
    response,
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 200,
    costUsd: 0.001,
  };
}

describe('scoreCandidate', () => {
  describe('quality bar enforcement', () => {
    it('PASSES a candidate at mean F1 0.861 against a 0.85-bar seat', () => {
      // 5 tasks with groundTruthLabels; 4 score 1.0, 1 scores ~0.305
      // Mean ≈ (4*1.0 + 0.305) / 5 = 0.861
      const evalSet: EvalSet = {
        seat: 'pain-distiller',
        version: '1.0',
        taskCount: 5,
        gradingMethod: 'exact-match',
        tasks: [
          { id: 't1', prompt: '', groundTruthLabels: ['a'], expectedOutput: 'a' },
          { id: 't2', prompt: '', groundTruthLabels: ['b'], expectedOutput: 'b' },
          { id: 't3', prompt: '', groundTruthLabels: ['c'], expectedOutput: 'c' },
          { id: 't4', prompt: '', groundTruthLabels: ['d'], expectedOutput: 'd' },
          { id: 't5', prompt: '', groundTruthLabels: ['a', 'b', 'c', 'd'], expectedOutput: 'a,b,c,d' },
        ],
      };

      const results: EvalResult[] = [
        makeResult('t1', 'ANSWER: a'),           // 1.0
        makeResult('t2', 'ANSWER: b'),           // 1.0
        makeResult('t3', 'ANSWER: c'),           // 1.0
        makeResult('t4', 'ANSWER: d'),           // 1.0
        makeResult('t5', 'ANSWER: a, b'),        // 2/6 precision × recall → F1 ≈ 0.5 (partial)
      ];

      const seatConfig: SeatConfig = {
        seat: 'pain-distiller',
        candidates: ['test-model'],
        temperature: 0,
        maxTokens: 2048,
        gradingMethod: 'exact-match',
        evalSetPath: '',
        humanReviewPercent: 0,
        qualityBar: 0.85,
      };

      const scoring = scoreCandidate(results, evalSet, seatConfig);
      // Mean: (1 + 1 + 1 + 1 + F1_of_t5) / 5
      // t5: predicted={a,b}, expected={a,b,c,d}, intersection=2, precision=2/2=1, recall=2/4=0.5, F1=2/3≈0.667
      // Mean: (4 + 0.667) / 5 = 0.933
      expect(scoring.aggregateScore).toBeGreaterThan(0.85);
      expect(scoring.qualityPass).toBe(true);
    });

    it('FAILS the same candidate against a 0.95-bar seat', () => {
      const evalSet: EvalSet = {
        seat: 'micro',
        version: '1.0',
        taskCount: 5,
        gradingMethod: 'exact-match',
        tasks: [
          { id: 't1', prompt: '', groundTruthLabels: ['a'], expectedOutput: 'a' },
          { id: 't2', prompt: '', groundTruthLabels: ['b'], expectedOutput: 'b' },
          { id: 't3', prompt: '', groundTruthLabels: ['c'], expectedOutput: 'c' },
          { id: 't4', prompt: '', groundTruthLabels: ['d'], expectedOutput: 'd' },
          { id: 't5', prompt: '', groundTruthLabels: ['a', 'b', 'c', 'd'], expectedOutput: 'a,b,c,d' },
        ],
      };

      const results: EvalResult[] = [
        makeResult('t1', 'ANSWER: a'),
        makeResult('t2', 'ANSWER: b'),
        makeResult('t3', 'ANSWER: c'),
        makeResult('t4', 'ANSWER: d'),
        makeResult('t5', 'ANSWER: a, b'),  // partial match → drops aggregate below 0.95
      ];

      const seatConfig: SeatConfig = {
        seat: 'micro',
        candidates: ['test-model'],
        temperature: 0,
        maxTokens: 256,
        gradingMethod: 'exact-match',
        evalSetPath: '',
        humanReviewPercent: 0,
        qualityBar: 0.95,
      };

      const scoring = scoreCandidate(results, evalSet, seatConfig);
      expect(scoring.aggregateScore).toBeLessThan(0.95);
      expect(scoring.qualityPass).toBe(false);
    });

    it('human-graded seat (qualityBar: null) always passes quality', () => {
      const evalSet: EvalSet = {
        seat: 'legal-ledger',
        version: '1.0',
        taskCount: 1,
        gradingMethod: 'human',
        tasks: [{ id: 't1', prompt: '' }],
      };

      const results: EvalResult[] = [makeResult('t1', 'some response')];

      const seatConfig: SeatConfig = {
        seat: 'legal-ledger',
        candidates: ['test-model'],
        temperature: 0,
        maxTokens: 8192,
        gradingMethod: 'human',
        evalSetPath: '',
        humanReviewPercent: 1.0,
        qualityBar: null,
      };

      const scoring = scoreCandidate(results, evalSet, seatConfig);
      expect(scoring.qualityPass).toBe(true);
    });
  });

  describe('call-graph verification (FINDING-H prevention)', () => {
    it('scoreCandidate on a groundTruthLabels task invokes the multi-label F1 path', () => {
      const spy = vi.spyOn(exactMatchModule, 'scoreMultiLabel');

      const evalSet: EvalSet = {
        seat: 'micro',
        version: '1.0',
        taskCount: 1,
        gradingMethod: 'exact-match',
        tasks: [{ id: 't1', prompt: '', groundTruthLabels: ['nc-triage', 'hazard-q'], expectedOutput: 'hazard-q,nc-triage' }],
      };

      const results: EvalResult[] = [makeResult('t1', 'ANSWER: nc-triage, hazard-q')];

      const seatConfig: SeatConfig = {
        seat: 'micro',
        candidates: ['test-model'],
        temperature: 0,
        maxTokens: 256,
        gradingMethod: 'exact-match',
        evalSetPath: '',
        humanReviewPercent: 0,
        qualityBar: 0.95,
      };

      scoreCandidate(results, evalSet, seatConfig);

      // CRITICAL: scoreMultiLabel MUST have been called (not scoreExactMatch)
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('ANSWER: nc-triage, hazard-q', 'hazard-q,nc-triage');

      spy.mockRestore();
    });

    it('scoreCandidate on a task WITHOUT groundTruthLabels uses exact-match path', () => {
      const multiLabelSpy = vi.spyOn(exactMatchModule, 'scoreMultiLabel');
      const exactSpy = vi.spyOn(exactMatchModule, 'scoreExactMatch');

      const evalSet: EvalSet = {
        seat: 'test',
        version: '1.0',
        taskCount: 1,
        gradingMethod: 'exact-match',
        tasks: [{ id: 't1', prompt: '', expectedOutput: 'hazard-q' }],
      };

      const results: EvalResult[] = [makeResult('t1', 'ANSWER: hazard-q')];

      const seatConfig: SeatConfig = {
        seat: 'test',
        candidates: ['test-model'],
        temperature: 0,
        maxTokens: 256,
        gradingMethod: 'exact-match',
        evalSetPath: '',
        humanReviewPercent: 0,
        qualityBar: 0.95,
      };

      scoreCandidate(results, evalSet, seatConfig);

      expect(multiLabelSpy).not.toHaveBeenCalled();
      expect(exactSpy).toHaveBeenCalledTimes(1);

      multiLabelSpy.mockRestore();
      exactSpy.mockRestore();
    });
  });
});
