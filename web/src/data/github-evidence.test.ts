import { describe, expect, it, vi } from 'vitest';
import { GitHubEvidenceClient } from './github-evidence';
import {
  bytesSha256,
  evidenceObjectPath,
  type EvidenceFile,
  MAX_EVIDENCE_FILE_BYTES,
} from './evidence-files';

const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
const hash = bytesSha256(bytes);
const HEAD = '1'.repeat(40);
const BLOB = '2'.repeat(40);
const COMMIT = '3'.repeat(40);
const TOKEN = 'github_pat_' + 'x'.repeat(60);
const config = { owner: 'owner', repo: 'private-data', token: TOKEN };
const file = (): EvidenceFile => ({
  schema: 'ima.evidence-file/v1',
  expectedSha256: hash,
  expectedByteLength: 256,
  mimeTypeOrigin: 'unknown',
});
const stored = (): EvidenceFile => ({
  ...file(),
  storage: {
    kind: 'github-private-blob',
    owner: 'owner',
    repo: 'private-data',
    branch: 'main',
    path: evidenceObjectPath(hash),
    blobSha: BLOB,
    commitSha: COMMIT,
  },
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const privateRepo = () => [
  json({ private: true, default_branch: 'main' }),
  json({ name: 'main', commit: { sha: HEAD } }),
  json([]),
];
const metadata = (sha = BLOB, size = 256) =>
  json({ type: 'file', sha, size, encoding: 'none', content: '' });
const binary = (value = bytes) => new Response(new Uint8Array(value).buffer);
const mock = (responses: Response[]) =>
  vi.fn<typeof fetch>(async () => {
    const response = responses.shift();
    if (!response) throw new Error('Unexpected request');
    return response;
  });

describe('private create-only binary transport', () => {
  it('uploads exact binary base64 without update SHA and reads immutable bytes back', async () => {
    const fetcher = mock([
      ...privateRepo(),
      json({}, 404),
      ...privateRepo(),
      json({ content: { sha: BLOB }, commit: { sha: COMMIT } }, 201),
      binary(),
    ]);
    const client = new GitHubEvidenceClient(config, fetcher);
    expect(await client.upload(file(), new Blob([bytes]))).toEqual(stored());
    const [url, init] = fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(url).toBe(
      `https://api.github.com/repos/owner/private-data/contents/${evidenceObjectPath(hash)}`,
    );
    const body = JSON.parse(String(init!.body));
    expect(body.sha).toBeUndefined();
    expect(body.branch).toBe('main');
    expect(Uint8Array.from(atob(body.content), (char) => char.charCodeAt(0))).toEqual(bytes);
    const [readUrl, readInit] = fetcher.mock.calls.at(-1)!;
    expect(readUrl).toContain(`/git/blobs/${BLOB}`);
    expect(new Headers(readInit?.headers).get('Accept')).toBe('application/vnd.github.raw+json');
    expect(readInit?.redirect).toBe('error');
    expect(JSON.stringify(client)).not.toContain(TOKEN);
  });
  it('refuses public repositories before any file/byte request', async () => {
    const fetcher = mock([json({ private: false, default_branch: 'main' })]);
    await expect(
      new GitHubEvidenceClient(config, fetcher).upload(file(), new Blob([bytes])),
    ).rejects.toThrow(/private/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reuses an identical object without overwriting or changing its original receipt', async () => {
    const fetcher = mock([...privateRepo(), metadata(), binary()]);
    expect(
      await new GitHubEvidenceClient(config, fetcher).upload(stored(), new Blob([bytes])),
    ).toEqual(stored());
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
  it('refuses conflicting object bytes at the hash path', async () => {
    const changed = new Uint8Array(bytes);
    changed[0] = 1;
    const fetcher = mock([...privateRepo(), metadata(), binary(changed)]);
    await expect(
      new GitHubEvidenceClient(config, fetcher).upload(file(), new Blob([bytes])),
    ).rejects.toThrow(/andere bytes/);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
  it('refuses mismatched selected bytes before making a request', async () => {
    const fetcher = mock([]);
    await expect(
      new GitHubEvidenceClient(config, fetcher).upload(file(), new Blob(['other'])),
    ).rejects.toThrow(/wijken af/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([409, 422])('never retries or updates on HTTP %s create conflict', async (status) => {
    const fetcher = mock([...privateRepo(), json({}, 404), ...privateRepo(), json({}, status)]);
    await expect(
      new GitHubEvidenceClient(config, fetcher).upload(file(), new Blob([bytes])),
    ).rejects.toThrow(/conflict/);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  });
  it('checks hidden 404 against current rights before permitting creation', async () => {
    const fetcher = mock([...privateRepo(), json({}, 404), json({}, 403)]);
    await expect(
      new GitHubEvidenceClient(config, fetcher).upload(file(), new Blob([bytes])),
    ).rejects.toThrow(/toegankelijk/);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
  it('does not return an uploaded descriptor without positive byte readback', async () => {
    const changed = new Uint8Array(bytes);
    changed[1] = 0;
    const fetcher = mock([
      ...privateRepo(),
      json({}, 404),
      ...privateRepo(),
      json({ content: { sha: BLOB }, commit: { sha: COMMIT } }, 201),
      binary(changed),
    ]);
    await expect(
      new GitHubEvidenceClient(config, fetcher).upload(file(), new Blob([bytes])),
    ).rejects.toThrow(/teruggelezen/);
  });
});

describe('fresh source availability and immutable byte recheck', () => {
  it('rechecks actual byte hash and branch path at a pinned head commit', async () => {
    const fetcher = mock([...privateRepo(), metadata(), binary()]);
    const result = await new GitHubEvidenceClient(config, fetcher).recheck(
      stored(),
      'Current checker',
    );
    expect(result.check).toMatchObject({
      state: 'match',
      sourceState: 'unchanged',
      storageBlobSha: BLOB,
      observedSha256: hash,
      observedByteLength: 256,
    });
    expect(new Uint8Array(await result.blob!.arrayBuffer())).toEqual(bytes);
    expect(String(fetcher.mock.calls[3][0])).toContain(`?ref=${HEAD}`);
  });
  it('flags changed branch object even if a historical blob may still exist', async () => {
    const fetcher = mock([...privateRepo(), metadata('4'.repeat(40))]);
    const result = await new GitHubEvidenceClient(config, fetcher).recheck(stored(), 'Checker');
    expect(result.check).toMatchObject({ state: 'mismatch', sourceState: 'changed' });
    expect(result.blob).toBeUndefined();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/git/blobs/'))).toBe(false);
  });
  it('reports missing only after repository, branch and Contents access are rechecked', async () => {
    const fetcher = mock([...privateRepo(), json({}, 404), ...privateRepo()]);
    expect(
      (await new GitHubEvidenceClient(config, fetcher).recheck(stored(), 'Checker')).check,
    ).toMatchObject({ state: 'missing', sourceState: 'missing' });
  });
  it.each([401, 403, 404])('reports repo HTTP %s inaccessible, never missing', async (status) => {
    const fetcher = mock([json({}, status)]);
    expect(
      (await new GitHubEvidenceClient(config, fetcher).recheck(stored(), 'Checker')).check.state,
    ).toBe('inaccessible');
  });
  it('reports revoked access after a file 404 as inaccessible', async () => {
    const fetcher = mock([...privateRepo(), json({}, 404), json({}, 404)]);
    expect(
      (await new GitHubEvidenceClient(config, fetcher).recheck(stored(), 'Checker')).check.state,
    ).toBe('inaccessible');
  });
  it('reports changed bytes without accepting a blob or positive match', async () => {
    const changed = new Uint8Array(bytes);
    changed[255] = 0;
    const fetcher = mock([...privateRepo(), metadata(), binary(changed)]);
    const result = await new GitHubEvidenceClient(config, fetcher).recheck(stored(), 'Checker');
    expect(result.check.state).toBe('mismatch');
    expect(result.blob).toBeUndefined();
  });
  it('bounds streams even when metadata understates size', async () => {
    const raw = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_EVIDENCE_FILE_BYTES));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      }),
    );
    const fetcher = mock([...privateRepo(), metadata(), raw]);
    const result = await new GitHubEvidenceClient(config, fetcher).recheck(stored(), 'Checker');
    expect(result.check.state).toBe('inaccessible');
    expect(result.blob).toBeUndefined();
  });
  it('downloads only exact historical bytes without declaring the source unchanged', async () => {
    const fetcher = mock([...privateRepo(), binary()]);
    const blob = await new GitHubEvidenceClient(config, fetcher).downloadBoundVersion(stored());
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/contents/attachments'))).toBe(
      false,
    );
  });
  it('rejects a different repo and does not expose token text in errors', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error(TOKEN);
    });
    const client = new GitHubEvidenceClient(config, fetcher);
    const result = await client.recheck(stored(), 'Checker');
    expect(result.check.note).not.toContain(TOKEN);
    const other = stored();
    other.storage!.repo = 'another';
    expect((await client.recheck(other, 'Checker')).check.state).toBe('inaccessible');
    client.disconnect();
    expect(JSON.stringify(client)).not.toContain(TOKEN);
    await expect(client.downloadBoundVersion(stored())).rejects.toThrow(/gesloten/);
  });
});
