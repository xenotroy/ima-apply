import { useState, type FormEvent, type ReactNode } from 'react';
import { Plus, Save } from 'lucide-react';
import type { WorkspacePatch, WorkspaceState } from '../data/model';
import { newId } from '../data/model';
import {
  basisRiskFactorStatusLabels,
  changeBasisRiskFactorStatus,
  type BasisRiskFactorRecord,
  type BasisRiskFactorStatus,
} from '../data/brf';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export default function BasisRiskFactorRegister({
  workspace,
  onUpdate,
}: {
  workspace: WorkspaceState;
  onUpdate: (patch: WorkspacePatch) => boolean;
}) {
  const records = workspace.basisRiskFactorRecords ?? [];
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<BasisRiskFactorRecord | null>(null);
  const [previousSource, setPreviousSource] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<{
    id: string;
    status: BasisRiskFactorStatus;
    actor: string;
    reason: string;
    source: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const selected = records.find((record) => record.id === selectedId);
  function begin(previous?: BasisRiskFactorRecord) {
    setError('');
    setMessage('');
    setStatusDraft(null);
    setPreviousSource(previous ? JSON.stringify(previous) : null);
    setDraft({
      id: newId(),
      factorId: previous?.factorId ?? newId(),
      taxonomy: previous?.taxonomy ?? 'project-brf',
      code: previous?.code ?? '',
      title: previous?.title ?? '',
      version: previous ? '' : '1.0.0',
      status: 'draft',
      description: previous?.description ?? '',
      sourceReference: previous?.sourceReference ?? '',
      owner: previous?.owner ?? '',
      createdBy: '',
      createdAt: new Date().toISOString(),
      changeNote: '',
      ...(previous ? { supersedesId: previous.id } : {}),
      ...(previous?.parentRecordId ? { parentRecordId: previous.parentRecordId } : {}),
      statusHistory: [],
    });
  }
  function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!draft) return;
    const previous = records.find((record) => record.id === draft.supersedesId);
    if ((previous ? JSON.stringify(previous) : null) !== previousSource) {
      setError(
        'De vorige BRF-versie is intussen gewijzigd. Je concept blijft bewaard; open de actuele versie voordat je haar opvolger vastlegt.',
      );
      return;
    }
    const saved: BasisRiskFactorRecord = {
      ...draft,
      taxonomy: draft.taxonomy.trim(),
      code: draft.code.trim(),
      title: draft.title.trim(),
      version: draft.version.trim(),
      description: draft.description.trim(),
      sourceReference: draft.sourceReference.trim(),
      owner: draft.owner.trim(),
      createdBy: draft.createdBy.trim(),
      changeNote: draft.changeNote.trim(),
      createdAt: new Date().toISOString(),
    };
    if (
      records.some(
        (record) => record.factorId === saved.factorId && record.version === saved.version,
      )
    ) {
      setError(
        'Deze BRF-identiteit heeft deze versie al. Kies een nieuwe expliciete versie; de vorige inhoud wordt niet overschreven.',
      );
      return;
    }
    if (!onUpdate({ basisRiskFactorRecords: [...records, saved] })) {
      setError('De BRF-versie kon niet worden opgeslagen. Je concept blijft beschikbaar.');
      return;
    }
    setSelectedId(saved.id);
    setDraft(null);
    setMessage('Nieuwe BRF-definitieversie als concept vastgelegd.');
  }
  function saveStatus(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!statusDraft) return;
    const record = records.find((item) => item.id === statusDraft.id);
    if (!record || JSON.stringify(record) !== statusDraft.source) {
      setError(
        'Deze BRF-versie is intussen gewijzigd. Open de actuele registratie voordat je haar status wijzigt.',
      );
      return;
    }
    try {
      const next = changeBasisRiskFactorStatus(
        record,
        statusDraft.status,
        statusDraft.actor,
        statusDraft.reason,
      );
      if (
        !onUpdate({
          basisRiskFactorRecords: records.map((item) => (item.id === next.id ? next : item)),
        })
      ) {
        setError('De statuswijziging kon niet worden opgeslagen; je invoer blijft beschikbaar.');
        return;
      }
      setStatusDraft(null);
      setMessage('BRF-status en redenering opgeslagen.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'De statuswijziging is ongeldig.');
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Lokaal BRF-register</h2>
          <button className="primary" onClick={() => begin()}>
            <Plus size={16} /> Nieuwe basisrisicofactor
          </button>
        </div>
        <p>
          Beheer eigen definities van onderliggende systeemcondities. Leg bron, betekenis, eigenaar
          en versie vast. Een onderzoekskoppeling vraagt nog een onderbouwde beoordeling.
        </p>
        <p className="caption">
          Dit register is een lokale projecttaxonomie. Het verklaart geen oorzaak automatisch en
          stelt geen canonieke Tripod-codering vast.
        </p>
        {!records.length && (
          <p className="muted">
            Nog geen beheerde BRF-definities. Bestaande vrije codes blijven in hun onderzoeken
            bewaard.
          </p>
        )}
        <div className="button-row">
          {records.map((record) => (
            <button
              key={record.id}
              className={selectedId === record.id ? 'primary' : 'secondary'}
              onClick={() => {
                setSelectedId(record.id);
                setError('');
                setMessage('');
              }}
            >
              {record.code} · {record.title} @{record.version} ·{' '}
              {basisRiskFactorStatusLabels[record.status]}
            </button>
          ))}
        </div>
      </section>
      {error && (
        <p className="rose-text" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="green-text" role="status">
          {message}
        </p>
      )}
      {selected && (
        <section className="panel">
          <div className="panel-heading">
            <h2>
              {selected.code} — {selected.title} @{selected.version}
            </h2>
            <span className="muted">{basisRiskFactorStatusLabels[selected.status]}</span>
          </div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{selected.description}</p>
          <p>Bron/afspraak: {selected.sourceReference || 'Nog niet vastgelegd'}</p>
          <p>
            Eigenaar: {selected.owner || 'Nog niet vastgelegd'} · vastlegger{' '}
            {selected.createdBy || 'Onbekend'}
          </p>
          <p className="caption">
            Taxonomie {selected.taxonomy} · stabiele identiteit {selected.factorId}
            <br />
            Definitieversie {selected.id} · {new Date(selected.createdAt).toLocaleString('nl-NL')}
            <br />
            Versieredenering: {selected.changeNote}
          </p>
          {selected.supersedesId && (
            <p className="caption">
              Voorganger: {records.find((item) => item.id === selected.supersedesId)?.version} [
              {selected.supersedesId}]
            </p>
          )}
          {selected.parentRecordId && (
            <p className="caption">
              Bovenliggende versie:{' '}
              {records.find((item) => item.id === selected.parentRecordId)?.title} [
              {selected.parentRecordId}]
            </p>
          )}
          <div className="button-row">
            <button className="secondary" onClick={() => begin(selected)}>
              Nieuwe definitieversie
            </button>
            {selected.status !== 'retired' && (
              <button
                className="secondary"
                onClick={() => {
                  setDraft(null);
                  setStatusDraft({
                    id: selected.id,
                    status: selected.status === 'draft' ? 'local' : 'retired',
                    actor: '',
                    reason: '',
                    source: JSON.stringify(selected),
                  });
                  setError('');
                  setMessage('');
                }}
              >
                Status wijzigen
              </button>
            )}
          </div>
          {selected.statusHistory.length > 0 && (
            <details>
              <summary>Statusgeschiedenis</summary>
              {selected.statusHistory.map((event, index) => (
                <p key={index}>
                  {basisRiskFactorStatusLabels[event.from]} →{' '}
                  {basisRiskFactorStatusLabels[event.to]} · {event.actor} ·{' '}
                  {new Date(event.at).toLocaleString('nl-NL')}
                  <br />
                  {event.reason}
                </p>
              ))}
            </details>
          )}
        </section>
      )}
      {draft && (
        <form className="panel" onSubmit={save}>
          <div className="panel-heading">
            <h2>
              {draft.supersedesId ? 'Nieuwe BRF-definitieversie' : 'Nieuwe basisrisicofactor'}
            </h2>
            <span className="muted">Concept</span>
          </div>
          <p className="caption">
            Een gewijzigde betekenis krijgt een nieuwe versie-ID. Eerdere versies en
            onderzoeksverwijzingen blijven bestaan.
          </p>
          <div className="form-grid">
            <Field label="Lokale taxonomie">
              <input
                required
                readOnly={Boolean(draft.supersedesId)}
                value={draft.taxonomy}
                onChange={(e) =>
                  setDraft({ ...draft, taxonomy: e.target.value, parentRecordId: undefined })
                }
              />
            </Field>
            <Field label="BRF-code">
              <input
                required
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </Field>
            <Field label="Titel basisrisicofactor">
              <input
                required
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Definitieversie">
              <input
                required
                value={draft.version}
                onChange={(e) => setDraft({ ...draft, version: e.target.value })}
                placeholder="Bijvoorbeeld 1.0.0 of project-2026-10"
              />
            </Field>
          </div>
          <Field label="Betekenis en toepassingsgrenzen">
            <textarea
              required
              rows={4}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Welke systeemconditie bedoel je, en wat valt erbuiten?"
            />
          </Field>
          <Field label="Bron of lokale afspraak">
            <textarea
              value={draft.sourceReference}
              onChange={(e) => setDraft({ ...draft, sourceReference: e.target.value })}
              placeholder="Document, versie, pagina of lokaal vastgelegde afspraak; onbekend mag in concept leeg blijven."
            />
          </Field>
          <div className="form-grid">
            <Field label="Inhoudelijk eigenaar">
              <input
                value={draft.owner}
                onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
              />
            </Field>
            <Field label="Vastlegger van deze versie">
              <input
                required
                value={draft.createdBy}
                onChange={(e) => setDraft({ ...draft, createdBy: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Bovenliggende definitieversie">
            <select
              value={draft.parentRecordId ?? ''}
              onChange={(e) => setDraft({ ...draft, parentRecordId: e.target.value || undefined })}
            >
              <option value="">Geen bovenliggende versie</option>
              {records
                .filter(
                  (record) =>
                    record.taxonomy === draft.taxonomy && record.factorId !== draft.factorId,
                )
                .map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.code} · {record.title} @{record.version}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Redenering bij deze definitieversie">
            <textarea
              required
              value={draft.changeNote}
              onChange={(e) => setDraft({ ...draft, changeNote: e.target.value })}
            />
          </Field>
          <div className="button-row">
            <button className="primary" type="submit">
              <Save size={16} /> BRF-versie vastleggen
            </button>
            <button className="secondary" type="button" onClick={() => setDraft(null)}>
              Concept sluiten
            </button>
          </div>
        </form>
      )}
      {statusDraft && (
        <form className="panel" onSubmit={saveStatus}>
          <h2>BRF-status wijzigen</h2>
          <p className="caption">
            Lokaal vastgesteld betekent dat de projectdefinitie is afgesproken; het maakt een
            koppeling in een onderzoek niet automatisch causaal.
          </p>
          <Field label="Nieuwe BRF-status">
            <select
              value={statusDraft.status}
              onChange={(e) =>
                setStatusDraft({ ...statusDraft, status: e.target.value as BasisRiskFactorStatus })
              }
            >
              {records.find((record) => record.id === statusDraft.id)?.status === 'draft' && (
                <option value="local">Lokaal vastgesteld</option>
              )}
              <option value="retired">Teruggetrokken</option>
            </select>
          </Field>
          <Field label="Actor BRF-statuswijziging">
            <input
              required
              value={statusDraft.actor}
              onChange={(e) => setStatusDraft({ ...statusDraft, actor: e.target.value })}
            />
          </Field>
          <Field label="Reden BRF-statuswijziging">
            <textarea
              required
              value={statusDraft.reason}
              onChange={(e) => setStatusDraft({ ...statusDraft, reason: e.target.value })}
            />
          </Field>
          <div className="button-row">
            <button className="primary" type="submit">
              BRF-status vastleggen
            </button>
            <button className="secondary" type="button" onClick={() => setStatusDraft(null)}>
              Invoer sluiten
            </button>
          </div>
        </form>
      )}
    </>
  );
}
