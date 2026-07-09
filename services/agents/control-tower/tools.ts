/**
 * ControlTower tool definitions for Bedrock Converse.
 * Mutating tools (ct-governance-write) are HITL-gated.
 * Advisory tools (ct-route-task) execute directly.
 */

import type { ToolConfig } from '../../ai-invoker/src/types.js';

export const CONTROL_TOWER_TOOLS: ToolConfig[] = [
  {
    toolSpec: {
      name: 'ct-governance-write',
      description: 'Write cross-standard roles/authorities to the governance registry. HITL-gated: requires human approval.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['roleTitle', 'responsibilities', 'standards'],
          properties: {
            roleTitle: { type: 'string', description: 'Title of the governance role' },
            responsibilities: { type: 'string', description: 'Description of responsibilities and authorities' },
            standards: { type: 'array', items: { type: 'string' }, description: 'Applicable standards (e.g., ISO 9001, ISO 14001, ISO 45001)' },
            clauses: { type: 'array', items: { type: 'string' }, description: 'Relevant clause references' },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'ct-route-task',
      description: 'Route a task to a collaborating agent. Advisory — no HITL required.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['targetAgent', 'taskDescription'],
          properties: {
            targetAgent: { type: 'string', description: 'Agent to route the task to (e.g., DocStudio, LeadAuditor)' },
            taskDescription: { type: 'string', description: 'Description of the task to route' },
            priority: { type: 'string', description: 'Priority: low | medium | high' },
          },
        },
      },
    },
  },
];
