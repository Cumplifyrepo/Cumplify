/**
 * Deterministic ISO requirements map chunker.
 * Pure function — no I/O, no side effects.
 * Spec: iso-kb-seeding, design §2.1.
 *
 * Parses docs/architecture/iso-requirements-map.md into discrete retrieval chunks,
 * one per sub-clause, with metadata aligned to the AOSS index template.
 */

import { ISO_CANON_TENANT_ID } from '../../agents/shared/constants.js';

export interface ChunkMetadata {
  tenantId: string;
  standard: 'ISO9001' | 'ISO14001' | 'ISO45001' | 'HLS';
  clauseRef: string;
  lang: string;
}

export interface Chunk {
  text: string;
  metadata: ChunkMetadata;
}

type Standard = 'ISO9001' | 'ISO14001' | 'ISO45001' | 'HLS';

interface SectionBoundary {
  standard: Standard;
  stdNum: string; // '9001', '14001', '45001', or ''
  startLine: number;
}

/**
 * Chunk the ISO requirements map markdown into retrieval units.
 * CHUNK-1a: one chunk per sub-clause (entries with (b)/(c) content).
 * CHUNK-1b: prefixed [ISO <NNNN> <clause>] for standard clauses.
 * CHUNK-1g: HLS section prefixed [Annex SL HLS] (R-4: outside citation pattern).
 */
export function chunkIsoRequirementsMap(source: string): Chunk[] {
  const lines = source.split('\n');
  const sections = identifySections(lines);
  const chunks: Chunk[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const endLine = i + 1 < sections.length ? sections[i + 1].startLine : lines.length;
    const sectionLines = lines.slice(section.startLine, endLine);

    if (section.standard === 'HLS') {
      // CHUNK-1g: single HLS chunk
      const hlsText = sectionLines.join('\n').trim();
      if (hlsText.length > 0) {
        chunks.push({
          text: `[Annex SL HLS] ${hlsText}`,
          metadata: {
            tenantId: ISO_CANON_TENANT_ID,
            standard: 'HLS',
            clauseRef: 'Annex SL HLS',
            lang: 'en',
          },
        });
      }
    } else {
      // Parse sub-clauses from standard section
      const sectionChunks = parseStandardSection(sectionLines, section.standard, section.stdNum);
      chunks.push(...sectionChunks);
    }
  }

  return chunks;
}

/**
 * Identify section boundaries by detecting section headers.
 */
function identifySections(lines: string[]): SectionBoundary[] {
  const sections: SectionBoundary[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('# Section A')) {
      sections.push({ standard: 'ISO9001', stdNum: '9001', startLine: i });
    } else if (line.startsWith('# Section B')) {
      sections.push({ standard: 'ISO14001', stdNum: '14001', startLine: i });
    } else if (line.startsWith('# Section C')) {
      sections.push({ standard: 'ISO45001', stdNum: '45001', startLine: i });
    } else if (line.startsWith('# Shared vs Standard-Specific Clauses')) {
      sections.push({ standard: 'HLS', stdNum: '', startLine: i });
    }
  }

  return sections;
}

/**
 * Parse a standard section into chunks. Each sub-clause with (b)/(c) content
 * becomes one chunk. Parent headers without (b)/(c) are skipped.
 */
function parseStandardSection(lines: string[], standard: Standard, stdNum: string): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Pattern 1: Inline bullet sub-clause — "- **X.Y.Z Title** — (b) … (c) …"
    const inlineMatch = line.match(
      /^- \*\*(\d+(?:\.\d+)+)\s+(.+?)\*\*\s*—\s*\(b\)\s*(.+)/,
    );
    if (inlineMatch) {
      const [, clauseNum, title, rest] = inlineMatch;
      // rest contains "(b) content" and possibly "(c) content" on the same line
      const bcText = extractInlineBc(rest, title);
      chunks.push(buildChunk(stdNum, clauseNum, title.trim(), bcText, standard));
      i++;
      continue;
    }

    // Pattern 2: Top-level bold heading — "**X.Y Title**" or "**X.Y Title (sub-refs)**"
    const headingMatch = line.match(/^\*\*(\d+(?:\.\d+)+)\s+(.+?)\*\*\s*$/);
    if (headingMatch) {
      const [, clauseNum, title] = headingMatch;
      // Collect following (b)/(c) lines
      const { text: bcText, linesConsumed } = collectBcLines(lines, i + 1);
      if (bcText) {
        chunks.push(buildChunk(stdNum, clauseNum, title.trim(), bcText, standard));
      }
      // Skip header line plus consumed (b)/(c) lines
      i += 1 + linesConsumed;
      continue;
    }

    i++;
  }

  return chunks;
}

/**
 * Extract (b) and (c) content from an inline bullet that has both on one line.
 * The line starts after the "— (b) " marker.
 */
function extractInlineBc(rest: string, _title: string): string {
  // rest is like: "Determine… (c) Resource register…"
  // or just: "Determine…" with (c) on a continuation
  const bcParts: string[] = [];
  const cMatch = rest.match(/^(.+?)\.\s*\(c\)\s*(.+)$/);
  if (cMatch) {
    bcParts.push(`(b) ${cMatch[1].trim()}.`);
    bcParts.push(`(c) ${cMatch[2].trim()}`);
  } else {
    bcParts.push(`(b) ${rest.trim()}`);
  }
  return bcParts.join(' ');
}

/**
 * Collect consecutive (b)/(c) lines after a heading.
 * Returns the merged text and how many lines were consumed.
 */
function collectBcLines(lines: string[], startIdx: number): { text: string; linesConsumed: number } {
  const parts: string[] = [];
  let idx = startIdx;

  while (idx < lines.length) {
    const line = lines[idx];

    // (b) line
    const bMatch = line.match(/^- \(b\)\s*(.+)/);
    if (bMatch) {
      parts.push(`(b) ${bMatch[1].trim()}`);
      idx++;
      continue;
    }

    // (c) line
    const cMatch = line.match(/^- \(c\)\s*(.+)/);
    if (cMatch) {
      parts.push(`(c) ${cMatch[1].trim()}`);
      idx++;
      continue;
    }

    // Continuation line (starts with spaces or text, not a new heading/bullet-clause)
    if (line.startsWith('  ') && parts.length > 0) {
      // Append to last part
      parts[parts.length - 1] += ' ' + line.trim();
      idx++;
      continue;
    }

    // Blank line — skip but continue looking
    if (line.trim() === '' && parts.length > 0) {
      idx++;
      continue;
    }

    // Anything else breaks the collection
    break;
  }

  return {
    text: parts.join(' '),
    linesConsumed: idx - startIdx,
  };
}

/**
 * Build a Chunk from parsed sub-clause data.
 */
function buildChunk(
  stdNum: string,
  clauseNum: string,
  title: string,
  bcText: string,
  standard: Standard,
): Chunk {
  const prefix = `[ISO ${stdNum} ${clauseNum}]`;
  return {
    text: `${prefix} ${title} — ${bcText}`,
    metadata: {
      tenantId: ISO_CANON_TENANT_ID,
      standard,
      clauseRef: `ISO ${stdNum} ${clauseNum}`,
      lang: 'en',
    },
  };
}
