/**
 * Amplify Hosting deployment bundle script.
 *
 * Transforms `next build` (output: 'standalone') into the Amplify Hosting
 * deployment specification format:
 *
 *   .amplify-hosting/
 *   ├── compute/default/   (standalone server + node_modules)
 *   ├── static/            (public + .next/static)
 *   └── deploy-manifest.json
 *
 * Usage: npm run build && npm run deploy:bundle
 * Output: .amplify-hosting/ directory ready for zip + upload to Amplify.
 *
 * Reference: https://docs.aws.amazon.com/amplify/latest/userguide/ssr-deployment-specification.html
 */

import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const NEXT_DIR = resolve(ROOT, '.next');
const STANDALONE_DIR = resolve(NEXT_DIR, 'standalone');
const OUTPUT_DIR = resolve(ROOT, '.amplify-hosting');

// Verify next build output exists
if (!existsSync(STANDALONE_DIR)) {
  console.error('ERROR: .next/standalone not found. Run `npm run build` first.');
  process.exit(1);
}

// Clean previous output
if (existsSync(OUTPUT_DIR)) {
  rmSync(OUTPUT_DIR, { recursive: true });
}

console.log('Creating .amplify-hosting/ deployment bundle...');

// 1. Compute bundle: standalone server
const computeDir = resolve(OUTPUT_DIR, 'compute', 'default');
mkdirSync(computeDir, { recursive: true });

// Copy standalone output (contains server.js + node_modules + .next/server chunks)
cpSync(STANDALONE_DIR, computeDir, { recursive: true });

// Copy .next/static into the compute bundle's .next/static (needed by the server)
const nextStaticSrc = resolve(NEXT_DIR, 'static');
const nextStaticDest = resolve(computeDir, '.next', 'static');
if (existsSync(nextStaticSrc)) {
  cpSync(nextStaticSrc, nextStaticDest, { recursive: true });
}

// 2. Static assets: public/ + .next/static/
const staticDir = resolve(OUTPUT_DIR, 'static');
mkdirSync(staticDir, { recursive: true });

// Copy public/ assets
const publicDir = resolve(ROOT, 'public');
if (existsSync(publicDir)) {
  cpSync(publicDir, staticDir, { recursive: true });
}

// Copy .next/static/ as _next/static/ (Next.js convention for static assets URL)
if (existsSync(nextStaticSrc)) {
  const nextStaticOut = resolve(staticDir, '_next', 'static');
  mkdirSync(resolve(staticDir, '_next'), { recursive: true });
  cpSync(nextStaticSrc, nextStaticOut, { recursive: true });
}

// 3. deploy-manifest.json
const manifest = {
  version: 1,
  routes: [
    {
      path: '/_next/static/*',
      target: {
        kind: 'Static',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    },
    {
      path: '/brand/*',
      target: {
        kind: 'Static',
        cacheControl: 'public, max-age=86400',
      },
    },
    {
      path: '/*.*',
      target: { kind: 'Static' },
      fallback: { kind: 'Compute', src: 'default' },
    },
    {
      path: '/*',
      target: { kind: 'Compute', src: 'default' },
    },
  ],
  computeResources: [
    {
      name: 'default',
      entrypoint: 'server.js',
      runtime: 'nodejs22.x',
    },
  ],
  framework: {
    name: 'next',
    version: '14',
  },
};

writeFileSync(resolve(OUTPUT_DIR, 'deploy-manifest.json'), JSON.stringify(manifest, null, 2));

console.log('Done. Bundle at: .amplify-hosting/');
console.log('  compute/default/ — standalone Next.js server');
console.log('  static/          — public assets + _next/static');
console.log('  deploy-manifest.json — Amplify deployment specification');
