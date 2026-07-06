/**
 * Shape-validation test: loads ALL eval-set files and asserts every task's
 * fields match the EvalTask type contract.
 *
 * This is the typecheck that would have prevented truth incidents #5 and #7:
 * - expectedOutput must be a string (or absent)
 * - expectedSchema must be an object with required[] and properties{} (or absent)
 * - groundTruthLabels must be a string array (or absent)
 * - expectedClauses must be a string array (or absent)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVAL_SETS_DIR = resolve(__dirname, '../data/eval-sets');

describe('eval-set shape validation (all files)', () => {
  const files = readdirSync(EVAL_SETS_DIR).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    describe(file, () => {
      const filePath = resolve(EVAL_SETS_DIR, file);
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));

      it('has valid top-level fields', () => {
        expect(typeof data.seat).toBe('string');
        expect(typeof data.version).toBe('string');
        expect(typeof data.taskCount).toBe('number');
        expect(typeof data.gradingMethod).toBe('string');
        expect(Array.isArray(data.tasks)).toBe(true);
        expect(data.tasks.length).toBe(data.taskCount);
      });

      it('every task has id (string) and prompt (string)', () => {
        for (const task of data.tasks) {
          expect(typeof task.id).toBe('string');
          expect(typeof task.prompt).toBe('string');
          expect(task.prompt.length).toBeGreaterThan(0);
        }
      });

      it('expectedOutput, if present, is a string (never an object)', () => {
        for (const task of data.tasks) {
          if ('expectedOutput' in task) {
            expect(typeof task.expectedOutput).toBe('string');
          }
        }
      });

      it('expectedSchema, if present, is an object with required[] and properties{}', () => {
        for (const task of data.tasks) {
          if ('expectedSchema' in task) {
            expect(typeof task.expectedSchema).toBe('object');
            expect(task.expectedSchema).not.toBeNull();
            expect(Array.isArray(task.expectedSchema.required)).toBe(true);
            expect(task.expectedSchema.required.length).toBeGreaterThan(0);
            expect(typeof task.expectedSchema.properties).toBe('object');
            // Every required field has a property definition
            for (const field of task.expectedSchema.required) {
              expect(typeof field).toBe('string');
              expect(task.expectedSchema.properties[field]).toBeDefined();
            }
          }
        }
      });

      it('groundTruthLabels, if present, is a string array', () => {
        for (const task of data.tasks) {
          if ('groundTruthLabels' in task) {
            expect(Array.isArray(task.groundTruthLabels)).toBe(true);
            for (const label of task.groundTruthLabels) {
              expect(typeof label).toBe('string');
            }
          }
        }
      });

      it('expectedClauses, if present, is a string array', () => {
        for (const task of data.tasks) {
          if ('expectedClauses' in task) {
            expect(Array.isArray(task.expectedClauses)).toBe(true);
            for (const clause of task.expectedClauses) {
              expect(typeof clause).toBe('string');
            }
          }
        }
      });
    });
  }
});
