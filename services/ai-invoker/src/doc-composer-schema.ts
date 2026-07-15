/**
 * Structured output contract for the doc-composer seat (spec 40, design §4.3-4.4).
 *
 * Every sentence must carry factRefs — the deterministic checker in
 * ComposeSection resolves each ref against the assembled fact set (BC-4);
 * this schema enforces the SHAPE only, so the invoker's schema-retry
 * (SERVE-10) catches malformed output before the checker sees it.
 * Fact RESOLUTION stays in checker code — the model never grades itself.
 */
export const DOC_COMPOSER_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['sentences'],
  additionalProperties: false,
  properties: {
    sentences: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['text', 'factRefs'],
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1 },
          factRefs: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  },
};

/** Parsed shape of a schema-valid doc-composer response */
export interface DocComposerOutput {
  sentences: Array<{ text: string; factRefs: string[] }>;
}
