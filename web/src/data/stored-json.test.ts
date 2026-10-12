import { describe, expect, it } from 'vitest';
import { encodeStoredJson, decodeStoredJson } from './stored-json';
import { createWorkspace, reviseWorkspace } from './model';
import { LocalWorkspaceStore } from './local';
import { WorkspaceJournal } from './workspace-journal';
import { exportWorkspace } from './validation';
class QuotaStorage implements Storage {
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
    const next = new Map(this.values).set(key, value);
    if (
      [...next].reduce((sum, [key, value]) => sum + (key.length + value.length) * 2, 0) >
      5 * 1024 * 1024
    )
      throw new Error('Storage quota');
    this.values = next;
  }
}
describe('large native workspaces in bounded browser storage', () => {
  it('reads existing plain envelopes without migration', () => {
    const original = { format: 1, version: 'old', workspace: { name: 'Bestaand' } };
    expect(encodeStoredJson(original)).toBe(JSON.stringify(original));
    expect(decodeStoredJson(JSON.stringify(original), 10000)).toEqual(original);
  });
  it('roundtrips large Unicode JSON and rejects corrupted or oversized compressed records', () => {
    const original = { body: 'Ω€ onderzoek '.repeat(150000) };
    const raw = encodeStoredJson(original);
    expect(raw.length).toBeLessThan(100000);
    expect(decodeStoredJson(raw, 8000000)).toEqual(original);
    const record = JSON.parse(raw);
    expect(() =>
      decodeStoredJson(JSON.stringify({ ...record, sha256: '0'.repeat(64) }), 8000000),
    ).toThrow(/controle/);
    expect(() =>
      decodeStoredJson(JSON.stringify({ ...record, byteLength: 8000001 }), 8000000),
    ).toThrow(/Ongeldige/);
    expect(() =>
      decodeStoredJson(JSON.stringify({ ...record, body: '!not-base64!' }), 8000000),
    ).toThrow();
  });
  it('keeps a large library and latest interrupted edit recoverable together under a 5MiB UTF-16 quota', async () => {
    const workspace = createWorkspace('Fictieve grote bibliotheek', {
      contentRecords: Array.from({ length: 40 }, (_, index) => ({
        id: `fictief-${index}`,
        body: 'Ω'.repeat(40000),
      })),
    });
    expect(new TextEncoder().encode(exportWorkspace(workspace)).length).toBeGreaterThan(2000000);
    const storage = new QuotaStorage();
    const local = new LocalWorkspaceStore(storage);
    const journal = new WorkspaceJournal(storage);
    const first = await local.save(workspace, null);
    const queued = reviseWorkspace(workspace, { name: 'Laatste interviewinvoer intact' });
    const latest = reviseWorkspace(queued, { name: 'Nog nieuwere interviewinvoer intact' });
    const pending = journal.stage(queued, first.version, 'tab-test');
    journal.stage(latest, first.version, 'tab-test');
    const saved = await local.save(queued, first.version);
    journal.acknowledge(pending, saved);
    expect(new LocalWorkspaceStore(storage).load()?.workspace).toEqual(queued);
    const recovered = new WorkspaceJournal(storage).recoverable(local.load());
    expect(recovered).toHaveLength(1);
    expect(recovered[0].workspace).toEqual(latest);
    expect(recovered[0].expectedVersion).toBe(saved.version);
    expect(recovered[0].workspace.contentRecords).toEqual(workspace.contentRecords);
  });
});

import { completeModuleOptions } from './module-selection';
import type { PlannedModule } from './module-plan';
it('adds new library options disabled while preserving an existing selected draft and exclusions', () => {
  const original: PlannedModule = {
    id: 'old',
    origin: 'imported_theme',
    code: 'old',
    title: 'Old',
    questionIds: ['a', 'b'],
    enabled: true,
    excludedQuestionIds: ['b'],
    scopeNotes: 'Bewuste uitsluiting',
    sourceIds: [],
  };
  const added: PlannedModule = { ...original, id: 'new', questionIds: ['c'], enabled: true };
  const completed = completeModuleOptions([original], [{ ...original, enabled: false }, added]);
  expect(completed[0]).toEqual(original);
  expect(completed[1].enabled).toBe(false);
  expect(added.enabled).toBe(true);
});
