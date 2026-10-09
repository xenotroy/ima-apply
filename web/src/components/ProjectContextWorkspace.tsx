import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  departmentLabel,
  departmentOrganisationId,
  emptyProjectDetails,
  projectContextFields,
} from '../data';
import type { Dossier, ProjectContext, Walkthrough, WorkspacePatch, WorkspaceState } from '../data';
import { Field, Modal } from './Primitives';

const newId = () => crypto.randomUUID();

export default function ProjectContextWorkspace({
  workspace,
  onUpdate,
  selectedDossier,
}: {
  workspace: WorkspaceState;
  onUpdate: (patch: WorkspacePatch) => boolean;
  selectedDossier?: Dossier;
}) {
  const [editing, setEditing] = useState<{
    kind: 'context' | 'walkthrough';
    record?: ProjectContext | Walkthrough;
  }>();
  const [error, setError] = useState('');
  const contexts = workspace.projectContexts ?? [],
    reports = workspace.walkthroughs ?? [];
  function save(record: ProjectContext | Walkthrough) {
    if (!editing) return;
    const collection = editing.kind === 'context' ? contexts : reports;
    if (
      editing.record &&
      JSON.stringify(collection.find((item) => item.id === record.id)) !==
        JSON.stringify(editing.record)
    ) {
      setError(
        'Dit record is ondertussen gewijzigd. Sluit het formulier en open de huidige versie.',
      );
      return;
    }
    const values = editing.record
      ? collection.map((item) => (item.id === record.id ? record : item))
      : [...collection, record];
    const patch =
      editing.kind === 'context'
        ? { projectContexts: values as ProjectContext[] }
        : { walkthroughs: values as Walkthrough[] };
    if (onUpdate(patch)) {
      setEditing(undefined);
      setError('');
    }
  }
  return (
    <div className="project-context-workspace">
      <section className="panel">
        <div className="section-row">
          <h2>Projectcontext</h2>
          <button
            className="secondary"
            onClick={() => {
              setError('');
              setEditing({ kind: 'context' });
            }}
          >
            <Plus size={14} /> Projectcontext
          </button>
        </div>
        <p className="muted">
          Leg werkzaamheden, personeelscontext en bekende projectgegevens vast. Koppel een context
          expliciet aan een beoordelingsdossier.
        </p>
        {selectedDossier && (
          <Field label={`Projectcontext van dossier: ${selectedDossier.title}`}>
            <select
              value={selectedDossier.projectContextId ?? ''}
              onChange={(event) => {
                if (event.target.value === (selectedDossier.projectContextId ?? '')) return;
                const changed = {
                  ...selectedDossier,
                  projectContextId: event.target.value || undefined,
                  ...(selectedDossier.status === 'completed'
                    ? {
                        status: 'draft' as const,
                        reviewedBy: undefined,
                        reviewedAt: undefined,
                        reviewNote: undefined,
                      }
                    : {}),
                };
                onUpdate({
                  dossiers: (workspace.dossiers ?? []).map((dossier) =>
                    dossier.id === changed.id ? changed : dossier,
                  ),
                });
              }}
            >
              <option value="">Niet gekoppeld</option>
              {contexts
                .filter(
                  (context) =>
                    !context.organisationIds.length ||
                    (!!selectedDossier.organisationId &&
                      context.organisationIds.includes(selectedDossier.organisationId)),
                )
                .map((context) => (
                  <option key={context.id} value={context.id}>
                    {context.title}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {contexts.map((context) => (
          <article className="registry-item" key={context.id}>
            <div className="section-row">
              <h3>{context.title}</h3>
              <button
                className="secondary"
                aria-label={`Projectcontext bewerken: ${context.title}`}
                onClick={() => {
                  setError('');
                  setEditing({ kind: 'context', record: structuredClone(context) });
                }}
              >
                Bewerken
              </button>
            </div>
            <p>
              {context.organisationText || 'Organisatiebeschrijving niet vastgelegd'} ·{' '}
              {context.locationText || 'Locatiebeschrijving niet vastgelegd'}
            </p>
            <p>
              Contact: {context.contactName || 'Niet vastgelegd'} {context.contactEmail}
            </p>
            <p>
              Gekoppelde dossiers:{' '}
              {(workspace.dossiers ?? [])
                .filter((dossier) => dossier.projectContextId === context.id)
                .map((dossier) => dossier.title)
                .join('; ') || 'Geen'}
            </p>
            <details>
              <summary>Inhoudelijke context en herkomst</summary>
              {projectContextFields.map(([key, label]) => (
                <div key={key}>
                  <strong>{label}</strong>
                  <p style={{ whiteSpace: 'pre-wrap' }}>
                    {context.details[key] || 'Niet vastgelegd'}
                  </p>
                </div>
              ))}
              <p>
                Aangemaakt: {context.createdAt ?? 'Niet vastgelegd'} · bijgewerkt:{' '}
                {context.updatedAt ?? 'Niet vastgelegd'}
              </p>
              <p>Bronrecords: {context.sourceIds.join(', ') || 'Handmatig vastgelegd'}</p>
            </details>
          </article>
        ))}
        {!contexts.length && <p className="muted">Nog geen projectcontext vastgelegd.</p>}
      </section>
      <section className="panel">
        <div className="section-row">
          <h2>Rondgangverslagen</h2>
          <button
            className="secondary"
            disabled={!workspace.organisations?.length}
            onClick={() => {
              setError('');
              setEditing({ kind: 'walkthrough' });
            }}
          >
            <Plus size={14} /> Rondgangverslag
          </button>
        </div>
        <p className="muted">
          Bewaar het volledige verslag en zijn geselecteerde modules. Leg afzonderlijke feiten vast
          als waarneming met een verwijzing naar dit verslag.
        </p>
        {reports.map((report) => (
          <article className="registry-item" key={report.id}>
            <div className="section-row">
              <h3>{report.title}</h3>
              <button
                className="secondary"
                aria-label={`Rondgang bewerken: ${report.title}`}
                onClick={() => {
                  setError('');
                  setEditing({ kind: 'walkthrough', record: structuredClone(report) });
                }}
              >
                Bewerken
              </button>
            </div>
            <p>
              {report.date || 'Datum niet vastgelegd'} · {report.author || 'Auteur niet vastgelegd'}
            </p>
            <p>
              {workspace.organisations?.find((item) => item.id === report.organisationId)?.name} ·{' '}
              {report.departmentId
                ? workspace.departments?.find((item) => item.id === report.departmentId)?.name
                : 'Organisatiebreed'}{' '}
              · dossier:{' '}
              {workspace.dossiers?.find((item) => item.id === report.dossierId)?.title ??
                'Niet gekoppeld'}
            </p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{report.summary}</p>
            <details>
              <summary>Volledig verslag, modules en herkomst</summary>
              <p style={{ whiteSpace: 'pre-wrap' }}>
                {report.body || 'Geen verslagtekst vastgelegd.'}
              </p>
              <p>
                Geselecteerde modules:{' '}
                {report.modules.map((module) => `${module.code} ${module.title}`).join('; ') ||
                  'Geen vastgelegd'}
              </p>
              <p>
                Waarnemingen:{' '}
                {(workspace.observations ?? [])
                  .filter((observation) => observation.walkthroughId === report.id)
                  .map((observation) => observation.title)
                  .join('; ') || 'Geen gekoppeld'}
              </p>
              <p>Bronrecords: {report.sourceIds.join(', ') || 'Handmatig vastgelegd'}</p>
            </details>
          </article>
        ))}
        {!reports.length && <p className="muted">Nog geen rondgangverslagen vastgelegd.</p>}
      </section>
      {editing && (
        <Modal
          wide
          title={
            editing.kind === 'context' ? 'Projectcontext vastleggen' : 'Rondgangverslag vastleggen'
          }
          onClose={() => setEditing(undefined)}
        >
          {error && <p role="alert">{error}</p>}
          {editing.kind === 'context' ? (
            <ContextForm
              key={editing.record?.id ?? 'new-context'}
              workspace={workspace}
              initial={editing.record as ProjectContext | undefined}
              onSave={save}
            />
          ) : (
            <WalkthroughForm
              key={editing.record?.id ?? 'new-walkthrough'}
              workspace={workspace}
              initial={editing.record as Walkthrough | undefined}
              selectedDossier={selectedDossier}
              onSave={save}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function ContextForm({
  workspace,
  initial,
  onSave,
}: {
  workspace: WorkspaceState;
  initial?: ProjectContext;
  onSave: (record: ProjectContext) => void;
}) {
  const [record, set] = useState<ProjectContext>(
    () =>
      initial ?? {
        id: newId(),
        title: '',
        organisationText: '',
        locationText: '',
        contactName: '',
        contactEmail: '',
        organisationIds: [],
        details: emptyProjectDetails(),
        sourceIds: [],
        createdAt: new Date().toISOString(),
      },
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...record, updatedAt: new Date().toISOString() });
      }}
    >
      <Field label="Projectnaam">
        <input
          required
          autoFocus
          value={record.title}
          onChange={(event) => set({ ...record, title: event.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Organisatiebeschrijving">
          <input
            value={record.organisationText}
            onChange={(event) => set({ ...record, organisationText: event.target.value })}
          />
        </Field>
        <Field label="Locatiebeschrijving">
          <input
            value={record.locationText}
            onChange={(event) => set({ ...record, locationText: event.target.value })}
          />
        </Field>
        <Field label="Contactpersoon">
          <input
            value={record.contactName}
            onChange={(event) => set({ ...record, contactName: event.target.value })}
          />
        </Field>
        <Field label="Contact e-mail">
          <input
            value={record.contactEmail}
            onChange={(event) => set({ ...record, contactEmail: event.target.value })}
          />
        </Field>
      </div>
      <fieldset className="link-choices">
        <legend>Organisaties binnen projectcontext</legend>
        {(workspace.organisations ?? []).map((organisation) => (
          <label key={organisation.id}>
            <input
              type="checkbox"
              checked={record.organisationIds.includes(organisation.id)}
              onChange={(event) =>
                set({
                  ...record,
                  organisationIds: event.target.checked
                    ? [...record.organisationIds, organisation.id]
                    : record.organisationIds.filter((id) => id !== organisation.id),
                })
              }
            />
            {organisation.name}
          </label>
        ))}
      </fieldset>
      {projectContextFields.map(([key, label]) => (
        <Field key={key} label={label}>
          <textarea
            value={record.details[key]}
            onChange={(event) =>
              set({ ...record, details: { ...record.details, [key]: event.target.value } })
            }
          />
        </Field>
      ))}
      <button className="primary">Projectcontext opslaan</button>
    </form>
  );
}

function WalkthroughForm({
  workspace,
  initial,
  selectedDossier,
  onSave,
}: {
  workspace: WorkspaceState;
  initial?: Walkthrough;
  selectedDossier?: Dossier;
  onSave: (record: Walkthrough) => void;
}) {
  const [record, set] = useState<Walkthrough>(
    () =>
      initial ?? {
        id: newId(),
        title: '',
        organisationId: selectedDossier?.organisationId ?? workspace.organisations?.[0]?.id ?? '',
        ...(selectedDossier && !selectedDossier.departmentIds.length
          ? {
              dossierId: selectedDossier.id,
              ...(selectedDossier.projectContextId
                ? { projectContextId: selectedDossier.projectContextId }
                : {}),
            }
          : {}),
        date: new Date().toLocaleDateString('sv-SE'),
        author: '',
        summary: '',
        body: '',
        modules: [],
        sourceIds: [],
        createdAt: new Date().toISOString(),
      },
  );
  const departments = (workspace.departments ?? []).filter(
    (department) =>
      departmentOrganisationId(department, workspace.sites ?? []) === record.organisationId,
  );
  const dossiers = (workspace.dossiers ?? []).filter(
    (dossier) =>
      (!dossier.organisationId || dossier.organisationId === record.organisationId) &&
      (!dossier.departmentIds.length ||
        (!!record.departmentId && dossier.departmentIds.includes(record.departmentId))),
  );
  const contexts = (workspace.projectContexts ?? []).filter(
    (context) =>
      !context.organisationIds.length || context.organisationIds.includes(record.organisationId),
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...record, updatedAt: new Date().toISOString() });
      }}
    >
      <Field label="Verslagtitel">
        <input
          required
          autoFocus
          value={record.title}
          onChange={(event) => set({ ...record, title: event.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Rondgangdatum">
          <input
            type="date"
            value={record.date}
            onChange={(event) => set({ ...record, date: event.target.value })}
          />
        </Field>
        <Field label="Auteur">
          <input
            value={record.author}
            onChange={(event) => set({ ...record, author: event.target.value })}
          />
        </Field>
        <Field label="Organisatie">
          <select
            required
            value={record.organisationId}
            onChange={(event) =>
              set({
                ...record,
                organisationId: event.target.value,
                departmentId: undefined,
                dossierId: undefined,
                projectContextId: undefined,
              })
            }
          >
            {workspace.organisations?.map((organisation) => (
              <option key={organisation.id} value={organisation.id}>
                {organisation.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Afdeling">
          <select
            value={record.departmentId ?? ''}
            onChange={(event) =>
              set({
                ...record,
                departmentId: event.target.value || undefined,
                dossierId: undefined,
              })
            }
          >
            <option value="">Organisatiebreed</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {departmentLabel(department, workspace.sites ?? [], workspace.organisations ?? [])}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Beoordelingsdossier">
          <select
            value={record.dossierId ?? ''}
            onChange={(event) => {
              const dossier = dossiers.find((item) => item.id === event.target.value);
              set({
                ...record,
                dossierId: event.target.value || undefined,
                ...(dossier?.projectContextId
                  ? { projectContextId: dossier.projectContextId }
                  : {}),
              });
            }}
          >
            <option value="">Niet gekoppeld</option>
            {dossiers.map((dossier) => (
              <option key={dossier.id} value={dossier.id}>
                {dossier.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Projectcontext">
          <select
            value={record.projectContextId ?? ''}
            onChange={(event) =>
              set({ ...record, projectContextId: event.target.value || undefined })
            }
          >
            <option value="">Niet gekoppeld</option>
            {contexts.map((context) => (
              <option key={context.id} value={context.id}>
                {context.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Samenvatting">
        <textarea
          value={record.summary}
          onChange={(event) => set({ ...record, summary: event.target.value })}
        />
      </Field>
      <Field label="Volledig rondgangverslag">
        <textarea
          rows={10}
          value={record.body}
          onChange={(event) => set({ ...record, body: event.target.value })}
        />
      </Field>
      <fieldset>
        <legend>Geselecteerde modules</legend>
        {record.modules.map((module) => (
          <div className="form-grid" key={module.id}>
            <Field label="Modulecode">
              <input
                value={module.code}
                onChange={(event) =>
                  set({
                    ...record,
                    modules: record.modules.map((item) =>
                      item.id === module.id ? { ...item, code: event.target.value } : item,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Modulenaam">
              <input
                value={module.title}
                onChange={(event) =>
                  set({
                    ...record,
                    modules: record.modules.map((item) =>
                      item.id === module.id ? { ...item, title: event.target.value } : item,
                    ),
                  })
                }
              />
            </Field>
            <button
              type="button"
              className="secondary"
              aria-label={`Module verwijderen: ${module.title || module.code}`}
              onClick={() =>
                set({ ...record, modules: record.modules.filter((item) => item.id !== module.id) })
              }
            >
              Verwijderen
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() =>
            set({ ...record, modules: [...record.modules, { id: newId(), code: '', title: '' }] })
          }
        >
          Module toevoegen
        </button>
      </fieldset>
      <button className="primary">Rondgangverslag opslaan</button>
    </form>
  );
}
