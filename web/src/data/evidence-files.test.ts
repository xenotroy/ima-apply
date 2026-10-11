import { describe, expect, it, vi } from 'vitest';
import {
  assertEvidenceFile,
  assertEvidenceFileCheck,
  assertEvidenceFileFields,
  bytesSha256,
  checkedFileBytes,
  DEFAULT_EVIDENCE_FILE_SESSION,
  evidenceFileBindingHash,
  evidenceFileIntegrityReady,
  evidenceObjectPath,
  EvidenceFileSession,
  makeEvidenceFileCheck,
  MAX_EVIDENCE_FILE_BYTES,
  retainSelectedFile,
  type EvidenceFile,
  type EvidenceFileIdentity,
  type EvidenceFileStore,
} from './evidence-files';
import { IndexedDbEvidenceFileStore } from './evidence-file-store';

const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
const hash = '40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880';
const file = (): EvidenceFile => ({
  schema: 'ima.evidence-file/v1',
  expectedSha256: hash,
  expectedByteLength: 256,
  mimeTypeOrigin: 'unknown',
});
const evidence = (): EvidenceFileIdentity => ({
  id: 'proof-1',
  recordedAt: '2026-10-11T10:00:00Z',
  capturedBy: 'Oorspronkelijke vastlegger',
  file: file(),
});
const observed = { sha256: hash, byteLength: 256 };
const store = (): EvidenceFileStore => ({
  put: vi.fn(async () => undefined),
  get: vi.fn(async () => null),
});

describe('exact evidence bytes and independent immutable identity', () => {
  it('hashes binary NUL/invalid UTF-8 as bytes, matching the independent 0..255 vector', async () => {
    expect(bytesSha256(bytes)).toBe(hash);
    expect(await checkedFileBytes(new Blob([bytes]))).toEqual({ bytes, sha256: hash });
    expect(bytesSha256(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('refuses over-limit files before reading their bytes', async () => {
    const arrayBuffer = vi.fn();
    await expect(
      checkedFileBytes({ size: MAX_EVIDENCE_FILE_BYTES + 1, arrayBuffer } as unknown as Blob),
    ).rejects.toThrow(/maximaal/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it('retains bytes before returning a descriptor, without manufacturing MIME or author', async () => {
    const s = store();
    const blob = new File([bytes], 'inspection.bin');
    const output = await retainSelectedFile(blob, s);
    expect(s.put).toHaveBeenCalledWith(hash, blob);
    expect(output).toEqual({ ...file(), originalFileName: 'inspection.bin' });
    expect(output).not.toHaveProperty('capturedBy');
  });
  it('requires the durable store to complete before allowing record commit', async () => {
    let release!: () => void;
    const s = store();
    s.put = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let committed = false;
    const pending = retainSelectedFile(new Blob([bytes]), s).then(() => {
      committed = true;
    });
    await vi.waitFor(() => expect(s.put).toHaveBeenCalled());
    expect(committed).toBe(false);
    release();
    await pending;
    expect(committed).toBe(true);
  });
  it('does not hide quota failure or replace a migrated expected hash', async () => {
    const s = store();
    s.put = vi.fn(async () => {
      throw new Error('Quota failure');
    });
    await expect(retainSelectedFile(new Blob([bytes]), s)).rejects.toThrow(/Quota/);
    s.put = vi.fn();
    const original = file();
    await expect(retainSelectedFile(new Blob(['different bytes']), s, original)).rejects.toThrow(
      /oorspronkelijke verwachting/,
    );
    expect(s.put).not.toHaveBeenCalled();
    expect(original.expectedSha256).toBe(hash);
  });
  it('recovers original metadata unchanged rather than assigning browser MIME', async () => {
    const original = {
      ...file(),
      originalReference: 'attachments/original.pdf',
      declaredMimeType: 'application/pdf',
      mimeTypeOrigin: 'legacy' as const,
    };
    const recovered = await retainSelectedFile(
      new File([bytes], 'renamed.bin', { type: 'application/octet-stream' }),
      store(),
      original,
    );
    expect(recovered).toEqual(original);
  });
  it('validates MIME origin, safe content address, exact Git IDs and unknown fields', () => {
    const original = file();
    assertEvidenceFile(original);
    expect(() => assertEvidenceFile({ ...original, mimeTypeOrigin: 'browser' })).toThrow(
      /herkomst/,
    );
    expect(() =>
      assertEvidenceFile({ ...original, declaredMimeType: 'text/html', mimeTypeOrigin: 'unknown' }),
    ).toThrow(/herkomst/);
    expect(() => assertEvidenceFile({ ...original, bytesBase64: 'secret' })).toThrow(/onbekend/);
    expect(() => evidenceObjectPath('../bad')).toThrow(/SHA256/);
    expect(() =>
      assertEvidenceFile({
        ...original,
        storage: {
          kind: 'github-private-blob',
          owner: 'owner',
          repo: 'private',
          branch: 'main',
          path: '../bad',
          blobSha: 'a'.repeat(40),
          commitSha: 'b'.repeat(40),
        },
      }),
    ).toThrow(/pad/);
  });
  it('requires a separate human file pin; positive bytes do not imply human verification', () => {
    const e = { ...evidence(), status: 'verified' };
    expect(() => assertEvidenceFileFields(e)).toThrow(/menselijk/);
    const pinned = { ...e, verifiedFileBindingSha256: evidenceFileBindingHash(e) };
    expect(() => assertEvidenceFileFields(pinned)).not.toThrow();
    expect(() => assertEvidenceFileFields({ ...pinned, capturedBy: 'Other author' })).toThrow(
      /gewijzigd/,
    );
    expect(() => assertEvidenceFileFields({ ...pinned, file: undefined })).toThrow(/vereist/);
    expect(() =>
      assertEvidenceFileFields({
        ...evidence(),
        file: undefined,
        fileCheck: makeEvidenceFileCheck(file(), 'Actor', 'selected-file', observed),
      }),
    ).toThrow(/vereist/);
  });
  it('does not change immutable file pin when operational checks change', () => {
    const e = evidence();
    const pin = evidenceFileBindingHash(e);
    e.fileCheck = makeEvidenceFileCheck(e.file!, 'Actor', 'selected-file', observed);
    expect(evidenceFileBindingHash(e)).toBe(pin);
    e.file!.expectedByteLength = 255;
    expect(evidenceFileBindingHash(e)).not.toBe(pin);
  });
  it('allows unknown size and zero-byte files, but rejects invented matches', () => {
    assertEvidenceFile({ ...file(), expectedByteLength: undefined });
    assertEvidenceFile({ ...file(), expectedByteLength: 0 });
    const check = makeEvidenceFileCheck(file(), 'Actor', 'selected-file', observed);
    expect(() =>
      assertEvidenceFileCheck({ ...check, observedSha256: '0'.repeat(64) }, file()),
    ).toThrow(/waargenomen/);
    expect(() =>
      assertEvidenceFileCheck({ ...check, expectedSha256: '0'.repeat(64) }, file()),
    ).toThrow(/andere/);
  });
});

describe('current-session byte readiness', () => {
  it('starts unchecked on a new session and ignores persisted historical match', () => {
    const e = evidence();
    const session = new EvidenceFileSession();
    e.fileCheck = makeEvidenceFileCheck(e.file!, 'Actor', 'local-cache', observed);
    expect(evidenceFileIntegrityReady(e, { workspaceId: 'w', proofs: session.proofs })).toBe(false);
    e.fileCheck = session.record('w', e, e.fileCheck);
    expect(evidenceFileIntegrityReady(e, { workspaceId: 'w', proofs: session.proofs })).toBe(true);
    const nextSession = new EvidenceFileSession();
    expect(evidenceFileIntegrityReady(e, { workspaceId: 'w', proofs: nextSession.proofs })).toBe(
      false,
    );
    expect(evidenceFileIntegrityReady(e, { workspaceId: 'other', proofs: session.proofs })).toBe(
      false,
    );
    e.capturedBy = 'Changed author';
    expect(evidenceFileIntegrityReady(e, { workspaceId: 'w', proofs: session.proofs })).toBe(false);
  });
  it('uses default module session only after a real registered proof, not a copied nonce', () => {
    DEFAULT_EVIDENCE_FILE_SESSION.clear();
    const e = evidence();
    const tagged = DEFAULT_EVIDENCE_FILE_SESSION.record(
      'w',
      e,
      makeEvidenceFileCheck(file(), 'Actor', 'local-cache', observed),
    );
    e.fileCheck = tagged;
    expect(evidenceFileIntegrityReady(e)).toBe(true);
    DEFAULT_EVIDENCE_FILE_SESSION.clear();
    expect(evidenceFileIntegrityReady(e)).toBe(false);
  });
  it('requires unchanged private source and bound Git blob, not just cached bytes', () => {
    const e = evidence();
    e.file!.storage = {
      kind: 'github-private-blob',
      owner: 'owner',
      repo: 'private',
      branch: 'main',
      path: evidenceObjectPath(hash),
      blobSha: 'a'.repeat(40),
      commitSha: 'b'.repeat(40),
    };
    const session = new EvidenceFileSession();
    session.record('w', e, makeEvidenceFileCheck(e.file!, 'Actor', 'local-cache', observed));
    expect(evidenceFileIntegrityReady(e, { workspaceId: 'w', proofs: session.proofs })).toBe(false);
    session.record(
      'w',
      e,
      makeEvidenceFileCheck(e.file!, 'Actor', 'github-private-blob', observed, {
        sourceState: 'unchanged',
      }),
    );
    expect(evidenceFileIntegrityReady(e, { workspaceId: 'w', proofs: session.proofs })).toBe(true);
    session.record(
      'w',
      e,
      makeEvidenceFileCheck(e.file!, 'Actor', 'github-private-blob', undefined, {
        state: 'missing',
        sourceState: 'missing',
      }),
    );
    expect(evidenceFileIntegrityReady(e, { workspaceId: 'w', proofs: session.proofs })).toBe(false);
  });
  it('refuses a cloud match lacking exact bound object or source check', () => {
    const e = evidence();
    expect(() => makeEvidenceFileCheck(e.file!, 'Actor', 'github-private-blob', observed)).toThrow(
      /Cloudmatch/,
    );
  });
  it('does not let an older positive session proof overrule a known negative current check', () => {
    const e = evidence();
    const session = new EvidenceFileSession();
    session.record('w', e, makeEvidenceFileCheck(file(), 'Actor', 'local-cache', observed));
    e.fileCheck = makeEvidenceFileCheck(file(), 'Actor', 'local-cache', undefined, {
      state: 'inaccessible',
    });
    expect(evidenceFileIntegrityReady(e, { workspaceId: 'w', proofs: session.proofs })).toBe(false);
  });
  it('reports unavailable binary storage without touching the descriptor', async () => {
    const s = new IndexedDbEvidenceFileStore(undefined);
    await expect(s.put(hash, new Blob([bytes]))).rejects.toThrow(/opslag/);
  });
});
