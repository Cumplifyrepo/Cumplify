/**
 * Hello-world SSR page for Amplify Hosting spike (Task 1).
 * Proves server-side rendering: timestamp changes on every reload.
 */
export default function Home() {
  const now = new Date().toISOString();
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Cumplify OK</h1>
      <p>SSR timestamp: <code>{now}</code></p>
      <p>If this timestamp changes on every reload, SSR is working.</p>
    </main>
  );
}

// Force dynamic rendering (no static optimization)
export const dynamic = 'force-dynamic';
