/**
 * Contextual grounding check module — spec-35 L1.
 *
 * Post-response ApplyGuardrail call with qualifiers:
 * - grounding_source: retrieved chunks (≤100k chars)
 * - query: user question (≤1,000 chars)
 * - unqualified: response content to guard (≤5k chars per section)
 *
 * Returns numeric scores for HITL cards + pass/blocked verdict.
 */

import {
  BedrockRuntimeClient,
  ApplyGuardrailCommand,
  type ApplyGuardrailCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { Logger } from '@aws-lambda-powertools/logger';
import type { GuardrailConfig } from './guardrail.js';

const logger = new Logger({ serviceName: 'ai-invoker-grounding' });

/** Singleton client */
let client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return client;
}

/** Reset client (for testing) */
export function resetGroundingClient(): void {
  client = null;
}

// ─── API Caps (§0.3, M-3) ──────────────────────────────────────────────────

const MAX_SOURCE_CHARS = 100_000;
const MAX_QUERY_CHARS = 1_000;
const MAX_SECTION_CHARS = 5_000;
const FALLBACK_CHUNK_SIZE = 4_000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GroundingContext {
  source: string; // concatenated retrieval chunks (≤100k)
  query: string;  // user question (≤1,000)
}

export interface GroundingResult {
  verdict: 'pass' | 'blocked';
  groundingScore: number;
  relevanceScore: number;
}

export interface Citation {
  clauseRef: string;
  sourceChunk: string;
  score: number;
}

// ─── Validation (M-3) ──────────────────────────────────────────────────────

/**
 * Validate and truncate grounding context to API caps.
 * Mutates nothing — returns a sanitized copy.
 */
export function validateGroundingContext(ctx: GroundingContext): GroundingContext {
  let source = ctx.source;
  let query = ctx.query;

  if (source.length > MAX_SOURCE_CHARS) {
    logger.warn('Grounding source exceeds 100k chars, truncating', {
      originalLength: source.length,
    });
    source = source.slice(0, MAX_SOURCE_CHARS);
  }

  if (query.length > MAX_QUERY_CHARS) {
    // Truncate at word boundary
    const truncated = query.slice(0, MAX_QUERY_CHARS);
    const lastSpace = truncated.lastIndexOf(' ');
    query = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
    logger.warn('Grounding query exceeds 1,000 chars, truncated at word boundary', {
      originalLength: ctx.query.length,
      truncatedLength: query.length,
    });
  }

  return { source, query };
}

// ─── Section Splitting (L1-6, INV-4) ────────────────────────────────────────

/**
 * Split response text into sections for grounding checks.
 * Primary: markdown headers (## / ###). Fallback: 4,000-char paragraph chunks.
 */
export function splitForGroundingCheck(text: string): string[] {
  if (text.length <= MAX_SECTION_CHARS) return [text];

  // Primary: split on ## or ### headers
  const headerSections = text.split(/(?=^#{2,3}\s)/m).filter((s) => s.trim());
  if (headerSections.length > 1) return headerSections;

  // Fallback: chunk at paragraph boundaries
  return chunkAtParagraphs(text, FALLBACK_CHUNK_SIZE);
}

/**
 * Chunk text at paragraph boundaries (\n\n), targeting chunkSize chars.
 */
export function chunkAtParagraphs(text: string, chunkSize: number): string[] {
  const paragraphs = text.split(/\n\n/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

// ─── Grounding Check (§3.3) ────────────────────────────────────────────────

/**
 * Check grounding of a response section via ApplyGuardrail.
 * Uses qualifiers to pass grounding_source and query separately.
 */
export async function checkGrounding(params: {
  guardrailConfig: GuardrailConfig;
  groundingSource: string;
  query: string;
  content: string;
}): Promise<GroundingResult> {
  const startMs = Date.now();

  const response = await getClient().send(
    new ApplyGuardrailCommand({
      guardrailIdentifier: params.guardrailConfig.guardrailIdentifier,
      guardrailVersion: params.guardrailConfig.guardrailVersion,
      source: 'OUTPUT',
      content: [
        { text: { text: params.groundingSource, qualifiers: ['grounding_source'] } },
        { text: { text: params.query, qualifiers: ['query'] } },
        { text: { text: params.content } }, // unqualified = content to guard
      ],
    }),
  );

  const latencyMs = Date.now() - startMs;
  const result = parseGroundingResponse(response);

  logger.info('Grounding check complete', {
    verdict: result.verdict,
    groundingScore: result.groundingScore,
    relevanceScore: result.relevanceScore,
    latencyMs,
  });

  return result;
}

/**
 * Parse ApplyGuardrail response to extract grounding/relevance scores and verdict.
 */
export function parseGroundingResponse(response: ApplyGuardrailCommandOutput): GroundingResult {
  const action = response.action ?? 'NONE';
  const verdict: 'pass' | 'blocked' = action === 'GUARDRAIL_INTERVENED' ? 'blocked' : 'pass';

  // Extract scores from assessments
  let groundingScore = 1.0;
  let relevanceScore = 1.0;

  const assessments = response.assessments ?? [];
  for (const assessment of assessments) {
    const filters =
      (assessment as any).contextualGroundingPolicy?.filters ?? [];
    for (const filter of filters) {
      if (filter.type === 'GROUNDING' && typeof filter.score === 'number') {
        groundingScore = filter.score;
      }
      if (filter.type === 'RELEVANCE' && typeof filter.score === 'number') {
        relevanceScore = filter.score;
      }
    }
  }

  return { verdict, groundingScore, relevanceScore };
}

// ─── Citation Construction (§4.3) ──────────────────────────────────────────

const CHUNK_DELIMITER = '\n---\n';
const CLAUSE_REF_REGEX = /\[ISO\s+(\d{4,5})\s+(\d+(?:\.\d+)*)\]/;
const MAX_CITATIONS = 5;
const CHUNK_PREVIEW_LENGTH = 200;

/**
 * Build citations from grounding source chunks post-check.
 * Splits source on delimiter, extracts clauseRef from metadata prefix,
 * assigns scores, returns top-N sorted by score.
 */
export function buildCitations(
  groundingSource: string,
  groundingScore: number,
): Citation[] {
  const chunks = groundingSource.split(CHUNK_DELIMITER).filter((c) => c.trim());
  const citations: Citation[] = [];

  for (const chunk of chunks) {
    const match = chunk.match(CLAUSE_REF_REGEX);
    const clauseRef = match ? `ISO ${match[1]} ${match[2]}` : '';

    citations.push({
      clauseRef,
      sourceChunk: chunk.slice(0, CHUNK_PREVIEW_LENGTH),
      score: groundingScore, // Per-chunk scoring requires multiple checks; use section score
    });
  }

  // Sort by score descending (for future per-chunk scoring), take top-N
  return citations
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CITATIONS);
}
