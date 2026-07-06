/**
 * Shared types for the model-evals harness.
 */

export interface EvalTask {
  id: string;
  prompt: string;
  expectedOutput?: string; // For exact-match / classification
  expectedClauses?: string[]; // For clause-citation grading
  expectedSchema?: Record<string, unknown>; // For schema validation
  groundTruthLabels?: string[]; // For extraction tasks
  metadata?: Record<string, unknown>;
}

export interface EvalSet {
  seat: string;
  version: string;
  taskCount: number;
  tasks: EvalTask[];
  gradingMethod: 'exact-match' | 'schema-validation' | 'clause-citation' | 'rubric' | 'human';
  qualityGateApproval?: { approvedBy: string; approvedAt: string; commitHash: string };
}

export interface EvalResult {
  taskId: string;
  candidateModelId: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  qualityScore?: number; // 0-1 for automated; undefined for human-graded
  qualityPass?: boolean;
}

export interface ScoredReport {
  seat: string;
  timestamp: string;
  candidates: CandidateReport[];
  winner: string | null; // modelId of winner, null if no quality-passers
  budgetConsumed: number;
  pricingSource: Record<string, 'live-api' | 'snapshot-priced'>;
  groundTruthLimitation?: string;
}

export interface CandidateReport {
  modelId: string;
  qualityPass: boolean;
  qualityScore: number; // aggregate 0-1
  costPerTaskP50: number;
  costPerTaskP95: number;
  marginAtCreditPricing: number; // 0-1
  marginPass: boolean; // >= 0.50
  tokenUsage: { inputP50: number; inputP95: number; outputP50: number; outputP95: number };
  rank: number | null; // null if quality-fail
}

export interface SeatConfig {
  seat: string;
  candidates: string[];
  temperature: number;
  maxTokens: number;
  gradingMethod: EvalSet['gradingMethod'];
  evalSetPath: string;
  humanReviewPercent: number; // 0 for fully automated, 0.2 for 20%, 1.0 for 100%
}

export interface PriceEntry {
  inputPricePerMToken: number;
  outputPricePerMToken: number;
  unit: string;
  notes?: string;
}

export interface PriceSnapshot {
  capturedAt: string;
  sourceUrl: string;
  capturedBy: string;
  stalenessLimitDays: number;
  models: Record<string, PriceEntry>;
}

export interface MarginInput {
  creditsPerTask: number;
  pricePerCredit: number;
  effectivePricePerTask: number;
}

export interface MarginInputsFile {
  capturedAt: string;
  source: string;
  capturedBy: string;
  creditPricingPerTask: Record<string, MarginInput>;
  marginMandate: number;
  notes: string;
}
