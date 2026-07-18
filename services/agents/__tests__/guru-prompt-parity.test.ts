/**
 * Guru prompt parity test — ensures all three guru prompts include the
 * grounded-composition fragment (prevents drift where one is updated, others not).
 * Spec: iso-kb-content-depth, Task 3 (design §4.3).
 */

import { describe, it, expect } from 'vitest';
import { ISO9001_GURU_PROMPT } from '../guru-9001/prompt.js';
import { ISO14001_GURU_PROMPT } from '../guru-14001/prompt.js';
import { ISO45001_GURU_PROMPT } from '../guru-45001/prompt.js';

describe('guru prompt parity', () => {
  const GROUNDED_COMPOSITION_MARKER = 'Grounded Composition Rules';

  it.each([
    ['9001', ISO9001_GURU_PROMPT],
    ['14001', ISO14001_GURU_PROMPT],
    ['45001', ISO45001_GURU_PROMPT],
  ])('guru-%s includes grounded-composition fragment', (_std, prompt) => {
    expect(prompt).toContain(GROUNDED_COMPOSITION_MARKER);
  });

  it.each([
    ['9001', ISO9001_GURU_PROMPT],
    ['14001', ISO14001_GURU_PROMPT],
    ['45001', ISO45001_GURU_PROMPT],
  ])('guru-%s includes prohibited patterns section', (_std, prompt) => {
    expect(prompt).toContain('NEVER do the following (prohibited patterns)');
  });

  it.each([
    ['9001', ISO9001_GURU_PROMPT],
    ['14001', ISO14001_GURU_PROMPT],
    ['45001', ISO45001_GURU_PROMPT],
  ])('guru-%s includes licensed-uncertainty fallback', (_std, prompt) => {
    expect(prompt).toContain('The standard does not specify this');
  });
});
