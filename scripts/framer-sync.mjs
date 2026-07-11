/**
 * Framer design-sync script.
 * Connects to the Framer project via framer-api SDK, extracts available
 * pages and component names, writes metadata to frontend/src/tokens/.
 *
 * Usage: node --env-file=.env scripts/framer-sync.mjs
 * Requires: FRAMER_API_KEY, FRAMER_PROJECT_URL in .env (git-ignored)
 *
 * Per steering 21: Framer is the single machine-readable design source.
 */

import { connect } from 'framer-api';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOKENS_DIR = resolve(import.meta.dirname, '../frontend/src/tokens');
mkdirSync(TOKENS_DIR, { recursive: true });

console.log('Connecting to Framer project...');
const framer = await connect(process.env.FRAMER_PROJECT_URL, process.env.FRAMER_API_KEY);

try {
  const info = await framer.getProjectInfo();
  console.log(`Connected: ${info.name} (${info.id})`);

  // Extract web pages (navigable routes)
  const pages = await framer.getNodesWithType('WebPageNode');
  const pageData = pages.map(p => ({
    name: p.name ?? '(unnamed)',
    path: p.path ?? '/',
  }));
  console.log(`Found ${pages.length} web pages`);

  // Extract components
  const components = await framer.getNodesWithType('ComponentNode');
  const componentData = components.map(c => ({
    name: c.name ?? '(unnamed)',
    id: c.id,
  }));
  console.log(`Found ${components.length} components`);

  // Write framer-pages.json
  writeFileSync(
    resolve(TOKENS_DIR, 'framer-pages.json'),
    JSON.stringify({ project: info.name, syncedAt: new Date().toISOString(), pages: pageData }, null, 2),
  );

  // Write framer-components.json
  writeFileSync(
    resolve(TOKENS_DIR, 'framer-components.json'),
    JSON.stringify({ project: info.name, syncedAt: new Date().toISOString(), components: componentData }, null, 2),
  );

  console.log(`\nWritten to ${TOKENS_DIR}/:`);
  console.log('  framer-pages.json');
  console.log('  framer-components.json');
} finally {
  await framer.disconnect();
}
