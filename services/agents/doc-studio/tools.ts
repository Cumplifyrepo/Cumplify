/**
 * DocStudio tool definitions for Bedrock Converse.
 * Mutating tools (doc-version-control, doc-publish) are HITL-gated.
 * Advisory tools (doc-draft) execute directly.
 */

import type { ToolConfig } from '../../ai-invoker/src/types.js';

export const DOC_STUDIO_TOOLS: ToolConfig[] = [
  {
    toolSpec: {
      name: 'doc-draft',
      description: 'Draft a document based on requirements and context. Advisory — no HITL required.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['docType', 'title', 'content'],
          properties: {
            docType: { type: 'string', description: 'Document type: policy | procedure | work-instruction | form | record' },
            title: { type: 'string', description: 'Document title' },
            content: { type: 'string', description: 'Draft content for the document' },
            clauses: { type: 'array', items: { type: 'string' }, description: 'Applicable clause references' },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'doc-version-control',
      description: 'Create a new version of a controlled document. HITL-gated: requires human approval.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['docId', 'changeDescription', 'newVersion'],
          properties: {
            docId: { type: 'string', description: 'ID of the document to version' },
            changeDescription: { type: 'string', description: 'Summary of changes in this version' },
            newVersion: { type: 'string', description: 'New version number (e.g., 2.0, 1.1)' },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'doc-publish',
      description: 'Publish an approved document to the controlled document store. HITL-gated: requires human approval.',
      inputSchema: {
        json: {
          type: 'object',
          required: ['docId', 'version', 'effectiveDate'],
          properties: {
            docId: { type: 'string', description: 'ID of the document to publish' },
            version: { type: 'string', description: 'Version to publish' },
            effectiveDate: { type: 'string', description: 'Effective date (ISO 8601)' },
            distribution: { type: 'array', items: { type: 'string' }, description: 'Distribution list (role IDs)' },
          },
        },
      },
    },
  },
];
