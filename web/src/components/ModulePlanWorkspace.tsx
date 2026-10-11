import { useState } from 'react';
import { Layers, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import type { Question } from '../content/catalog';
import type { WorkspaceState, WorkspacePatch } from '../data/model';
import { departmentLabel, departmentOrganisationId } from '../data/dossier';
import { draftBase } from '../data/local-drafts';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import DraftNotice from './DraftNotice';
import {
  assertModulePlans,
  createDossierFromModulePlan,
  moduleOriginLabels,
  modulePlanOptions,
  modulePlanQuestionIds,
  type ModulePlan,
  type PlannedModule,
} from '../data/module-plan';
import { Badge, Field, Modal } from './Primitives';

export default function ModulePlanWorkspace({
  workspace,
  questions,
  onUpdate,
}: {
  workspace: WorkspaceState;
  questions: Question[];
  onUpdate: (patch: WorkspacePatch) => boolean;
}) {
  const [editing, setEditing] = useState<ModulePlan | 'new' | undefined>();
  const [creating, setCreating] = useState<ModulePlan | undefined>();
  return (
    <section className="panel">
      <div className="section-row">
        <h2>
          <Layers size={18} /> Modules & scope
        </h2>
        <button className="secondary" onClick={() => setEditing('new')}>
          <Plus size={14} /> Moduleplan
        </button>
      </div>
      <p className="muted">
        Bewaar de modulekeuze per project of afdeling, inclusief volgorde en scopenotities. Een
        nieuw dossier bevriest die keuze en de beschikbare vraagversies; later wijzigen van het plan
        verandert bestaande dossiers niet.
      </p>
      {(workspace.modulePlans ?? []).map((plan) => (
        <div className="registry-item" key={plan.id}>
          <div className="section-row">
            <h3>{plan.title}</h3>
            <Badge tone="blue">Revisie {plan.revision}</Badge>
          </div>
          <p>
            {plan.scope === 'department'
              ? `Afdeling: ${workspace.departments?.find((department) => department.id === plan.departmentId)?.name ?? plan.departmentId}`
              : 'Projectbreed'}{' '}
            · {modulePlanQuestionIds(plan).length} geselecteerde vragen
          </p>
          {plan.modules
            .filter((module) => module.enabled)
            .map((module) => (
              <div key={module.id}>
                <strong>
                  {module.code} {module.title}
                </strong>
                <small>
                  {' '}
                  · {moduleOriginLabels[module.origin]} · {module.questionIds.length} vragen
                </small>
                <p>{module.scopeNotes}</p>
              </div>
            ))}
          <div className="button-row">
            <button
              className="secondary"
              aria-label={`Moduleplan bewerken: ${plan.title}`}
              onClick={() => setEditing(plan)}
            >
              Bewerken
            </button>
            <button
              className="primary"
              aria-label={`Dossier uit moduleplan: ${plan.title}`}
              onClick={() => setCreating(plan)}
            >
              Dossier uit deze keuze
            </button>
          </div>
        </div>
      ))}
      {!workspace.modulePlans?.length && (
        <p className="muted">
          Nog geen opgeslagen modulekeuze. Kies eerst de project- of afdelingsscope.
        </p>
      )}
      {editing && (
        <Modal title="Moduleplan vastleggen" wide onClose={() => setEditing(undefined)}>
          <PlanForm
            key={editing === 'new' ? 'new' : editing.id}
            workspace={workspace}
            questions={questions}
            original={editing === 'new' ? undefined : editing}
            onSave={(plan) => {
              const original = editing === 'new' ? undefined : editing;
              if (
                original &&
                JSON.stringify(workspace.modulePlans?.find((item) => item.id === original.id)) !==
                  JSON.stringify(original)
              )
                return 'Dit plan is intussen gewijzigd. Sluit het formulier en open de actuele versie.';
              const modulePlans = original
                ? (workspace.modulePlans ?? []).map((item) => (item.id === plan.id ? plan : item))
                : [...(workspace.modulePlans ?? []), plan];
              try {
                assertModulePlans({ ...workspace, modulePlans });
              } catch (error) {
                return error instanceof Error ? error.message : 'Moduleplan ongeldig.';
              }
              if (onUpdate({ modulePlans })) {
                setEditing(undefined);
                return '';
              }
              return 'Opslag is niet gelukt. Je formulier blijft beschikbaar.';
            }}
          />
        </Modal>
      )}
      {creating && (
        <Modal title="Dossier uit moduleplan" wide onClose={() => setCreating(undefined)}>
          <DossierFromPlan
            key={creating.id}
            workspace={workspace}
            questions={questions}
            plan={creating}
            onSave={(fields) => {
              const live = workspace.modulePlans?.find((plan) => plan.id === creating.id);
              if (JSON.stringify(live) !== JSON.stringify(creating))
                return 'De modulekeuze is gewijzigd. Open de actuele versie voordat je het dossier aanmaakt.';
              try {
                const dossier = createDossierFromModulePlan(creating, questions, workspace, {
                  ...fields,
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                });
                if (onUpdate({ dossiers: [...(workspace.dossiers ?? []), dossier] })) {
                  setCreating(undefined);
                  return '';
                }
                return 'Opslag is niet gelukt. Je formulier blijft beschikbaar.';
              } catch (error) {
                return error instanceof Error
                  ? error.message
                  : 'Dossier kan niet worden aangemaakt.';
              }
            }}
          />
        </Modal>
      )}
    </section>
  );
}
function PlanForm({
  workspace,
  questions,
  original,
  onSave,
}: {
  workspace: WorkspaceState;
  questions: Question[];
  original?: ModulePlan;
  onSave: (plan: ModulePlan) => string;
}) {
  const [draft, setDraft, draftStatus] = usePersistentDraft(
    `${workspace.id}/module-plan/${original?.id ?? 'new'}`,
    () => ({
      title: original?.title ?? '',
      scope: original?.scope ?? ('project' as ModulePlan['scope']),
      projectContextId: original?.projectContextId ?? '',
      organisationId: original?.organisationId ?? '',
      departmentId: original?.departmentId ?? '',
      modules: [
        ...(original?.modules.map((module) => structuredClone(module)) ?? []),
        ...modulePlanOptions(workspace, questions).filter(
          (module) => !original?.modules.some((item) => item.id === module.id),
        ),
      ],
    }),
    original
      ? draftBase(original)
      : `new/v1:${draftBase((workspace.modulePlans ?? []).map((record) => record.id))}`,
  );
  const { title, scope, projectContextId, organisationId, departmentId, modules } = draft;
  const setTitle = (title: string) => setDraft((current) => ({ ...current, title }));
  const setScope = (scope: ModulePlan['scope']) => setDraft((current) => ({ ...current, scope }));
  const setContext = (projectContextId: string) =>
    setDraft((current) => ({ ...current, projectContextId }));
  const setOrganisation = (organisationId: string) =>
    setDraft((current) => ({ ...current, organisationId }));
  const setDepartment = (departmentId: string) =>
    setDraft((current) => ({ ...current, departmentId }));
  const setModules = (change: PlannedModule[] | ((modules: PlannedModule[]) => PlannedModule[])) =>
    setDraft((current) => ({
      ...current,
      modules: typeof change === 'function' ? change(current.modules) : change,
    }));
  const [error, setError] = useState('');
  const context = workspace.projectContexts?.find((item) => item.id === projectContextId);
  const organisations = (workspace.organisations ?? []).filter(
    (item) => !context || context.organisationIds.includes(item.id),
  );
  const departments = (workspace.departments ?? []).filter(
    (item) =>
      (!organisationId ||
        departmentOrganisationId(item, workspace.sites ?? []) === organisationId) &&
      (!context ||
        context.organisationIds.includes(
          departmentOrganisationId(item, workspace.sites ?? []) ?? '',
        )),
  );
  function change(id: string, patch: Partial<PlannedModule>) {
    setModules((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }
  function move(index: number, direction: -1 | 1) {
    const other = index + direction;
    if (other < 0 || other >= modules.length) return;
    const result = [...modules];
    [result[index], result[other]] = [result[other], result[index]];
    setModules(result.map((module, sortOrder) => ({ ...module, sortOrder })));
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const result = onSave({
          id: original?.id ?? crypto.randomUUID(),
          title,
          scope,
          ...(projectContextId ? { projectContextId } : {}),
          ...(organisationId ? { organisationId } : {}),
          ...(scope === 'department' && departmentId ? { departmentId } : {}),
          modules,
          revision: (original?.revision ?? -1) + 1,
          sourceIds: original?.sourceIds ?? [],
        });
        setError(result);
        if (!result) draftStatus.clear();
      }}
    >
      <DraftNotice status={draftStatus} />
      <Field label="Plantitel">
        <input required value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <div className="form-grid">
        <Field label="Planscope">
          <select
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as ModulePlan['scope']);
              if (event.target.value === 'project') setDepartment('');
            }}
          >
            <option value="project">Projectbreed</option>
            <option value="department">Afdeling</option>
          </select>
        </Field>
        <Field label="Projectcontext">
          <select
            value={projectContextId}
            onChange={(event) => {
              setContext(event.target.value);
              setOrganisation('');
              setDepartment('');
            }}
          >
            <option value="">Niet gekoppeld</option>
            {(workspace.projectContexts ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Organisatie">
          <select
            value={organisationId}
            onChange={(event) => {
              setOrganisation(event.target.value);
              setDepartment('');
            }}
          >
            <option value="">Niet gekoppeld</option>
            {organisations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        {scope === 'department' && (
          <Field label="Afdeling">
            <select
              required
              value={departmentId}
              onChange={(event) => {
                setDepartment(event.target.value);
                const department = departments.find((item) => item.id === event.target.value);
                setOrganisation(departmentOrganisationId(department, workspace.sites ?? []) ?? '');
              }}
            >
              <option value="">Kies afdeling</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {departmentLabel(item, workspace.sites ?? [], workspace.organisations ?? [])}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <fieldset className="link-choices">
        <legend>Modulekeuze en volgorde</legend>
        {modules.map((module, index) => (
          <div className="registry-item" key={module.id}>
            <label>
              <input
                type="checkbox"
                checked={module.enabled}
                onChange={(event) => change(module.id, { enabled: event.target.checked })}
              />
              {module.title} · {module.questionIds.length} vragen
            </label>
            <small>
              {moduleOriginLabels[module.origin]} · {module.code} · {module.id}
            </small>
            {module.enabled && (
              <>
                <Field label={`Scopenotities ${module.title}`}>
                  <textarea
                    value={module.scopeNotes}
                    onChange={(event) => change(module.id, { scopeNotes: event.target.value })}
                  />
                </Field>
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary"
                    disabled={index === 0}
                    aria-label={`Module omhoog: ${module.title}`}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={14} /> Omhoog
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={index === modules.length - 1}
                    aria-label={`Module omlaag: ${module.title}`}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={14} /> Omlaag
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </fieldset>
      <p className="muted">
        {modulePlanQuestionIds({ modules } as ModulePlan).length} vragen geselecteerd. Opslaan maakt
        geen antwoorden of beoordeling aan.
      </p>
      {error && (
        <p className="validation-message" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary">
        Moduleplan opslaan
      </button>
    </form>
  );
}
function DossierFromPlan({
  workspace,
  questions,
  plan,
  onSave,
}: {
  workspace: WorkspaceState;
  questions: Question[];
  plan: ModulePlan;
  onSave: (fields: { title: string; scope: string; assessor: string }) => string;
}) {
  const [draft, setDraft, draftStatus] = usePersistentDraft(
    `${workspace.id}/module-plan-dossier/${plan.id}`,
    { title: '', scope: '', assessor: '' },
    draftBase(plan),
  );
  const { title, scope, assessor } = draft;
  const setTitle = (title: string) => setDraft((current) => ({ ...current, title }));
  const setScope = (scope: string) => setDraft((current) => ({ ...current, scope }));
  const setAssessor = (assessor: string) => setDraft((current) => ({ ...current, assessor }));
  const [error, setError] = useState('');
  const missing = modulePlanQuestionIds(plan).filter(
    (id) => !questions.some((question) => question.id === id),
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const result = onSave({ title, scope, assessor });
        setError(result);
        if (!result) draftStatus.clear();
      }}
    >
      <DraftNotice status={draftStatus} />
      <p>
        {plan.title} · revisie {plan.revision} · {modulePlanQuestionIds(plan).length} vragen.
        Organisatie en afdeling volgen uitsluitend de opgeslagen planrelaties.
      </p>
      <Field label="Dossiertitel">
        <input required value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Afgebakende scope">
        <textarea required value={scope} onChange={(event) => setScope(event.target.value)} />
      </Field>
      <Field label="Beoordelaar">
        <input required value={assessor} onChange={(event) => setAssessor(event.target.value)} />
      </Field>
      <p className="muted">
        {plan.organisationId
          ? workspace.organisations?.find((item) => item.id === plan.organisationId)?.name
          : 'Organisatie niet gekoppeld'}{' '}
        · Een bestaand dossier krijgt hierdoor geen nieuwe vragen.
      </p>
      {missing.length > 0 && (
        <p role="alert">
          Niet beschikbare vragen: {missing.join(', ')}. Er wordt geen gedeeltelijk dossier
          aangemaakt.
        </p>
      )}
      {error && (
        <p className="validation-message" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary" disabled={missing.length > 0}>
        Dossier met bevroren modulekeuze aanmaken
      </button>
    </form>
  );
}
