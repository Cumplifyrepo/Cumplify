/**
 * RiskSentinel tool definitions for Bedrock Converse.
 * risk-assessment-write is HITL-gated (architecture §4: risk assessment is
 * a record-of-truth write, matrix-routed to QM/EHS Manager per RS-6).
 */

import type { ToolConfig } from '../../ai-invoker/src/types.js';

export const RISK_SENTINEL_TOOLS: ToolConfig[] = [
  {
    toolSpec: {
      name: 'risk-assessment-write',
      description:
        'Propose an updated likelihood/severity rating for an existing risk. HITL-gated: requires human approval before commit.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['riskId', 'likelihood', 'severity', 'rationale'],
          properties: {
            riskId: { type: 'string', description: 'ID of the risk being assessed' },
            likelihood: { type: 'integer', description: 'Likelihood rating, 1-5' },
            severity: { type: 'integer', description: 'Severity rating, 1-5' },
            rationale: {
              type: 'string',
              description: 'Evidence-grounded justification for the proposed rating',
            },
          },
        },
      },
    },
  },
];
