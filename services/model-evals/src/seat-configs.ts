/**
 * Per-seat configuration: candidates, temperature, maxTokens, grading method.
 * Per design §5 temperature policy + §9.4 maxTokens + requirements §5 candidates.
 */

import type { SeatConfig } from './types.js';

export const SEAT_CONFIGS: Record<string, SeatConfig> = {
  guru: {
    seat: 'guru',
    candidates: [
      'zai.glm-5',
      'deepseek.v3.2',
      'qwen.qwen3-next-80b-a3b',
      'moonshotai.kimi-k2.5',
      'us.amazon.nova-pro-v1:0',
    ],
    temperature: 0,
    maxTokens: 2048,
    gradingMethod: 'clause-citation',
    evalSetPath: 'data/eval-sets/guru-iso9001.json', // runner iterates all 3
    humanReviewPercent: 0.2,
  },
  workhorse: {
    seat: 'workhorse',
    candidates: [
      'us.amazon.nova-pro-v1:0',
      'deepseek.v3.2',
      'qwen.qwen3-next-80b-a3b',
      'zai.glm-4.7',
      'minimax.minimax-m2.5',
    ],
    temperature: 0,
    maxTokens: 4096,
    gradingMethod: 'schema-validation',
    evalSetPath: 'data/eval-sets/workhorse.json',
    humanReviewPercent: 0.3,
  },
  lightweight: {
    seat: 'lightweight',
    candidates: [
      'us.amazon.nova-lite-v1:0',
      'us.amazon.nova-2-lite-v1:0',
      'zai.glm-4.7-flash',
      'qwen.qwen3-32b-v1:0',
    ],
    temperature: 0,
    maxTokens: 1024,
    gradingMethod: 'schema-validation',
    evalSetPath: 'data/eval-sets/lightweight.json',
    humanReviewPercent: 0,
  },
  micro: {
    seat: 'micro',
    candidates: [
      'us.amazon.nova-micro-v1:0',
      'zai.glm-4.7-flash',
    ],
    temperature: 0,
    maxTokens: 256,
    gradingMethod: 'exact-match',
    evalSetPath: 'data/eval-sets/micro-routing.json',
    humanReviewPercent: 0,
  },
  snapshot: {
    seat: 'snapshot',
    candidates: [
      'us.amazon.nova-pro-v1:0',
      'us.amazon.nova-lite-v1:0',
      'us.amazon.nova-2-lite-v1:0',
      'zai.glm-4.7-flash',
    ],
    temperature: 0,
    maxTokens: 2048,
    gradingMethod: 'schema-validation',
    evalSetPath: 'data/eval-sets/snapshot-pipeline.json',
    humanReviewPercent: 0,
  },
  'editor-ai': {
    seat: 'editor-ai',
    candidates: [
      'us.amazon.nova-pro-v1:0',
      'us.amazon.nova-lite-v1:0',
      'deepseek.v3.2',
      'zai.glm-4.7',
    ],
    temperature: 0.3,
    maxTokens: 4096,
    gradingMethod: 'schema-validation',
    evalSetPath: 'data/eval-sets/editor-ai.json',
    humanReviewPercent: 0.2,
  },
  'pain-distiller': {
    seat: 'pain-distiller',
    candidates: [
      'us.amazon.nova-pro-v1:0',
      'deepseek.v3.2',
      'qwen.qwen3-next-80b-a3b',
    ],
    temperature: 0,
    maxTokens: 2048,
    gradingMethod: 'schema-validation',
    evalSetPath: 'data/eval-sets/pain-distiller.json',
    humanReviewPercent: 0,
  },
  'legal-ledger': {
    seat: 'legal-ledger',
    candidates: [
      'zai.glm-5',
      'deepseek.v3.2',
      'moonshot.kimi-k2-thinking',
    ],
    temperature: 0,
    maxTokens: 8192,
    gradingMethod: 'human',
    evalSetPath: 'data/eval-sets/legal-ledger.json',
    humanReviewPercent: 1.0,
  },
};
