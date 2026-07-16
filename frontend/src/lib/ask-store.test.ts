import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests for standard selector routing logic.
 * The store maintains selectedStandard which routes to the correct query.
 */

// Fresh import per test to reset module state
describe('ask-store: standard selector routing', () => {
  beforeEach(async () => {
    // Reset module state by re-importing
    vi.resetModules();
  });

  it('defaults to ISO9001', async () => {
    const store = await import('./ask-store');
    expect(store.getSelectedStandard()).toBe('ISO9001');
  });

  it('setSelectedStandard changes the active standard', async () => {
    const store = await import('./ask-store');
    store.setSelectedStandard('ISO14001');
    expect(store.getSelectedStandard()).toBe('ISO14001');
  });

  it('addUserMessage records the standard with the message', async () => {
    const store = await import('./ask-store');
    store.setSelectedStandard('ISO45001');
    store.addUserMessage('What does clause 4.1 require?', 'ISO45001');
    const messages = store.getMessages();
    expect(messages[0].standard).toBe('ISO45001');
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('What does clause 4.1 require?');
  });

  it('addAssistantMessage stores citations', async () => {
    const store = await import('./ask-store');
    store.addAssistantMessage('Clause 8.5.1 requires...', 'ISO9001', ['8.5.1', '8.5.2']);
    const messages = store.getMessages();
    expect(messages[0].citations).toEqual(['8.5.1', '8.5.2']);
    expect(messages[0].standard).toBe('ISO9001');
  });

  it('subscribe notifies on state change', async () => {
    const store = await import('./ask-store');
    let called = 0;
    const unsub = store.subscribe(() => {
      called += 1;
    });
    store.setSelectedStandard('ISO14001');
    expect(called).toBe(1);
    store.addUserMessage('test', 'ISO14001');
    expect(called).toBe(2);
    unsub();
    store.addUserMessage('no notify', 'ISO9001');
    expect(called).toBe(2);
  });

  it('reset() clears messages and resets standard to ISO9001 (P1)', async () => {
    const store = await import('./ask-store');
    store.setSelectedStandard('ISO45001');
    store.addUserMessage('question 1', 'ISO45001');
    store.addAssistantMessage('answer 1', 'ISO45001', ['4.1']);
    expect(store.getMessages()).toHaveLength(2);
    expect(store.getSelectedStandard()).toBe('ISO45001');

    store.reset();

    expect(store.getMessages()).toHaveLength(0);
    expect(store.getSelectedStandard()).toBe('ISO9001');
  });
});
