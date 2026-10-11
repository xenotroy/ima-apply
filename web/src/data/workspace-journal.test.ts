import { describe, expect, it } from 'vitest';
import { createWorkspace, reviseWorkspace } from './model';
import { LocalWorkspaceStore } from './local';
import { WorkspaceJournal, WORKSPACE_JOURNAL_PREFIX } from './workspace-journal';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
describe('workspace recovery before queued writes finish', () => {
  it('stages synchronously and recovers the last accepted input after an interrupted write', async () => {
    const storage = new MemoryStorage(),
      local = new LocalWorkspaceStore(storage),
      journal = new WorkspaceJournal(storage);
    const workspace = createWorkspace('Interview');
    const main = await local.save(workspace, null);
    const latest = reviseWorkspace(workspace, { name: 'Interview met de laatst getypte tekst' });
    journal.stage(latest, main.version, 'tab-a');
    expect(local.load()?.workspace.name).toBe('Interview');
    const afterCrash = new WorkspaceJournal(storage).recoverable(local.load());
    expect(afterCrash).toHaveLength(1);
    expect(afterCrash[0].workspace).toEqual(latest);
  });
  it('updates later pending changes after earlier saves and clears only the exact latest entry', async () => {
    const storage = new MemoryStorage(),
      local = new LocalWorkspaceStore(storage),
      journal = new WorkspaceJournal(storage);
    const initial = createWorkspace('A'),
      baseline = await local.save(initial, null);
    const one = reviseWorkspace(initial, { name: 'B' }),
      two = reviseWorkspace(one, { name: 'C' }),
      three = reviseWorkspace(two, { name: 'D' });
    const entry1 = journal.stage(one, baseline.version, 'tab');
    const entry2 = journal.stage(two, baseline.version, 'tab');
    const entry3 = journal.stage(three, baseline.version, 'tab');
    const saved1 = await local.save(one, baseline.version);
    journal.acknowledge(entry1, saved1);
    expect(journal.recoverable(saved1)[0].workspace.name).toBe('D');
    const saved2 = await local.save(two, saved1.version);
    journal.acknowledge({ ...entry2, expectedVersion: saved1.version }, saved2);
    expect(journal.recoverable(saved2)[0].workspace.name).toBe('D');
    const saved3 = await local.save(three, saved2.version);
    journal.acknowledge({ ...entry3, expectedVersion: saved2.version }, saved3);
    expect(journal.list()).toEqual([]);
    expect(local.load()?.workspace.name).toBe('D');
  });
  it('retains conflicting tab histories for explicit export rather than overwriting the main version', async () => {
    const storage = new MemoryStorage(),
      local = new LocalWorkspaceStore(storage),
      journal = new WorkspaceJournal(storage);
    const initial = createWorkspace('Base'),
      baseline = await local.save(initial, null);
    journal.stage(reviseWorkspace(initial, { name: 'Tab A' }), baseline.version, 'a');
    journal.stage(reviseWorkspace(initial, { name: 'Tab B' }), baseline.version, 'b');
    expect(journal.recoverable(baseline)).toHaveLength(2);
    const newer = await local.save(
      reviseWorkspace(initial, { name: 'Stored elsewhere' }),
      baseline.version,
    );
    expect(journal.recoverable(newer)).toHaveLength(0);
    expect(journal.list()).toHaveLength(2);
    expect(local.load()?.workspace.name).toBe('Stored elsewhere');
  });
  it('preserves invalid journal bytes and surfaces unavailable storage', () => {
    const storage = new MemoryStorage(),
      journal = new WorkspaceJournal(storage);
    storage.setItem(WORKSPACE_JOURNAL_PREFIX + 'a', '{invalid');
    expect(() => journal.stage(createWorkspace('New'), null, 'a')).toThrow();
    expect(storage.getItem(WORKSPACE_JOURNAL_PREFIX + 'a')).toBe('{invalid');
    storage.clear();
    storage.setItem = () => {
      throw new Error('Full storage');
    };
    expect(() => journal.stage(createWorkspace('New'), null, 'a')).toThrow('Full storage');
  });
});
