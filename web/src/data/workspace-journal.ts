import type { WorkspaceState } from './model';
import type { LocalWorkspaceSnapshot } from './local';
import { exportWorkspace, importWorkspace, MAX_WORKSPACE_BYTES } from './validation';

export const WORKSPACE_JOURNAL_PREFIX = 'ima-apply.pending-workspace.v1.';
export interface WorkspaceJournalEntry {
  schema: 'ima.workspace-journal/v1';
  id: string;
  writer: string;
  expectedVersion: string | null;
  savedAt: string;
  workspace: WorkspaceState;
}
function read(raw: string): WorkspaceJournalEntry {
  if (new TextEncoder().encode(raw).byteLength > MAX_WORKSPACE_BYTES + 2000)
    throw new Error('De tussentijdse versie is te groot en blijft bewaard.');
  const entry = JSON.parse(raw) as WorkspaceJournalEntry;
  if (
    !entry ||
    entry.schema !== 'ima.workspace-journal/v1' ||
    ![entry.id, entry.writer].every(
      (value) => typeof value === 'string' && value.trim() && value.length <= 160,
    ) ||
    !(
      entry.expectedVersion === null ||
      (typeof entry.expectedVersion === 'string' &&
        entry.expectedVersion.length <= 160 &&
        entry.expectedVersion.trim())
    ) ||
    typeof entry.savedAt !== 'string' ||
    !Number.isFinite(Date.parse(entry.savedAt)) ||
    Object.keys(entry).some(
      (key) => !['schema', 'id', 'writer', 'expectedVersion', 'savedAt', 'workspace'].includes(key),
    )
  )
    throw new Error('Onbekend formaat van de tussentijdse versie; de gegevens blijven bewaard.');
  entry.workspace = importWorkspace(JSON.stringify(entry.workspace));
  return entry;
}

export class WorkspaceJournal {
  constructor(readonly storage: Storage) {}
  list(): WorkspaceJournalEntry[] {
    const result: WorkspaceJournalEntry[] = [];
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index);
      if (!key?.startsWith(WORKSPACE_JOURNAL_PREFIX)) continue;
      const raw = this.storage.getItem(key);
      if (raw === null) continue;
      const entry = read(raw);
      if (key !== WORKSPACE_JOURNAL_PREFIX + entry.writer)
        throw new Error('Identiteit van de tussentijdse versie klopt niet.');
      result.push(entry);
    }
    return result;
  }
  stage(
    workspace: WorkspaceState,
    expectedVersion: string | null,
    writer: string,
  ): WorkspaceJournalEntry {
    const copy = importWorkspace(exportWorkspace(workspace));
    const entry: WorkspaceJournalEntry = {
      schema: 'ima.workspace-journal/v1',
      id: crypto.randomUUID(),
      writer,
      expectedVersion,
      savedAt: new Date().toISOString(),
      workspace: copy,
    };
    const key = WORKSPACE_JOURNAL_PREFIX + writer;
    const existing = this.storage.getItem(key);
    if (existing !== null) read(existing);
    const raw = JSON.stringify(entry);
    read(raw);
    this.storage.setItem(key, raw); // Synchronous: the current keystroke is recoverable before queued saving starts.
    if (this.storage.getItem(key) !== raw)
      throw new Error('Tussentijdse opslag kon niet worden bevestigd.');
    return entry;
  }
  acknowledge(entry: WorkspaceJournalEntry, saved: LocalWorkspaceSnapshot): void {
    const key = WORKSPACE_JOURNAL_PREFIX + entry.writer;
    const raw = this.storage.getItem(key);
    if (raw === null) return;
    const pending = read(raw);
    if (pending.id === entry.id) {
      this.storage.removeItem(key);
      return;
    }
    if (
      pending.expectedVersion === entry.expectedVersion &&
      pending.workspace.id === entry.workspace.id &&
      pending.workspace.revision >= entry.workspace.revision
    ) {
      // A later queued change descends from this completed write. Advance its conflict baseline.
      this.storage.setItem(key, JSON.stringify({ ...pending, expectedVersion: saved.version }));
    }
  }
  recoverable(snapshot: LocalWorkspaceSnapshot | null): WorkspaceJournalEntry[] {
    return this.list().filter((entry) => entry.expectedVersion === (snapshot?.version ?? null));
  }
}
