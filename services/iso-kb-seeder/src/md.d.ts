/**
 * Ambient module declaration for .md file imports.
 * T-1: esbuild resolves .md as text at bundle time (loader: { '.md': 'text' });
 * this declaration satisfies tsc --noEmit (TS2307) for the same bare specifier.
 */
declare module '*.md' {
  const content: string;
  export default content;
}
