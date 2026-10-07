import type { WorkspaceState } from './model';
import { exportWorkspace, importWorkspace, MAX_WORKSPACE_BYTES } from './validation';

export const DEFAULT_GITHUB_WORKSPACE = {
  owner: 'xenotroy',
  repo: 'ima-apply-workspaces',
  path: 'workspaces/default.json',
} as const;
export interface GitHubWorkspaceConfig {
  owner: string;
  repo: string;
  token: string;
  path?: string;
  branch?: string;
}
export type GitHubWorkspaceSnapshot =
  { workspace: WorkspaceState; sha: string } | { workspace: null; sha: null };

export class GitHubSyncError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GitHubSyncError';
    this.status = status;
  }
}

export class GitHubConflictError extends GitHubSyncError {
  constructor(status = 409) {
    super(
      'De GitHub-werkruimte is gewijzigd of de upload is afgewezen. Je lokale gegevens zijn behouden. Exporteer je versie, haal de nieuwste GitHub-versie op en vergelijk beide voordat je opnieuw publiceert.',
      status,
    );
    this.name = 'GitHubConflictError';
  }
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
}

function fromBase64(value: string): string {
  let binary: string;
  try {
    binary = atob(value.replace(/\s/g, ''));
  } catch {
    throw new GitHubSyncError(
      'GitHub retourneerde een ongeldig bestand; er is lokaal niets vervangen.',
    );
  }
  if (binary.length > MAX_WORKSPACE_BYTES)
    throw new GitHubSyncError('Het GitHub-bestand is te groot.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    );
  } catch {
    throw new GitHubSyncError('Het GitHub-bestand bevat ongeldige UTF-8.');
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GitHubSyncError('Onverwacht antwoord van GitHub.');
  return value as Record<string, unknown>;
}

function sha(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40,64}$/i.test(value))
    throw new GitHubSyncError('GitHub retourneerde een ongeldige bestandsversie.');
  return value;
}

/** Credential lives only in this instance's private memory. No local/session storage. */
export class GitHubWorkspaceClient {
  #token: string;
  readonly #base: string;
  readonly #path: string;
  readonly #branch: string | undefined;
  readonly #fetch: typeof fetch;
  #writing = false;

  constructor(
    config: GitHubWorkspaceConfig,
    fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    if (
      !/^[a-z\d][a-z\d-]{0,38}$/i.test(config.owner) ||
      !/^[a-z\d._-]{1,100}$/i.test(config.repo)
    ) {
      throw new GitHubSyncError('Vul een geldige GitHub-eigenaar en repositorynaam in.');
    }
    if (!config.token.trim() || /[\s\x00-\x1f]/.test(config.token.trim()))
      throw new GitHubSyncError('Vul een geldig GitHub-toegangstoken in.');
    const path = config.path ?? DEFAULT_GITHUB_WORKSPACE.path;
    if (
      path.length > 240 ||
      !path.endsWith('.json') ||
      path
        .split('/')
        .some((part) => !part || part === '.' || part === '..' || !/^[a-z\d._-]+$/i.test(part))
    ) {
      throw new GitHubSyncError(
        'Gebruik een relatief JSON-bestandspad, bijvoorbeeld workspaces/default.json.',
      );
    }
    if (config.branch !== undefined && (!config.branch.trim() || config.branch.length > 240))
      throw new GitHubSyncError('Ongeldige GitHub-branch.');
    this.#token = config.token.trim();
    this.#base = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
    this.#path = path.split('/').map(encodeURIComponent).join('/');
    this.#branch = config.branch;
    this.#fetch = fetcher;
  }

  disconnect(): void {
    this.#token = '';
  }

  async #request(url: string, init: RequestInit = {}): Promise<Response> {
    if (!this.#token)
      throw new GitHubSyncError('De GitHub-verbinding is gesloten. Vul het token opnieuw in.');
    try {
      return await this.#fetch(url, {
        ...init,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.#token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      // Never copy fetch exceptions, request headers, or server bodies into errors.
      throw new GitHubSyncError(
        'GitHub is niet bereikbaar of het verzoek duurde te lang. Je lokale gegevens zijn behouden. Controleer bij een upload eerst de GitHub-versie voordat je opnieuw probeert.',
      );
    }
  }

  #checkStatus(response: Response): void {
    if (response.ok) return;
    if (response.status === 401 || response.status === 403)
      throw new GitHubSyncError(
        'GitHub-toegang geweigerd. Controleer het token, repositoryrechten en de API-limiet.',
        response.status,
      );
    if (response.status === 404)
      throw new GitHubSyncError(
        'Repository, branch of bestand niet toegankelijk. Er is niets aangemaakt of overschreven.',
        404,
      );
    throw new GitHubSyncError(
      `GitHub-verzoek mislukt (HTTP ${response.status}). Je lokale gegevens zijn behouden.`,
      response.status,
    );
  }

  async #json(response: Response): Promise<Record<string, unknown>> {
    let input: string;
    try {
      input = await response.text();
    } catch {
      throw new GitHubSyncError(
        'GitHub-antwoord kon niet volledig worden gelezen. Controleer de GitHub-versie voordat je opnieuw uploadt.',
      );
    }
    if (input.length > MAX_WORKSPACE_BYTES * 2 + 20_000)
      throw new GitHubSyncError('GitHub-antwoord is te groot.');
    let result: unknown;
    try {
      result = JSON.parse(input);
    } catch {
      throw new GitHubSyncError('GitHub retourneerde ongeldige JSON.');
    }
    return asObject(result);
  }

  async #verifyPrivateRepo(): Promise<string> {
    const response = await this.#request(this.#base);
    this.#checkStatus(response);
    const repo = await this.#json(response);
    if (repo.private !== true)
      throw new GitHubSyncError(
        'Synchronisatie is alleen toegestaan naar een private datarepository. Gebruik niet de publieke apprepository.',
      );
    if (typeof repo.default_branch !== 'string' || !repo.default_branch)
      throw new GitHubSyncError('GitHub-repository heeft geen geldige standaardbranch.');
    const branch = this.#branch ?? repo.default_branch;
    // Verify a 404 is a missing file, rather than an absent branch or repository.
    const branchResponse = await this.#request(
      `${this.#base}/branches/${encodeURIComponent(branch)}`,
    );
    this.#checkStatus(branchResponse);
    await this.#json(branchResponse);
    // Metadata access alone does not prove Contents permission. GitHub can hide
    // authorization failures behind 404, so verify readable root content as well.
    const rootResponse = await this.#request(
      `${this.#base}/contents?ref=${encodeURIComponent(branch)}`,
    );
    this.#checkStatus(rootResponse);
    return branch;
  }

  async #readFile(branch: string): Promise<GitHubWorkspaceSnapshot> {
    const response = await this.#request(
      `${this.#base}/contents/${this.#path}?ref=${encodeURIComponent(branch)}`,
    );
    if (response.status === 404) {
      // Access may have been revoked between the metadata and contents requests.
      // Recheck metadata/branch before accepting absence; never treat auth as empty.
      const confirmedBranch = await this.#verifyPrivateRepo();
      if (confirmedBranch !== branch)
        throw new GitHubSyncError('De standaardbranch is gewijzigd. Maak opnieuw verbinding.');
      return { workspace: null, sha: null };
    }
    this.#checkStatus(response);
    const result = await this.#json(response);
    if (
      result.type !== 'file' ||
      result.encoding !== 'base64' ||
      typeof result.content !== 'string' ||
      typeof result.size !== 'number' ||
      !Number.isFinite(result.size) ||
      result.size > MAX_WORKSPACE_BYTES ||
      result.size < 0
    ) {
      throw new GitHubSyncError('GitHub-bestand heeft een ongeldig of te groot formaat.');
    }
    return { workspace: importWorkspace(fromBase64(result.content)), sha: sha(result.sha) };
  }

  async read(): Promise<GitHubWorkspaceSnapshot> {
    return this.#readFile(await this.#verifyPrivateRepo());
  }

  async write(
    workspace: WorkspaceState,
    expectedSha: string | null,
  ): Promise<{ workspace: WorkspaceState; sha: string }> {
    if (this.#writing)
      throw new GitHubSyncError('Er loopt al een upload. Wacht totdat deze klaar is.');
    if (expectedSha !== null) sha(expectedSha);
    const content = exportWorkspace(workspace);
    // Snapshot caller state before awaiting network requests.
    const copy = importWorkspace(content);
    this.#writing = true;
    try {
      const branch = await this.#verifyPrivateRepo();
      const current = await this.#readFile(branch);
      if (current.sha !== expectedSha) throw new GitHubConflictError();
      const response = await this.#request(`${this.#base}/contents/${this.#path}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: 'Update IMA Apply workspace',
          content: toBase64(content),
          branch,
          ...(expectedSha === null ? {} : { sha: expectedSha }),
        }),
      });
      // 422 may be a validation error, not necessarily a conflict. Either way,
      // stop; never retry with another SHA or assume the write succeeded.
      if (response.status === 409 || response.status === 422)
        throw new GitHubConflictError(response.status);
      this.#checkStatus(response);
      const result = await this.#json(response);
      return { workspace: copy, sha: sha(asObject(result.content).sha) };
    } finally {
      this.#writing = false;
    }
  }
}
