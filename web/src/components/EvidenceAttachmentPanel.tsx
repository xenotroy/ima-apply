import { useMemo, useState } from 'react';
import type { Evidence } from '../data/dossier';
import {
  checkedFileBytes,
  DEFAULT_EVIDENCE_FILE_SESSION,
  evidenceFileBindingHash,
  evidenceFileIntegrityReady,
  EvidenceFileSession,
  makeEvidenceFileCheck,
  MAX_EVIDENCE_FILE_BYTES,
  retainSelectedFile,
  type EvidenceAttachmentFields,
  type EvidenceFile,
  type EvidenceFileCheck,
  type EvidenceFileStore,
} from '../data/evidence-files';
import { IndexedDbEvidenceFileStore } from '../data/evidence-file-store';
import type { GitHubEvidenceClient } from '../data/github-evidence';
import { usePersistentDraft } from '../hooks/usePersistentDraft';

export interface EvidenceAttachmentPanelProps {
  workspaceId: string;
  evidence: Evidence & EvidenceAttachmentFields;
  onChange(
    patch: EvidenceAttachmentFields,
    options?: { contentChanged: boolean },
  ): void | Promise<void>;
  session?: EvidenceFileSession;
  cloud?: GitHubEvidenceClient;
  store?: EvidenceFileStore;
  onSessionChange?(): void;
  onBusyChange?(busy: boolean): void;
}

const states = {
  match: 'Bytes komen overeen',
  mismatch: 'Bestand gewijzigd / bytes wijken af',
  missing: 'Bestand ontbreekt',
  inaccessible: 'Bestand niet toegankelijk',
};

export function EvidenceAttachmentPanel({
  workspaceId,
  evidence,
  onChange,
  session = DEFAULT_EVIDENCE_FILE_SESSION,
  cloud,
  store: suppliedStore,
  onSessionChange,
  onBusyChange,
}: EvidenceAttachmentPanelProps) {
  const defaultStore = useMemo(() => new IndexedDbEvidenceFileStore(), []);
  const store = suppliedStore ?? defaultStore;
  const [operator, setOperator, operatorDraft] = usePersistentDraft(
    `${workspaceId}/evidence-file-controls/${evidence.id}`,
    { actor: '' },
    'evidence-file-controls/v1',
    (candidate) => typeof candidate.actor === 'string' && candidate.actor.length <= 2_000,
  );
  const actor = operator.actor;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [, refresh] = useState(0);
  const proof = session.proofs.find(
    (item) =>
      item.workspaceId === workspaceId &&
      item.evidenceId === evidence.id &&
      item.fileBindingSha256 === evidenceFileBindingHash(evidence),
  );
  const ready = evidenceFileIntegrityReady(evidence, { workspaceId, proofs: session.proofs });

  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    setMessage('');
    try {
      await operation();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Bestandsbewerking is mislukt. De bestaande registratie is behouden.',
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const checker = () => {
    if (!actor.trim()) throw new Error('Vul eerst in wie de bestandsbytes controleert.');
    return actor.trim();
  };
  const commit = async (patch: EvidenceAttachmentFields, check?: EvidenceFileCheck) => {
    const next = { ...evidence, ...patch };
    const contentChanged = evidenceFileBindingHash(next) !== evidenceFileBindingHash(evidence);
    if (check) patch = { ...patch, fileCheck: session.record(workspaceId, next, check) };
    try {
      await onChange(patch, { contentChanged });
    } catch (err) {
      session.clear(workspaceId, evidence.id);
      throw err;
    }
    refresh((value) => value + 1);
    onSessionChange?.();
  };
  const selectFile = (blob: File) =>
    run(async () => {
      const who = checker();
      const actual = await checkedFileBytes(blob);
      if (
        evidence.file &&
        !replacing &&
        (actual.sha256 !== evidence.file.expectedSha256 ||
          (evidence.file.expectedByteLength !== undefined &&
            blob.size !== evidence.file.expectedByteLength))
      ) {
        await commit(
          {},
          makeEvidenceFileCheck(evidence.file, who, 'selected-file', {
            sha256: actual.sha256,
            byteLength: blob.size,
          }),
        );
        throw new Error(
          'De gekozen bytes wijken af van het vastgelegde bewijs. De oorspronkelijke verwachting is behouden.',
        );
      }
      const file = await retainSelectedFile(blob, store, replacing ? undefined : evidence.file);
      const check = makeEvidenceFileCheck(file, who, 'selected-file', {
        sha256: actual.sha256,
        byteLength: blob.size,
      });
      await commit({ file }, check);
      setReplacing(false);
      setMessage(
        'Bestandsbytes duurzaam lokaal opgeslagen. Inhoudelijke beoordeling blijft een afzonderlijke stap.',
      );
    });
  const checkLocal = () =>
    run(async () => {
      const who = checker();
      const file = evidence.file!;
      let blob: Blob | null;
      try {
        blob = await store.get(file.expectedSha256);
      } catch (err) {
        await commit(
          {},
          makeEvidenceFileCheck(file, who, 'local-cache', undefined, {
            state: 'inaccessible',
            sourceState: 'unknown',
          }),
        );
        throw err;
      }
      const actual = blob ? await checkedFileBytes(blob) : undefined;
      await commit(
        {},
        makeEvidenceFileCheck(
          file,
          who,
          'local-cache',
          actual ? { sha256: actual.sha256, byteLength: blob!.size } : undefined,
          file.storage
            ? {
                sourceState: 'unknown',
                note: 'Lokale bytes gecontroleerd; actuele private cloudbron is nog niet gecontroleerd.',
              }
            : {},
        ),
      );
    });
  const upload = () =>
    run(async () => {
      const who = checker();
      if (!cloud)
        throw new Error('Maak eerst verbinding met de private GitHub-repository in Instellingen.');
      const blob = await store.get(evidence.file!.expectedSha256);
      if (!blob)
        throw new Error(
          'Lokale bijlage ontbreekt. Selecteer eerst het bestand met dezelfde vastgelegde hash.',
        );
      const file = await cloud.upload(evidence.file!, blob);
      const result = await cloud.recheck(file, who);
      await commit({ file }, result.check);
      setMessage(
        result.check.state === 'match'
          ? 'Bijlage apart in private GitHub-opslag bewaard en exact teruggelezen.'
          : 'Bijlage geplaatst; actuele beschikbaarheid vereist nog een succesvolle controle.',
      );
    });
  const checkCloud = () =>
    run(async () => {
      const who = checker();
      if (!cloud)
        throw new Error('Maak eerst verbinding met de private GitHub-repository in Instellingen.');
      const result = await cloud.recheck(evidence.file!, who);
      if (result.blob) await store.put(evidence.file!.expectedSha256, result.blob);
      await commit({}, result.check);
    });
  const download = () =>
    run(async () => {
      let blob = await store.get(evidence.file!.expectedSha256);
      if (!blob && evidence.file!.storage && cloud) {
        blob = await cloud.downloadBoundVersion(evidence.file!);
        await store.put(evidence.file!.expectedSha256, blob);
      }
      if (!blob)
        throw new Error(
          'Bestandsbytes ontbreken lokaal. Verbind de private repository of selecteer het oorspronkelijke bestand.',
        );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        evidence.file!.originalFileName?.replace(/[\\/\x00-\x1f]/g, '_') || 'bewijsbestand.bin';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage(
        'De exact gebonden bestandsversie is gedownload. Dit bevestigt geen actuele bronlocatie.',
      );
    });

  return (
    <section className="panel" aria-label="Bestandsbijlage">
      <h3>Bestandsbijlage</h3>
      <p className="caption">
        Maximaal {MAX_EVIDENCE_FILE_BYTES.toLocaleString('nl-NL')} bytes per bestand. Bijlagebytes
        staan apart van de werkruimte.
      </p>
      <label>
        Oorspronkelijke vastlegger
        <input
          value={evidence.capturedBy ?? ''}
          disabled={busy}
          placeholder="Onbekend indien niet vastgelegd"
          onChange={(e) => {
            const capturedBy = e.target.value || undefined;
            void commit({ capturedBy }).catch((err) => setError(String(err)));
          }}
        />
      </label>
      <label>
        Controleur van bestandsbytes
        <input
          value={actor}
          onChange={(e) => setOperator({ actor: e.target.value })}
          disabled={busy}
          placeholder="Naam of expliciete rol van de huidige controleur"
        />
      </label>
      {operatorDraft.error && <p role="alert">{operatorDraft.error}</p>}
      {operatorDraft.recovered && (
        <p className="caption">Naam van de bestandscontroleur hersteld uit lokaal concept.</p>
      )}
      <label>
        {evidence.file && !replacing
          ? 'Hetzelfde bewijsbestand selecteren / herstellen'
          : 'Bewijsbestand selecteren'}
        <input
          type="file"
          disabled={busy}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            e.target.value = '';
            if (selected) void selectFile(selected);
          }}
        />
      </label>
      {evidence.file && (
        <>
          <p>
            {evidence.file.originalFileName ?? 'Oorspronkelijke naam onbekend'} ·{' '}
            {evidence.file.expectedByteLength?.toLocaleString('nl-NL') ?? 'Onbekend aantal'} bytes
          </p>
          <p className="caption">
            MIME: {evidence.file.declaredMimeType ?? 'Onbekend'} · herkomst{' '}
            {evidence.file.mimeTypeOrigin}
          </p>
          <p className="caption">
            Bytes-SHA256: <code>{evidence.file.expectedSha256}</code>
          </p>
          <p role="status">
            {proof
              ? states[proof.check.state]
              : 'Bestandsbytes nog niet gecontroleerd in deze sessie'}
            {ready && ' · Controle bruikbaar in deze sessie'}
            {proof?.check.method === 'local-cache' &&
              evidence.file.storage &&
              ' · Cloudbron nog niet gecontroleerd'}
          </p>
          {evidence.fileCheck && !proof && (
            <p className="caption">
              Eerdere controle: {states[evidence.fileCheck.state]} · {evidence.fileCheck.checkedBy}{' '}
              · {evidence.fileCheck.checkedAt}. Deze controle geeft deze sessie nog geen
              bestandszekerheid.
            </p>
          )}
          {proof?.check.note && <p className="caption">{proof.check.note}</p>}
          <p className="caption">
            {evidence.file.storage
              ? `Private opslag: ${evidence.file.storage.owner}/${evidence.file.storage.repo} · ${evidence.file.storage.path}`
              : 'Bijlage nog niet naar private GitHub-opslag overgedragen.'}
          </p>
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void checkLocal()}
            >
              Lokale bytes controleren
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !cloud}
              onClick={() => void upload()}
            >
              Bijlage opslaan in private GitHub
            </button>
            {evidence.file.storage && (
              <button
                type="button"
                className="secondary"
                disabled={busy || !cloud}
                onClick={() => void checkCloud()}
              >
                Private bron opnieuw controleren
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void download()}
            >
              Gebonden bestand downloaden
            </button>
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => {
                setReplacing(!replacing);
                setError('');
              }}
            >
              Bestand vervangen (opnieuw beoordelen)
            </button>
          </div>
          {replacing && (
            <p className="info-box">
              Kies bewust een nieuwe bestandsversie. De eerdere beoordeling moet opnieuw worden
              uitgevoerd; historische dossiers behouden hun eigen bewijsbasis.
            </p>
          )}
        </>
      )}
      {busy && <p role="status">Bestandsbytes worden verwerkt…</p>}
      {error && (
        <p className="info-box" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="caption" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
