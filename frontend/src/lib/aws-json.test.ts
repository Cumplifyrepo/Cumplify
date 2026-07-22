import { describe, it, expect } from 'vitest';
import { parseAwsJson } from './aws-json';

describe('parseAwsJson', () => {
  it('passes a parsed object through untouched (correct resolver + AppSync single-serialize)', () => {
    const obj = { sections: [1, 2] };
    expect(parseAwsJson(obj)).toBe(obj);
  });

  it('parses a single-encoded string', () => {
    expect(parseAwsJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses the legacy double-encoded wire shape (pre-2026-07-22 resolvers)', () => {
    const doubled = JSON.stringify(JSON.stringify({ a: 1 }));
    expect(parseAwsJson(doubled)).toEqual({ a: 1 });
  });
});
