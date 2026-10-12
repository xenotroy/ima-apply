import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Building2, ChevronRight, GitBranch, Plus, ShieldCheck } from 'lucide-react';
import type { Question } from '../content/catalog';
import type { WorkspaceState } from '../data/model';
import { departmentLabel, departmentOrganisationId } from '../data/dossier';
import { modulePlanQuestionIds, moduleQuestionIds, type ModulePlan } from '../data/module-plan';
import { setModuleEnabled, completeModuleOptions } from '../data/module-selection';
import { draftBase } from '../data/local-drafts';
import { usePersistentDraft, type DraftStatus } from '../hooks/usePersistentDraft';
import {
  emptyPiRouterInputs,
  piBindingsFromWorkspace,
  PI_PROFILE_FEATURES,
  PI_ROUTER_RULES,
  resolvePiRoute,
  type PiRouterInputs,
  type PiRiskSelection,
} from '../data/pi-router';
import {
  rieporterModuleCatalog,
  rieporterDepartmentPlans,
  type RieporterModuleCatalog,
} from '../data/rieporter-module-choice';
import type { ModulePlanDraft } from './ModulePlanWorkspace';
import ModuleSelectionExplorer from './ModuleSelectionExplorer';
import DraftNotice from './DraftNotice';
import DepartmentChoiceReasons from './DepartmentChoiceReasons';
import './RieporterModuleWorkspace.css';

export interface RieporterDraft extends ModulePlanDraft {
  routerInputs: PiRouterInputs;
}
export type RieporterDraftState = [
  RieporterDraft,
  Dispatch<SetStateAction<RieporterDraft>>,
  DraftStatus,
];
export interface RieporterModuleWorkspaceProps {
  workspace: WorkspaceState;
  questions: Question[];
  editorOpen: boolean;
  onRequestEditor: () => void;
  renderEditor: (state: RieporterDraftState, catalog: RieporterModuleCatalog) => ReactNode;
  onEditPlan: (planId: string) => void;
  onCreateDossier: (planId: string) => void;
  onOpenInventory?: (dossierId: string) => void;
  onAddDepartment?: () => void;
  onOpenSettings?: () => void;
}
export default function RieporterModuleWorkspace(props: RieporterModuleWorkspaceProps) {
  const { workspace, questions, editorOpen } = props;
  const [choiceContext, setChoiceContext, contextStatus] = usePersistentDraft(
    `${workspace.id}/rieporter-module-context`,
    { departmentId: '' },
    'context/v1',
    (value) =>
      typeof value?.departmentId === 'string' &&
      (!value.departmentId ||
        Boolean(workspace.departments?.some((record) => record.id === value.departmentId))),
  );
  const [overview, setOverview] = useState<'tree' | 'reasons'>('tree');
  const departmentId = choiceContext.departmentId;
  const setDepartmentId = (departmentId: string) => setChoiceContext({ departmentId });
  const bank = useMemo(() => {
    try {
      return { catalog: rieporterModuleCatalog(workspace, questions), error: '' };
    } catch (error) {
      return {
        catalog: undefined,
        error: error instanceof Error ? error.message : 'Bronbank kan niet veilig worden geopend.',
      };
    }
  }, [workspace, questions]);
  const catalog = bank.catalog;
  const department = workspace.departments?.find((record) => record.id === departmentId);
  const organisationId = departmentOrganisationId(department, workspace.sites ?? []);
  const selectionBasis = draftBase({
    banks: catalog?.banks.map((record) => [record.id, record.sourceSha256, record.date]),
    department: department ?? null,
    organisation: workspace.organisations?.find((record) => record.id === organisationId) ?? null,
    plans: (workspace.modulePlans ?? []).map((record) => record.id),
  });
  return (
    <section className="rie-choice" aria-label="RIEporter-bronbank">
      {!editorOpen && (
        <>
          <DraftNotice status={contextStatus} />
          <header className="rie-choice-heading">
            <GitBranch size={25} />
            <div>
              <span>BRONVRAGEN · AFDELINGEN · ONDERZOEK</span>
              <h2>RIEporter-bronmodules & afdelingskeuze</h2>
              <p>
                Verken de aanwezige procesblokken. Bewaar de keuze per echte afdeling en start een
                afgebakend dossier.
              </p>
            </div>
          </header>
          {bank.error && (
            <p className="validation-message" role="alert">
              {bank.error}
            </p>
          )}
          {!catalog?.banks.length ? (
            <div className="rie-empty-bank">
              <h3>Nog geen RIEporter-bronbank aanwezig</h3>
              <p>
                Open of importeer je private werkruimte met bronvraagbindingen. Algemene IMA-thema’s
                en oorspronkelijke legacy-modules vormen een afzonderlijke bank.
              </p>
              {props.onOpenSettings && (
                <button type="button" className="primary" onClick={props.onOpenSettings}>
                  Bronbank openen
                </button>
              )}
            </div>
          ) : (
            <div className="rie-bank-register">
              {catalog.banks.map((record) => (
                <details key={record.id} className="rie-bank-card">
                  <summary>
                    <span>
                      <strong>{record.boundQuestionCount} bronvragen</strong>
                      <small>
                        {record.processCount} procesblokken · {record.aspectCount} aspecten ·{' '}
                        {record.availableQuestionCount} vraagdefinities · bronmoment {record.date}
                      </small>
                    </span>
                    <span className="rie-bank-coverage">
                      {record.coverage === 'full_source'
                        ? 'Volledige aanwezige bronsnapshot'
                        : record.coverage === 'scoped_selection'
                          ? 'Afgebakend brondeel'
                          : 'Dekking niet vastgelegd'}
                    </span>
                    <ChevronRight size={17} />
                  </summary>
                  <dl>
                    <dt>Bronbank-ID</dt>
                    <dd>{record.id}</dd>
                    <dt>Oorspronkelijk verklaard aantal</dt>
                    <dd>{record.declaredQuestionCount}</dd>
                    <dt>Gebonden / beschikbare definities</dt>
                    <dd>
                      {record.boundQuestionCount} / {record.availableQuestionCount}
                    </dd>
                    <dt>SHA-256 van de bron</dt>
                    <dd>{record.sourceSha256}</dd>
                  </dl>
                  <p>
                    Procesblokken zijn afgeleide browsergroeperingen van de exacte bronlabels, geen
                    oorspronkelijke technische Porter-module-ID’s. Dekking betreft deze snapshot,
                    geen actuele complete Porter-bibliotheek.
                  </p>
                  {record.missingQuestionIds.length > 0 && (
                    <p role="alert">
                      {record.missingQuestionIds.length} bronvraagdefinities ontbreken. Gekozen
                      onvolledige procesblokken kunnen niet worden vastgelegd.
                    </p>
                  )}
                </details>
              ))}
            </div>
          )}
          <div className="rie-overview-tabs" role="tablist" aria-label="Afdelingsoverzicht">
            <button
              type="button"
              role="tab"
              aria-selected={overview === 'tree'}
              onClick={() => setOverview('tree')}
            >
              Afdelingen & modules
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={overview === 'reasons'}
              onClick={() => setOverview('reasons')}
            >
              Argumentatie & keuzes
            </button>
          </div>
          {overview === 'reasons' ? (
            <DepartmentChoiceReasons
              workspace={workspace}
              catalog={catalog}
              onEditPlan={props.onEditPlan}
            />
          ) : (
            <DepartmentModuleTree
              {...props}
              canCreateChoice={Boolean(catalog?.banks.length)}
              onCreateForDepartment={(id) => {
                setDepartmentId(id);
                props.onRequestEditor();
              }}
            />
          )}
          {catalog?.banks.length ? (
            <label className="field rie-department-selector">
              <span>Afdeling voor deze keuze</span>
              <select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">Projectbreed · kies organisatie in het moduleplan</option>
                {(workspace.departments ?? []).map((record) => (
                  <option key={record.id} value={record.id}>
                    {departmentLabel(record, workspace.sites ?? [], workspace.organisations ?? [])}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      )}
      {catalog?.banks.length ? (
        <RieporterChoice
          key={`${workspace.id}/${departmentId || 'project'}/${selectionBasis}`}
          {...props}
          catalog={catalog}
          departmentId={departmentId}
          organisationId={organisationId}
          selectionBasis={selectionBasis}
        />
      ) : null}
    </section>
  );
}
function RieporterChoice({
  workspace,
  questions,
  catalog,
  departmentId,
  organisationId,
  selectionBasis,
  editorOpen,
  onRequestEditor,
  renderEditor,
}: RieporterModuleWorkspaceProps & {
  catalog: RieporterModuleCatalog;
  departmentId: string;
  organisationId?: string;
  selectionBasis: string;
}) {
  const storedState = usePersistentDraft<RieporterDraft>(
    `${workspace.id}/rieporter-module-choice/${departmentId || 'project'}/new`,
    () => ({
      title: '',
      scope: departmentId ? 'department' : 'project',
      projectContextId: '',
      organisationId: organisationId ?? '',
      departmentId,
      modules: structuredClone(catalog.modules),
      signalIds: [],
      routerInputs: {
        ...emptyPiRouterInputs(
          workspace.departments?.find((record) => record.id === departmentId)?.name ?? '',
        ),
        researchLevel: departmentId ? 'department' : 'central',
        ...(organisationId ? { organisationId } : {}),
      },
    }),
    `rieporter/v1:${selectionBasis}`,
  );
  const [storedDraft, setDraft, status] = storedState;
  const draft = {
    ...storedDraft,
    modules: completeModuleOptions(storedDraft.modules, catalog.modules),
  };
  const state: RieporterDraftState = [draft, setDraft, status];
  const [error, setError] = useState('');
  const recommendation = useMemo(() => {
    try {
      const route = resolvePiRoute(draft.routerInputs, piBindingsFromWorkspace(workspace));
      const wanted = new Set(route.questionIds);
      return {
        route,
        modules: catalog.modules.filter((module) =>
          module.questionIds.some((id) => wanted.has(id)),
        ),
        error: '',
      };
    } catch (error) {
      return {
        route: undefined,
        modules: [],
        error: error instanceof Error ? error.message : 'Routervoorstel niet beschikbaar.',
      };
    }
  }, [workspace, draft.routerInputs, catalog]);
  const changeRouter = (patch: Partial<PiRouterInputs>) =>
    setDraft((current) => ({ ...current, routerInputs: { ...current.routerInputs, ...patch } }));
  return (
    <>
      {!editorOpen && (
        <>
          <DraftNotice status={status} />
          <details className="rie-router-help" open>
            <summary>
              <ShieldCheck size={19} />
              <span>RIEporter-keuzehulp: profiel, risico en onderzoekslaag</span>
              <ChevronRight size={17} />
            </summary>
            <p>
              De bestaande onderzoeksrouter koppelt ingevulde profielen en risico’s aan bronvragen.
              Het voorstel betreft procesblokken die zulke vragen bevatten. Controleer de overige
              vragen zelf; bronbindings kunnen nog een conceptmapping zijn.
            </p>
            <label className="field">
              <span>Onderzoekslaag RIEporter</span>
              <select
                value={draft.routerInputs.researchLevel ?? 'local'}
                onChange={(event) =>
                  changeRouter({
                    researchLevel: event.target.value as PiRouterInputs['researchLevel'],
                  })
                }
              >
                <option value="central">Inrichtingsbreed / centraal</option>
                <option value="department">Organisatie / afdeling</option>
                <option value="local">Lokaal / taak en werkgebied</option>
              </select>
            </label>
            <div className="rie-profile-grid">
              {PI_PROFILE_FEATURES.map(([id, label]) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    aria-label={`Porterprofiel: ${label}`}
                    checked={draft.routerInputs.features[id] === 'present'}
                    onChange={(event) =>
                      changeRouter({
                        features: {
                          ...draft.routerInputs.features,
                          [id]: event.target.checked ? 'present' : 'unknown',
                        },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <details className="rie-risk-inputs">
              <summary>Risico’s en lokale verhoging invullen</summary>
              <div className="rie-risk-grid">
                {PI_ROUTER_RULES.filter((rule) => rule.kind === 'risk').map((rule) => (
                  <label className="field" key={rule.id}>
                    <span>{rule.title}</span>
                    <select
                      aria-label={`Porterrisico: ${rule.title}`}
                      value={draft.routerInputs.risks[rule.id] ?? 'unknown'}
                      onChange={(event) =>
                        changeRouter({
                          risks: {
                            ...draft.routerInputs.risks,
                            [rule.id]: event.target.value as PiRiskSelection,
                          },
                        })
                      }
                    >
                      <option value="unknown">Nog onbekend</option>
                      <option value="possible">Mogelijk relevant</option>
                      <option value="confirmed">Aanwezig volgens invoer</option>
                      <option value="increased">Lokale verhoging / signaal</option>
                    </select>
                  </label>
                ))}
              </div>
            </details>
            <div className="rie-router-result">
              <strong>{recommendation.modules.length} procesblokken in het routervoorstel</strong>
              <button
                type="button"
                className="primary"
                disabled={!recommendation.modules.length}
                onClick={() => {
                  let modules = draft.modules;
                  for (const module of recommendation.modules)
                    modules = setModuleEnabled(modules, module.id, true);
                  setDraft((current) => ({ ...current, modules }));
                  setError('');
                }}
              >
                Routervoorstel toevoegen
              </button>
            </div>
            <p className="rie-router-boundary">
              Geen automatische selectie. Uitvinken van een profiel betekent onbekend, geen bewezen
              afwezigheid. Toevoegen behoudt jouw vraaguitsluitingen; het verleent geen bewijs- of
              risicocredit.
            </p>
            <details className="rie-router-reasons">
              <summary>Voorstel onderbouwen</summary>
              {recommendation.route?.topics
                .filter((topic) => topic.questions.length)
                .map((topic) => (
                  <p key={topic.rule.id}>
                    <strong>{topic.rule.title}</strong> · {topic.reasons.join(' ')} ·{' '}
                    {topic.questions.length} gekoppelde bronvragen · {topic.applicability}
                  </p>
                ))}
            </details>
            {(error || recommendation.error) && (
              <p role="alert" className="validation-message">
                {error || recommendation.error}
              </p>
            )}
          </details>
          <ModuleSelectionExplorer
            workspace={workspace}
            questions={questions}
            modules={draft.modules}
            onModulesChange={(modules) => setDraft((current) => ({ ...current, modules }))}
            questionMetadata={catalog.questionMetadata}
            showAdvice={false}
            onCreatePlan={onRequestEditor}
          />
          {draft.modules
            .filter((module) => module.enabled && catalog.moduleAvailability[module.id]?.blocked)
            .map((module) => (
              <p key={module.id} role="alert" className="rie-blocked">
                Gekozen procesblok {module.title} is niet volledig beschikbaar. Ontbrekende of
                onduidelijke brondefinities blokkeren vastleggen, ook wanneer die vraag is
                uitgesloten.
              </p>
            ))}
        </>
      )}
      {renderEditor(state, catalog)}
    </>
  );
}
function DepartmentModuleTree(
  props: RieporterModuleWorkspaceProps & {
    onCreateForDepartment: (id: string) => void;
    canCreateChoice: boolean;
  },
) {
  const {
    workspace,
    questions,
    onEditPlan,
    onCreateDossier,
    onOpenInventory,
    onCreateForDepartment,
  } = props;
  const byId = new Map(questions.map((question) => [question.id, question]));
  function plans(items: ModulePlan[]) {
    return items.map((plan) => (
      <details className="rie-tree-plan" key={plan.id}>
        <summary>
          <strong>{plan.title}</strong>
          <span>
            revisie {plan.revision} · {modulePlanQuestionIds(plan).length} vragen
          </span>
        </summary>
        <div className="rie-tree-actions">
          <button
            type="button"
            className="secondary"
            aria-label={`Aanpassen: ${plan.title}`}
            onClick={() => onEditPlan(plan.id)}
          >
            Aanpassen
          </button>
          <button
            type="button"
            className="primary"
            aria-label={`Dossier uit moduleplan: ${plan.title}`}
            onClick={() => onCreateDossier(plan.id)}
          >
            Dossier uit keuze
          </button>
        </div>
        {plan.modules
          .filter((module) => module.enabled)
          .map((module) => (
            <details className="rie-tree-module" key={module.id}>
              <summary>
                {module.title}
                <span>
                  {moduleQuestionIds(module).length} van {module.questionIds.length} vragen
                </span>
              </summary>
              {moduleQuestionIds(module).map((id) => (
                <details className="rie-tree-question" key={id}>
                  <summary>
                    {byId.get(id)?.title ?? id}
                    <small>{id}</small>
                  </summary>
                  <p>
                    {byId.get(id)?.prompt ??
                      'Actuele vraagdefinitie niet beschikbaar; gebruik het bevroren dossier voor het eerdere onderzoek.'}
                  </p>
                </details>
              ))}
            </details>
          ))}
        <div className="rie-frozen-dossiers">
          <h5>Afzonderlijk bevroren dossiers</h5>
          {(workspace.dossiers ?? [])
            .filter((dossier) => dossier.modulePlanSnapshot?.id === plan.id)
            .map((dossier) => (
              <div key={dossier.id}>
                <span>
                  {dossier.title} · planrevisie {dossier.modulePlanSnapshot?.revision} ·{' '}
                  {dossier.questions.length} bevroren vragen
                </span>
                {onOpenInventory && (
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Start interview: ${dossier.title}`}
                    onClick={() => onOpenInventory(dossier.id)}
                  >
                    Start interview
                  </button>
                )}
              </div>
            ))}
          {!(workspace.dossiers ?? []).some(
            (dossier) => dossier.modulePlanSnapshot?.id === plan.id,
          ) && <p>Nog geen dossier uit dit plan.</p>}
          <p>Een aangepaste keuze verandert bestaande dossiers niet.</p>
        </div>
      </details>
    ));
  }
  return (
    <section className="rie-department-tree" aria-label="Afdelingen en modulekeuzes">
      <div className="rie-tree-heading">
        <h3>
          <Building2 size={19} /> Afdelingen en hun modulekeuzes
        </h3>
        {props.onAddDepartment && (
          <button type="button" className="secondary" onClick={props.onAddDepartment}>
            <Plus size={15} /> Afdeling toevoegen
          </button>
        )}
      </div>
      {(workspace.organisations ?? []).map((organisation) => (
        <details className="rie-tree-organisation" key={organisation.id} open>
          <summary>
            <strong>{organisation.name}</strong>
            <span>
              {
                (workspace.departments ?? []).filter(
                  (department) =>
                    departmentOrganisationId(department, workspace.sites ?? []) === organisation.id,
                ).length
              }{' '}
              afdelingen
            </span>
          </summary>
          {(workspace.departments ?? [])
            .filter(
              (department) =>
                departmentOrganisationId(department, workspace.sites ?? []) === organisation.id,
            )
            .map((department) => (
              <details className="rie-tree-department" key={department.id}>
                <summary>
                  <strong>{department.name}</strong>
                  <small>{department.activity || 'Activiteiten nog niet beschreven'}</small>
                </summary>
                <p className="rie-tree-location">
                  {departmentLabel(
                    department,
                    workspace.sites ?? [],
                    workspace.organisations ?? [],
                  )}
                </p>
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Afdelingskeuze maken: ${department.name}`}
                  disabled={!props.canCreateChoice}
                  onClick={() => onCreateForDepartment(department.id)}
                >
                  Afdelingskeuze maken
                </button>
                {plans(rieporterDepartmentPlans(workspace, department.id))}
                {!rieporterDepartmentPlans(workspace, department.id).length && (
                  <p>Nog geen moduleplan aan deze afdeling gekoppeld.</p>
                )}
              </details>
            ))}
        </details>
      ))}
      {!workspace.departments?.length && (
        <p className="rie-tree-empty">
          Nog geen vastgelegde afdelingen. Voeg een afdeling toe onder de werkelijke organisatie of
          locatie; bronvragen maken geen afdelingen aan.
        </p>
      )}
      {(workspace.modulePlans ?? []).some((plan) => plan.scope === 'project') && (
        <details className="rie-tree-project">
          <summary>
            <strong>Projectbrede keuzes</strong>
            <span>Niet automatisch aan een afdeling toegewezen</span>
          </summary>
          {plans((workspace.modulePlans ?? []).filter((plan) => plan.scope === 'project'))}
        </details>
      )}
    </section>
  );
}
