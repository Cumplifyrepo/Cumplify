import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cssVariables } from '../tokens/design-tokens';

/**
 * m5: Assert globals.css :root block matches the cssVariables export from
 * design-tokens.ts — prevents hand-duplication drift.
 */

describe('globals.css / design-tokens.ts sync', () => {
  it('every cssVariables entry exists in globals.css :root block', () => {
    const cssPath = resolve(__dirname, '../app/globals.css');
    const css = readFileSync(cssPath, 'utf-8');

    for (const [varName, value] of Object.entries(cssVariables)) {
      expect(css).toContain(`${varName}: ${value}`);
    }
  });

  it('globals.css does not have extra color/font/radius vars beyond cssVariables', () => {
    const cssPath = resolve(__dirname, '../app/globals.css');
    const css = readFileSync(cssPath, 'utf-8');

    // Extract all custom properties from :root
    const rootMatch = css.match(/:root\s*{([^}]*)}/s);
    expect(rootMatch).not.toBeNull();

    const rootBlock = rootMatch![1];
    const varLines = rootBlock.match(/--[\w-]+:\s*[^;]+/g) ?? [];

    for (const line of varLines) {
      const varName = line.match(/^(--[\w-]+)/)?.[1];
      if (
        varName &&
        (varName.startsWith('--color-') ||
          varName.startsWith('--font-') ||
          varName.startsWith('--radius-'))
      ) {
        expect(cssVariables).toHaveProperty(varName);
      }
    }
  });
});
