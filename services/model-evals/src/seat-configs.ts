/**
 * Per-seat configuration: candidates, temperature, maxTokens, grading method, quality bar.
 * Per design §5 temperature policy + §9.4 maxTokens + §2.3 quality bars.
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
    evalSetPath: 'data/eval-sets/guru-iso9001.json',
    humanReviewPercent: 0.2,
    qualityBar: 0.85, // §2.3: clause-citation mean >= 85%
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
    qualityBar: 1.0, // §2.3: schema compliance 100% (correctness 85% checked separately in human review)
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
    qualityBar: 0.90, // §2.3: task correctness >= 90%
  },
  micro: {
    seat: 'micro',
    candidates: [
      'us.amazon.nova-micro-v1:0',
      'us.amazon.nova-lite-v1:0',
      'us.amazon.nova-pro-v1:0',
      'us.amazon.nova-2-lite-v1:0',
      'zai.glm-4.7-flash',
      'zai.glm-4.7',
      'zai.glm-5',
      'qwen.qwen3-32b-v1:0',
      'minimax.minimax-m2.5',
      'moonshotai.kimi-k2.5',
    ],
    temperature: 0,
    maxTokens: 256,
    gradingMethod: 'exact-match',
    evalSetPath: 'data/eval-sets/micro-routing.json',
    humanReviewPercent: 0,
    qualityBar: 0.95, // §2.3: multi-label F1 >= 0.95
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
    qualityBar: 1.0, // §2.3: schema compliance 100% + grounding pass
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
    qualityBar: 1.0, // §2.3: schema compliance 100% (quality spot-reviewed separately)
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
    gradingMethod: 'exact-match',
    evalSetPath: 'data/eval-sets/pain-distiller.json',
    humanReviewPercent: 0,
    qualityBar: 0.85, // §2.3: label coverage >= 85%
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
    qualityBar: null, // §2.3: human-graded (rubric mean >= 4.0, no criterion at 1)
  },
};
