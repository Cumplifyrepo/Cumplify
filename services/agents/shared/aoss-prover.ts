/**
 * AOSS Task-12 prover Lambda — architect ops tool (ACC-4, agents-existing-8).
 *
 * Runs INSIDE the VPC (AOSS network policy = VPC endpoint only) so the
 * architect can execute the Task-12 proof sequence against live collections:
 *   template-check → seed (fail-closed on template) → tenant-filtered queries
 *   via the REAL production retrieve() wrapper → unfiltered control search →
 *   delete-index cleanup.
 *
 * ONE-DOOR: this Lambda NEVER touches Bedrock. All embedding vectors arrive
 * in the invocation payload (architect generates them out-of-band as a
 * witnessed ops action, weight-seeder precedent). Its role has only
 * aoss:APIAccessAll — invocable only by principals with lambda:InvokeFunction
 * on it (architect admin).
 *
 * Safety: seed/delete-index refuse any index not carrying a task12-/task13-/
 * task14- proof prefix so this tool can never mutate a production index.
 * (task13/14: eval grounding corpora for the budget-gated re-evals.)
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { signedAossFetch } from './aoss-signed-client.js';
import { verifyTemplate, type VerifyResult } from './aoss-apply-template.js';
import { retrieve, type RetrievalResult } from './retrieval.js';

const logger = new Logger({ serviceName: 'aoss-prover' });

/** JSON array: [{ "name": "cumplify-tenant-docs-kb", "endpoint": "https://..." }, ...] */
const COLLECTIONS: Array<{ name: string; endpoint: string }> = JSON.parse(
  process.env.COLLECTIONS ?? '[]',
);

const PROOF_INDEX_PREFIXES = ['task12-', 'task13-', 'task14-'];

export interface SeedDoc {
  text: string;
  embedding: number[];
  metadata: Record<string, string>;
}

export type ProverEvent =
  | { action: 'template-check'; collection: string }
  | { action: 'seed'; collection: string; indexName: string; docs: SeedDoc[] }
  | {
      action: 'query';
      collection: string;
      indexName: string;
      tenantId: string;
      queryVector: number[];
      topK?: number;
      scoreThreshold?: number;
    }
  | { action: 'search-control'; collection: string; indexName: string; body: Record<string, unknown> }
  | { action: 'delete-index'; collection: string; indexName: string };

function resolveEndpoint(collection: string): string {
  const entry = COLLECTIONS.find((c) => c.name === collection);
  if (!entry) {
    throw new Error(`Unknown collection '${collection}' — not in COLLECTIONS env (fail-closed)`);
  }
  return entry.endpoint;
}

function assertProverIndex(indexName: string): void {
  if (!PROOF_INDEX_PREFIXES.some((p) => indexName.startsWith(p))) {
    throw new Error(
      `REFUSED: index '${indexName}' lacks a proof prefix (${PROOF_INDEX_PREFIXES.join(', ')}) — this ops tool never mutates production indexes`,
    );
  }
}

async function seed(
  endpoint: string,
  collection: string,
  indexName: string,
  docs: SeedDoc[],
): Promise<{ templateCheck: VerifyResult; indexed: number; ids: string[] }> {
  assertProverIndex(indexName);

  // T3E-F1 part 3: fail-closed template check BEFORE any document is indexed.
  const templateCheck = await verifyTemplate(collection, endpoint);

  const ids: string[] = [];
  for (const doc of docs) {
    if (doc.embedding.length !== 1024) {
      throw new Error(`Seed doc embedding must be 1024-dim (Titan Embed v2), got ${doc.embedding.length}`);
    }
    if (!doc.metadata.tenantId) {
      throw new Error('Seed doc missing metadata.tenantId — refusing to index an unattributable doc');
    }
    // AOSS VECTORSEARCH collections reject client-supplied _id — POST auto-ID.
    const resp = await signedAossFetch(
      'POST',
      endpoint,
      `/${indexName}/_doc`,
      JSON.stringify({ text: doc.text, embedding: doc.embedding, metadata: doc.metadata }),
    );
    if (resp.status !== 201 && resp.status !== 200) {
      throw new Error(`Seed FAILED (HTTP ${resp.status}): ${resp.body.slice(0, 500)}`);
    }
    ids.push(JSON.parse(resp.body)._id ?? '');
  }

  logger.info('Seeded docs', { collection, indexName, indexed: ids.length });
  return { templateCheck, indexed: ids.length, ids };
}

export async function handler(event: ProverEvent): Promise<unknown> {
  const endpoint = resolveEndpoint(event.collection);

  switch (event.action) {
    case 'template-check':
      return verifyTemplate(event.collection, endpoint);

    case 'seed':
      return seed(endpoint, event.collection, event.indexName, event.docs);

    case 'query': {
      // Through the REAL production wrapper — proves REQ-RET-1 filter,
      // 45s backoff, and SigV4 signing exactly as agents will use them.
      const result: RetrievalResult = await retrieve({
        tenantId: event.tenantId,
        collectionEndpoint: endpoint,
        indexName: event.indexName,
        queryText: '',
        queryVector: event.queryVector,
        topK: event.topK,
        scoreThreshold: event.scoreThreshold,
      });
      return result;
    }

    case 'search-control': {
      // Raw signed search for ops controls (unfiltered coexistence proof,
      // visibility polling). Never a production path.
      const resp = await signedAossFetch(
        'POST',
        endpoint,
        `/${event.indexName}/_search`,
        JSON.stringify(event.body),
      );
      if (resp.status < 200 || resp.status >= 300) {
        throw new Error(`search-control FAILED (HTTP ${resp.status}): ${resp.body.slice(0, 500)}`);
      }
      return JSON.parse(resp.body);
    }

    case 'delete-index': {
      assertProverIndex(event.indexName);
      const resp = await signedAossFetch('DELETE', endpoint, `/${event.indexName}`);
      if (resp.status !== 200 && resp.status !== 404) {
        throw new Error(`delete-index FAILED (HTTP ${resp.status}): ${resp.body.slice(0, 500)}`);
      }
      logger.info('Index deleted', { indexName: event.indexName, status: resp.status });
      return { deleted: event.indexName, status: resp.status };
    }

    default:
      throw new Error(`Unknown action '${(event as { action: string }).action}'`);
  }
}
