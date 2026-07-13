/**
 * ASK-4: Action chip URL construction.
 * Chips navigate to module pages with URL-param prefill.
 * Target FormDrawers (Phase C) consume these params.
 *
 * Exported for unit testing (chip URL construction is an ACC-2 assertion target).
 */

import type { Standard } from './ask-store';

export type ChipType = 'draftProcedure' | 'raiseNc' | 'addRisk';

interface ChipDef {
  type: ChipType;
  i18nKey: string;
  buildUrl: (standard: Standard, derived: string) => string;
}

/**
 * Derive a short title/description from the answer content for URL prefill.
 * Takes first sentence, capped at 80 chars.
 */
export function deriveTitle(answerContent: string): string {
  const firstSentence = answerContent.split(/[.!?]\s/)[0] ?? '';
  const trimmed = firstSentence.slice(0, 80).trim();
  return trimmed || '';
}

export const CHIP_DEFINITIONS: ChipDef[] = [
  {
    type: 'draftProcedure',
    i18nKey: 'ask.chipDraftProcedure',
    buildUrl: (standard, derived) =>
      `/m1?draft=1&title=${encodeURIComponent(derived)}&standard=${standard}`,
  },
  {
    type: 'raiseNc',
    i18nKey: 'ask.chipRaiseNc',
    buildUrl: (standard, derived) =>
      `/m2?raise=1&description=${encodeURIComponent(derived)}&standard=${standard}`,
  },
  {
    type: 'addRisk',
    i18nKey: 'ask.chipAddRisk',
    buildUrl: (standard, derived) =>
      `/m5?create=1&title=${encodeURIComponent(derived)}&standard=${standard}`,
  },
];

/** Build the full set of chip URLs for a given answer. */
export function buildChipUrls(
  standard: Standard,
  answerContent: string,
): Array<{ type: ChipType; url: string }> {
  const derived = deriveTitle(answerContent);
  return CHIP_DEFINITIONS.map((def) => ({
    type: def.type,
    url: def.buildUrl(standard, derived),
  }));
}
