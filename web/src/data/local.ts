import { newId, type WorkspaceState } from './model';
import { exportWorkspace, importWorkspace, MAX_WORKSPACE_BYTES } from './validation';

export const LOCAL_WORKSPACE_KEY = 'ima-apply.workspace.v1';
export interface LocalWorkspaceSnapshot {
  workspace: WorkspaceState;
  version: string;
}
type LockRunner = <T>(operation: () => T | Promise<T>) => Promise<T>;

export class LocalConflictError extends Error {
  constructor() {
    super(
      'Een ander tabblad heeft de lokale werkruimte gewijzigd. Exporteer je versie en laad de opgeslagen versie voordat je verder schrijft.',
    );
    this.name = 'LocalConflictError';
  }
}

export class WorkspaceStorageError extends Error {
  constructor(
    message = 'Lokale opslag is niet beschikbaar of vol. Exporteer de huidige werkruimte als JSON.',
  ) {
    super(message);
    this.name = 'WorkspaceStorageError';
  }
}

function browserStorage(): Storage {
  try {
    return globalThis.localStorage;
  } catch {
    throw new WorkspaceStorageError();
  }
}

function browserLock(): LockRunner | undefined {
  if (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator.locks?.request
  ) {
    return (operation) => navigator.locks.request(LOCAL_WORKSPACE_KEY, operation);
  }
  return undefined;
}

export class LocalWorkspaceStore {
  readonly #storage: Storage;
  readonly #lock: LockRunner | undefined;

  constructor(storage: Storage = browserStorage(), lock: LockRunner | undefined = browserLock()) {
    if (!storage) throw new WorkspaceStorageError();
    this.#storage = storage;
    this.#lock = lock;
  }

  load(): LocalWorkspaceSnapshot | null {
    let raw: string | null;
    try {
      raw = this.#storage.getItem(LOCAL_WORKSPACE_KEY);
    } catch {
      throw new WorkspaceStorageError();
    }
    if (raw === null) return null;
    // Corrupt existing storage must never become an empty workspace automatically.
    if (new TextEncoder().encode(raw).byteLength > MAX_WORKSPACE_BYTES + 2_000) {
      throw new WorkspaceStorageError(
        'De bestaande lokale werkruimte is te groot; de gegevens zijn bewaard en worden niet overschreven.',
      );
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      throw new WorkspaceStorageError(
        'De bestaande lokale werkruimte bevat ongeldige JSON; de gegevens zijn bewaard en worden niet overschreven.',
      );
    }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      throw new WorkspaceStorageError(
        'Onbekend lokaal opslagformaat; de bestaande gegevens zijn bewaard.',
      );
    }
    const record = envelope as Record<string, unknown>;
    if (
      record.format !== 1 ||
      typeof record.version !== 'string' ||
      record.version.length > 160 ||
      !record.version ||
      Object.keys(record).some((key) => !['format', 'version', 'workspace'].includes(key))
    ) {
      throw new WorkspaceStorageError(
        'Onbekend lokaal opslagformaat; de bestaande gegevens zijn bewaard.',
      );
    }
    return {
      workspace: importWorkspace(JSON.stringify(record.workspace)),
      version: record.version,
    };
  }

  async save(
    workspace: WorkspaceState,
    expectedVersion: string | null,
  ): Promise<LocalWorkspaceSnapshot> {
    const copy = importWorkspace(exportWorkspace(workspace));
    const operation = (): LocalWorkspaceSnapshot => {
      const current = this.load();
      if ((current?.version ?? null) !== expectedVersion) throw new LocalConflictError();
      const version = newId();
      try {
        this.#storage.setItem(
          LOCAL_WORKSPACE_KEY,
          JSON.stringify({ format: 1, version, workspace: copy }),
        );
      } catch {
        throw new WorkspaceStorageError();
      }
      if (this.load()?.version !== version) throw new LocalConflictError();
      return { workspace: copy, version };
    };
    // Web Locks serializes writes across tabs on HTTPS. The synchronous fallback
    // still checks the expected version, but cannot guarantee cross-process locking.
    return this.#lock ? this.#lock(operation) : operation();
  }
}

export function loadLocalWorkspace(): LocalWorkspaceSnapshot | null {
  return new LocalWorkspaceStore().load();
}

export function saveLocalWorkspace(
  workspace: WorkspaceState,
  expectedVersion: string | null,
): Promise<LocalWorkspaceSnapshot> {
  return new LocalWorkspaceStore().save(workspace, expectedVersion);
}
