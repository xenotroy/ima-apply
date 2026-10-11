import { useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { sources as builtinSources, themes, type QuestionRichFields } from '../content/catalog';
import type { WorkspaceState, WorkspacePatch, WorkspaceRecord } from '../data/model';
import {
  addQuestionDefinition,
  assertQuestionDefinitions,
  isQuestionPackageFrozen,
  managedQuestion,
  questionDefinitionStatusLabels,
  setQuestionDefinitionStatus,
  type ManagedQuestion,
  type QuestionDefinitionDraft,
  type QuestionDefinitionStatus,
} from '../data/question-definition';
import { Badge, Field, Modal } from './Primitives';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import { draftBase } from '../data/local-drafts';
import DraftNotice from './DraftNotice';

export default function QuestionDefinitionWorkspace({
  workspace,
  onUpdate,
}: {
  workspace: WorkspaceState;
  onUpdate: (patch: WorkspacePatch) => boolean;
}) {
  const [editing, setEditing] = useState<ManagedQuestion | 'new' | undefined>();
  const [statusTarget, setStatusTarget] = useState<ManagedQuestion>();
  const [status, setStatus] = useState<QuestionDefinitionStatus>('active');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const managed = workspace.questions
    .map(managedQuestion)
    .filter((q): q is ManagedQuestion => Boolean(q));
  function store(questions: WorkspaceRecord[]): boolean {
    try {
      assertQuestionDefinitions({ ...workspace, questions });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vraagdefinitie ongeldig.');
      return false;
    }
    if (!onUpdate({ questions })) {
      setError('Opslag is niet gelukt. Het formulier blijft beschikbaar.');
      return false;
    }
    setError('');
    return true;
  }
  return (
    <section className="panel">
      <div className="section-row">
        <h2>
          <BookOpen size={18} /> Beheerde vraagdefinities
        </h2>
        <button className="secondary" onClick={() => setEditing('new')}>
          <Plus size={14} /> Vraagdefinitie
        </button>
      </div>
      <p className="muted">
        Bewaar vraagtekst, toelichting, criteria en verwacht bewijs afzonderlijk. Nieuwe dossiers
        gebruiken actieve vraagversies en bevriezen de volledige pakketversie, ook definities die
        daarin niet zijn geselecteerd.
      </p>
      <p className="muted">
        {workspace.questions.length - managed.length} geïmporteerde vragen hebben geen beheerde
        versie. Hun historische versie, auteur of menselijke bekrachtiging worden niet ingevuld.
      </p>
      <Field label="Pakketfilter">
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">Alle pakketten</option>
          {[...new Set(managed.map((q) => q.definition.contentPackageId))].map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </Field>
      {error && <p role="alert">{error}</p>}
      {managed
        .filter((q) => !filter || q.definition.contentPackageId === filter)
        .map((q) => {
          const frozen = isQuestionPackageFrozen(
            workspace,
            q.definition.contentPackageId,
            q.definition.contentPackageVersion,
          );
          return (
            <article className="registry-item" key={q.id}>
              <div className="section-row">
                <h3>{q.title}</h3>
                <Badge tone={q.definition.status === 'active' ? 'green' : 'blue'}>
                  {questionDefinitionStatusLabels[q.definition.status]}
                </Badge>
              </div>
              <p>
                {q.definition.contentPackageId}@{q.definition.contentPackageVersion} · vraagversie{' '}
                {q.definition.version}
                {frozen ? ' · pakket bevroren' : ''}
              </p>
              <p>{q.prompt}</p>
              <details>
                <summary>Afzonderlijke inhoud en broncontext</summary>
                <dl>
                  <dt>Toelichting</dt>
                  <dd>{q.assessmentGuidance || '(leeg bronveld)'}</dd>
                  <dt>Acceptatiecriteria</dt>
                  <dd>{q.acceptanceCriteria ?? 'Niet afzonderlijk vastgelegd'}</dd>
                  <dt>Verwacht bewijs</dt>
                  <dd>{q.expectedEvidence ?? 'Niet afzonderlijk vastgelegd'}</dd>
                  <dt>Bronpad / verwijzing</dt>
                  <dd>{q.definition.sourcePath ?? 'Niet vastgelegd'}</dd>
                  <dt>Vastlegging</dt>
                  <dd>{q.definition.createdAt ?? 'Historisch onbekend'}</dd>
                  <dt>Voorganger</dt>
                  <dd>{q.definition.supersedesId ?? 'Niet vastgelegd'}</dd>
                  <dt>Onderwerpen / wetgeving / tags</dt>
                  <dd>
                    {[
                      ...q.definition.topicIds,
                      ...q.definition.legalIds,
                      ...q.definition.tags,
                    ].join(', ') || 'Geen'}
                  </dd>
                  {q.richFields &&
                    Object.entries(q.richFields).map(([key, value]) => (
                      <div key={key}>
                        <dt>{richLabels[key as keyof QuestionRichFields]}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                </dl>
              </details>
              <div className="button-row">
                <button
                  className="secondary"
                  aria-label={`Opvolger maken: ${q.title}`}
                  onClick={() => setEditing(q)}
                >
                  Nieuwe opvolgende versie
                </button>
                {!frozen && q.definition.status !== 'retired' && (
                  <button
                    className="secondary"
                    aria-label={`Vraagstatus wijzigen: ${q.title}`}
                    onClick={() => {
                      setStatusTarget(q);
                      setStatus(q.definition.status === 'draft' ? 'active' : 'retired');
                      setError('');
                    }}
                  >
                    Status wijzigen
                  </button>
                )}
              </div>
              {frozen && (
                <small>
                  Inhoud en status van deze pakketversie zijn vastgezet. Een opvolger krijgt een
                  hogere vraag- en pakketversie.
                </small>
              )}
            </article>
          );
        })}
      {!managed.length && (
        <p className="muted">
          Nog geen beheerde vraagdefinities. Bronvragen blijven beschikbaar via hun eigen snapshots.
        </p>
      )}
      {editing && (
        <Modal title="Vraagdefinitie vastleggen" wide onClose={() => setEditing(undefined)}>
          <DefinitionForm
            key={editing === 'new' ? 'new' : editing.id}
            workspace={workspace}
            predecessor={editing === 'new' ? undefined : editing}
            onSave={(draft) => {
              try {
                if (
                  editing !== 'new' &&
                  JSON.stringify(workspace.questions.find((q) => q.id === editing.id)) !==
                    JSON.stringify(editing)
                )
                  return 'De voorganger is intussen gewijzigd. Open de actuele versie.';
                const q = addQuestionDefinition(workspace, draft, {
                  id: crypto.randomUUID(),
                  now: new Date().toISOString(),
                });
                if (store([...workspace.questions, q as unknown as WorkspaceRecord])) {
                  setEditing(undefined);
                  return '';
                }
                return 'Opslag is niet gelukt. Het formulier blijft beschikbaar.';
              } catch (cause) {
                return cause instanceof Error ? cause.message : 'Vraagdefinitie ongeldig.';
              }
            }}
          />
        </Modal>
      )}
      {statusTarget && (
        <Modal title="Vraagstatus wijzigen" onClose={() => setStatusTarget(undefined)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                if (
                  JSON.stringify(workspace.questions.find((q) => q.id === statusTarget.id)) !==
                  JSON.stringify(statusTarget)
                )
                  throw new Error('De vraag is intussen gewijzigd. Open de actuele versie.');
                const next = setQuestionDefinitionStatus(
                  workspace,
                  statusTarget.id,
                  status,
                  new Date().toISOString(),
                );
                if (
                  store(
                    workspace.questions.map((q) =>
                      q.id === next.id ? (next as unknown as WorkspaceRecord) : q,
                    ),
                  )
                )
                  setStatusTarget(undefined);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Status ongeldig.');
              }
            }}
          >
            <p>
              {statusTarget.title} · {statusTarget.definition.version}
            </p>
            <p className="muted">
              Actief maakt deze versie selecteerbaar in nieuwe dossiers. Dit legt geen
              conformiteits- of risicobesluit vast.
            </p>
            <Field label="Nieuwe vraagstatus">
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as QuestionDefinitionStatus)}
              >
                {statusTarget.definition.status === 'draft' && (
                  <option value="active">Actief</option>
                )}
                <option value="retired">Teruggetrokken</option>
              </select>
            </Field>
            {error && <p role="alert">{error}</p>}
            <button className="primary" type="submit">
              Vraagstatus opslaan
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
const richLabels: Record<keyof QuestionRichFields, string> = {
  number: 'Oorspronkelijk vraagnummer',
  hazard: 'Gevaar',
  risk: 'Risico',
  riskFactor: 'Risicofactor',
  technicalControls: 'Technische maatregelen',
  organisationalControls: 'Organisatorische maatregelen',
  rootCauses: 'Basisoorzaken',
  culture: 'Cultuur',
  sortOrder: 'Oorspronkelijke volgorde',
};
function nextVersion(version: string): string {
  const [major, minor, patch] = version.split('.');
  return `${major}.${minor}.${BigInt(patch) + 1n}`;
}
function initialDraft(predecessor?: ManagedQuestion): QuestionDefinitionDraft {
  return {
    themeId: predecessor?.themeId ?? themes[0].id,
    title: predecessor?.title ?? '',
    prompt: predecessor?.prompt ?? '',
    route: predecessor?.route ?? 'kern',
    evidenceHints: predecessor?.evidenceHints ?? [],
    assessmentGuidance: predecessor?.assessmentGuidance ?? '',
    acceptanceCriteria: predecessor?.acceptanceCriteria ?? '',
    expectedEvidence: predecessor?.expectedEvidence ?? '',
    sourceIds: predecessor?.sourceIds ?? [],
    suggestedHierarchy: predecessor?.suggestedHierarchy ?? [],
    roles: predecessor?.roles ?? [],
    ...(predecessor?.legalReferences !== undefined
      ? { legalReferences: predecessor.legalReferences }
      : {}),
    ...(predecessor?.richFields !== undefined
      ? { richFields: structuredClone(predecessor.richFields) }
      : {}),
    definition: {
      status: 'draft',
      version: predecessor ? nextVersion(predecessor.definition.version) : '1.0.0',
      contentPackageId: predecessor?.definition.contentPackageId ?? '',
      contentPackageVersion: predecessor
        ? nextVersion(predecessor.definition.contentPackageVersion)
        : '1.0.0',
      ...(predecessor ? { supersedesId: predecessor.id } : {}),
      topicIds: predecessor?.definition.topicIds ?? [],
      legalIds: predecessor?.definition.legalIds ?? [],
      tags: predecessor?.definition.tags ?? [],
      ...(predecessor?.definition.sourcePath !== undefined
        ? { sourcePath: predecessor.definition.sourcePath }
        : {}),
    },
  };
}
function DefinitionForm({
  workspace,
  predecessor,
  onSave,
}: {
  workspace: WorkspaceState;
  predecessor?: ManagedQuestion;
  onSave: (draft: QuestionDefinitionDraft) => string;
}) {
  const [draft, setDraft, draftStatus] = usePersistentDraft<QuestionDefinitionDraft>(
    `${workspace.id}/question-definition/${predecessor?.id ?? 'new'}`,
    () => initialDraft(predecessor),
    predecessor
      ? draftBase(predecessor)
      : `new/v1:${draftBase((workspace.questions ?? []).map((record) => record.id))}`,
  );
  const [error, setError] = useState('');
  const sources = [
    ...new Map(
      [...builtinSources, ...workspace.sources].map((source) => [source.id, source]),
    ).values(),
  ];
  const themeIds = [
    ...new Set([
      ...themes.map((theme) => theme.id),
      ...workspace.questions.map((q) => String(q.themeId)),
    ]),
  ];
  function meta(patch: Partial<QuestionDefinitionDraft['definition']>) {
    setDraft((current) => ({ ...current, definition: { ...current.definition, ...patch } }));
  }
  function field<K extends keyof QuestionDefinitionDraft>(
    key: K,
    value: QuestionDefinitionDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function toggle(key: 'sourceIds', id: string) {
    field(
      key,
      draft[key].includes(id) ? draft[key].filter((item) => item !== id) : [...draft[key], id],
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const result = onSave({
          ...draft,
          definition: {
            ...draft.definition,
            tags: draft.definition.tags.map((tag) => tag.trim()).filter(Boolean),
          },
        });
        setError(result);
        if (!result) draftStatus.clear();
      }}
    >
      <DraftNotice status={draftStatus} />
      {predecessor && (
        <p>
          Voorganger: {predecessor.title} · {predecessor.definition.version}. Beide versies blijven
          leesbaar.
        </p>
      )}
      <div className="form-grid">
        <Field label="Vraagdefinitietitel">
          <input
            required
            value={draft.title}
            onChange={(event) => field('title', event.target.value)}
          />
        </Field>
        <Field label="Vraagthema">
          <select value={draft.themeId} onChange={(event) => field('themeId', event.target.value)}>
            {themeIds.map((id) => (
              <option key={id} value={id}>
                {themes.find((theme) => theme.id === id)?.title ?? id}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vraagversie">
          <input
            required
            value={draft.definition.version}
            onChange={(event) => meta({ version: event.target.value })}
          />
        </Field>
        <Field label="Contentpakketidentiteit">
          <input
            required
            readOnly={Boolean(predecessor)}
            value={draft.definition.contentPackageId}
            onChange={(event) => meta({ contentPackageId: event.target.value })}
          />
        </Field>
        <Field label="Contentpakketversie">
          <input
            required
            value={draft.definition.contentPackageVersion}
            onChange={(event) => meta({ contentPackageVersion: event.target.value })}
          />
        </Field>
        <Field label="Vraagroute">
          <select
            value={draft.route}
            onChange={(event) =>
              field('route', event.target.value as QuestionDefinitionDraft['route'])
            }
          >
            <option value="kern">Kern</option>
            <option value="verdieping">Verdieping</option>
          </select>
        </Field>
      </div>
      <Field label="Controleerbare vraagtekst">
        <textarea
          required
          value={draft.prompt}
          onChange={(event) => field('prompt', event.target.value)}
        />
      </Field>
      <Field label="Afzonderlijke toelichting">
        <textarea
          value={draft.assessmentGuidance}
          onChange={(event) => field('assessmentGuidance', event.target.value)}
        />
      </Field>
      <Field label="Acceptatiecriteria">
        <textarea
          value={draft.acceptanceCriteria}
          onChange={(event) => field('acceptanceCriteria', event.target.value)}
        />
      </Field>
      <Field label="Verwacht bewijs">
        <textarea
          value={draft.expectedEvidence}
          onChange={(event) => field('expectedEvidence', event.target.value)}
        />
      </Field>
      <Field label="Bewijsaanwijzingen, één per regel">
        <textarea
          value={draft.evidenceHints.join('\n')}
          onChange={(event) => field('evidenceHints', event.target.value.split('\n'))}
        />
      </Field>
      <Field label="Bronpad of herleidbare verwijzing">
        <input
          value={draft.definition.sourcePath ?? ''}
          onChange={(event) => meta({ sourcePath: event.target.value })}
        />
      </Field>
      <Field label="Tags, één per regel">
        <textarea
          value={draft.definition.tags.join('\n')}
          onChange={(event) => meta({ tags: event.target.value.split('\n') })}
        />
      </Field>
      <fieldset>
        <legend>Broncontext</legend>
        {sources.map((source) => (
          <label className="checkbox" key={source.id}>
            <input
              type="checkbox"
              checked={draft.sourceIds.includes(source.id)}
              onChange={() => toggle('sourceIds', source.id)}
            />
            {String(source.title ?? source.id)}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Onderwerprelaties</legend>
        {(workspace.topics ?? []).map((topic) => (
          <label className="checkbox" key={topic.id}>
            <input
              type="checkbox"
              checked={draft.definition.topicIds.includes(topic.id)}
              onChange={() =>
                meta({
                  topicIds: draft.definition.topicIds.includes(topic.id)
                    ? draft.definition.topicIds.filter((id) => id !== topic.id)
                    : [...draft.definition.topicIds, topic.id],
                })
              }
            />
            {topic.title}
          </label>
        ))}
        {!workspace.topics?.length && <small>Geen onderwerpregisterrecords.</small>}
      </fieldset>
      <fieldset>
        <legend>Wetgevingsrelaties</legend>
        {(workspace.legalRecords ?? []).map((record) => (
          <label className="checkbox" key={record.id}>
            <input
              type="checkbox"
              checked={draft.definition.legalIds.includes(record.id)}
              onChange={() =>
                meta({
                  legalIds: draft.definition.legalIds.includes(record.id)
                    ? draft.definition.legalIds.filter((id) => id !== record.id)
                    : [...draft.definition.legalIds, record.id],
                })
              }
            />
            {record.title}
          </label>
        ))}
        {!workspace.legalRecords?.length && <small>Geen wetgevingsregisterrecords.</small>}
      </fieldset>
      <details>
        <summary>Rijke oorspronkelijke vraagvelden</summary>
        <p className="muted">
          Deze tekstvelden behouden hun bronbetekenis. Technische maatregelen worden geen
          automatische AHS-bronaanpak of reductiepercentage.
        </p>
        {Object.entries(richLabels)
          .filter(([key]) => key !== 'sortOrder')
          .map(([key, label]) => (
            <Field key={key} label={label}>
              <textarea
                value={String(draft.richFields?.[key as keyof QuestionRichFields] ?? '')}
                onChange={(event) =>
                  field('richFields', { ...draft.richFields, [key]: event.target.value })
                }
              />
            </Field>
          ))}
        <Field label="Oorspronkelijke volgorde">
          <input
            type="number"
            step="1"
            value={draft.richFields?.sortOrder ?? ''}
            onChange={(event) => {
              const rich = { ...draft.richFields };
              if (event.target.value === '') delete rich.sortOrder;
              else rich.sortOrder = Number(event.target.value);
              field('richFields', rich);
            }}
          />
        </Field>
      </details>
      <p className="muted">
        De nieuwe versie start als concept. Activeren is een expliciete vraagbeheerhandeling; een
        geïmporteerde bronkopie wordt niet vanzelf actief.
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="primary" type="submit">
        Vraagdefinitie opslaan
      </button>
    </form>
  );
}
