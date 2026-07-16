import { describe, it, expect } from 'vitest';
import { buildChipUrls, deriveTitle, CHIP_DEFINITIONS } from './ask-chips';
import type { Standard } from './ask-store';

describe('ask-chips', () => {
  describe('deriveTitle', () => {
    it('extracts first sentence, capped at 80 chars', () => {
      const text =
        'Clause 8.5.1 requires documented procedures for production control. This includes work instructions.';
      expect(deriveTitle(text)).toBe(
        'Clause 8.5.1 requires documented procedures for production control',
      );
    });

    it('caps at 80 characters', () => {
      const longSentence = 'A'.repeat(120) + '. Second sentence.';
      expect(deriveTitle(longSentence).length).toBeLessThanOrEqual(80);
    });

    it('returns empty string for empty content', () => {
      expect(deriveTitle('')).toBe('');
    });
  });

  describe('buildChipUrls', () => {
    const answer =
      'You should create a documented procedure for clause 8.5.1 covering production control.';

    it('returns three chips for any answer', () => {
      const chips = buildChipUrls('ISO9001', answer);
      expect(chips).toHaveLength(3);
      expect(chips.map((c) => c.type)).toEqual(['draftProcedure', 'raiseNc', 'addRisk']);
    });

    it('chipDraftProcedure navigates to /m1 with draft=1, title, standard', () => {
      const chips = buildChipUrls('ISO9001', answer);
      const chip = chips.find((c) => c.type === 'draftProcedure')!;
      expect(chip.url).toContain('/m1?');
      expect(chip.url).toContain('draft=1');
      expect(chip.url).toContain('standard=ISO9001');
      expect(chip.url).toContain('title=');
    });

    it('chipRaiseNc navigates to /m2 with raise=1, description, standard', () => {
      const chips = buildChipUrls('ISO14001', answer);
      const chip = chips.find((c) => c.type === 'raiseNc')!;
      expect(chip.url).toContain('/m2?');
      expect(chip.url).toContain('raise=1');
      expect(chip.url).toContain('standard=ISO14001');
      expect(chip.url).toContain('description=');
    });

    it('chipAddRisk navigates to /m5 with create=1, title, standard', () => {
      const chips = buildChipUrls('ISO45001', answer);
      const chip = chips.find((c) => c.type === 'addRisk')!;
      expect(chip.url).toContain('/m5?');
      expect(chip.url).toContain('create=1');
      expect(chip.url).toContain('standard=ISO45001');
      expect(chip.url).toContain('title=');
    });

    it('encodes the derived title in the URL', () => {
      const answer = 'Handle dangerous chemicals & waste safely.';
      const chips = buildChipUrls('ISO14001', answer);
      const chip = chips.find((c) => c.type === 'draftProcedure')!;
      // & should be encoded
      expect(chip.url).toContain(encodeURIComponent('Handle dangerous chemicals & waste safely'));
    });

    it('uses the selected standard in all chip URLs', () => {
      const standards: Standard[] = ['ISO9001', 'ISO14001', 'ISO45001'];
      for (const std of standards) {
        const chips = buildChipUrls(std, 'Test answer');
        for (const chip of chips) {
          expect(chip.url).toContain(`standard=${std}`);
        }
      }
    });
  });

  describe('CHIP_DEFINITIONS', () => {
    it('has exactly 3 definitions', () => {
      expect(CHIP_DEFINITIONS).toHaveLength(3);
    });
  });
});
