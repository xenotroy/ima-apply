import { sha256 } from '@noble/hashes/sha2.js';
import {
  questions as builtinQuestions,
  themes,
  sources as builtinSources,
  type Question,
} from '../content/catalog';
import type { WorkspaceState, WorkspaceRecord } from './model';
import { departmentOrganisationId, type Dossier } from './dossier';
import { freezeQuestion } from './frozen';
import { captureQuestionPackages } from './question-definition';

export interface PlannedModule {
  id: string;
  /** A legacy Module ID is distinct from a new catalog or imported theme ID. */
  origin: 'legacy_module' | 'catalog_theme' | 'imported_theme';
  code: string;
  title: string;
  questionIds: string[];
  enabled: boolean;
  scopeNotes: string;
  /** Original assignment order, distinct from the module-definition order. */
  sortOrder?: number;
  definitionSortOrder?: number;
  sourceIds: string[];
}
export interface ModulePlan {
  id: string;
  title: string;
  scope: 'project' | 'department';
  projectContextId?: string;
  organisationId?: string;
  departmentId?: string;
  modules: PlannedModule[];
  revision: number;
  sourceIds: string[];
}
export const moduleOriginLabels = {
  legacy_module: 'Oorspronkelijke module',
  catalog_theme: 'IMA-catalogusthema',
  imported_theme: 'Geïmporteerd vraagthema',
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function modulePlanHash(plan: ModulePlan): string {
  const artifact = JSON.stringify({
    id: plan.id,
    title: plan.title,
    scope: plan.scope,
    projectContextId: plan.projectContextId ?? null,
    organisationId: plan.organisationId ?? null,
    departmentId: plan.departmentId ?? null,
    revision: plan.revision,
    sourceIds: plan.sourceIds,
    modules: plan.modules.map((module) => ({
      id: module.id,
      origin: module.origin,
      code: module.code,
      title: module.title,
      enabled: module.enabled,
      questionIds: module.questionIds,
      scopeNotes: module.scopeNotes,
      sortOrder: module.sortOrder ?? null,
      definitionSortOrder: module.definitionSortOrder ?? null,
      sourceIds: module.sourceIds,
    })),
  });
  return Array.from(sha256(new TextEncoder().encode(artifact)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
export function modulePlanQuestionIds(plan: ModulePlan): string[] {
  return [
    ...new Set(
      plan.modules.filter((module) => module.enabled).flatMap((module) => module.questionIds),
    ),
  ];
}
/** Existing legacy identities remain separate; new themes never impersonate them. */
export function modulePlanOptions(
  workspace: WorkspaceState,
  questions: readonly Question[],
): PlannedModule[] {
  const legacy = [
    ...new Map(
      (workspace.modulePlans ?? [])
        .flatMap((plan) => plan.modules)
        .filter((module) => module.origin === 'legacy_module')
        .map((module) => [module.id, module]),
    ).values(),
  ];
  const legacyQuestionIds = new Set(legacy.flatMap((module) => module.questionIds));
  const groups = new Map<string, PlannedModule>();
  const builtinIds = new Set(builtinQuestions.map((question) => question.id));
  for (const question of questions) {
    if (legacyQuestionIds.has(question.id)) continue;
    const origin =
      builtinIds.has(question.id) &&
      !workspace.questions.some((record) => record.id === question.id)
        ? 'catalog_theme'
        : 'imported_theme';
    const key = `${origin}:${question.themeId}`;
    if (!groups.has(key))
      groups.set(key, {
        id: key,
        origin,
        code: question.themeId,
        title:
          origin === 'catalog_theme'
            ? (themes.find((theme) => theme.id === question.themeId)?.title ?? question.themeId)
            : question.themeId,
        questionIds: [],
        enabled: false,
        scopeNotes: '',
        sourceIds: [],
      });
    const group = groups.get(key)!;
    group.questionIds.push(question.id);
    group.sourceIds = [...new Set([...group.sourceIds, ...question.sourceIds])];
  }
  return [
    ...legacy.map((module) => ({ ...copy(module), enabled: false, scopeNotes: '' })),
    ...groups.values(),
  ];
}
function invalid(message: string): never {
  throw new Error(`Moduleplan: ${message}`);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('object verwacht.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid('onbekend veld.');
}
function text(value: unknown, required = false): asserts value is string {
  if (typeof value !== 'string' || (required && !value.trim())) invalid('tekst ontbreekt.');
}
function identity(value: unknown): asserts value is string {
  text(value, true);
  if (value.length > 160) invalid('identiteit is te lang.');
}
function ids(value: unknown): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 160) ||
    new Set(value).size !== value.length
  )
    invalid('identiteiten ontbreken of komen dubbel voor.');
}
/** Validates structure separately so corrupt exports fail before relational reads. */
export function assertModulePlan(plan: unknown): asserts plan is ModulePlan {
  const value = record(plan);
  keys(value, [
    'id',
    'title',
    'scope',
    'projectContextId',
    'organisationId',
    'departmentId',
    'modules',
    'revision',
    'sourceIds',
  ]);
  identity(value.id);
  text(value.title, true);
  if (!['project', 'department'].includes(String(value.scope))) invalid('onbekende scope.');
  for (const key of ['projectContextId', 'organisationId', 'departmentId'])
    if (value[key] !== undefined) identity(value[key]);
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0)
    invalid('ongeldige revisie.');
  ids(value.sourceIds);
  if (!Array.isArray(value.modules)) invalid('modules ontbreken.');
  const moduleIds = new Set<string>();
  for (const raw of value.modules) {
    const module = record(raw);
    keys(module, [
      'id',
      'origin',
      'code',
      'title',
      'questionIds',
      'enabled',
      'scopeNotes',
      'sortOrder',
      'definitionSortOrder',
      'sourceIds',
    ]);
    identity(module.id);
    text(module.code);
    text(module.title, true);
    text(module.scopeNotes);
    if (moduleIds.has(module.id)) invalid('dubbele module-identiteit.');
    moduleIds.add(module.id);
    if (!['legacy_module', 'catalog_theme', 'imported_theme'].includes(String(module.origin)))
      invalid('onbekende moduleherkomst.');
    if (typeof module.enabled !== 'boolean') invalid('selectiestatus ontbreekt.');
    ids(module.questionIds);
    ids(module.sourceIds);
    for (const key of ['sortOrder', 'definitionSortOrder'])
      if (module[key] !== undefined && !Number.isSafeInteger(module[key]))
        invalid('modulevolgorde moet een geheel getal zijn.');
  }
  if (value.scope === 'department' && !value.departmentId) invalid('afdelingsscope mist afdeling.');
  if (value.scope === 'project' && value.departmentId)
    invalid('projectscope bevat een afdelingskeuze.');
  if (!value.projectContextId && !value.organisationId && !value.departmentId)
    invalid('kies projectcontext, organisatie of afdeling.');
}
function assertScope(plan: ModulePlan, workspace: WorkspaceState): void {
  const context = workspace.projectContexts?.find((record) => record.id === plan.projectContextId);
  const organisation = workspace.organisations?.find((record) => record.id === plan.organisationId);
  const department = workspace.departments?.find((record) => record.id === plan.departmentId);
  if (plan.projectContextId && !context) invalid('projectcontext bestaat niet.');
  if (plan.organisationId && !organisation) invalid('organisatie bestaat niet.');
  if (plan.departmentId && !department) invalid('afdeling bestaat niet.');
  const actualOrganisation = departmentOrganisationId(department, workspace.sites ?? []);
  if (department && plan.organisationId !== actualOrganisation)
    invalid('afdeling en organisatie komen niet overeen.');
  if (context && plan.organisationId && !context.organisationIds.includes(plan.organisationId))
    invalid('organisatie hoort niet bij deze projectcontext.');
}
export function assertModulePlans(workspace: WorkspaceState): void {
  if (workspace.modulePlans === undefined) return;
  if (!Array.isArray(workspace.modulePlans)) invalid('collectie ontbreekt.');
  const planIds = new Set<string>();
  const questionIds = new Set(
    [...builtinQuestions, ...workspace.questions].map((question) => question.id),
  );
  const sourceIds = new Set([...builtinSources, ...workspace.sources].map((source) => source.id));
  for (const plan of workspace.modulePlans) {
    assertModulePlan(plan);
    assertScope(plan, workspace);
    if (planIds.has(plan.id)) invalid('dubbele plan-identiteit.');
    planIds.add(plan.id);
    for (const module of plan.modules)
      for (const questionId of module.questionIds)
        if (!questionIds.has(questionId)) invalid(`vraag ${questionId} bestaat niet.`);
    for (const sourceId of [
      ...plan.sourceIds,
      ...plan.modules.flatMap((module) => module.sourceIds),
    ])
      if (!sourceIds.has(sourceId)) invalid(`bron ${sourceId} bestaat niet.`);
  }
}
export function assertDossierModulePlanSnapshot(dossier: Dossier, workspace: WorkspaceState): void {
  if (dossier.modulePlanSnapshot === undefined) {
    if (dossier.modulePlanSnapshotSha256 !== undefined) invalid('planhash zonder snapshot.');
    return;
  }
  const plan = dossier.modulePlanSnapshot;
  assertModulePlan(plan);
  assertScope(plan, workspace);
  if (dossier.modulePlanSnapshotSha256 !== modulePlanHash(plan))
    invalid('bevroren moduleplanhash komt niet overeen.');
  if (plan.modules.some((module) => !module.enabled))
    invalid('dossiersnapshot bevat een niet-geselecteerde module.');
  if (
    plan.organisationId !== dossier.organisationId ||
    plan.projectContextId !== dossier.projectContextId ||
    JSON.stringify(plan.departmentId ? [plan.departmentId] : []) !==
      JSON.stringify(dossier.departmentIds)
  )
    invalid('dossierscope verschilt van haar bevroren moduleplan.');
  if (
    JSON.stringify(modulePlanQuestionIds(plan)) !==
    JSON.stringify(dossier.questions.map((question) => question.id))
  )
    invalid('dossiervragen verschillen van de bevroren modulekeuze.');
  const sources = new Set((dossier.sourceSnapshots ?? []).map((source) => source.id));
  for (const sourceId of [...plan.sourceIds, ...plan.modules.flatMap((module) => module.sourceIds)])
    if (!sources.has(sourceId)) invalid('bevroren modulebron ontbreekt in het dossier.');
}
export function createDossierFromModulePlan(
  plan: ModulePlan,
  questions: readonly Question[],
  workspace: WorkspaceState,
  fields: { id: string; title: string; scope: string; assessor: string; createdAt: string },
): Dossier {
  assertModulePlan(plan);
  assertScope(plan, workspace);
  for (const value of [fields.id, fields.title, fields.scope, fields.assessor]) text(value, true);
  if (
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(fields.createdAt) ||
    !Number.isFinite(Date.parse(fields.createdAt))
  )
    invalid('geldige aanmaaktijd vereist.');
  const questionIds = modulePlanQuestionIds(plan);
  if (!questionIds.length) invalid('selecteer minimaal één beschikbare vraag.');
  const selected = questionIds.map((id) => {
    const question = questions.find((question) => question.id === id);
    if (!question)
      invalid(`vraag ${id} is niet beschikbaar; het dossier wordt niet gedeeltelijk aangemaakt.`);
    return question;
  });
  const snapshot = copy({ ...plan, modules: plan.modules.filter((module) => module.enabled) });
  const usedIds = new Set([
    ...snapshot.sourceIds,
    ...snapshot.modules.flatMap((module) => module.sourceIds),
    ...selected.flatMap((question) => question.sourceIds),
  ]);
  const sources = [
    ...new Map(
      [...builtinSources, ...workspace.sources].map((source) => [source.id, source]),
    ).values(),
  ];
  const sourceSnapshots = copy(
    sources.filter((source) => usedIds.has(source.id)),
  ) as WorkspaceRecord[];
  if ([...usedIds].some((id) => !sourceSnapshots.some((source) => source.id === id)))
    invalid('een gekozen bron is niet beschikbaar.');
  const frozen = selected.map((question) => {
    const imported = workspace.questions.some((record) => record.id === question.id);
    const versions = sourceSnapshots
      .filter((source) => question.sourceIds.includes(source.id))
      .flatMap((source) => {
        const metadata = source.sourceMetadata;
        return metadata &&
          typeof metadata === 'object' &&
          !Array.isArray(metadata) &&
          typeof metadata.version === 'string'
          ? [metadata.version]
          : [];
      });
    return freezeQuestion(
      question,
      question.definition?.version ??
        (imported
          ? [...new Set(versions)].join(' + ') || 'bronversie-niet-vastgelegd'
          : 'IMA-catalogus-2.0.0'),
    );
  });
  const contentPackageSnapshots = captureQuestionPackages(questionIds, workspace);
  return {
    ...fields,
    ...(plan.organisationId ? { organisationId: plan.organisationId } : {}),
    ...(plan.projectContextId ? { projectContextId: plan.projectContextId } : {}),
    departmentIds: plan.departmentId ? [plan.departmentId] : [],
    status: 'active',
    questions: frozen,
    sourceSnapshots,
    ...(contentPackageSnapshots.length ? { contentPackageSnapshots } : {}),
    modulePlanSnapshot: snapshot,
    modulePlanSnapshotSha256: modulePlanHash(snapshot),
  };
}
export function modulePlanMarkdown(workspace: WorkspaceState): string[] {
  const lines: string[] = [];
  if (workspace.modulePlans?.length) lines.push('', '## Moduleplannen', '');
  for (const plan of workspace.modulePlans ?? []) {
    lines.push(
      `### ${plan.title} [${plan.id}]`,
      `Revisie ${plan.revision} | scope ${plan.scope} | projectcontext ${plan.projectContextId ?? 'Niet gekoppeld'} | organisatie ${plan.organisationId ?? 'Niet gekoppeld'} | afdeling ${plan.departmentId ?? 'Projectbreed'}`,
    );
    for (const module of plan.modules)
      lines.push(
        `${module.enabled ? 'Geselecteerd' : 'Uitgeschakeld'}: ${module.code} ${module.title} [${module.id}] | ${moduleOriginLabels[module.origin]}`,
        `Volgorde: ${module.sortOrder ?? 'Niet vastgelegd'} | definitievolgorde ${module.definitionSortOrder ?? 'Niet vastgelegd'} | vragen ${module.questionIds.join(', ')}`,
        `Scopenotities: ${module.scopeNotes || 'Niet vastgelegd'} | bronrecords ${module.sourceIds.join(', ')}`,
      );
    lines.push(`Bronrecords plan: ${plan.sourceIds.join(', ')}`, '');
  }
  for (const dossier of workspace.dossiers ?? []) {
    const plan = dossier.modulePlanSnapshot;
    if (!plan) continue;
    lines.push(
      '',
      `### Bevroren modulekeuze — ${dossier.title} [${dossier.id}]`,
      `Plan: ${plan.title} [${plan.id}] | revisie ${plan.revision} | hash ${dossier.modulePlanSnapshotSha256}`,
      `Scope: ${plan.scope} | projectcontext ${plan.projectContextId ?? 'Niet gekoppeld'} | organisatie ${plan.organisationId ?? 'Niet gekoppeld'} | afdeling ${plan.departmentId ?? 'Projectbreed'}`,
    );
    for (const module of plan.modules)
      lines.push(
        `${module.code} ${module.title} [${module.id}] | ${moduleOriginLabels[module.origin]}`,
        `Volgorde ${module.sortOrder ?? 'Niet vastgelegd'} | definitievolgorde ${module.definitionSortOrder ?? 'Niet vastgelegd'} | vragen ${module.questionIds.join(', ')}`,
        `Scopenotities: ${module.scopeNotes || 'Niet vastgelegd'} | bronrecords ${module.sourceIds.join(', ')}`,
      );
    lines.push(`Bronrecords plan: ${plan.sourceIds.join(', ')}`, '');
  }
  return lines;
}
