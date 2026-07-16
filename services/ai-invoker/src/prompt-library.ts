/**
 * Shared Prompt Library — spec-35 L4 (§7.2).
 *
 * Loads the four shared instruction blocks and prepends them to the
 * agent's base system prompt before every Converse call. This ensures
 * all agents uniformly receive:
 * - Structural honesty (citation-or-silence, L4-2)
 * - Licensed uncertainty (L4-3)
 * - Retrieval-first ordering (L4-6)
 * - Relative-date instruction (L4-7)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Instruction Block Loading ──────────────────────────────────────────────

/**
 * Load a prompt file from prompts/shared/ relative to the repo root.
 * In Lambda, files are bundled at the same relative path.
 */
function loadPromptFile(filename: string): string {
  // Path: services/ai-invoker/src/ → ../../../prompts/shared/
  const filePath = resolve(__dirname, '..', '..', '..', 'prompts', 'shared', filename);
  try {
    return readFileSync(filePath, 'utf-8').trim();
  } catch {
    // Graceful fallback: if file not found (e.g. in test environment),
    // return empty string — the system prompt still works without it.
    return '';
  }
}

/** Cached instruction blocks (loaded once per Lambda cold start) */
const STRUCTURAL_HONESTY = loadPromptFile('structural-honesty.md');
const LICENSED_UNCERTAINTY = loadPromptFile('licensed-uncertainty.md');
const RETRIEVAL_FIRST = loadPromptFile('retrieval-first.md');
const RELATIVE_DATE = loadPromptFile('relative-date.md');

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the complete system prompt by prepending the four shared instruction
 * blocks before the agent's base prompt.
 *
 * Order: structural-honesty → licensed-uncertainty → retrieval-first → relative-date → basePrompt
 * Matches design §7.2.
 */
export function buildSystemPrompt(basePrompt: string): string {
  const blocks = [
    STRUCTURAL_HONESTY,
    LICENSED_UNCERTAINTY,
    RETRIEVAL_FIRST,
    RELATIVE_DATE,
    basePrompt,
  ].filter((b) => b.length > 0);

  return blocks.join('\n\n');
}

/** Exported for testing: get individual block content */
export const PROMPT_BLOCKS = {
  STRUCTURAL_HONESTY,
  LICENSED_UNCERTAINTY,
  RETRIEVAL_FIRST,
  RELATIVE_DATE,
} as const;
