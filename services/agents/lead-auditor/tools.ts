/**
 * LeadAuditor tool definitions for Bedrock Converse.
 * Mutating tools (audit-finding-write, audit-checklist-gen) are HITL-gated.
 * Advisory tools (audit-programme) execute directly.
 */

import type { ToolConfig } from '../../ai-invoker/src/types.js';

export const LEAD_AUDITOR_TOOLS: ToolConfig[] = [
  {
    toolSpec: {
      name: 'audit-programme',
      description: 'Plan or review the internal audit programme. Advisory — no HITL required.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['scope', 'standards'],
          properties: {
            scope: { type: 'string', description: 'Audit scope description' },
            standards: {
              type: 'array',
              items: { type: 'string' },
              description: 'Standards to audit against',
            },
            frequency: {
              type: 'string',
              description: 'Audit frequency: annual | semi-annual | quarterly',
            },
            riskFactors: { type: 'string', description: 'Risk factors influencing audit priority' },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'audit-checklist-gen',
      description:
        'Generate an audit checklist for a specific process/clause area. HITL-gated: requires human approval.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['processArea', 'standard', 'clauses'],
          properties: {
            processArea: { type: 'string', description: 'Process area to audit' },
            standard: { type: 'string', description: 'Standard (e.g., ISO 9001:2015)' },
            clauses: {
              type: 'array',
              items: { type: 'string' },
              description: 'Clauses to cover in the checklist',
            },
            checklistItems: {
              type: 'array',
              items: { type: 'string' },
              description: 'Generated checklist questions',
            },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'audit-finding-write',
      description:
        'Record an audit finding (NC, observation, OFI). HITL-gated: requires human approval.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['auditId', 'findingType', 'clause', 'description'],
          properties: {
            auditId: { type: 'string', description: 'ID of the parent audit' },
            findingType: {
              type: 'string',
              description: 'Type: major-nc | minor-nc | observation | ofi',
            },
            clause: { type: 'string', description: 'Clause reference (e.g., ISO 9001 8.5.1)' },
            description: {
              type: 'string',
              description: 'Finding description with objective evidence',
            },
          },
        },
      },
    },
  },
];
