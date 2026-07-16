/**
 * RecordsVault tool definitions for Bedrock Converse.
 * Mutating tools (records-retention-schedule) are HITL-gated.
 * Advisory tools (records-retain, records-audit-append) execute directly.
 * Note: sealing is HITL-exempt because the immutability layer enforces integrity.
 */

import type { ToolConfig } from '../../ai-invoker/src/types.js';

export const RECORDS_VAULT_TOOLS: ToolConfig[] = [
  {
    toolSpec: {
      name: 'records-retain',
      description:
        'Trigger record sealing for a completed record. Advisory — no HITL required (immutability layer).',
      inputSchema: {
        json: {
          type: 'object',
          required: ['recordId', 'retentionCategory'],
          properties: {
            recordId: { type: 'string', description: 'ID of the record to seal' },
            retentionCategory: {
              type: 'string',
              description: 'Retention category: permanent | 7-year | 5-year | 3-year',
            },
            sealReason: { type: 'string', description: 'Reason for sealing the record' },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'records-audit-append',
      description:
        'Append an audit trail entry to a sealed record. Advisory — no HITL required (immutable append-only).',
      inputSchema: {
        json: {
          type: 'object',
          required: ['recordId', 'action', 'detail'],
          properties: {
            recordId: { type: 'string', description: 'ID of the sealed record' },
            action: {
              type: 'string',
              description: 'Action type: access | review | disposition-check',
            },
            detail: { type: 'string', description: 'Details of the audit trail entry' },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'records-retention-schedule',
      description:
        'Modify a retention schedule for a record category. HITL-gated: requires human approval.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['category', 'retentionPeriod', 'justification'],
          properties: {
            category: { type: 'string', description: 'Record category to modify' },
            retentionPeriod: {
              type: 'string',
              description: 'New retention period (e.g., 7-year, permanent)',
            },
            justification: { type: 'string', description: 'Justification for the schedule change' },
          },
        },
      },
    },
  },
];
