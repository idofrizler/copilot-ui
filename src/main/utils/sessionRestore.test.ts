import { describe, expect, it } from 'vitest';
import { mergeSessionCwds, resolveSessionName } from './sessionRestore';

describe('resolveSessionName', () => {
  it('prefers stored open-session name', () => {
    expect(
      resolveSessionName({
        storedName: 'Feature Branch',
        persistedName: 'Old Name',
        summary: 'Please implement the following...',
      })
    ).toBe('Feature Branch');
  });

  it('falls back to persisted name before summary', () => {
    expect(
      resolveSessionName({
        persistedName: 'Renamed Session',
        summary: 'Please implement the following...',
      })
    ).toBe('Renamed Session');
  });
});

describe('mergeSessionCwds', () => {
  it('backfills cwd entries from open sessions', () => {
    expect(
      mergeSessionCwds({ a: '/repo/a' }, [
        { sessionId: 'a', cwd: '/repo/new-a' },
        { sessionId: 'b', cwd: '/repo/b' },
      ])
    ).toEqual({ a: '/repo/new-a', b: '/repo/b' });
  });
});
