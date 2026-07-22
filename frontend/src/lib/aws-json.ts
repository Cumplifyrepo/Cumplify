/**
 * Normalize an AWSJSON response field to its parsed value.
 *
 * A correctly-behaving resolver returns the parsed object and AppSync
 * serializes it once — the client then receives parsed JSON directly.
 * Resolvers that return pre-stringified JSON double-encode the wire
 * (found live 2026-07-22). The bounded loop accepts every shape seen in
 * the wild: parsed object (correct), single-encoded string, and the
 * legacy double-encoded string — so a cached frontend never breaks
 * against either API version during a deploy window.
 */
export function parseAwsJson<T>(value: unknown): T {
  let v: unknown = value;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    v = JSON.parse(v);
  }
  return v as T;
}
