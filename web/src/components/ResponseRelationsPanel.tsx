import { useState } from 'react';
import { Link2 } from 'lucide-react';
import type { WorkspaceAnswer, WorkspacePatch, WorkspaceState } from '../data/model';
import { upsertResponse, type RelatedResponse } from '../data/response-relations';
import { draftBase } from '../data/local-drafts';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import DraftNotice from './DraftNotice';
import { Field, Modal } from './Primitives';

export default function ResponseRelationsPanel({
  workspace,
  answer,
  dossierId,
  questionId,
  respondedBy,
  onUpdate,
  disabled = false,
}: {
  workspace: WorkspaceState;
  answer?: WorkspaceAnswer;
  dossierId?: string;
  questionId: string;
  respondedBy: string;
  onUpdate: (patch: WorkspacePatch) => boolean;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState<RelatedResponse>();
  const response = answer as RelatedResponse | undefined;
  if (!response)
    return (
      <section aria-label="Response-relaties">
        <p className="muted">
          Beantwoord deze vraag voordat je waarnemingen of bevindingen aan de response koppelt.
        </p>
      </section>
    );
  if (response.dossierId !== dossierId || response.questionId !== questionId)
    return <p role="alert">De response hoort bij een andere vraag of dossierscope.</p>;
  return (
    <section aria-label="Response-relaties">
      <h3>
        <Link2 size={16} /> Respondent & relaties
      </h3>
      <p>
        Respondent: <strong>{response.respondedBy ?? 'Historisch niet vastgelegd'}</strong>
        {' · '}
        {response.answeredAt}
      </p>
      <p className="muted">
        {response.observationIds?.length ?? 0} waarnemingen · {response.findingIds?.length ?? 0}{' '}
        bevindingen · {response.evidenceIds?.length ?? 0} bewijslinks
      </p>
      <button
        className="secondary"
        disabled={disabled || !respondedBy.trim()}
        onClick={() => setEditing(structuredClone(response))}
      >
        Response-relaties wijzigen
      </button>
      {editing && (
        <Modal title="Response-relaties wijzigen" onClose={() => setEditing(undefined)}>
          <RelationForm
            workspace={workspace}
            original={editing}
            respondedBy={respondedBy}
            onSave={(observationIds, findingIds) => {
              const live = workspace.answers.find((record) => record.id === editing.id);
              if (JSON.stringify(live) !== JSON.stringify(editing))
                return 'Deze response is intussen gewijzigd. Sluit het formulier en open de actuele response.';
              try {
                const patch = upsertResponse(workspace, {
                  answer: editing,
                  respondedBy,
                  observationIds,
                  findingIds,
                });
                if (!onUpdate(patch))
                  return 'Opslag is niet gelukt. Je gekozen relaties blijven beschikbaar.';
                setEditing(undefined);
                return '';
              } catch (error) {
                return error instanceof Error ? error.message : 'Response-relaties zijn ongeldig.';
              }
            }}
          />
        </Modal>
      )}
    </section>
  );
}

function RelationForm({
  workspace,
  original,
  respondedBy,
  onSave,
}: {
  workspace: WorkspaceState;
  original: RelatedResponse;
  respondedBy: string;
  onSave: (observationIds: string[], findingIds: string[]) => string;
}) {
  const [selected, setSelected, draftStatus] = usePersistentDraft(
    `${workspace.id}/response-relations/${original.dossierId ?? 'unscoped'}/${original.questionId}`,
    { observationIds: original.observationIds ?? [], findingIds: original.findingIds ?? [] },
    draftBase(original),
  );
  const [error, setError] = useState('');
  const observations = (workspace.observations ?? []).filter(
    (record) => record.dossierId === original.dossierId,
  );
  const findings = (workspace.findings ?? []).filter(
    (record) => record.dossierId === original.dossierId,
  );
  const toggle = (selected: string[], id: string, checked: boolean) =>
    checked ? [...selected, id] : selected.filter((value) => value !== id);
  if (
    !selected ||
    !Array.isArray(selected.observationIds) ||
    !Array.isArray(selected.findingIds) ||
    !selected.observationIds.every((id) => typeof id === 'string') ||
    !selected.findingIds.every((id) => typeof id === 'string')
  )
    return (
      <p role="alert">
        Het bestaande relatieconcept heeft een onbekend formaat en blijft bewaard. Exporteer het
        concept via Rapportage voordat je het herstelt.
      </p>
    );
  const { observationIds, findingIds } = selected;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const saveError = onSave(observationIds, findingIds);
        setError(saveError);
        if (!saveError) draftStatus.clear();
      }}
    >
      <p>
        Deze wijziging wordt vastgelegd door{' '}
        <strong>{respondedBy.trim() || 'Nog geen respondent ingevuld'}</strong>. De bestaande
        response-ID blijft behouden.
      </p>
      <DraftNotice status={draftStatus} />
      <fieldset>
        <legend>Waarnemingen in hetzelfde dossier</legend>
        {observations.map((record) => (
          <label className="check-row" key={record.id}>
            <input
              type="checkbox"
              checked={observationIds.includes(record.id)}
              onChange={(event) =>
                setSelected({
                  ...selected,
                  observationIds: toggle(observationIds, record.id, event.target.checked),
                })
              }
            />
            <span>{record.title}</span>
          </label>
        ))}
        {!observations.length && <p className="muted">Nog geen waarnemingen in dit dossier.</p>}
      </fieldset>
      <fieldset>
        <legend>Bevindingen in hetzelfde dossier</legend>
        {findings.map((record) => (
          <label className="check-row" key={record.id}>
            <input
              type="checkbox"
              checked={findingIds.includes(record.id)}
              onChange={(event) =>
                setSelected({
                  ...selected,
                  findingIds: toggle(findingIds, record.id, event.target.checked),
                })
              }
            />
            <span>{record.title}</span>
          </label>
        ))}
        {!findings.length && <p className="muted">Nog geen bevindingen in dit dossier.</p>}
      </fieldset>
      <Field label="Bestaande bewijslinks">
        <span>
          {original.evidenceIds?.length
            ? original.evidenceIds
                .map((id) => workspace.evidence?.find((record) => record.id === id)?.title ?? id)
                .join('; ')
            : 'Geen bewijs gekoppeld. Gebruik het bewijsveld bij het antwoord.'}
        </span>
      </Field>
      <p className="muted">
        Een bevinding kan met meerdere responses worden onderbouwd. Het afzonderlijke vraagveld van
        een bevinding blijft de oorspronkelijke vraagcontext.
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={!respondedBy.trim()}>
        Relaties opslaan
      </button>
    </form>
  );
}
