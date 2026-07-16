/**
 * Dollar-quote-aware SQL statement splitter for RDS Data API.
 *
 * RDS Data API ExecuteStatement runs EXACTLY ONE statement per call.
 * This splitter breaks multi-statement migration files into individual
 * statements while respecting:
 *   - Dollar-quoted blocks: $$ ... $$ AND tagged $tag$ ... $tag$
 *   - Single-quoted string literals (with '' escapes)
 *   - Line comments (--)
 *   - Block comments (slash-star ... star-slash)
 *
 * A semicolon inside any of these contexts is NOT a separator.
 * Empty/whitespace-only statements are skipped.
 *
 * SECURITY NOTE: Incorrect splitting could tear a SECURITY DEFINER function
 * body or RLS DO-block apart, producing a broken policy or isolation hole.
 * This splitter is security-relevant and architect-reviewed.
 */

export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  const len = sql.length;

  while (i < len) {
    // ─── Line comment: -- to end of line ──────────────────────────────────
    if (sql[i] === '-' && sql[i + 1] === '-') {
      const eol = sql.indexOf('\n', i);
      if (eol === -1) {
        current += sql.slice(i);
        i = len;
      } else {
        current += sql.slice(i, eol + 1);
        i = eol + 1;
      }
      continue;
    }

    // ─── Block comment: /* ... */ (non-nested) ─────────────────────────────
    if (sql[i] === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) {
        // Unterminated comment — take rest of file
        current += sql.slice(i);
        i = len;
      } else {
        current += sql.slice(i, end + 2);
        i = end + 2;
      }
      continue;
    }

    // ─── Dollar-quoted block: $tag$ ... $tag$ or $$ ... $$ ────────────────
    if (sql[i] === '$') {
      // Find the tag: $ followed by optional identifier chars, then $
      const tagMatch = sql.slice(i).match(/^(\$[A-Za-z0-9_]*\$)/);
      if (tagMatch) {
        const tag = tagMatch[1];
        const endIdx = sql.indexOf(tag, i + tag.length);
        if (endIdx === -1) {
          // Unterminated dollar-quote — take rest of file
          current += sql.slice(i);
          i = len;
        } else {
          current += sql.slice(i, endIdx + tag.length);
          i = endIdx + tag.length;
        }
        continue;
      }
    }

    // ─── Single-quoted string: '...' with '' escapes ──────────────────────
    if (sql[i] === "'") {
      current += sql[i];
      i++;
      while (i < len) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          // Escaped quote
          current += "''";
          i += 2;
        } else if (sql[i] === "'") {
          // End of string
          current += sql[i];
          i++;
          break;
        } else {
          current += sql[i];
          i++;
        }
      }
      continue;
    }

    // ─── Semicolon: statement separator ───────────────────────────────────
    if (sql[i] === ';') {
      current += ';';
      const trimmed = current.trim();
      if (trimmed && trimmed !== ';') {
        statements.push(trimmed);
      }
      current = '';
      i++;
      continue;
    }

    // ─── Default: accumulate character ────────────────────────────────────
    current += sql[i];
    i++;
  }

  // Handle trailing content (no final semicolon)
  const trimmed = current.trim();
  if (trimmed && trimmed !== ';') {
    statements.push(trimmed);
  }

  return statements;
}
