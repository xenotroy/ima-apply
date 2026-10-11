import type { WorkspaceState } from '../data/model';
import {
  actionSourceCollections,
  actionSourceRecords,
  sourceRefKey,
  type ActionSourceRef,
} from '../domain/action-context';
import {
  isSourceOffsetTimestamp,
  type LegalRecordContext,
  type ObservationRecordContext,
  type TopicRecordContext,
} from '../domain/record-context';

export interface RecordContextFieldProps<T> {
  value: T & { id?: string };
  onChange: (patch: Partial<T>) => void;
  workspace: WorkspaceState;
}
function display(record: { id: string; title?: string; name?: string }): string {
  return `${record.title || record.name || record.id} [${record.id}]`;
}
function availableParents(value: TopicRecordContext & { id?: string }, workspace: WorkspaceState) {
  const topics = workspace.topics ?? [];
  return topics.filter((candidate) => {
    const seen = new Set<string>();
    let current: typeof candidate | undefined = candidate;
    while (current && !seen.has(current.id)) {
      if (current.id === value.id) return false;
      seen.add(current.id);
      current = topics.find((topic) => topic.id === current?.parentId);
    }
    return true;
  });
}
export function TopicContextFields({
  value,
  onChange,
  workspace,
}: RecordContextFieldProps<TopicRecordContext>) {
  const parents = availableParents(value, workspace);
  return (
    <>
      <label className="field">
        <span>Bovenliggend onderwerp</span>
        <select
          value={value.parentId ?? ''}
          onChange={(event) => onChange({ parentId: event.target.value || undefined })}
        >
          <option value="">Geen bovenliggend onderwerp vastgelegd</option>
          {value.parentId && !parents.some((topic) => topic.id === value.parentId) && (
            <option value={value.parentId}>{value.parentId} · niet beschikbaar als ouder</option>
          )}
          {parents.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {display(topic)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Tags (één per regel)</span>
        <textarea
          value={value.tags?.join('\n') ?? ''}
          onChange={(event) =>
            onChange({ tags: event.target.value === '' ? [] : event.target.value.split('\n') })
          }
        />
        <small className="muted">
          Eén tag per regel; lege regels en dubbele tags moeten voor opslaan worden gecorrigeerd.
        </small>
      </label>
      <label className="field">
        <span>Onderwerpstatus (bronlabel)</span>
        <input
          value={value.status ?? ''}
          maxLength={1000}
          onChange={(event) => onChange({ status: event.target.value })}
        />
      </label>
    </>
  );
}

export function LegalContextFields({
  value,
  onChange,
  workspace,
}: RecordContextFieldProps<LegalRecordContext>) {
  const refs = value.affectedRefs ?? [];
  const keys = new Set(refs.map(sourceRefKey));
  function changeRef(index: number, next: ActionSourceRef) {
    onChange({ affectedRefs: refs.map((ref, current) => (current === index ? next : ref)) });
  }
  return (
    <>
      <label className="field">
        <span>Publicatiedatum</span>
        <input
          type="date"
          value={value.publishedOn ?? ''}
          onChange={(event) => onChange({ publishedOn: event.target.value || undefined })}
        />
      </label>
      <fieldset>
        <legend>Geraakte objecten</legend>
        <p className="muted">
          Een verwijzing benoemt een geraakt object. Zij bevestigt geen bewijs, naleving of
          risicoreductie.
        </p>
        {refs.map((ref, index) => (
          <div className="panel" key={index}>
            {ref.kind === 'workspace' ? (
              <p>
                {ref.collection} ·{' '}
                {display(
                  actionSourceRecords(workspace, ref.collection).find(
                    (record) => record.id === ref.id,
                  ) ?? { id: ref.id },
                )}
              </p>
            ) : (
              <>
                <label className="field">
                  <span>Oorspronkelijke object-ID</span>
                  <input
                    required
                    maxLength={1000}
                    value={ref.originalId}
                    onChange={(event) =>
                      changeRef(index, { ...ref, originalId: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Raw bronrecord (optioneel)</span>
                  <select
                    value={ref.rawSourceId ?? ''}
                    onChange={(event) =>
                      changeRef(index, { ...ref, rawSourceId: event.target.value || undefined })
                    }
                  >
                    <option value="">Geen raw bronrecord gekoppeld</option>
                    {ref.rawSourceId &&
                      !workspace.sources.some((source) => source.id === ref.rawSourceId) && (
                        <option value={ref.rawSourceId}>{ref.rawSourceId} · ontbreekt</option>
                      )}
                    {workspace.sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {display({
                          id: source.id,
                          title: typeof source.title === 'string' ? source.title : undefined,
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted">Deze oorspronkelijke relatie blijft expliciet onopgelost.</p>
              </>
            )}
            <button
              type="button"
              className="secondary"
              aria-label={`Geraakt object ${index + 1} verwijderen`}
              onClick={() =>
                onChange({ affectedRefs: refs.filter((_, current) => current !== index) })
              }
            >
              Verwijzing verwijderen
            </button>
          </div>
        ))}
        <label className="field">
          <span>Intern geraakt object toevoegen</span>
          <select
            value=""
            onChange={(event) => {
              if (event.target.value)
                onChange({
                  affectedRefs: [...refs, JSON.parse(event.target.value) as ActionSourceRef],
                });
            }}
          >
            <option value="">Kies de werkelijke collectie en het object</option>
            {actionSourceCollections.map((collection) => {
              const records = actionSourceRecords(workspace, collection).filter(
                (record) =>
                  !keys.has(sourceRefKey({ kind: 'workspace', collection, id: record.id })),
              );
              return records.length ? (
                <optgroup key={collection} label={collection}>
                  {records.map((record) => (
                    <option
                      key={record.id}
                      value={JSON.stringify({ kind: 'workspace', collection, id: record.id })}
                    >
                      {display(record)}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            onChange({ affectedRefs: [...refs, { kind: 'unresolved', originalId: '' }] })
          }
        >
          Onopgelost geraakt object toevoegen
        </button>
      </fieldset>
    </>
  );
}

export type ObservationContextFieldValue = ObservationRecordContext & { date?: string };
export function ObservationContextFields({
  value,
  onChange,
  workspace,
}: RecordContextFieldProps<ObservationContextFieldValue>) {
  const topics = workspace.topics ?? [];
  const selected = value.topicIds ?? [];
  return (
    <>
      <label className="field">
        <span>Waarnemingstijdstip (exact met tijdzone)</span>
        <input
          value={value.observedAt ?? ''}
          placeholder="2026-10-11T14:30:00.1234567+02:00"
          onChange={(event) => {
            const observedAt = event.target.value;
            onChange({
              observedAt: observedAt || undefined,
              ...(isSourceOffsetTimestamp(observedAt) ? { date: observedAt.slice(0, 10) } : {}),
            });
          }}
        />
        <small className="muted">
          Bewaar de oorspronkelijke offset. Een geldig tijdstip gebruikt zijn eigen kalenderdatum
          voor de waarnemingsdatum.
        </small>
      </label>
      <label className="field">
        <span>Locatie van de waarneming</span>
        <input
          value={value.location ?? ''}
          onChange={(event) => onChange({ location: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Oorspronkelijke scope-ID</span>
        <input
          value={value.scopeId ?? ''}
          maxLength={160}
          onChange={(event) => onChange({ scopeId: event.target.value })}
        />
        <small className="muted">
          Dit is de oorspronkelijke scope-ID; er wordt geen dossier- of afdelingsrelatie uit
          afgeleid.
        </small>
      </label>
      <label className="field">
        <span>Waarnemingscontext</span>
        <textarea
          value={value.context ?? ''}
          onChange={(event) => onChange({ context: event.target.value })}
        />
      </label>
      <fieldset className="link-choices">
        <legend>Onderwerpen bij deze waarneming</legend>
        {selected
          .filter((id) => !topics.some((topic) => topic.id === id))
          .map((id) => (
            <label key={id}>
              <input
                type="checkbox"
                checked
                onChange={() => onChange({ topicIds: selected.filter((value) => value !== id) })}
              />
              {id} · ontbreekt
            </label>
          ))}
        {topics.map((topic) => (
          <label key={topic.id}>
            <input
              type="checkbox"
              checked={selected.includes(topic.id)}
              onChange={(event) =>
                onChange({
                  topicIds: event.target.checked
                    ? [...selected, topic.id]
                    : selected.filter((id) => id !== topic.id),
                })
              }
            />
            {display(topic)}
          </label>
        ))}
        {!topics.length && !selected.length && (
          <p className="muted">Geen onderwerpen vastgelegd.</p>
        )}
      </fieldset>
      <label className="field">
        <span>Oorspronkelijk aangemaakt op</span>
        <input
          value={value.sourceCreatedAt ?? ''}
          placeholder="ISO-tijdstip met oorspronkelijke tijdzone"
          onChange={(event) => onChange({ sourceCreatedAt: event.target.value || undefined })}
        />
      </label>
      <label className="field">
        <span>Oorspronkelijk bijgewerkt op</span>
        <input
          value={value.sourceUpdatedAt ?? ''}
          placeholder="ISO-tijdstip met oorspronkelijke tijdzone"
          onChange={(event) => onChange({ sourceUpdatedAt: event.target.value || undefined })}
        />
      </label>
      <p className="muted">
        Bronmomenten worden niet automatisch ingevuld of vervangen door het huidige tijdstip.
      </p>
    </>
  );
}
