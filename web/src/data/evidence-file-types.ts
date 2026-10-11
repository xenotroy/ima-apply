/** Byte identity is independent from the historical Evidence metadata hash. */
export const MAX_EVIDENCE_FILE_BYTES = 10_000_000;

export interface GitHubEvidenceStorage {
  kind: 'github-private-blob';
  owner: string;
  repo: string;
  branch: string;
  path: string;
  blobSha: string;
  commitSha: string;
}

export interface EvidenceFile {
  schema: 'ima.evidence-file/v1';
  expectedSha256: string;
  expectedByteLength?: number;
  originalFileName?: string;
  declaredMimeType?: string;
  mimeTypeOrigin: 'legacy' | 'user' | 'browser' | 'unknown';
  originalReference?: string;
  sourceId?: string;
  storage?: GitHubEvidenceStorage;
}

export interface EvidenceFileCheck {
  schema: 'ima.evidence-file-check/v1';
  expectedSha256: string;
  checkedAt: string;
  checkedBy: string;
  method: 'selected-file' | 'local-cache' | 'github-private-blob';
  state: 'match' | 'mismatch' | 'missing' | 'inaccessible';
  observedSha256?: string;
  observedByteLength?: number;
  storageBlobSha?: string;
  sourceState?: 'unchanged' | 'changed' | 'missing' | 'inaccessible' | 'unknown';
  note?: string;
  /** Operational only: restoring this value never restores the in-memory proof. */
  sessionId?: string;
  workspaceId?: string;
}

export interface EvidenceAttachmentFields {
  capturedBy?: string;
  file?: EvidenceFile;
  fileCheck?: EvidenceFileCheck;
  verifiedFileBindingSha256?: string;
}

export interface EvidenceFileIdentity extends EvidenceAttachmentFields {
  id: string;
  recordedAt: string;
}

/** Never serialize session proofs into a workspace or restore them on reload. */
export interface EvidenceFileSessionProof {
  workspaceId: string;
  evidenceId: string;
  fileBindingSha256: string;
  check: EvidenceFileCheck;
}

export interface EvidenceFileIntegrityContext {
  workspaceId: string;
  proofs: readonly EvidenceFileSessionProof[];
}

export interface EvidenceFileStore {
  put(sha256: string, blob: Blob): Promise<void>;
  get(sha256: string): Promise<Blob | null>;
}
