import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Layers, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import type { Question } from '../content/catalog';
import type { WorkspaceState, WorkspacePatch } from '../data/model';
import { departmentLabel, departmentOrganisationId } from '../data/dossier';
import { draftBase } from '../data/local-drafts';
import { usePersistentDraft, type DraftStatus } from '../hooks/usePersistentDraft';
import DraftNotice from './DraftNotice';
import ModuleSelectionExplorer from './ModuleSelectionExplorer';
import { completeModuleOptions } from '../data/module-selection';
import RieporterModuleWorkspace from './RieporterModuleWorkspace';
import {
  assertRieporterSelectionAvailable,
  createRieporterProjectWorkspace,
  rieporterModuleCatalog,
  type RieporterQuestionMetadata,
} from '../data/rieporter-module-choice';
import { exportWorkspace, importWorkspace } from '../data/validation';
import {
  assertModulePlans,
  createDossierFromModulePlan,
  moduleOriginLabels,
  modulePlanOptions,
  modulePlanQuestionIds,
  moduleQuestionIds,
  type ModulePlan,
  type PlannedModule,
} from '../data/module-plan';
import { Badge, Field, Modal } from './Primitives';

function isRieporterPlan(plan: ModulePlan | undefined): boolean {
  return Boolean(
    plan?.modules.length &&
    plan.modules.every((module) => module.id.startsWith('rieporter-process:')),
  );
}

export default function ModulePlanWorkspace({
  workspace,
  questions,
  onUpdate,
  onOpenInventory,
  initialView = 'general',
  onViewChange,
  onAddDepartment,
  onOpenSettings,
}: {
  workspace: WorkspaceState;
  questions: Question[];
  onUpdate: (patch: WorkspacePatch) => boolean;
  onOpenInventory?: (dossierId: string) => void;
  initialView?: 'general' | 'rieporter';
  onViewChange?: (view: 'general' | 'rieporter') => void;
  onAddDepartment?: () => void;
  onOpenSettings?: () => void;
}) {
  const [view, setView] = useState(initialView);
  useEffect(() => setView(initialView), [initialView]);
  const [editing, setEditing] = useState<ModulePlan | 'new' | 'rie-new' | undefined>();
  const [creating, setCreating] = useState<ModulePlan | undefined>();
  const [revealPlanId, setRevealPlanId] = useState<string>();
  useEffect(() => {
    if (!revealPlanId) return;
    const card = document.getElementById(`module-plan-${revealPlanId}`);
    if (!card) return;
    card.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    setRevealPlanId(undefined);
  }, [revealPlanId, workspace.modulePlans]);
  return (
    <section className="panel">
      <div className="section-row">
        <h2>
          <Layers size={18} /> Modules & scope
        </h2>
        {view === 'general' && (
          <button
            className="secondary"
            onClick={() => {
              setEditing('new');
            }}
          >
            <Plus size={14} /> Moduleplan
          </button>
        )}
      </div>
      <p className="muted">
        Bewaar de modulekeuze per project of afdeling, inclusief volgorde en scopenotities. Een
        nieuw dossier bevriest die keuze en de beschikbare vraagversies; later wijzigen van het plan
        verandert bestaande dossiers niet.
      </p>
      <div className="segmented dossier-tabs" aria-label="Ingang modulekeuze">
        {(['general', 'rieporter'] as const).map((key) => (
          <button
            type="button"
            key={key}
            className={view === key ? 'active' : ''}
            onClick={() => {
              setView(key);
              onViewChange?.(key);
            }}
          >
            {key === 'general' ? 'Algemene modulekeuze' : 'RIEporter & afdelingen'}
          </button>
        ))}
      </div>
      {view === 'rieporter' && (
        <RieporterModuleWorkspace
          workspace={workspace}
          questions={questions}
          editorOpen={editing === 'rie-new'}
          onRequestEditor={() => setEditing('rie-new')}
          onEditPlan={(id) => {
            const plan = workspace.modulePlans?.find((record) => record.id === id);
            if (plan) setEditing(plan);
          }}
          onCreateDossier={(id) => {
            const plan = workspace.modulePlans?.find((record) => record.id === id);
            if (plan) setCreating(plan);
          }}
          onOpenInventory={onOpenInventory}
          onAddDepartment={onAddDepartment}
          onOpenSettings={onOpenSettings}
          renderEditor={(state, catalog) =>
            editing === 'rie-new' ? (
              <Modal title="Moduleplan vastleggen" wide onClose={() => setEditing(undefined)}>
                <PlanFields
                  workspace={workspace}
                  questions={questions}
                  state={state}
                  questionMetadata={catalog.questionMetadata}
                  onSave={(plan) => {
                    try {
                      assertRieporterSelectionAvailable(catalog, plan.modules);
                      const saved = {
                        ...plan,
                        modules: plan.modules.filter((module) => module.enabled),
                      };
                      const modulePlans = [...(workspace.modulePlans ?? []), saved];
                      assertModulePlans({ ...workspace, modulePlans });
                      if (onUpdate({ modulePlans })) {
                        setRevealPlanId(saved.id);
                        setEditing(undefined);
                        return '';
                      }
                      return 'Opslag is niet gelukt. Je volledige keuze blijft behouden.';
                    } catch (error) {
                      return error instanceof Error ? error.message : 'RIEporter-keuze ongeldig.';
                    }
                  }}
                />
              </Modal>
            ) : null
          }
        />
      )}
      {view === 'general' && (
        <NewModuleSelection
          key={`${workspace.id}/${draftBase((workspace.modulePlans ?? []).map((plan) => plan.id))}`}
          workspace={workspace}
          questions={questions}
          open={editing === 'new'}
          onOpen={() => setEditing('new')}
          onClose={() => setEditing(undefined)}
          onSave={(plan) => {
            const modulePlans = [...(workspace.modulePlans ?? []), plan];
            try {
              assertModulePlans({ ...workspace, modulePlans });
            } catch (error) {
              return error instanceof Error ? error.message : 'Moduleplan ongeldig.';
            }
            if (onUpdate({ modulePlans })) {
              setRevealPlanId(plan.id);
              setEditing(undefined);
              return '';
            }
            return 'Opslag is niet gelukt. Je formulier blijft beschikbaar.';
          }}
        />
      )}
      {Boolean(workspace.modulePlans?.length) && (
        <h3 className="module-plan-saved-heading">Opgeslagen modulekeuzes</h3>
      )}
      {(workspace.modulePlans ?? []).map((plan) => (
        <div
          className="registry-item module-plan-saved-card"
          id={`module-plan-${plan.id}`}
          key={plan.id}
        >
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
                  · {moduleOriginLabels[module.origin]} · {moduleQuestionIds(module).length} van{' '}
                  {module.questionIds.length} vragen
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
          {onOpenInventory &&
            (workspace.dossiers ?? [])
              .filter((dossier) => dossier.modulePlanSnapshot?.id === plan.id)
              .map((dossier) => (
                <button
                  key={dossier.id}
                  type="button"
                  className="secondary"
                  aria-label={`Start interview: ${dossier.title}`}
                  onClick={() => onOpenInventory(dossier.id)}
                >
                  Start interview · {dossier.title}
                </button>
              ))}
        </div>
      ))}
      {!workspace.modulePlans?.length && (
        <p className="muted">
          Nog geen opgeslagen modulekeuze. Kies eerst de project- of afdelingsscope.
        </p>
      )}
      {editing && typeof editing !== 'string' && (
        <Modal title="Moduleplan vastleggen" wide onClose={() => setEditing(undefined)}>
          <PlanForm
            key={editing.id}
            workspace={workspace}
            questions={questions}
            original={editing}
            questionMetadata={
              isRieporterPlan(editing)
                ? rieporterModuleCatalog(workspace, questions).questionMetadata
                : undefined
            }
            onSave={(plan) => {
              const original = editing;
              if (
                original &&
                JSON.stringify(workspace.modulePlans?.find((item) => item.id === original.id)) !==
                  JSON.stringify(original)
              )
                return 'Dit plan is intussen gewijzigd. Sluit het formulier en open de actuele versie.';
              const rieporter = isRieporterPlan(original);
              let saved = plan;
              try {
                if (rieporter) {
                  assertRieporterSelectionAvailable(
                    rieporterModuleCatalog(workspace, questions),
                    plan.modules,
                  );
                  saved = { ...plan, modules: plan.modules.filter((module) => module.enabled) };
                }
                const modulePlans = (workspace.modulePlans ?? []).map((item) =>
                  item.id === saved.id ? saved : item,
                );
                assertModulePlans({ ...workspace, modulePlans });
                if (onUpdate({ modulePlans })) {
                  setEditing(undefined);
                  return '';
                }
              } catch (error) {
                return error instanceof Error ? error.message : 'Moduleplan ongeldig.';
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
            onExport={
              creating.modules
                .filter((module) => module.enabled)
                .every((module) => module.id.startsWith('rieporter-process:'))
                ? (fields) => {
                    try {
                      const project = createRieporterProjectWorkspace(
                        workspace,
                        creating,
                        questions,
                        { ...fields, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
                        (candidate) => importWorkspace(JSON.stringify(candidate)),
                      );
                      const href = URL.createObjectURL(
                        new Blob([exportWorkspace(project)], { type: 'application/json' }),
                      );
                      const link = document.createElement('a');
                      link.href = href;
                      link.download = 'ima-rieporter-project.json';
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(href), 1000);
                      return '';
                    } catch (error) {
                      return error instanceof Error ? error.message : 'Projectexport geweigerd.';
                    }
                  }
                : undefined
            }
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
                  onOpenInventory?.(dossier.id);
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
function useModulePlanDraft(
  workspace: WorkspaceState,
  questions: Question[],
  original?: ModulePlan,
) {
  const options = isRieporterPlan(original)
    ? rieporterModuleCatalog(workspace, questions).modules
    : modulePlanOptions(workspace, questions);
  const state = usePersistentDraft(
    `${workspace.id}/module-plan/${original?.id ?? 'new'}`,
    () => ({
      title: original?.title ?? '',
      scope: original?.scope ?? ('project' as ModulePlan['scope']),
      projectContextId: original?.projectContextId ?? '',
      organisationId: original?.organisationId ?? '',
      departmentId: original?.departmentId ?? '',
      modules: [
        ...(original?.modules.map((module) => structuredClone(module)) ?? []),
        ...options.filter((module) => !original?.modules.some((item) => item.id === module.id)),
      ],
      signalIds: [] as string[],
    }),
    original
      ? draftBase(original)
      : `new/v1:${draftBase((workspace.modulePlans ?? []).map((record) => record.id))}`,
  );
  return [
    { ...state[0], modules: completeModuleOptions(state[0].modules, options) },
    state[1],
    state[2],
  ] as typeof state;
}
export type ModulePlanDraft = ReturnType<typeof useModulePlanDraft>[0];
type PlanDraftState = ReturnType<typeof useModulePlanDraft>;
function NewModuleSelection({
  workspace,
  questions,
  open,
  onOpen,
  onClose,
  onSave,
}: {
  workspace: WorkspaceState;
  questions: Question[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (plan: ModulePlan) => string;
}) {
  const state = useModulePlanDraft(workspace, questions);
  const [draft, setDraft] = state;
  return (
    <>
      {!open && <DraftNotice status={state[2]} />}
      {!open && (
        <ModuleSelectionExplorer
          workspace={workspace}
          questions={questions}
          modules={draft.modules}
          signalIds={draft.signalIds ?? []}
          onSignalIdsChange={(signalIds) => setDraft((current) => ({ ...current, signalIds }))}
          onModulesChange={(modules) => setDraft((current) => ({ ...current, modules }))}
          onCreatePlan={onOpen}
        />
      )}
      {open && (
        <Modal title="Moduleplan vastleggen" wide onClose={onClose}>
          <PlanFields workspace={workspace} questions={questions} onSave={onSave} state={state} />
        </Modal>
      )}
    </>
  );
}
function PlanForm({
  workspace,
  questions,
  original,
  onSave,
  questionMetadata,
}: {
  workspace: WorkspaceState;
  questions: Question[];
  original?: ModulePlan;
  onSave: (plan: ModulePlan) => string;
  questionMetadata?: Record<string, RieporterQuestionMetadata>;
}) {
  const state = useModulePlanDraft(workspace, questions, original);
  return (
    <PlanFields
      workspace={workspace}
      questions={questions}
      original={original}
      onSave={onSave}
      state={state}
      questionMetadata={questionMetadata}
    />
  );
}
function PlanFields<T extends ModulePlanDraft>({
  workspace,
  questions,
  original,
  onSave,
  state,
  questionMetadata,
}: {
  workspace: WorkspaceState;
  questions: Question[];
  original?: ModulePlan;
  onSave: (plan: ModulePlan) => string;
  state: [T, Dispatch<SetStateAction<T>>, DraftStatus];
  questionMetadata?: Record<string, RieporterQuestionMetadata>;
}) {
  const [draft, setDraft, draftStatus] = state;
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
      <ModuleSelectionExplorer
        workspace={workspace}
        questions={questions}
        modules={modules}
        questionMetadata={questionMetadata}
        showAdvice={!questionMetadata}
        signalIds={draft.signalIds ?? []}
        onSignalIdsChange={(signalIds) => setDraft((current) => ({ ...current, signalIds }))}
        onModulesChange={(modules) => setModules(modules)}
        renderModuleExtra={(module, index) => (
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
      />
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
  onExport,
}: {
  workspace: WorkspaceState;
  questions: Question[];
  plan: ModulePlan;
  onSave: (fields: { title: string; scope: string; assessor: string }) => string;
  onExport?: (fields: { title: string; scope: string; assessor: string }) => string;
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
      {onExport && (
        <div className="rie-project-export">
          <p>
            Maak expliciet een afzonderlijke projectwerkruimte met deze selectie. De bronbank en
            eerdere interviews blijven in de huidige werkruimte; de export bevat een nieuw dossier
            met lege antwoorden.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={(event) => {
              if (event.currentTarget.form?.reportValidity())
                setError(onExport({ title, scope, assessor }));
            }}
          >
            Projectwerkruimte exporteren
          </button>
        </div>
      )}
    </form>
  );
}
