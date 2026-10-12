import { sha256 } from '@noble/hashes/sha2.js';
import type { Question } from '../content/catalog';
import { departmentOrganisationId } from './dossier';
import { createWorkspace, type WorkspaceState, type WorkspaceRecord } from './model';
import {
  createDossierFromModulePlan,
  modulePlanHash,
  modulePlanQuestionIds,
  type ModulePlan,
  type PlannedModule,
} from './module-plan';
import {
  piBindingsFromWorkspace,
  type PiQuestionBinding,
  type PiRouterBindings,
} from './pi-router';

export type RieporterQuestionMetadata = Pick<
  PiQuestionBinding,
  'code' | 'key' | 'aspect' | 'process' | 'sourceId' | 'page' | 'mappingStatus'
>;
export interface RieporterBankSummary {
  id: string;
  date: string;
  coverage: NonNullable<PiRouterBindings['coverage']> | 'unspecified';
  declaredQuestionCount: number;
  boundQuestionCount: number;
  availableQuestionCount: number;
  missingQuestionIds: string[];
  ambiguousQuestionIds: string[];
  processCount: number;
  aspectCount: number;
  sourceSha256: string;
  sourceIds: string[];
  missingSourceIds: string[];
}
export interface RieporterModuleAvailability {
  bankId: string;
  availableQuestionCount: number;
  missingQuestionIds: string[];
  ambiguousQuestionIds: string[];
  missingSourceIds: string[];
  blocked: boolean;
}
export interface RieporterModuleCatalog {
  modules: PlannedModule[];
  questionMetadata: Record<string, RieporterQuestionMetadata>;
  banks: RieporterBankSummary[];
  moduleBankIds: Record<string, string>;
  moduleAvailability: Record<string, RieporterModuleAvailability>;
  issues: string[];
  ambiguousQuestionIds: string[];
  moduleCount: number;
  bankCount: number;
  boundQuestionCount: number;
  availableQuestionCount: number;
}

/** A browser grouping ID, never an invented native RIEporter module ID. No index/title join. */
export function rieporterProcessModuleId(bankId: string, process: string): string {
  const bytes = sha256(
    new TextEncoder().encode(JSON.stringify(['ima.rieporter-process/v1', bankId, process])),
  );
  return `rieporter-process:${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}
function metadata(binding: PiQuestionBinding): RieporterQuestionMetadata {
  return {
    code: binding.code,
    key: binding.key,
    aspect: binding.aspect,
    process: binding.process,
    sourceId: binding.sourceId,
    page: binding.page,
    mappingStatus: binding.mappingStatus,
  };
}
const unique = (values: readonly string[]) => [...new Set(values)];

/** Runtime private bindings are the sole bank source; no question/code/process catalogue is bundled. */
export function rieporterModuleCatalog(
  workspace: WorkspaceState,
  questions: readonly Question[],
): RieporterModuleCatalog {
  const bindings = piBindingsFromWorkspace(workspace);
  if (new Set(bindings.map((bank) => bank.id)).size !== bindings.length)
    throw new Error('RIEporter-keuzehulp: bronbank-ID is niet uniek.');
  const definitions = new Map<string, number>();
  for (const question of questions)
    definitions.set(question.id, (definitions.get(question.id) ?? 0) + 1);
  const sourceCounts = new Map<string, number>();
  for (const source of workspace.sources)
    sourceCounts.set(source.id, (sourceCounts.get(source.id) ?? 0) + 1);
  const metadataById = new Map<string, RieporterQuestionMetadata>(),
    ambiguous = new Set<string>();
  for (const bank of bindings)
    for (const binding of bank.questions) {
      const current = metadata(binding),
        previous = metadataById.get(binding.questionId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(current))
        ambiguous.add(binding.questionId);
      else if (!previous) metadataById.set(binding.questionId, current);
      if ((definitions.get(binding.questionId) ?? 0) > 1) ambiguous.add(binding.questionId);
    }
  const available = (id: string) => definitions.get(id) === 1 && !ambiguous.has(id);
  const absent = (id: string) => !definitions.has(id);
  const sourcesMissing = (ids: readonly string[]) => ids.filter((id) => sourceCounts.get(id) !== 1);
  const modules: PlannedModule[] = [],
    banks: RieporterBankSummary[] = [],
    issues: string[] = [];
  const bankEntries: [string, string][] = [],
    availabilityEntries: [string, RieporterModuleAvailability][] = [];
  for (const bank of bindings) {
    const missingQuestionIds = bank.questions
      .filter((q) => absent(q.questionId))
      .map((q) => q.questionId);
    const ambiguousQuestionIds = bank.questions
      .filter((q) => ambiguous.has(q.questionId))
      .map((q) => q.questionId);
    const provenance = unique([...bank.sourceIds, ...bank.questions.map((q) => q.sourceId)]);
    const missingSourceIds = sourcesMissing(provenance);
    banks.push({
      id: bank.id,
      date: bank.bankDate,
      coverage: bank.coverage ?? 'unspecified',
      declaredQuestionCount: bank.originalQuestionCount ?? bank.questions.length,
      boundQuestionCount: bank.questions.length,
      availableQuestionCount: bank.questions.filter((q) => available(q.questionId)).length,
      missingQuestionIds,
      ambiguousQuestionIds,
      sourceIds: provenance,
      missingSourceIds,
      processCount: new Set(bank.questions.map((q) => q.process)).size,
      aspectCount: new Set(bank.questions.map((q) => q.aspect)).size,
      sourceSha256: bank.sourceSha256,
    });
    if (missingQuestionIds.length)
      issues.push(`Bronbank ${bank.id}: ${missingQuestionIds.length} vraagdefinities ontbreken.`);
    if (ambiguousQuestionIds.length)
      issues.push(
        `Bronbank ${bank.id}: ${ambiguousQuestionIds.length} vraagidentiteiten hebben onduidelijke metadata of meerdere definities.`,
      );
    if (missingSourceIds.length)
      issues.push(
        `Bronbank ${bank.id}: bron-ID’s ontbreken of zijn niet uniek: ${missingSourceIds.join(', ')}.`,
      );
    const groups = new Map<string, PiQuestionBinding[]>();
    for (const binding of bank.questions) {
      const group = groups.get(binding.process) ?? [];
      group.push(binding);
      groups.set(binding.process, group);
    }
    for (const [process, members] of groups) {
      const id = rieporterProcessModuleId(bank.id, process);
      const sourceIds = unique([...bank.sourceIds, ...members.map((q) => q.sourceId)]);
      const missing = members.filter((q) => absent(q.questionId)).map((q) => q.questionId);
      const unresolved = members
        .filter((q) => ambiguous.has(q.questionId))
        .map((q) => q.questionId);
      const missingSources = sourcesMissing(sourceIds);
      modules.push({
        id,
        origin: 'imported_theme',
        code: process,
        title: process,
        questionIds: members.map((q) => q.questionId),
        enabled: false,
        sourceIds,
        scopeNotes: bank.scopeNote ?? '',
        sortOrder: modules.length,
      });
      bankEntries.push([id, bank.id]);
      availabilityEntries.push([
        id,
        {
          bankId: bank.id,
          availableQuestionCount: members.filter((q) => available(q.questionId)).length,
          missingQuestionIds: missing,
          ambiguousQuestionIds: unresolved,
          missingSourceIds: missingSources,
          blocked: Boolean(missing.length || unresolved.length || missingSources.length),
        },
      ]);
    }
  }
  return {
    modules,
    banks,
    questionMetadata: Object.fromEntries([...metadataById].filter(([id]) => !ambiguous.has(id))),
    moduleBankIds: Object.fromEntries(bankEntries),
    moduleAvailability: Object.fromEntries(availabilityEntries),
    issues,
    ambiguousQuestionIds: [...ambiguous],
    moduleCount: modules.length,
    bankCount: banks.length,
    boundQuestionCount: banks.reduce((sum, bank) => sum + bank.boundQuestionCount, 0),
    availableQuestionCount: banks.reduce((sum, bank) => sum + bank.availableQuestionCount, 0),
  };
}

/** A selected process retains its whole source membership even if a missing question was unchecked. */
export function assertRieporterSelectionAvailable(
  catalog: RieporterModuleCatalog,
  modules: readonly PlannedModule[],
): void {
  const selected = modules.filter((module) => module.enabled);
  if (new Set(selected.map((module) => module.id)).size !== selected.length)
    throw new Error('RIEporter-keuze: dubbele geselecteerde module.');
  for (const module of selected) {
    const original = catalog.modules.find((item) => item.id === module.id);
    const availability = catalog.moduleAvailability[module.id];
    if (!original || !availability)
      throw new Error('RIEporter-keuze: module behoort niet tot de actuele broncatalogus.');
    if (
      module.origin !== 'imported_theme' ||
      JSON.stringify(module.questionIds) !== JSON.stringify(original.questionIds) ||
      !Array.isArray(module.sourceIds) ||
      JSON.stringify(unique(module.sourceIds).sort()) !==
        JSON.stringify([...original.sourceIds].sort())
    )
      throw new Error(
        'RIEporter-keuze: oorspronkelijke vraagleden of bronkoppelingen zijn gewijzigd.',
      );
    if (availability.blocked)
      throw new Error(
        `RIEporter-keuze: proces ${original.title} heeft ontbrekende of onduidelijke definities/bronverwijzingen. Herstel de bronbank vóór vastleggen.`,
      );
  }
  if (!modulePlanQuestionIds({ modules: [...selected] } as ModulePlan).length)
    throw new Error('RIEporter-keuze: selecteer minimaal één beschikbare bronvraag.');
}

/** Exactly the selected department; no title join or inferred organisation/location. */
export function rieporterDepartmentOrganisationId(
  workspace: WorkspaceState,
  departmentId: string,
): string | undefined {
  const departments = (workspace.departments ?? []).filter(
    (department) => department.id === departmentId,
  );
  if (departments.length !== 1) return undefined;
  return departmentOrganisationId(departments[0], workspace.sites ?? []);
}
/** Department plans only; a project-wide plan is a separate choice, not implicit inheritance. */
export function rieporterDepartmentPlans(
  workspace: WorkspaceState,
  departmentId: string,
): ModulePlan[] {
  return (workspace.modulePlans ?? []).filter(
    (plan) => plan.scope === 'department' && plan.departmentId === departmentId,
  );
}

export interface RieporterProjectDossierFields {
  id: string;
  title: string;
  scope: string;
  assessor: string;
  createdAt: string;
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** Explicit new project: no old interview, action, incident or evidence state is transferred.
 * Caller must apply the actual boundary: p => importWorkspace(JSON.stringify(p)).
 */
export function createRieporterProjectWorkspace(
  workspace: WorkspaceState,
  plan: ModulePlan,
  questions: readonly Question[],
  fields: RieporterProjectDossierFields,
  validateProject: (project: WorkspaceState) => WorkspaceState,
): WorkspaceState {
  const catalog = rieporterModuleCatalog(workspace, questions);
  assertRieporterSelectionAvailable(catalog, plan.modules);
  if (typeof validateProject !== 'function')
    throw new Error('Projectexport vereist native uitvoervalidatie.');
  const selectedPlan = copy({ ...plan, modules: plan.modules.filter((module) => module.enabled) });
  // Excluded original members remain definitions: the plan still records those source memberships.
  const retainedIds = new Set(selectedPlan.modules.flatMap((module) => module.questionIds));
  const selectedDefinitions = questions.filter((question) => retainedIds.has(question.id));
  // A scoped copy cannot certify that it contains an entire managed package version.
  if (selectedDefinitions.some((question) => question.definition !== undefined))
    throw new Error(
      'Afzonderlijke RIEporter-projectexport met beheerde pakketmetadata vereist behoud van de volledige pakketversie. Deze bronselectie wordt niet als volledig pakket bevroren.',
    );
  const selectedBankIds = new Set(
    selectedPlan.modules.map((module) => catalog.moduleBankIds[module.id]),
  );
  const bindings = piBindingsFromWorkspace(workspace)
    .filter((bank) => selectedBankIds.has(bank.id))
    .map((bank): PiRouterBindings => ({
      ...copy(bank),
      questions: copy(bank.questions.filter((binding) => retainedIds.has(binding.questionId))),
      coverage: 'scoped_selection',
      originalQuestionCount: bank.originalQuestionCount ?? bank.questions.length,
      scopeNote: `${bank.scopeNote ? `${bank.scopeNote}\n` : ''}Handmatige modulekeuze ${selectedPlan.id}, plan-SHA256 ${modulePlanHash(selectedPlan)}. Alleen oorspronkelijke vraagleden van gekozen processen zijn overgedragen; de afzonderlijke dossierselectie kan vragen uitsluiten.`,
    }));
  const contexts = (workspace.projectContexts ?? []).filter(
    (context) => context.id === plan.projectContextId,
  );
  const departments = (workspace.departments ?? []).filter(
    (department) => department.id === plan.departmentId,
  );
  const sites = (workspace.sites ?? []).filter((site) =>
    departments.some((department) => department.siteId === site.id),
  );
  const organisationIds = new Set(
    [
      plan.organisationId,
      ...contexts.flatMap((context) => context.organisationIds),
      ...departments.map((department) =>
        departmentOrganisationId(department, workspace.sites ?? []),
      ),
    ].filter((id): id is string => Boolean(id)),
  );
  const usedSourceIds = new Set([
    ...selectedPlan.sourceIds,
    ...selectedPlan.modules.flatMap((module) => module.sourceIds),
    ...selectedDefinitions.flatMap((question) => question.sourceIds),
    ...contexts.flatMap((context) => context.sourceIds),
    ...bindings.flatMap((bank) => bank.sourceIds),
  ]);
  const project = createWorkspace(`Project: ${fields.title}`, {
    questions: copy(selectedDefinitions) as unknown as WorkspaceRecord[],
    sources: copy(workspace.sources.filter((source) => usedSourceIds.has(source.id))),
    contentRecords: copy(bindings) as unknown as WorkspaceRecord[],
    organisations: copy(
      (workspace.organisations ?? []).filter((organisation) =>
        organisationIds.has(organisation.id),
      ),
    ),
    departments: copy(departments),
    sites: copy(sites),
    projectContexts: copy(contexts),
    modulePlans: [selectedPlan],
  });
  project.createdAt = fields.createdAt;
  project.updatedAt = fields.createdAt;
  project.dossiers = [
    createDossierFromModulePlan(selectedPlan, selectedDefinitions, project, fields),
  ];
  return validateProject(project);
}
