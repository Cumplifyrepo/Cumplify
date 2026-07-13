'use client';

import styles from './DiffView.module.css';

/**
 * DiffView — view-designs.md §5 diff view.
 * Added = success 12% tint bg line, removed = danger tint + strikethrough; monospace 14px.
 * CARD-2 reuses this component for superseding drafts.
 */

interface Diff {
  additions: number;
  deletions: number;
  content: string;
}

export function DiffView({ diff }: { diff: Diff }) {
  const lines = diff.content.split('\n');

  return (
    <div className={styles.wrapper}>
      <div className={styles.stats}>
        <span className={styles.added}>+{diff.additions}</span>
        <span className={styles.removed}>-{diff.deletions}</span>
      </div>
      <pre className={styles.code}>
        {lines.map((line, i) => {
          let cls = styles.line;
          if (line.startsWith('+')) cls = `${styles.line} ${styles.addedLine}`;
          else if (line.startsWith('-')) cls = `${styles.line} ${styles.removedLine}`;
          return (
            <div key={i} className={cls}>
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
