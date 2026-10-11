import { sha256 } from '@noble/hashes/sha2.js';
import {
  MAX_EVIDENCE_FILE_BYTES,
  type EvidenceFile,
  type EvidenceFileCheck,
  type EvidenceFileIdentity,
  type EvidenceFileIntegrityContext,
  type EvidenceFileSessionProof,
  type EvidenceFileStore,
  type GitHubEvidenceStorage,
} from './evidence-file-types';

export * from './evidence-file-types';

export class EvidenceFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceFileError';
  }
}

const currentSessionId = globalThis.crypto.randomUUID();
export const getEvidenceFileSessionId = (): string => currentSessionId;

export function bytesSha256(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function canonicalEvidenceJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalEvidenceJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalEvidenceJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new EvidenceFileError(`${label}: verwacht een object.`);
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !keys.includes(key)))
    throw new EvidenceFileError(`${label}: onbekend veld.`);
  return item;
}
function text(value: unknown, label: string, max = 2_000): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value))
    throw new EvidenceFileError(`${label}: ongeldige tekst.`);
}
function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new EvidenceFileError(`${label}: verwacht SHA256 van 64 lowercase hextekens.`);
}
function gitSha(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value))
    throw new EvidenceFileError(`${label}: ongeldige Git-objectidentiteit.`);
}
function size(value: unknown, label: string): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > MAX_EVIDENCE_FILE_BYTES
  )
    throw new EvidenceFileError(
      `${label}: bestand mag maximaal ${MAX_EVIDENCE_FILE_BYTES} bytes zijn.`,
    );
}
function time(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new EvidenceFileError(`${label}: verwacht een tijdstip met tijdzone.`);
}

export function evidenceObjectPath(hash: string): string {
  digest(hash, 'Bestandshash');
  return `attachments/sha256/${hash.slice(0, 2)}/${hash}.bin`;
}

export function assertGitHubEvidenceStorage(
  value: unknown,
  hash: string,
): asserts value is GitHubEvidenceStorage {
  const item = object(
    value,
    ['kind', 'owner', 'repo', 'branch', 'path', 'blobSha', 'commitSha'],
    'Bestandsopslag',
  );
  if (item.kind !== 'github-private-blob') throw new EvidenceFileError('Onbekende bestandsopslag.');
  if (
    typeof item.owner !== 'string' ||
    !/^[a-z\d][a-z\d-]{0,38}$/i.test(item.owner) ||
    typeof item.repo !== 'string' ||
    !/^[a-z\d._-]{1,100}$/i.test(item.repo)
  )
    throw new EvidenceFileError('Ongeldige GitHub-repository.');
  text(item.branch, 'Branch', 240);
  if (item.path !== evidenceObjectPath(hash))
    throw new EvidenceFileError('Bestandspad past niet bij de byteshash.');
  gitSha(item.blobSha, 'Blob');
  gitSha(item.commitSha, 'Commit');
}

export function assertEvidenceFile(value: unknown): asserts value is EvidenceFile {
  const item = object(
    value,
    [
      'schema',
      'expectedSha256',
      'expectedByteLength',
      'originalFileName',
      'declaredMimeType',
      'mimeTypeOrigin',
      'originalReference',
      'sourceId',
      'storage',
    ],
    'Bewijsbestand',
  );
  if (item.schema !== 'ima.evidence-file/v1')
    throw new EvidenceFileError('Onbekend bewijsbestand-schema.');
  digest(item.expectedSha256, 'Verwachte byteshash');
  if (item.expectedByteLength !== undefined)
    size(item.expectedByteLength, 'Verwachte bestandsgrootte');
  for (const key of ['originalFileName', 'originalReference', 'sourceId'])
    if (item[key] !== undefined) text(item[key], key);
  if (!['legacy', 'user', 'browser', 'unknown'].includes(item.mimeTypeOrigin as string))
    throw new EvidenceFileError('Onbekende herkomst van het MIME-type.');
  if (
    item.declaredMimeType !== undefined &&
    (typeof item.declaredMimeType !== 'string' ||
      !/^[a-z\d!#$&^_.+-]+\/[a-z\d!#$&^_.+-]+$/i.test(item.declaredMimeType))
  )
    throw new EvidenceFileError('Ongeldig gedeclareerd MIME-type.');
  if ((item.declaredMimeType === undefined) !== (item.mimeTypeOrigin === 'unknown'))
    throw new EvidenceFileError(
      'MIME-type en herkomst moeten overeenkomen; onbekend blijft onbekend.',
    );
  if (item.storage !== undefined) assertGitHubEvidenceStorage(item.storage, item.expectedSha256);
}

export function assertEvidenceFileCheck(
  value: unknown,
  file?: EvidenceFile,
): asserts value is EvidenceFileCheck {
  const item = object(
    value,
    [
      'schema',
      'expectedSha256',
      'checkedAt',
      'checkedBy',
      'method',
      'state',
      'observedSha256',
      'observedByteLength',
      'storageBlobSha',
      'sourceState',
      'note',
      'sessionId',
      'workspaceId',
    ],
    'Bestandscontrole',
  );
  if (item.schema !== 'ima.evidence-file-check/v1')
    throw new EvidenceFileError('Onbekend bestandscontrole-schema.');
  digest(item.expectedSha256, 'Gecontroleerde verwachting');
  time(item.checkedAt, 'Controletijdstip');
  text(item.checkedBy, 'Controleur');
  if (
    !['selected-file', 'local-cache', 'github-private-blob'].includes(item.method as string) ||
    !['match', 'mismatch', 'missing', 'inaccessible'].includes(item.state as string)
  )
    throw new EvidenceFileError('Ongeldige bestandscontrolemethode of uitkomst.');
  if (item.observedSha256 !== undefined) digest(item.observedSha256, 'Waargenomen byteshash');
  if (item.observedByteLength !== undefined)
    size(item.observedByteLength, 'Waargenomen bestandsgrootte');
  if (item.storageBlobSha !== undefined) gitSha(item.storageBlobSha, 'Gecontroleerde blob');
  if (
    item.sourceState !== undefined &&
    !['unchanged', 'changed', 'missing', 'inaccessible', 'unknown'].includes(
      item.sourceState as string,
    )
  )
    throw new EvidenceFileError('Ongeldige bronlocatiestatus.');
  if (item.note !== undefined) text(item.note, 'Controlenotitie');
  for (const key of ['sessionId', 'workspaceId'])
    if (item[key] !== undefined) text(item[key], key, 160);
  if (file && item.expectedSha256 !== file.expectedSha256)
    throw new EvidenceFileError('Bestandscontrole hoort bij een andere bytesverwachting.');
  if (item.state === 'match') {
    if (item.observedSha256 !== item.expectedSha256 || item.observedByteLength === undefined)
      throw new EvidenceFileError(
        'Een match vereist daadwerkelijk waargenomen overeenkomende bytes.',
      );
    if (
      file?.expectedByteLength !== undefined &&
      item.observedByteLength !== file.expectedByteLength
    )
      throw new EvidenceFileError('Bestandscontrole past niet bij de verwachte bytegrootte.');
    if (
      item.method === 'github-private-blob' &&
      (!file?.storage ||
        item.storageBlobSha !== file.storage.blobSha ||
        item.sourceState !== 'unchanged')
    )
      throw new EvidenceFileError(
        'Cloudmatch vereist de gebonden blob en ongewijzigde actuele bronlocatie.',
      );
  }
}

export function evidenceFileBindingHash(evidence: EvidenceFileIdentity): string {
  return bytesSha256(
    new TextEncoder().encode(
      canonicalEvidenceJson({
        schema: 'ima.evidence-file-review/v1',
        recordedAt: evidence.recordedAt,
        capturedBy: evidence.capturedBy ?? null,
        file: evidence.file ?? null,
      }),
    ),
  );
}

export function assertEvidenceFileFields(
  value: unknown,
): asserts value is EvidenceFileIdentity & { status?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new EvidenceFileError('Ongeldig bewijsrecord.');
  const evidence = value as EvidenceFileIdentity & { status?: string };
  text(evidence.id, 'Bewijsidentiteit', 160);
  time(evidence.recordedAt, 'Vastleggingstijdstip');
  if (evidence.capturedBy !== undefined) text(evidence.capturedBy, 'Vastlegger');
  if (evidence.file !== undefined) assertEvidenceFile(evidence.file);
  if (evidence.fileCheck !== undefined) {
    if (!evidence.file)
      throw new EvidenceFileError('Bestandscontrole vereist een bestandsbinding.');
    assertEvidenceFileCheck(evidence.fileCheck, evidence.file);
  }
  if (evidence.verifiedFileBindingSha256 !== undefined)
    digest(evidence.verifiedFileBindingSha256, 'Menselijke bestandsverificatie');
  if (!evidence.file && evidence.verifiedFileBindingSha256 !== undefined)
    throw new EvidenceFileError('Menselijke bestandsverificatie vereist een bestandsbinding.');
  if (
    evidence.status === 'verified' &&
    evidence.file &&
    evidence.verifiedFileBindingSha256 !== evidenceFileBindingHash(evidence)
  )
    throw new EvidenceFileError(
      'Bestandsbinding is niet menselijk geverifieerd of is gewijzigd sinds de verificatie.',
    );
}

export async function checkedFileBytes(blob: Blob): Promise<{ bytes: Uint8Array; sha256: string }> {
  size(blob.size, 'Bewijsbestand');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength !== blob.size)
    throw new EvidenceFileError('Bestandsbytes wijken af van de geselecteerde grootte.');
  return { bytes, sha256: bytesSha256(bytes) };
}

export async function retainSelectedFile(
  blob: Blob & { name?: string },
  store: EvidenceFileStore,
  current?: EvidenceFile,
): Promise<EvidenceFile> {
  const inspected = await checkedFileBytes(blob);
  if (
    current &&
    (current.expectedSha256 !== inspected.sha256 ||
      (current.expectedByteLength !== undefined && current.expectedByteLength !== blob.size))
  )
    throw new EvidenceFileError(
      'De gekozen bytes wijken af van het vastgelegde bewijs. De oorspronkelijke verwachting is behouden.',
    );
  const file: EvidenceFile = current
    ? structuredClone(current)
    : {
        schema: 'ima.evidence-file/v1',
        expectedSha256: inspected.sha256,
        expectedByteLength: blob.size,
        ...(blob.name ? { originalFileName: blob.name } : {}),
        ...(blob.type
          ? { declaredMimeType: blob.type, mimeTypeOrigin: 'browser' as const }
          : { mimeTypeOrigin: 'unknown' as const }),
      };
  assertEvidenceFile(file);
  // The caller may commit the descriptor only after this durable write succeeds.
  await store.put(inspected.sha256, blob);
  return file;
}

export function makeEvidenceFileCheck(
  file: EvidenceFile,
  actor: string,
  method: EvidenceFileCheck['method'],
  observed?: { sha256: string; byteLength: number },
  options: {
    now?: string;
    state?: EvidenceFileCheck['state'];
    sourceState?: EvidenceFileCheck['sourceState'];
    note?: string;
  } = {},
): EvidenceFileCheck {
  const matches =
    observed?.sha256 === file.expectedSha256 &&
    (file.expectedByteLength === undefined || observed.byteLength === file.expectedByteLength);
  const check: EvidenceFileCheck = {
    schema: 'ima.evidence-file-check/v1',
    expectedSha256: file.expectedSha256,
    checkedAt: options.now ?? new Date().toISOString(),
    checkedBy: actor,
    method,
    state: options.state ?? (matches ? 'match' : observed ? 'mismatch' : 'missing'),
    ...(observed
      ? { observedSha256: observed.sha256, observedByteLength: observed.byteLength }
      : {}),
    ...(method === 'github-private-blob' && file.storage
      ? { storageBlobSha: file.storage.blobSha }
      : {}),
    ...(options.sourceState ? { sourceState: options.sourceState } : {}),
    ...(options.note ? { note: options.note } : {}),
  };
  assertEvidenceFileCheck(check, file);
  return check;
}

export class EvidenceFileSession {
  #proofs = new Map<string, EvidenceFileSessionProof>();
  get proofs(): readonly EvidenceFileSessionProof[] {
    return structuredClone([...this.#proofs.values()]);
  }
  record(
    workspaceId: string,
    evidence: EvidenceFileIdentity,
    check: EvidenceFileCheck,
  ): EvidenceFileCheck {
    if (!evidence.file) throw new EvidenceFileError('Geen bestandsbinding om te controleren.');
    assertEvidenceFileCheck(check, evidence.file);
    const tagged = { ...structuredClone(check), sessionId: currentSessionId, workspaceId };
    const proof = {
      workspaceId,
      evidenceId: evidence.id,
      fileBindingSha256: evidenceFileBindingHash(evidence),
      check: tagged,
    };
    this.#proofs.set(`${workspaceId}\0${evidence.id}`, proof);
    return structuredClone(tagged);
  }
  clear(workspaceId?: string, evidenceId?: string): void {
    if (workspaceId === undefined) this.#proofs.clear();
    else
      for (const [key, proof] of this.#proofs)
        if (
          proof.workspaceId === workspaceId &&
          (evidenceId === undefined || proof.evidenceId === evidenceId)
        )
          this.#proofs.delete(key);
  }
}

export const DEFAULT_EVIDENCE_FILE_SESSION = new EvidenceFileSession();

export function evidenceFileIntegrityReady(
  evidence: EvidenceFileIdentity,
  context?: EvidenceFileIntegrityContext,
): boolean {
  if (!evidence.file) return true;
  if (
    evidence.fileCheck &&
    (evidence.fileCheck.state !== 'match' ||
      ['changed', 'missing', 'inaccessible'].includes(evidence.fileCheck.sourceState ?? ''))
  )
    return false;
  if (!context) {
    if (evidence.fileCheck?.sessionId !== currentSessionId || !evidence.fileCheck.workspaceId)
      return false;
    context = {
      workspaceId: evidence.fileCheck.workspaceId,
      proofs: DEFAULT_EVIDENCE_FILE_SESSION.proofs,
    };
  }
  const pin = evidenceFileBindingHash(evidence);
  const proof = context.proofs.find(
    (item) =>
      item.workspaceId === context.workspaceId &&
      item.evidenceId === evidence.id &&
      item.fileBindingSha256 === pin,
  );
  if (
    !proof ||
    proof.check.state !== 'match' ||
    proof.check.sessionId !== currentSessionId ||
    proof.check.workspaceId !== context.workspaceId
  )
    return false;
  try {
    assertEvidenceFileCheck(proof.check, evidence.file);
  } catch {
    return false;
  }
  // A cached private-cloud file alone does not establish current cloud availability.
  return (
    !evidence.file.storage ||
    (proof.check.method === 'github-private-blob' && proof.check.sourceState === 'unchanged')
  );
}
