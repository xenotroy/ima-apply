import {
  assertEvidenceFile,
  bytesSha256,
  checkedFileBytes,
  evidenceObjectPath,
  EvidenceFileError,
  makeEvidenceFileCheck,
} from './evidence-files';
import {
  MAX_EVIDENCE_FILE_BYTES,
  type EvidenceFile,
  type EvidenceFileCheck,
  type GitHubEvidenceStorage,
} from './evidence-file-types';

export interface GitHubEvidenceConfig {
  owner: string;
  repo: string;
  token: string;
  branch?: string;
}
export interface GitHubEvidenceRead {
  check: EvidenceFileCheck;
  blob?: Blob;
}
export class GitHubEvidenceError extends EvidenceFileError {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubEvidenceError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GitHubEvidenceError('Onverwachte GitHub-bestandsmetadata.');
  return value as Record<string, unknown>;
}
function gitSha(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value))
    throw new GitHubEvidenceError('GitHub retourneerde een ongeldige objectidentiteit.');
  return value;
}
function encodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8_192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8_192));
  return btoa(binary);
}

/** Separate binary transport; credential exists only in this instance's memory. */
export class GitHubEvidenceClient {
  #token: string;
  #base: string;
  #writing = false;
  readonly #config: Omit<GitHubEvidenceConfig, 'token'>;
  constructor(
    config: GitHubEvidenceConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    if (
      !/^[a-z\d][a-z\d-]{0,38}$/i.test(config.owner) ||
      !/^[a-z\d._-]{1,100}$/i.test(config.repo) ||
      !config.token.trim() ||
      /[\s\x00-\x1f]/.test(config.token.trim()) ||
      (config.branch !== undefined &&
        (!config.branch.trim() || config.branch.length > 240 || /[\x00-\x1f]/.test(config.branch)))
    )
      throw new GitHubEvidenceError(
        'Vul een geldige private repository, branch en toegangstoken in.',
      );
    this.#token = config.token.trim();
    this.#config = {
      owner: config.owner,
      repo: config.repo,
      ...(config.branch ? { branch: config.branch } : {}),
    };
    this.#base = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  }
  disconnect(): void {
    this.#token = '';
  }
  async #request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.#token)
      throw new GitHubEvidenceError('Bijlageverbinding is gesloten. Vul het token opnieuw in.');
    const headers = new Headers(init.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/vnd.github+json');
    headers.set('Authorization', `Bearer ${this.#token}`);
    headers.set('X-GitHub-Api-Version', '2022-11-28');
    if (init.body) headers.set('Content-Type', 'application/json');
    try {
      return await this.fetcher(`${this.#base}${path}`, {
        ...init,
        headers,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new GitHubEvidenceError(
        'De private bijlageopslag is niet bereikbaar. Lokale bytes en gegevens zijn behouden.',
      );
    }
  }
  #ok(response: Response): void {
    if (!response.ok)
      throw new GitHubEvidenceError(
        response.status === 409 || response.status === 422
          ? 'Bijlageupload heeft een conflict of is afgewezen. Er is geen bestaand bestand overschreven.'
          : 'Private bijlage niet toegankelijk. Controleer de verbinding en repositoryrechten.',
        response.status,
      );
  }
  async #bytes(response: Response, limit = MAX_EVIDENCE_FILE_BYTES): Promise<Uint8Array> {
    const reader = response.body?.getReader();
    if (!reader) throw new GitHubEvidenceError('GitHub retourneerde geen leesbare bijlagebytes.');
    let total = 0;
    const parts: Uint8Array[] = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit)
          throw new GitHubEvidenceError('GitHub-bijlage is te groot; de overdracht is gestopt.');
        parts.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
      }
      return bytes;
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      if (error instanceof GitHubEvidenceError) throw error;
      throw new GitHubEvidenceError(
        'Bijlageoverdracht is onderbroken. Er is geen positieve controle vastgelegd.',
      );
    } finally {
      reader.releaseLock();
    }
  }
  async #json(response: Response): Promise<Record<string, unknown>> {
    this.#ok(response);
    try {
      return record(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(await this.#bytes(response, 1_500_000)),
        ),
      );
    } catch (error) {
      if (error instanceof GitHubEvidenceError) throw error;
      throw new GitHubEvidenceError('Ongeldige GitHub-bestandsmetadata.');
    }
  }
  async #private(branchOverride?: string): Promise<{ branch: string; commitSha: string }> {
    const repo = await this.#json(await this.#request(''));
    if (repo.private !== true)
      throw new GitHubEvidenceError('Bijlagen mogen uitsluitend naar een private datarepository.');
    const branch = branchOverride ?? this.#config.branch ?? repo.default_branch;
    if (typeof branch !== 'string' || !branch || branch.length > 240)
      throw new GitHubEvidenceError('Private repository heeft geen geldige branch.');
    const head = await this.#json(await this.#request(`/branches/${encodeURIComponent(branch)}`));
    const commitSha = gitSha(record(head.commit).sha);
    const root = await this.#request(`/contents?ref=${encodeURIComponent(commitSha)}`);
    this.#ok(root); // Metadata access alone is not Contents access.
    await root.body?.cancel();
    return { branch, commitSha };
  }
  #path(hash: string): string {
    return evidenceObjectPath(hash).split('/').map(encodeURIComponent).join('/');
  }
  async #metadata(hash: string, commitSha: string): Promise<Record<string, unknown> | null> {
    const response = await this.#request(
      `/contents/${this.#path(hash)}?ref=${encodeURIComponent(commitSha)}`,
      { headers: { Accept: 'application/vnd.github.object+json' } },
    );
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    const item = await this.#json(response);
    if (
      item.type !== 'file' ||
      !Number.isSafeInteger(item.size) ||
      (item.size as number) < 0 ||
      (item.size as number) > MAX_EVIDENCE_FILE_BYTES
    )
      throw new GitHubEvidenceError(
        'Bijlagemetadata bevat een ongeldig bestand of overschrijdt 10.000.000 bytes.',
      );
    gitSha(item.sha);
    return item;
  }
  async #blob(blobSha: string, expectedSize?: number): Promise<Uint8Array> {
    const response = await this.#request(`/git/blobs/${gitSha(blobSha)}`, {
      headers: { Accept: 'application/vnd.github.raw+json' },
    });
    this.#ok(response);
    const bytes = await this.#bytes(response);
    if (expectedSize !== undefined && bytes.byteLength !== expectedSize)
      throw new GitHubEvidenceError('Bijlagebytes wijken af van de GitHub-bestandsgrootte.');
    return bytes;
  }
  #sameRepository(file: EvidenceFile): void {
    if (
      !file.storage ||
      file.storage.owner.toLowerCase() !== this.#config.owner.toLowerCase() ||
      file.storage.repo.toLowerCase() !== this.#config.repo.toLowerCase()
    )
      throw new GitHubEvidenceError(
        'Maak verbinding met de private repository die in deze bijlage is vastgelegd.',
      );
  }
  async upload(file: EvidenceFile, blob: Blob): Promise<EvidenceFile> {
    assertEvidenceFile(file);
    if (this.#writing) throw new GitHubEvidenceError('Er loopt al een bijlageupload.');
    const actual = await checkedFileBytes(blob);
    if (
      actual.sha256 !== file.expectedSha256 ||
      (file.expectedByteLength !== undefined && file.expectedByteLength !== blob.size)
    )
      throw new GitHubEvidenceError(
        'De te uploaden bytes wijken af van het bewijs; de oorspronkelijke binding is behouden.',
      );
    if (file.storage) this.#sameRepository(file);
    this.#writing = true;
    try {
      const location = await this.#private();
      const existing = await this.#metadata(file.expectedSha256, location.commitSha);
      let storage: GitHubEvidenceStorage;
      if (existing) {
        const bytes = await this.#blob(gitSha(existing.sha), existing.size as number);
        if (bytesSha256(bytes) !== file.expectedSha256 || bytes.byteLength !== blob.size)
          throw new GitHubEvidenceError(
            'Het bestaande private object heeft andere bytes. Er is niets overschreven.',
          );
        storage = {
          kind: 'github-private-blob',
          owner: this.#config.owner,
          repo: this.#config.repo,
          branch: location.branch,
          path: evidenceObjectPath(file.expectedSha256),
          blobSha: gitSha(existing.sha),
          commitSha: location.commitSha,
        };
        if (file.storage?.blobSha === storage.blobSha && file.storage.branch === storage.branch)
          storage = structuredClone(file.storage);
      } else {
        // Recheck access after a hidden 404; never turn revoked rights into absence.
        await this.#private(location.branch);
        const response = await this.#request(`/contents/${this.#path(file.expectedSha256)}`, {
          method: 'PUT',
          body: JSON.stringify({
            message: `Add evidence bytes ${file.expectedSha256}`,
            content: encodeBytes(actual.bytes),
            branch: location.branch,
          }),
        });
        const result = await this.#json(response);
        const content = record(result.content);
        storage = {
          kind: 'github-private-blob',
          owner: this.#config.owner,
          repo: this.#config.repo,
          branch: location.branch,
          path: evidenceObjectPath(file.expectedSha256),
          blobSha: gitSha(content.sha),
          commitSha: gitSha(record(result.commit).sha),
        };
        // Descriptor is returned only after an immutable exact-byte readback.
        const bytes = await this.#blob(storage.blobSha, blob.size);
        if (bytesSha256(bytes) !== file.expectedSha256)
          throw new GitHubEvidenceError(
            'Upload kon niet met dezelfde bytes worden teruggelezen. Lokale bytes zijn behouden.',
          );
      }
      return { ...structuredClone(file), expectedByteLength: blob.size, storage };
    } finally {
      this.#writing = false;
    }
  }

  async recheck(file: EvidenceFile, actor: string): Promise<GitHubEvidenceRead> {
    assertEvidenceFile(file);
    const check = (
      state: EvidenceFileCheck['state'],
      sourceState: EvidenceFileCheck['sourceState'],
      note?: string,
    ) =>
      makeEvidenceFileCheck(file, actor, 'github-private-blob', undefined, {
        state,
        sourceState,
        ...(note ? { note } : {}),
      });
    try {
      this.#sameRepository(file);
      const location = await this.#private(file.storage!.branch);
      const current = await this.#metadata(file.expectedSha256, location.commitSha);
      if (!current) {
        await this.#private(file.storage!.branch);
        return {
          check: check(
            'missing',
            'missing',
            'Actuele bronlocatie ontbreekt; een oude blob is geen actuele bronlocatie.',
          ),
        };
      }
      if (current.sha !== file.storage!.blobSha)
        return {
          check: check(
            'mismatch',
            'changed',
            'Het actuele bronpad bevat een andere Git-blob. De gebonden historische versie is behouden.',
          ),
        };
      const bytes = await this.#blob(file.storage!.blobSha, current.size as number);
      const observed = { sha256: bytesSha256(bytes), byteLength: bytes.byteLength };
      const result = makeEvidenceFileCheck(file, actor, 'github-private-blob', observed, {
        sourceState: 'unchanged',
      });
      return {
        check: result,
        ...(result.state === 'match'
          ? {
              blob: new Blob([new Uint8Array(bytes).buffer], {
                type: file.declaredMimeType ?? 'application/octet-stream',
              }),
            }
          : {}),
      };
    } catch (error) {
      return {
        check: check(
          'inaccessible',
          'inaccessible',
          error instanceof GitHubEvidenceError
            ? error.message
            : 'Bestandscontrole kon niet worden uitgevoerd.',
        ),
      };
    }
  }

  /** A historical download does not establish unchanged current-source status. */
  async downloadBoundVersion(file: EvidenceFile): Promise<Blob> {
    assertEvidenceFile(file);
    this.#sameRepository(file);
    await this.#private(file.storage!.branch);
    const bytes = await this.#blob(file.storage!.blobSha, file.expectedByteLength);
    if (bytesSha256(bytes) !== file.expectedSha256)
      throw new GitHubEvidenceError(
        'De teruggehaalde bestandsbytes wijken af van de gebonden hash.',
      );
    return new Blob([new Uint8Array(bytes).buffer], {
      type: file.declaredMimeType ?? 'application/octet-stream',
    });
  }
}
