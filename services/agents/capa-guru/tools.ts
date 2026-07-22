/**
 * CAPAGuru tool definitions for Bedrock Converse.
 * Mutating tools (capa-open, capa-verify-effectiveness) are HITL-gated.
 * Advisory tools (capa-rootcause) execute directly.
 */

import type { ToolConfig } from '../../ai-invoker/src/types.js';

export const CAPA_GURU_TOOLS: ToolConfig[] = [
  {
    toolSpec: {
      name: 'nc-triage-write',
      description:
        'Reclassify an existing nonconformity (architecture §4 CAPA stage 2: triage). HITL-gated: requires human (QM/EHS Manager) approval before commit.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['ncId', 'classification'],
          properties: {
            ncId: { type: 'string', description: 'ID of the nonconformity' },
            classification: {
              type: 'string',
              description: 'One of: nonconforming_output | nc | incident',
            },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'capa-open',
      description:
        'Propose a corrective action for a nonconformity. HITL-gated: requires human approval before commit.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['ncId', 'actionDesc', 'suggestedOwnerId', 'dueDate'],
          properties: {
            ncId: { type: 'string', description: 'ID of the nonconformity' },
            actionDesc: {
              type: 'string',
              description: 'Description of the proposed corrective action',
            },
            suggestedOwnerId: {
              type: 'string',
              description: 'Suggested owner (user ID) for the action',
            },
            dueDate: {
              type: 'string',
              description: 'Due date for the corrective action (ISO 8601 timestamp)',
            },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'capa-rootcause',
      description:
        'Perform structured root-cause analysis (5-why, fishbone). Advisory — no HITL required.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['ncId', 'method'],
          properties: {
            ncId: { type: 'string', description: 'ID of the nonconformity' },
            method: { type: 'string', description: 'Analysis method: 5why | fishbone | fta' },
            findings: { type: 'string', description: 'Root cause findings' },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'capa-verify-effectiveness',
      description: 'Record effectiveness verification for a corrective action. HITL-gated.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['capaId', 'verificationMethod', 'effective'],
          properties: {
            capaId: { type: 'string', description: 'ID of the corrective action' },
            verificationMethod: { type: 'string', description: 'How effectiveness was verified' },
            effective: { type: 'boolean', description: 'Whether the action was effective' },
          },
        },
      },
    },
  },
];
