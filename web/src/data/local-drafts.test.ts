import { describe, expect, it } from 'vitest';
import {
  LocalDraftStore,
  LOCAL_DRAFT_PREFIX,
  draftBase,
  localDraftsMarkdown,
  announceWorkspaceAccepted,
  announceWorkspaceSaved,
  afterWorkspaceSaved,
} from './local-drafts';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
describe('recoverable local form drafts', () => {
  it('retains exact multiline interview text after a new store is opened', () => {
    const storage = new MemoryStorage(),
      store = new LocalDraftStore(storage);
    const value = {
      title: 'Interview',
      body: 'Regel één\n\nVraag: ```\nAntwoord: nee.',
      optional: undefined,
    };
    store.save('ws/walkthrough/new', 'new/v1', 'tab-a', value);
    const recovered = new LocalDraftStore(storage).recover<typeof value>(
      'ws/walkthrough/new',
      'new/v1',
      'tab-b',
    );
    expect(recovered?.value).toEqual({ title: value.title, body: value.body });
    const markdown = localDraftsMarkdown(store.list()).join('\n');
    expect(markdown).toContain('nog geen vastgesteld dossierrecord');
    expect(markdown).toContain('````json');
    expect(markdown).toContain('Regel één\\n\\nVraag: ```');
  });
  it('preserves independent tab concepts and refuses an ambiguous recovery', () => {
    const store = new LocalDraftStore(new MemoryStorage());
    store.save('ws/finding/new', 'new/v1', 'tab-a', { text: 'A' });
    store.save('ws/finding/new', 'new/v1', 'tab-b', { text: 'B' });
    expect(store.recover<{ text: string }>('ws/finding/new', 'new/v1', 'tab-a')?.value.text).toBe(
      'A',
    );
    expect(() => store.recover('ws/finding/new', 'new/v1', 'tab-c')).toThrow('Meerdere concepten');
    expect(store.list()).toHaveLength(2);
  });
  it('refuses to overwrite a previous source version and preserves its exact bytes', () => {
    const storage = new MemoryStorage(),
      store = new LocalDraftStore(storage);
    store.save('ws/evidence/id', draftBase({ version: 1 }), 'a', { text: 'Before' });
    const before = [...storage.values];
    expect(() =>
      store.save('ws/evidence/id', draftBase({ version: 2 }), 'a', { text: 'After' }),
    ).toThrow('andere bronversie');
    expect([...storage.values]).toEqual(before);
    expect(() => store.recover('ws/evidence/id', draftBase({ version: 2 }), 'b')).toThrow(
      'bronrecord is veranderd',
    );
  });
  it('preserves corrupt storage rather than turning it into a blank form', () => {
    const storage = new MemoryStorage(),
      key = `${LOCAL_DRAFT_PREFIX}ws%2Fcontext%2Fnew.a`;
    storage.setItem(key, '{unfinished');
    const store = new LocalDraftStore(storage);
    expect(() => store.save('ws/context/new', 'new/v1', 'a', { text: 'New' })).toThrow();
    expect(storage.getItem(key)).toBe('{unfinished');
  });
  it('surfaces quota errors and does not delete the previous concept', () => {
    const storage = new MemoryStorage(),
      store = new LocalDraftStore(storage);
    store.save('ws/context/new', 'new/v1', 'a', { text: 'Before' });
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => store.save('ws/context/new', 'new/v1', 'a', { text: 'After' })).toThrow(
      'QuotaExceededError',
    );
    expect(store.recover<{ text: string }>('ws/context/new', 'new/v1', 'a')?.value.text).toBe(
      'Before',
    );
  });
  it('rejects credential fields and access tokens', () => {
    const store = new LocalDraftStore(new MemoryStorage());
    expect(() => store.save('ws/new', 'new/v1', 'a', { token: 'secret' })).toThrow('veld');
    expect(() => store.save('ws/new', 'new/v1', 'a', { text: 'ghp_' + 'a'.repeat(30) })).toThrow(
      'toegangstoken',
    );
    expect(store.list()).toHaveLength(0);
  });
  it('clears only after the exact accepted workspace write succeeds', () => {
    const events: string[] = [];
    const first = announceWorkspaceAccepted('durable-a');
    afterWorkspaceSaved('durable-a', () => events.push('a'));
    const second = announceWorkspaceAccepted('durable-b');
    announceWorkspaceSaved(second);
    expect(events).toEqual([]);
    announceWorkspaceSaved(first);
    expect(events).toEqual(['a']);
    afterWorkspaceSaved('durable-a', () => events.push('already-saved'));
    expect(events).toEqual(['a', 'already-saved']);
  });
});
