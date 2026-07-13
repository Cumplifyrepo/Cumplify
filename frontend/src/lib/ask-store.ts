/**
 * Client-side chat state store for Ask Cumplify.
 * State persists across open/close within a session (§4: "client store").
 * Simple module-level state — no persistence across page reloads.
 */

export type Standard = 'ISO9001' | 'ISO14001' | 'ISO45001';

export interface AskMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  standard: Standard;
  /** Parsed citation clauseRefs from the answer (if any) */
  citations: string[];
  timestamp: number;
}

let messages: AskMessage[] = [];
let selectedStandard: Standard = 'ISO9001';
let counter = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function getMessages(): AskMessage[] {
  return messages;
}

export function getSelectedStandard(): Standard {
  return selectedStandard;
}

export function setSelectedStandard(s: Standard) {
  selectedStandard = s;
  notify();
}

export function addUserMessage(content: string, standard: Standard): string {
  counter += 1;
  const id = `msg-${counter}`;
  messages = [...messages, { id, role: 'user', content, standard, citations: [], timestamp: Date.now() }];
  notify();
  return id;
}

export function addAssistantMessage(content: string, standard: Standard, citations: string[]): string {
  counter += 1;
  const id = `msg-${counter}`;
  messages = [...messages, { id, role: 'assistant', content, standard, citations, timestamp: Date.now() }];
  notify();
  return id;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * P1 fix: Reset all state on sign-out to prevent leaking one user's Q&A
 * to the next user signing in on the same browser session.
 */
export function reset(): void {
  messages = [];
  selectedStandard = 'ISO9001';
  counter = 0;
  notify();
}
