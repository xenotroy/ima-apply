import { describe, expect, it, vi } from 'vitest';
import type { Scenario } from '../domain/types';
import {
  createWorkspace,
  exportWorkspace,
  importWorkspace,
  LocalWorkspaceStore,
  LocalConflictError,
  WorkspaceStorageError,
  WorkspaceValidationError,
  GitHubWorkspaceClient,
  GitHubConflictError,
  GitHubSyncError,
  LOCAL_WORKSPACE_KEY,
  MAX_WORKSPACE_BYTES,
  reviseWorkspace,
} from './index';

class MemoryStorage implements Storage {
  #values = new Map<string, string>();
  get length() {
    return this.#values.size;
  }
  clear() {
    this.#values.clear();
  }
  getItem(key: string) {
    return this.#values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#values.delete(key);
  }
  setItem(key: string, value: string) {
    this.#values.set(key, value);
  }
}

const scenario: Scenario = {
  id: 'scenario-1',
  title: 'Valgevaar',
  description: '',
  department: 'Werkplaats',
  hazard: 'Onbeveiligde rand',
  consequence: 'Ernstig letsel',
  probability: 3,
  exposure: 6,
  effect: 15,
  controls: [
    {
      id: 'control-1',
      title: 'Randbeveiliging',
      ahs: 'collective',
      status: 'existing',
      evidence: 'verified',
      evidenceNote: 'Inspectie',
      rationale: 'Val voorkomen',
      probabilityReduction: { min: 0.2, value: 0.5, max: 0.8 },
      exposureReduction: { min: 0, value: 0, max: 0 },
      effectReduction: { min: 0, value: 0, max: 0 },
      independent: true,
      feasibility: 'easy',
      effort: 1,
      legalRequired: true,
    },
  ],
};
const workspace = () =>
  createWorkspace('Vught – façade ✅', { scenarios: [structuredClone(scenario)] });
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const TOKEN = 'github_pat_' + 'x'.repeat(60);
const config = { owner: 'xenotroy', repo: 'ima-apply-workspaces', token: TOKEN };

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function privateRepo(): Response[] {
  return [
    response({ private: true, default_branch: 'main' }),
    response({ name: 'main' }),
    response([{ type: 'file', name: 'README.md' }]),
  ];
}
function content(ws = workspace(), hash = SHA): Response {
  const input = exportWorkspace(ws);
  const binary = Array.from(new TextEncoder().encode(input), (byte) =>
    String.fromCharCode(byte),
  ).join('');
  return response({
    type: 'file',
    encoding: 'base64',
    size: new TextEncoder().encode(input).byteLength,
    sha: hash,
    content: btoa(binary),
  });
}
function mockFetch(responses: Response[]) {
  return vi.fn<typeof fetch>().mockImplementation(async () => {
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return next;
  });
}

describe('workspace schema boundary', () => {
  it('round-trips Unicode, scenarios and historical answer snapshots', () => {
    const ws = workspace();
    ws.answers = [
      {
        id: 'answer-1',
        questionId: 'q-1',
        choice: 'unknown',
        evidence: '',
        note: 'Nog controleren',
        answeredAt: new Date().toISOString(),
        questionSnapshot: 'Was de rand beveiligd?',
        sourceIds: ['source-1'],
        contentVersion: '2.0.0',
      },
    ];
    expect(importWorkspace(exportWorkspace(ws))).toEqual(ws);
  });

  it('rejects malformed, missing, future-version and oversized imports', () => {
    expect(() => importWorkspace('{')).toThrow(WorkspaceValidationError);
    expect(() => importWorkspace('{}')).toThrow(WorkspaceValidationError);
    expect(() => importWorkspace(JSON.stringify({ ...workspace(), schemaVersion: 2 }))).toThrow(
      WorkspaceValidationError,
    );
    expect(() => importWorkspace(' '.repeat(MAX_WORKSPACE_BYTES + 1))).toThrow(
      WorkspaceValidationError,
    );
    expect(() => importWorkspace('é'.repeat(MAX_WORKSPACE_BYTES / 2 + 1))).toThrow(
      WorkspaceValidationError,
    );
  });

  it('rejects foreign top-level data and duplicate identifiers', () => {
    expect(() => importWorkspace(JSON.stringify({ ...workspace(), unsafe: true }))).toThrow(
      WorkspaceValidationError,
    );
    const ws = workspace();
    ws.scenarios.push(structuredClone(ws.scenarios[0]));
    expect(() => exportWorkspace(ws)).toThrow(/dubbele id/);
  });

  it('rejects imported questions that would break the questionnaire screen', () => {
    const ws = workspace();
    ws.questions = [
      {
        id: 'q-1',
        themeId: 't-1',
        prompt: 'Is de rand beveiligd?',
        assessmentGuidance: '',
        evidenceHints: ['Inspectie'],
        sourceIds: [],
        roles: [],
        suggestedHierarchy: ['collective'],
      },
    ];
    expect(importWorkspace(exportWorkspace(ws)).questions).toEqual(ws.questions);
    ws.questions[0].evidenceHints = [{ unexpected: 'object' }];
    expect(() => exportWorkspace(ws)).toThrow(WorkspaceValidationError);
  });

  it('omits optional undefined object fields safely but rejects undefined array values', () => {
    const ws = workspace();
    ws.scenarios[0].controls[0].dependencyGroup = undefined;
    expect(
      importWorkspace(exportWorkspace(ws)).scenarios[0].controls[0].dependencyGroup,
    ).toBeUndefined();
    ws.scenarios[0].sourceIds = [undefined as unknown as string];
    expect(() => exportWorkspace(ws)).toThrow(WorkspaceValidationError);
  });

  it('rejects impossible score factors, control reductions and negative effort', () => {
    const ws = workspace();
    ws.scenarios[0].probability = 0;
    expect(() => exportWorkspace(ws)).toThrow(WorkspaceValidationError);
    ws.scenarios[0].probability = 3;
    ws.scenarios[0].controls[0].probabilityReduction = { min: 0.9, value: 0.1, max: 0.8 };
    expect(() => exportWorkspace(ws)).toThrow(/min ≤ value ≤ max/);
    ws.scenarios[0].controls[0].probabilityReduction = { min: 0, value: 1.2, max: 1.3 };
    expect(() => exportWorkspace(ws)).toThrow(WorkspaceValidationError);
    ws.scenarios[0].controls[0].probabilityReduction = { min: 0, value: 0, max: 0 };
    ws.scenarios[0].controls[0].effort = -1;
    expect(() => exportWorkspace(ws)).toThrow(WorkspaceValidationError);
  });

  it('rejects schema-valid inputs that cannot safely be calculated', () => {
    const tinyScore = workspace();
    tinyScore.scenarios[0].probability = Number.MIN_VALUE;
    tinyScore.scenarios[0].exposure = Number.MIN_VALUE;
    expect(() => exportWorkspace(tinyScore)).toThrow(/risicoberekening is ongeldig/);

    const overflowingPriority = workspace();
    overflowingPriority.scenarios[0].controls[0].status = 'planned';
    overflowingPriority.scenarios[0].controls[0].effort = Number.MIN_VALUE;
    expect(() => exportWorkspace(overflowingPriority)).toThrow(/risicoberekening is ongeldig/);
  });

  it('rejects invalid LOPA PFD instead of calculating zero residual risk', () => {
    const ws = workspace();
    ws.scenarios[0].lopa = {
      initiatingEvent: 'Verlies van containment',
      initiatingFrequency: { min: 0.01, value: 0.1, max: 0.2 },
      frequencyEvidence: 'Aanname',
      consequence: 'Brand',
      modifiers: [],
      targetFrequency: 0.001,
      assumptions: '',
      layers: [
        {
          id: 'ipl-1',
          title: 'Interlock',
          status: 'existing',
          evidence: 'verified',
          evidenceNote: '',
          pfd: { min: 0, value: 0, max: 0 },
          specific: true,
          independent: true,
          independentOfInitiator: true,
          auditable: true,
          effective: true,
          independenceNote: '',
        },
      ],
    };
    expect(() => exportWorkspace(ws)).toThrow(WorkspaceValidationError);
  });

  it('rejects secrets in generic metadata and free text without echoing them', () => {
    const withSecretKey = JSON.stringify({
      ...workspace(),
      sources: [{ id: 's-1', githubToken: TOKEN }],
    });
    const withSecretValue = JSON.stringify({ ...workspace(), name: TOKEN });
    for (const input of [withSecretKey, withSecretValue]) {
      try {
        importWorkspace(input);
        throw new Error('must reject');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkspaceValidationError);
        expect(String(error)).not.toContain(TOKEN);
      }
    }
  });

  it('rejects prototype-pollution keys and deeply nested content', () => {
    const malicious = exportWorkspace(workspace()).replace(
      '"sources": []',
      '"sources": [{"id":"s-1","__proto__":{"polluted":true}}]',
    );
    expect(() => importWorkspace(malicious)).toThrow(WorkspaceValidationError);
    let nested: unknown = 'x';
    for (let index = 0; index < 24; index++) nested = { nested };
    expect(() =>
      importWorkspace(JSON.stringify({ ...workspace(), sources: [{ id: 's-1', nested }] })),
    ).toThrow(/te diep/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('advances revision and preserves identity when editing', () => {
    const original = workspace();
    const revised = reviseWorkspace(original, { name: 'Nieuwe naam' });
    expect(revised.id).toBe(original.id);
    expect(revised.revision).toBe(original.revision + 1);
    expect(original.name).not.toBe(revised.name);
  });

  it('requires an owner, effect verification and verification date before closing an action', () => {
    const ws = workspace();
    ws.actions = [
      {
        id: 'action-1',
        title: 'Randbeveiliging plaatsen',
        owner: 'Facilitair',
        dueDate: '',
        status: 'done',
        notes: 'Geplaatst',
      },
    ];
    expect(() => exportWorkspace(ws)).toThrow(WorkspaceValidationError);
    ws.actions[0].effectCheck = 'Praktijkinspectie bevestigt doorlopende randbeveiliging.';
    ws.actions[0].verifiedAt = new Date().toISOString();
    expect(importWorkspace(exportWorkspace(ws)).actions[0].status).toBe('done');
    ws.actions[0].owner = '';
    expect(() => exportWorkspace(ws)).toThrow(WorkspaceValidationError);
  });
});

describe('durable browser storage', () => {
  it('requires an expected version and never overwrites another tab silently', async () => {
    const storage = new MemoryStorage();
    const first = new LocalWorkspaceStore(storage);
    const other = new LocalWorkspaceStore(storage);
    expect(first.load()).toBeNull();
    const saved = await first.save(workspace(), null);
    expect(other.load()).toEqual(saved);
    const newest = await other.save(
      reviseWorkspace(saved.workspace, { name: 'Van ander tabblad' }),
      saved.version,
    );
    await expect(first.save(workspace(), saved.version)).rejects.toBeInstanceOf(LocalConflictError);
    await expect(first.save(workspace(), null)).rejects.toBeInstanceOf(LocalConflictError);
    expect(first.load()).toEqual(newest);
  });

  it('does not reset malformed existing storage to a fresh demo', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_WORKSPACE_KEY, '{malformed');
    const store = new LocalWorkspaceStore(storage);
    expect(() => store.load()).toThrow(WorkspaceStorageError);
    await expect(store.save(workspace(), null)).rejects.toBeInstanceOf(WorkspaceStorageError);
    expect(storage.getItem(LOCAL_WORKSPACE_KEY)).toBe('{malformed');
  });

  it('does not save mutations made after a save was requested', async () => {
    const storage = new MemoryStorage();
    const store = new LocalWorkspaceStore(storage);
    const ws = workspace();
    const saving = store.save(ws, null);
    ws.name = 'Changed after call';
    expect((await saving).workspace.name).not.toBe(ws.name);
    expect(store.load()?.workspace.name).not.toBe(ws.name);
  });

  it('reports quota failure while preserving the previously saved workspace', async () => {
    const storage = new MemoryStorage();
    const store = new LocalWorkspaceStore(storage);
    const saved = await store.save(workspace(), null);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    await expect(
      store.save(reviseWorkspace(saved.workspace, { name: 'New' }), saved.version),
    ).rejects.toBeInstanceOf(WorkspaceStorageError);
    expect(store.load()).toEqual(saved);
  });

  it('allows only one initial writer when two tabs start with no data', async () => {
    const storage = new MemoryStorage();
    const results = await Promise.allSettled([
      new LocalWorkspaceStore(storage).save(workspace(), null),
      new LocalWorkspaceStore(storage).save(workspace(), null),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});

describe('GitHub private-data synchronization', () => {
  it('decodes Unicode content and exposes a SHA for optimistic concurrency', async () => {
    const ws = workspace();
    const fetcher = mockFetch([...privateRepo(), content(ws)]);
    const client = new GitHubWorkspaceClient(config, fetcher);
    expect(await client.read()).toEqual({ workspace: ws, sha: SHA });
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(fetcher.mock.calls[0][1]?.credentials).toBe('omit');
    expect(JSON.stringify(client)).not.toContain(TOKEN);
  });

  it('refuses a public data repository before reading or writing content', async () => {
    const fetcher = mockFetch([response({ private: false, default_branch: 'main' })]);
    const client = new GitHubWorkspaceClient(config, fetcher);
    await expect(client.write(workspace(), null)).rejects.toThrow(/private datarepository/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404])(
    'never treats repository HTTP %s as an empty workspace',
    async (status) => {
      const fetcher = mockFetch([response({ message: 'denied' }, status)]);
      await expect(new GitHubWorkspaceClient(config, fetcher).read()).rejects.toBeInstanceOf(
        GitHubSyncError,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('verifies Contents access so metadata-only authorization cannot masquerade as absence', async () => {
    const fetcher = mockFetch([
      response({ private: true, default_branch: 'main' }),
      response({ name: 'main' }),
      response({}, 404),
    ]);
    await expect(new GitHubWorkspaceClient(config, fetcher).read()).rejects.toBeInstanceOf(
      GitHubSyncError,
    );
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('requires a verified missing file before creating and excludes SHA on creation', async () => {
    const fetcher = mockFetch([
      ...privateRepo(),
      response({}, 404),
      ...privateRepo(),
      response({ content: { sha: OTHER_SHA } }, 201),
    ]);
    const ws = workspace();
    expect(await new GitHubWorkspaceClient(config, fetcher).write(ws, null)).toEqual({
      workspace: ws,
      sha: OTHER_SHA,
    });
    const put = fetcher.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put).toBeDefined();
    const body = JSON.parse(String(put![1]?.body));
    expect(body.sha).toBeUndefined();
    expect(body.branch).toBe('main');
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it('does not create after a missing-file response if access is subsequently revoked', async () => {
    const fetcher = mockFetch([...privateRepo(), response({}, 404), response({}, 403)]);
    await expect(
      new GitHubWorkspaceClient(config, fetcher).write(workspace(), null),
    ).rejects.toBeInstanceOf(GitHubSyncError);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('rejects a stale or absent SHA before issuing any upload', async () => {
    for (const expected of [null, OTHER_SHA]) {
      const fetcher = mockFetch([...privateRepo(), content()]);
      await expect(
        new GitHubWorkspaceClient(config, fetcher).write(workspace(), expected),
      ).rejects.toBeInstanceOf(GitHubConflictError);
      expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    }
  });

  it.each([409, 422])(
    'stops after HTTP %s without auto-retrying or overwriting',
    async (status) => {
      const fetcher = mockFetch([
        ...privateRepo(),
        content(),
        response({ message: 'conflict' }, status),
      ]);
      await expect(
        new GitHubWorkspaceClient(config, fetcher).write(workspace(), SHA),
      ).rejects.toBeInstanceOf(GitHubConflictError);
      expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
    },
  );

  it('uses the expected SHA and preserves a snapshot of the submitted workspace', async () => {
    const fetcher = mockFetch([
      ...privateRepo(),
      content(),
      response({ content: { sha: OTHER_SHA } }),
    ]);
    const ws = workspace();
    const submittedName = ws.name;
    const uploading = new GitHubWorkspaceClient(config, fetcher).write(ws, SHA);
    ws.name = 'Later edit';
    expect((await uploading).workspace.name).toBe(submittedName);
    const put = fetcher.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put![1]?.body)).sha).toBe(SHA);
  });

  it('sanitizes network errors and disconnects without persisting credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`network failure ${TOKEN}`));
    const client = new GitHubWorkspaceClient(config, fetcher);
    try {
      await client.read();
    } catch (error) {
      expect(String(error)).not.toContain(TOKEN);
    }
    client.disconnect();
    await expect(client.read()).rejects.toThrow(/gesloten/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(exportWorkspace(workspace())).not.toContain(TOKEN);
  });

  it('rejects token-bearing paths and external host injection', () => {
    expect(
      () => new GitHubWorkspaceClient({ ...config, owner: 'https://attacker.example' }),
    ).toThrow(GitHubSyncError);
    expect(() => new GitHubWorkspaceClient({ ...config, path: '../secret.json' })).toThrow(
      GitHubSyncError,
    );
    expect(
      () => new GitHubWorkspaceClient({ ...config, path: 'https://attacker.example/a.json' }),
    ).toThrow(GitHubSyncError);
  });
});
