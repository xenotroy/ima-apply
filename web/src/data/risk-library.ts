import { sha256 } from '@noble/hashes/sha2.js';
import type { Scenario } from '../domain/types';
import { KINNEY_SCALES } from '../domain/risk.ts';
import type { WorkspaceState } from './model';
import { departmentOrganisationId } from './dossier.ts';

export type OrdinalRating = 1 | 2 | 3;
export type LibraryCostLevel = 'low' | 'medium' | 'high';
export type LibraryControlType = 'technical' | 'collective' | 'organisational' | 'ppe';
export type LibraryRelevance = 'unknown' | 'relevant' | 'not_relevant';
export interface LibraryNode {
  id: string;
  code: string;
  title: string;
  description: string;
  sortOrder: number;
  sourceIds: string[];
}
export interface LibraryModule extends LibraryNode {}
export interface LibraryHazard extends LibraryNode {
  moduleId?: string;
}
export interface LibraryRisk extends LibraryNode {
  hazardId: string;
  effectRating: OrdinalRating;
}
export interface LibraryFactor extends LibraryNode {
  riskId: string;
  lodDescription: string;
  defaultLikelihoodRating: OrdinalRating;
}
export interface LibraryControl extends LibraryNode {
  type: LibraryControlType;
}
export interface LibraryControlLink {
  id: string;
  factorId: string;
  controlId: string;
  reductionRating: OrdinalRating;
  costLevel: LibraryCostLevel;
  sortOrder: number;
  sourceIds: string[];
}
export interface LibraryQuestion {
  id: string;
  factorId: string;
  prompt: string;
  explanation: string;
  sortOrder: number;
  sourceIds: string[];
}
/** An immutable definition version. Old 1–3 ratings are explicitly local ordinal inputs. */
export interface RiskLibrary {
  id: string;
  libraryId: string;
  version: string;
  title: string;
  origin: 'native' | 'legacy_sqlite';
  sourceIds: string[];
  sourceSha256?: string;
  predecessorId?: string;
  modules: LibraryModule[];
  hazards: LibraryHazard[];
  risks: LibraryRisk[];
  factors: LibraryFactor[];
  controls: LibraryControl[];
  links: LibraryControlLink[];
  questions: LibraryQuestion[];
  sha256: string;
}
export type RiskLibraryDraft = Omit<RiskLibrary, 'sha256'>;
/** Original project/company/department scopes are preserved without inventing a dossier. */
export interface RiskLibraryScope {
  dossierId?: string;
  projectContextId?: string;
  organisationId?: string;
  departmentId?: string;
}
interface LibraryCapture {
  id: string;
  libraryId: string;
  librarySha256: string;
  scope: RiskLibraryScope;
  origin: 'native' | 'legacy_sqlite';
  assessor?: string;
  reviewedAt?: string;
  /** Exact old value, including an absent/unknown time zone; never migration time. */
  legacyUpdatedAt?: string;
  note: string;
  sourceIds: string[];
  supersedesId?: string;
  sha256: string;
}
export interface LibraryFactorReview extends LibraryCapture {
  kind: 'factor';
  factorId: string;
  relevance: LibraryRelevance;
  exposureRating: OrdinalRating;
  likelihoodRating: OrdinalRating;
}
export interface LibraryControlReview extends LibraryCapture {
  kind: 'control_link';
  linkId: string;
  reductionRating: OrdinalRating;
  costLevel: LibraryCostLevel;
  isInPlace: boolean;
}
export type RiskLibraryReview = LibraryFactorReview | LibraryControlReview;
export type RiskLibraryReviewDraft =
  | Omit<LibraryFactorReview, 'sha256' | 'libraryId' | 'librarySha256'>
  | Omit<LibraryControlReview, 'sha256' | 'libraryId' | 'librarySha256'>;
export type LibraryNodeType = 'hazard' | 'risk' | 'factor' | 'control_link';
export interface RiskLibraryLayout extends LibraryCapture {
  nodeType: LibraryNodeType;
  nodeId: string;
  x: number;
  y: number;
}
export type RiskLibraryLayoutDraft = Omit<
  RiskLibraryLayout,
  'sha256' | 'libraryId' | 'librarySha256'
>;
/** Structural extension permits use before/without mutating the shared workspace model. */
export type RiskLibraryWorkspaceState = WorkspaceState & {
  riskLibraries?: RiskLibrary[];
  riskLibraryReviews?: RiskLibraryReview[];
  riskLibraryLayouts?: RiskLibraryLayout[];
};
export const libraryControlLabels: Record<LibraryControlType, string> = {
  technical: 'Technisch',
  collective: 'Collectief',
  organisational: 'Organisatorisch',
  ppe: 'PBM',
};
export const libraryRelevanceLabels: Record<LibraryRelevance, string> = {
  unknown: 'Onbekend',
  relevant: 'Relevant',
  not_relevant: 'Niet relevant',
};
export const libraryCostLabels: Record<LibraryCostLevel, string> = {
  low: 'Laag',
  medium: 'Midden',
  high: 'Hoog',
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** Object key order is irrelevant; array order remains part of the definition. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function digest(value: unknown): string {
  return Array.from(sha256(new TextEncoder().encode(canonical(value))))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function withoutHash<T extends { sha256?: string }>(record: T): Omit<T, 'sha256'> {
  const { sha256: _hash, ...content } = record;
  return content;
}
export function riskLibraryHash(library: RiskLibrary | RiskLibraryDraft): string {
  return digest(withoutHash(library as RiskLibrary));
}
export function riskLibraryCaptureHash(record: RiskLibraryReview | RiskLibraryLayout): string {
  return digest(withoutHash(record));
}
export function sealRiskLibrary(draft: RiskLibraryDraft): RiskLibrary {
  const library = { ...clone(draft), sha256: riskLibraryHash(draft) };
  assertRiskLibrary(library);
  return library;
}
function invalid(message: string): never {
  throw new Error(`Risicobibliotheek: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('object verwacht.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid('onbekend veld.');
}
function text(value: unknown, required = false): asserts value is string {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > 100_000)
    invalid('ongeldige of ontbrekende tekst.');
}
function id(value: unknown): asserts value is string {
  text(value, true);
  if (value.length > 160) invalid('identiteit is te lang.');
}
function ids(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length > 5000) invalid('bronidentiteiten ontbreken.');
  value.forEach(id);
  if (new Set(value).size !== value.length) invalid('dubbele bronidentiteit.');
}
function integer(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value)) invalid('geheel getal verwacht.');
}
function rating(value: unknown): asserts value is OrdinalRating {
  if (![1, 2, 3].includes(Number(value)) || typeof value !== 'number')
    invalid('lokale ordinale rating moet 1, 2 of 3 zijn.');
}
function enumValue(value: unknown, allowed: readonly string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid('onbekende keuzewaarde.');
}
function hash(value: unknown): void {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    invalid('SHA256 ontbreekt of is ongeldig.');
}
function semver(value: unknown): number[] {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
    invalid('versie moet major.minor.patch zijn.');
  const numbers = value.split('.').map(Number);
  if (numbers.some((part) => !Number.isSafeInteger(part))) invalid('versie is te groot.');
  return numbers;
}
function newer(after: string, before: string): boolean {
  const a = semver(after),
    b = semver(before);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
const nodeKeys = ['id', 'code', 'title', 'description', 'sortOrder', 'sourceIds'];
function node(value: Record<string, unknown>): void {
  id(value.id);
  text(value.code);
  text(value.title, true);
  text(value.description);
  integer(value.sortOrder);
  ids(value.sourceIds);
}
function list(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 5000)
    invalid('nodecollectie ontbreekt of is te groot.');
  const rows = value.map(object);
  const seen = new Set<string>();
  for (const row of rows) {
    id(row.id);
    if (seen.has(row.id)) invalid('dubbele node-identiteit.');
    seen.add(row.id);
  }
  return rows;
}
/** Shape checking precedes relational access, including on arbitrary imported JSON. */
export function assertRiskLibrary(raw: unknown): asserts raw is RiskLibrary {
  const value = object(raw);
  keys(value, [
    'id',
    'libraryId',
    'version',
    'title',
    'origin',
    'sourceIds',
    'sourceSha256',
    'predecessorId',
    'modules',
    'hazards',
    'risks',
    'factors',
    'controls',
    'links',
    'questions',
    'sha256',
  ]);
  id(value.id);
  id(value.libraryId);
  semver(value.version);
  text(value.title, true);
  enumValue(value.origin, ['native', 'legacy_sqlite']);
  ids(value.sourceIds);
  hash(value.sha256);
  if (value.sourceSha256 !== undefined) hash(value.sourceSha256);
  if (
    value.origin === 'legacy_sqlite' &&
    (!value.sourceSha256 || !(value.sourceIds as string[]).length)
  )
    invalid('oorspronkelijke SQLite-bibliotheek mist de databasehash of bronrijen.');
  if (value.predecessorId !== undefined) id(value.predecessorId);
  const modules = list(value.modules),
    hazards = list(value.hazards),
    risks = list(value.risks),
    factors = list(value.factors),
    controls = list(value.controls),
    links = list(value.links),
    questions = list(value.questions);
  for (const item of modules) {
    keys(item, nodeKeys);
    node(item);
  }
  for (const item of hazards) {
    keys(item, [...nodeKeys, 'moduleId']);
    node(item);
    if (item.moduleId !== undefined) id(item.moduleId);
  }
  for (const item of risks) {
    keys(item, [...nodeKeys, 'hazardId', 'effectRating']);
    node(item);
    id(item.hazardId);
    rating(item.effectRating);
  }
  for (const item of factors) {
    keys(item, [...nodeKeys, 'riskId', 'lodDescription', 'defaultLikelihoodRating']);
    node(item);
    id(item.riskId);
    text(item.lodDescription);
    rating(item.defaultLikelihoodRating);
  }
  for (const item of controls) {
    keys(item, [...nodeKeys, 'type']);
    node(item);
    enumValue(item.type, Object.keys(libraryControlLabels));
  }
  for (const item of links) {
    keys(item, [
      'id',
      'factorId',
      'controlId',
      'reductionRating',
      'costLevel',
      'sortOrder',
      'sourceIds',
    ]);
    id(item.factorId);
    id(item.controlId);
    rating(item.reductionRating);
    enumValue(item.costLevel, Object.keys(libraryCostLabels));
    integer(item.sortOrder);
    ids(item.sourceIds);
  }
  for (const item of questions) {
    keys(item, ['id', 'factorId', 'prompt', 'explanation', 'sortOrder', 'sourceIds']);
    id(item.factorId);
    text(item.prompt, true);
    text(item.explanation);
    integer(item.sortOrder);
    ids(item.sourceIds);
  }
  const contains = (rows: Record<string, unknown>[], key: unknown) =>
    rows.some((row) => row.id === key);
  if (
    hazards.some((row) => row.moduleId && !contains(modules, row.moduleId)) ||
    risks.some((row) => !contains(hazards, row.hazardId)) ||
    factors.some((row) => !contains(risks, row.riskId)) ||
    links.some((row) => !contains(factors, row.factorId) || !contains(controls, row.controlId)) ||
    questions.some((row) => !contains(factors, row.factorId))
  )
    invalid('gevaar/risico/factor/maatregel/vraagrelatie ontbreekt.');
  const pairs = links.map((row) => canonical([row.factorId, row.controlId]));
  if (new Set(pairs).size !== pairs.length)
    invalid('dezelfde factor–maatregelkoppeling komt dubbel voor.');
  if (
    value.origin === 'legacy_sqlite' &&
    [modules, hazards, risks, factors, controls, links, questions].some((rows) =>
      rows.some((row) => !(row.sourceIds as string[]).length),
    )
  )
    invalid('oorspronkelijke SQLite-node mist haar eigen bronrij.');
  if (riskLibraryHash(raw as RiskLibrary) !== value.sha256)
    invalid('bibliotheekinhoud wijkt af van de bevroren hash.');
}
export function riskLibraryScopeKey(scope: RiskLibraryScope): string {
  return canonical({
    dossierId: scope.dossierId ?? null,
    projectContextId: scope.projectContextId ?? null,
    organisationId: scope.organisationId ?? null,
    departmentId: scope.departmentId ?? null,
  });
}
function assertScope(
  raw: unknown,
  workspace?: RiskLibraryWorkspaceState,
): asserts raw is RiskLibraryScope {
  const scope = object(raw);
  keys(scope, ['dossierId', 'projectContextId', 'organisationId', 'departmentId']);
  for (const key of Object.keys(scope)) id(scope[key]);
  if (!Object.keys(scope).length) invalid('scope ontbreekt.');
  if (!workspace) return;
  const dossier = workspace.dossiers?.find((item) => item.id === scope.dossierId);
  const context = workspace.projectContexts?.find((item) => item.id === scope.projectContextId);
  const organisation = workspace.organisations?.find((item) => item.id === scope.organisationId);
  const department = workspace.departments?.find((item) => item.id === scope.departmentId);
  if (
    (scope.dossierId && !dossier) ||
    (scope.projectContextId && !context) ||
    (scope.organisationId && !organisation) ||
    (scope.departmentId && !department)
  )
    invalid('scope verwijst naar ontbrekend dossier/project/organisatie/afdeling.');
  if (
    department &&
    scope.organisationId !== departmentOrganisationId(department, workspace.sites ?? [])
  )
    invalid('afdeling en organisatie komen niet overeen.');
  if (
    context &&
    scope.organisationId &&
    !context.organisationIds.includes(String(scope.organisationId))
  )
    invalid('organisatie behoort niet tot deze projectcontext.');
  if (
    dossier &&
    ((scope.projectContextId && dossier.projectContextId !== scope.projectContextId) ||
      (scope.organisationId && dossier.organisationId !== scope.organisationId) ||
      (scope.departmentId && !dossier.departmentIds.includes(String(scope.departmentId))))
  )
    invalid('scope valt buiten het gekozen dossier.');
}
const captureKeys = [
  'id',
  'libraryId',
  'librarySha256',
  'scope',
  'origin',
  'assessor',
  'reviewedAt',
  'legacyUpdatedAt',
  'note',
  'sourceIds',
  'supersedesId',
  'sha256',
];
function assertCapture(
  value: Record<string, unknown>,
  workspace?: RiskLibraryWorkspaceState,
): void {
  id(value.id);
  id(value.libraryId);
  hash(value.librarySha256);
  assertScope(value.scope, workspace);
  enumValue(value.origin, ['native', 'legacy_sqlite']);
  text(value.note);
  ids(value.sourceIds);
  hash(value.sha256);
  if (value.supersedesId !== undefined) id(value.supersedesId);
  if (value.origin === 'native') {
    if (!(value.scope as RiskLibraryScope).dossierId)
      invalid('nieuwe lokale beoordeling/positie vraagt een dossier.');
    text(value.assessor, true);
    text(value.note, true);
    text(value.reviewedAt, true);
    if (
      !/(Z|[+-]\d{2}:\d{2})$/.test(value.reviewedAt) ||
      !Number.isFinite(Date.parse(value.reviewedAt))
    )
      invalid('nieuw tijdstip vraagt een expliciete tijdzone.');
    if (value.legacyUpdatedAt !== undefined)
      invalid('nieuwe beoordeling draagt geen verzonnen legacytijd.');
  } else {
    text(value.legacyUpdatedAt);
    if (!value.sourceIds.length)
      invalid('legacybeoordeling/positie mist de oorspronkelijke bronrij.');
    if (value.assessor !== undefined || value.reviewedAt !== undefined)
      invalid('legacy auteur/tijd worden niet uit migratie afgeleid.');
  }
  if (riskLibraryCaptureHash(value as unknown as RiskLibraryReview) !== value.sha256)
    invalid('lokale vastlegging wijkt af van haar hash.');
}
export function assertRiskLibraryReview(
  raw: unknown,
  workspace?: RiskLibraryWorkspaceState,
): asserts raw is RiskLibraryReview {
  const value = object(raw);
  if (value.kind === 'factor') {
    keys(value, [
      ...captureKeys,
      'kind',
      'factorId',
      'relevance',
      'exposureRating',
      'likelihoodRating',
    ]);
    id(value.factorId);
    enumValue(value.relevance, Object.keys(libraryRelevanceLabels));
    rating(value.exposureRating);
    rating(value.likelihoodRating);
  } else if (value.kind === 'control_link') {
    keys(value, [...captureKeys, 'kind', 'linkId', 'reductionRating', 'costLevel', 'isInPlace']);
    id(value.linkId);
    rating(value.reductionRating);
    enumValue(value.costLevel, Object.keys(libraryCostLabels));
    if (typeof value.isInPlace !== 'boolean') invalid('aanwezigheidsstatus ontbreekt.');
  } else invalid('onbekende lokale beoordeling.');
  assertCapture(value, workspace);
}
export function assertRiskLibraryLayout(
  raw: unknown,
  workspace?: RiskLibraryWorkspaceState,
): asserts raw is RiskLibraryLayout {
  const value = object(raw);
  keys(value, [...captureKeys, 'nodeType', 'nodeId', 'x', 'y']);
  enumValue(value.nodeType, ['hazard', 'risk', 'factor', 'control_link']);
  id(value.nodeId);
  for (const key of ['x', 'y'])
    if (
      typeof value[key] !== 'number' ||
      !Number.isFinite(value[key]) ||
      Number(value[key]) < 0 ||
      Number(value[key]) > 1_000_000
    )
      invalid('kaartpositie moet eindig en niet-negatief zijn, maximaal 1.000.000.');
  assertCapture(value, workspace);
}
export function captureRiskLibraryReview(
  library: RiskLibrary,
  draft: Extract<RiskLibraryReviewDraft, { kind: 'factor' }>,
): LibraryFactorReview;
export function captureRiskLibraryReview(
  library: RiskLibrary,
  draft: Extract<RiskLibraryReviewDraft, { kind: 'control_link' }>,
): LibraryControlReview;
export function captureRiskLibraryReview(
  library: RiskLibrary,
  draft: RiskLibraryReviewDraft,
): RiskLibraryReview;
export function captureRiskLibraryReview(
  library: RiskLibrary,
  draft: RiskLibraryReviewDraft,
): RiskLibraryReview {
  assertRiskLibrary(library);
  const record = {
    ...clone(draft),
    libraryId: library.id,
    librarySha256: library.sha256,
    sha256: '',
  } as RiskLibraryReview;
  record.sha256 = riskLibraryCaptureHash(record);
  assertRiskLibraryReview(record);
  const target =
    record.kind === 'factor'
      ? library.factors.some((item) => item.id === record.factorId)
      : library.links.some((item) => item.id === record.linkId);
  if (!target) invalid('beoordeling verwijst naar ontbrekende factor/koppeling.');
  return record;
}
export function captureRiskLibraryLayout(
  library: RiskLibrary,
  draft: RiskLibraryLayoutDraft,
): RiskLibraryLayout {
  assertRiskLibrary(library);
  const record = {
    ...clone(draft),
    libraryId: library.id,
    librarySha256: library.sha256,
    sha256: '',
  };
  record.sha256 = riskLibraryCaptureHash(record);
  assertRiskLibraryLayout(record);
  if (!nodeList(library, record.nodeType).some((item) => item.id === record.nodeId))
    invalid('kaartpositie verwijst naar ontbrekende node.');
  return record;
}
export function nodeList(library: RiskLibrary, type: LibraryNodeType): readonly { id: string }[] {
  return type === 'hazard'
    ? library.hazards
    : type === 'risk'
      ? library.risks
      : type === 'factor'
        ? library.factors
        : library.links;
}
function captureGroupKey(record: RiskLibraryReview | RiskLibraryLayout): string {
  const target =
    'nodeType' in record
      ? [record.nodeType, record.nodeId]
      : record.kind === 'factor'
        ? ['factor', record.factorId]
        : ['control_link', record.linkId];
  return canonical([
    record.libraryId,
    record.librarySha256,
    riskLibraryScopeKey(record.scope),
    ...target,
  ]);
}
/** A saved successor, rather than array order, determines the active capture. */
function latestCapture<T extends RiskLibraryReview | RiskLibraryLayout>(
  records: readonly T[],
): T | undefined {
  const active = records.filter(
    (record) => !records.some((candidate) => candidate.supersedesId === record.id),
  );
  if (records.length && active.length !== 1)
    invalid('tegenstrijdige of cyclische actuele review/positiegeschiedenissen.');
  return active[0];
}
export function assertRiskLibraryCollections(workspace: RiskLibraryWorkspaceState): void {
  const libraries = workspace.riskLibraries ?? [],
    reviews = workspace.riskLibraryReviews ?? [],
    layouts = workspace.riskLibraryLayouts ?? [];
  for (const records of [libraries, reviews, layouts])
    if (!Array.isArray(records)) invalid('collectie ontbreekt.');
  libraries.forEach(assertRiskLibrary);
  reviews.forEach((record) => assertRiskLibraryReview(record, workspace));
  layouts.forEach((record) => assertRiskLibraryLayout(record, workspace));
  const sourceIds = new Set(workspace.sources.map((source) => source.id));
  const checkSources = (ids: string[]) => {
    if (ids.some((source) => !sourceIds.has(source)))
      invalid('bronverwijzing bestaat niet in deze werkruimte.');
  };
  const libraryIds = new Set<string>(),
    versions = new Set<string>();
  for (const library of libraries) {
    assertRiskLibrary(library);
    const versionKey = canonical([library.libraryId, library.version]);
    if (libraryIds.has(library.id) || versions.has(versionKey))
      invalid('dubbele bibliotheek-ID of identiteit/versie.');
    libraryIds.add(library.id);
    versions.add(versionKey);
    checkSources(library.sourceIds);
    for (const rows of [
      library.modules,
      library.hazards,
      library.risks,
      library.factors,
      library.controls,
      library.links,
      library.questions,
    ])
      rows.forEach((row) => checkSources(row.sourceIds));
    if (library.predecessorId) {
      const before = libraries.find((item) => item.id === library.predecessorId);
      if (
        !before ||
        before.libraryId !== library.libraryId ||
        !newer(library.version, before.version)
      )
        invalid('voorganger ontbreekt of bibliotheekversie loopt niet op.');
    }
  }
  const validateCaptures = (
    records: readonly (RiskLibraryReview | RiskLibraryLayout)[],
    layout: boolean,
  ) => {
    const seen = new Set<string>();
    const groups = new Map<string, (RiskLibraryReview | RiskLibraryLayout)[]>();
    for (const record of records) {
      if (layout) assertRiskLibraryLayout(record, workspace);
      else assertRiskLibraryReview(record, workspace);
      if (seen.has(record.id)) invalid('dubbele lokale vastlegging.');
      seen.add(record.id);
      checkSources(record.sourceIds);
      const library = libraries.find((item) => item.id === record.libraryId);
      if (!library || library.sha256 !== record.librarySha256)
        invalid('lokale vastlegging verwijst naar ontbrekende/gewijzigde bibliotheekversie.');
      const targetKey = layout
        ? `${(record as RiskLibraryLayout).nodeType}:${(record as RiskLibraryLayout).nodeId}`
        : (record as RiskLibraryReview).kind === 'factor'
          ? `factor:${(record as LibraryFactorReview).factorId}`
          : `control_link:${(record as LibraryControlReview).linkId}`;
      const type = targetKey.slice(0, targetKey.indexOf(':')) as LibraryNodeType,
        target = targetKey.slice(targetKey.indexOf(':') + 1);
      if (!nodeList(library, type).some((item) => item.id === target))
        invalid('lokale vastlegging verwijst naar ontbrekende node.');
      if (record.supersedesId) {
        const before = records.find((item) => item.id === record.supersedesId);
        const beforeTarget =
          before &&
          (layout
            ? `${(before as RiskLibraryLayout).nodeType}:${(before as RiskLibraryLayout).nodeId}`
            : (before as RiskLibraryReview).kind === 'factor'
              ? `factor:${(before as LibraryFactorReview).factorId}`
              : `control_link:${(before as LibraryControlReview).linkId}`);
        if (
          !before ||
          before.id === record.id ||
          before.libraryId !== record.libraryId ||
          riskLibraryScopeKey(before.scope) !== riskLibraryScopeKey(record.scope) ||
          beforeTarget !== targetKey ||
          (before.reviewedAt &&
            record.reviewedAt &&
            Date.parse(before.reviewedAt) > Date.parse(record.reviewedAt))
        )
          invalid(
            'review/positievoorganger hoort niet bij dezelfde versie, scope, node of tijdvolgorde.',
          );
        const chain = new Set([record.id]);
        let current: RiskLibraryReview | RiskLibraryLayout | undefined = before;
        while (current) {
          if (chain.has(current.id)) invalid('cyclische review/positiegeschiedenis.');
          chain.add(current.id);
          const predecessor: string | undefined = current.supersedesId;
          current = records.find((item) => item.id === predecessor);
        }
      }
      const groupKey = captureGroupKey(record);
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), record]);
    }
    for (const group of groups.values()) latestCapture(group);
  };
  validateCaptures(reviews, false);
  validateCaptures(layouts, true);
}
/** Call on save against the latest workspace; definitions and captures are append-only. */
export function assertRiskLibraryUpdate(
  before: RiskLibraryWorkspaceState,
  after: RiskLibraryWorkspaceState,
): void {
  assertRiskLibraryCollections(after);
  for (const key of ['riskLibraries', 'riskLibraryReviews', 'riskLibraryLayouts'] as const)
    for (const previous of before[key] ?? []) {
      const current = (after[key] ?? []).find((item) => item.id === previous.id);
      if (!current || canonical(current) !== canonical(previous))
        invalid(
          'bestaande definitieversie/beoordeling/positie mag niet worden herschreven of verwijderd.',
        );
    }
}
export function latestLibraryReview(
  reviews: readonly RiskLibraryReview[],
  library: RiskLibrary,
  scope: RiskLibraryScope,
  kind: 'factor',
  targetId: string,
): LibraryFactorReview | undefined;
export function latestLibraryReview(
  reviews: readonly RiskLibraryReview[],
  library: RiskLibrary,
  scope: RiskLibraryScope,
  kind: 'control_link',
  targetId: string,
): LibraryControlReview | undefined;
export function latestLibraryReview(
  reviews: readonly RiskLibraryReview[],
  library: RiskLibrary,
  scope: RiskLibraryScope,
  kind: RiskLibraryReview['kind'],
  targetId: string,
): RiskLibraryReview | undefined {
  return latestCapture(
    reviews.filter(
      (item) =>
        item.libraryId === library.id &&
        item.librarySha256 === library.sha256 &&
        riskLibraryScopeKey(item.scope) === riskLibraryScopeKey(scope) &&
        item.kind === kind &&
        (item.kind === 'factor' ? item.factorId : item.linkId) === targetId,
    ),
  );
}
export function latestLibraryLayout(
  layouts: readonly RiskLibraryLayout[],
  library: RiskLibrary,
  scope: RiskLibraryScope,
  nodeType: LibraryNodeType,
  nodeId: string,
): RiskLibraryLayout | undefined {
  return latestCapture(
    layouts.filter(
      (item) =>
        item.libraryId === library.id &&
        item.librarySha256 === library.sha256 &&
        riskLibraryScopeKey(item.scope) === riskLibraryScopeKey(scope) &&
        item.nodeType === nodeType &&
        item.nodeId === nodeId,
    ),
  );
}
export function ordinalScreening(
  library: RiskLibrary,
  factorId: string,
  review?: LibraryFactorReview,
) {
  const factor = library.factors.find((item) => item.id === factorId);
  const risk = factor && library.risks.find((item) => item.id === factor.riskId);
  if (!factor || !risk) invalid('screeningfactor ontbreekt.');
  if (
    review &&
    (review.libraryId !== library.id ||
      review.librarySha256 !== library.sha256 ||
      review.factorId !== factorId)
  )
    invalid('screeningreview hoort bij een andere factor of versie.');
  const score =
    risk.effectRating *
    (review?.exposureRating ?? 1) *
    (review?.likelihoodRating ?? factor.defaultLikelihoodRating);
  return {
    score,
    label: score <= 4 ? 'Laag' : score <= 9 ? 'Midden' : score <= 17 ? 'Hoog' : 'Zeer hoog',
    reviewed: Boolean(review),
    relevance: review?.relevance ?? 'unknown',
  };
}
export function rankLibraryControls(
  library: RiskLibrary,
  factorId: string,
  scope: RiskLibraryScope,
  reviews: readonly RiskLibraryReview[],
) {
  const screening = ordinalScreening(
    library,
    factorId,
    latestLibraryReview(reviews, library, scope, 'factor', factorId),
  );
  let organisationalRank = 0;
  return library.links
    .filter((link) => link.factorId === factorId)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        (library.controls.find((item) => item.id === a.controlId)?.code ?? '').localeCompare(
          library.controls.find((item) => item.id === b.controlId)?.code ?? '',
        ),
    )
    .map((link) => {
      const control = library.controls.find((item) => item.id === link.controlId)!;
      const review = latestLibraryReview(reviews, library, scope, 'control_link', link.id);
      const reductionRating = review?.reductionRating ?? link.reductionRating,
        costLevel = review?.costLevel ?? link.costLevel;
      const typeWeight =
        control.type === 'technical' || control.type === 'collective'
          ? 1
          : control.type === 'organisational'
            ? 0.5
            : 0.4;
      const costWeight = costLevel === 'low' ? 1.5 : costLevel === 'high' ? 0.5 : 1;
      if (control.type === 'organisational') organisationalRank++;
      const diminishingWeight =
        control.type !== 'organisational' || organisationalRank === 1
          ? 1
          : organisationalRank === 2
            ? 0.6
            : organisationalRank === 3
              ? 0.35
              : 0.2;
      return {
        link,
        control,
        review,
        reductionRating,
        costLevel,
        typeWeight,
        costWeight,
        diminishingWeight,
        rankScore:
          Math.round(
            screening.score * reductionRating * typeWeight * costWeight * diminishingWeight * 100,
          ) / 100,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore || a.link.sortOrder - b.link.sortOrder);
}
export interface LibraryScenarioInput {
  id: string;
  title: string;
  consequence: string;
  probability: number;
  exposure: number;
  effect: number;
  assessmentNotes: string;
  scope: RiskLibraryScope;
  department: string;
}
/** Human re-assessment is mandatory; ordinal inputs, controls and PFDs are never converted. */
export function createLibraryScenario(
  library: RiskLibrary,
  factorId: string,
  input: LibraryScenarioInput,
): Scenario {
  assertRiskLibrary(library);
  const factor = library.factors.find((item) => item.id === factorId),
    risk = factor && library.risks.find((item) => item.id === factor.riskId),
    hazard = risk && library.hazards.find((item) => item.id === risk.hazardId);
  if (!factor || !risk || !hazard) invalid('scenariofactor ontbreekt.');
  id(input.id);
  text(input.title, true);
  text(input.consequence, true);
  text(input.assessmentNotes, true);
  text(input.department);
  assertScope(input.scope);
  if (!input.scope.dossierId) invalid('nieuw scenario vraagt de expliciete dossierscope.');
  for (const key of ['probability', 'exposure', 'effect'] as const)
    if (!KINNEY_SCALES[key].some((option) => option.value === input[key]))
      invalid('kies nieuwe menselijke Kinney-factoren uit de vastgelegde schaal.');
  return {
    id: input.id,
    title: input.title.trim(),
    description: `${factor.description}\nRisicobibliotheek ${library.libraryId} @${library.version}, versie-ID ${library.id}, SHA256 ${library.sha256}; factor ${factor.id}.`,
    department: input.department,
    hazard: hazard.title,
    consequence: input.consequence.trim(),
    probability: input.probability,
    exposure: input.exposure,
    effect: input.effect,
    controls: [],
    sourceIds: [
      ...new Set([
        ...library.sourceIds,
        ...hazard.sourceIds,
        ...risk.sourceIds,
        ...factor.sourceIds,
      ]),
    ],
    assessmentNotes: input.assessmentNotes.trim(),
    dossierId: input.scope.dossierId,
    ...(input.scope.departmentId ? { departmentId: input.scope.departmentId } : {}),
  };
}
export function riskLibraryMarkdown(workspace: RiskLibraryWorkspaceState): string[] {
  const libraries = workspace.riskLibraries ?? [],
    lines: string[] = [];
  if (!libraries.length) return lines;
  lines.push(
    '',
    '## Herbruikbare risicobibliotheken',
    '',
    'Lokale 1–3-screening en oorspronkelijke kosten/typegewichten zijn ordinale prioritering. Aanwezigheid is geen bewijs van effectiviteit; reductierating is geen percentage, PFD of AHS-credit.',
    '',
  );
  for (const library of libraries) {
    lines.push(
      `### ${library.title} @${library.version}`,
      `Identiteit ${library.libraryId} | versie-ID ${library.id} | ${library.origin} | SHA256 ${library.sha256}`,
      `Bronbestand-SHA256 ${library.sourceSha256 ?? 'Niet vastgelegd'} | voorganger ${library.predecessorId ?? 'Geen'}`,
      `Bronnen: ${library.sourceIds.join(', ') || 'Lokale definitie; geen externe bron vastgelegd'}`,
    );
    for (const hazard of library.hazards) {
      const module = library.modules.find((item) => item.id === hazard.moduleId);
      lines.push(
        `Gevaar ${hazard.code}: ${hazard.title} [${hazard.id}], module ${module ? `${module.code} ${module.title} [${module.id}]` : 'Niet vastgelegd'}, volgorde ${hazard.sortOrder}`,
        hazard.description,
      );
      for (const risk of library.risks.filter((item) => item.hazardId === hazard.id)) {
        lines.push(
          `Risico ${risk.code}: ${risk.title} [${risk.id}], lokale effectrating ${risk.effectRating}, volgorde ${risk.sortOrder}`,
          risk.description,
        );
        for (const factor of library.factors.filter((item) => item.riskId === risk.id)) {
          lines.push(
            `Factor ${factor.code}: ${factor.title} [${factor.id}], lokale standaardwaarschijnlijkheid ${factor.defaultLikelihoodRating}, volgorde ${factor.sortOrder}`,
            factor.description,
            `LOD: ${factor.lodDescription || 'Niet vastgelegd'}`,
          );
          for (const question of library.questions.filter((item) => item.factorId === factor.id))
            lines.push(
              `Beoordelingsvraag [${question.id}]: ${question.prompt}`,
              `Toelichting: ${question.explanation || 'Niet vastgelegd'}`,
            );
          for (const link of library.links.filter((item) => item.factorId === factor.id)) {
            const control = library.controls.find((item) => item.id === link.controlId)!;
            lines.push(
              `Maatregelkoppeling [${link.id}] → gedeelde maatregel ${control.code}: ${control.title} [${control.id}], ${libraryControlLabels[control.type]}, lokale reductierating ${link.reductionRating}, kosten ${libraryCostLabels[link.costLevel]}, volgorde ${link.sortOrder}`,
              control.description,
            );
          }
        }
      }
    }
    for (const review of workspace.riskLibraryReviews?.filter(
      (item) => item.libraryId === library.id,
    ) ?? [])
      lines.push(
        `Lokale ${review.kind}-review [${review.id}] | scope ${riskLibraryScopeKey(review.scope)}`,
        review.kind === 'factor'
          ? `Factor ${review.factorId}: ${libraryRelevanceLabels[review.relevance]}, B ${review.exposureRating}, W ${review.likelihoodRating}`
          : `Koppeling ${review.linkId}: reductierating ${review.reductionRating}, kosten ${libraryCostLabels[review.costLevel]}, aanwezig ${review.isInPlace ? 'Ja' : 'Nee'}`,
        `Beoordelaar ${review.assessor ?? 'Onbekend in oorspronkelijke bron'} | tijd ${review.reviewedAt ?? `oorspronkelijke waarde ${review.legacyUpdatedAt || 'onbekend'}; tijdzone niet afgeleid`} | ${review.note}`,
        `Review-SHA256 ${review.sha256} | bibliotheek-SHA256 ${review.librarySha256} | voorganger ${review.supersedesId ?? 'Geen'} | bronnen ${review.sourceIds.join(', ') || 'Lokale vastlegging'}`,
      );
    for (const layout of workspace.riskLibraryLayouts?.filter(
      (item) => item.libraryId === library.id,
    ) ?? [])
      lines.push(
        `Kaartpositie [${layout.id}]: ${layout.nodeType} ${layout.nodeId}, x=${layout.x}, y=${layout.y} | scope ${riskLibraryScopeKey(layout.scope)} | ${layout.note} | vastlegger ${layout.assessor ?? 'Onbekend'} | ${layout.reviewedAt ?? layout.legacyUpdatedAt ?? 'Tijd onbekend'} | SHA256 ${layout.sha256}`,
      );
    lines.push('');
  }
  return lines;
}

export type LegacyRiskLibraryRow = Record<string, unknown>;
export interface LegacyRiskLibraryProjectionOptions {
  id: string;
  libraryId: string;
  title: string;
  sourceSha256: string;
  version?: string;
  /** Return stable namespaced table + primary-key identities, never title joins. */
  targetIdFor: (table: string, row: LegacyRiskLibraryRow) => string;
  sourceIdFor: (table: string, row: LegacyRiskLibraryRow) => string;
  /** Resolve only explicit original FKs. Unresolved/ambiguous scopes return undefined. */
  scopeFor: (row: LegacyRiskLibraryRow) => RiskLibraryScope | undefined;
  warning: (code: string, table: string, row: LegacyRiskLibraryRow, message: string) => void;
}
/** Standalone projection; callers retain every original row raw before invoking this helper. */
export function projectLegacyRiskLibrary(
  tables: Record<string, LegacyRiskLibraryRow[] | undefined>,
  options: LegacyRiskLibraryProjectionOptions,
): { library?: RiskLibrary; reviews: RiskLibraryReview[]; layouts: RiskLibraryLayout[] } {
  const string = (value: unknown) => (typeof value === 'string' ? value : '');
  const rowKey = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === 'string' && value.trim()
        ? value
        : undefined;
  const validRating = (value: unknown) => typeof value === 'number' && [1, 2, 3].includes(value);
  const cost = (value: unknown) =>
    [0, 1, 2].includes(Number(value)) && typeof value === 'number'
      ? (['low', 'medium', 'high'] as const)[Number(value)]
      : undefined;
  const controlType = (value: unknown) =>
    [0, 1, 2, 3].includes(Number(value)) && typeof value === 'number'
      ? (['technical', 'collective', 'organisational', 'ppe'] as const)[Number(value)]
      : undefined;
  const relevance = (value: unknown) =>
    [0, 1, 2].includes(Number(value)) && typeof value === 'number'
      ? (['unknown', 'relevant', 'not_relevant'] as const)[Number(value)]
      : undefined;
  const maps = new Map<string, Map<string, string>>();
  const warn = (table: string, row: LegacyRiskLibraryRow, message: string) =>
    options.warning('risk_library_raw_only', table, row, message);
  const order = (row: LegacyRiskLibraryRow) =>
    Number.isSafeInteger(row.SortOrder) ? Number(row.SortOrder) : undefined;
  const register = (table: string, row: LegacyRiskLibraryRow): string | undefined => {
    const key = rowKey(row.Id);
    if (!key) {
      warn(table, row, 'Bibliotheekrij zonder expliciete primaire identiteit blijft raw.');
      return undefined;
    }
    const map = maps.get(table) ?? new Map<string, string>();
    maps.set(table, map);
    if (map.has(key)) {
      warn(table, row, 'Dubbele oorspronkelijke primaire identiteit blijft raw.');
      return undefined;
    }
    const target = options.targetIdFor(table, row);
    map.set(key, target);
    return target;
  };
  const lookup = (table: string, key: unknown) => maps.get(table)?.get(rowKey(key) ?? '');
  const base = (table: string, row: LegacyRiskLibraryRow): LibraryNode | undefined => {
    if (!string(row.Titel).trim() || order(row) === undefined) {
      warn(table, row, 'Bibliotheeknode mist titel of exacte volgorde; raw behouden.');
      return undefined;
    }
    const target = register(table, row);
    if (!target) return undefined;
    return {
      id: target,
      code: string(row.Code),
      title: string(row.Titel),
      description: string(row.Omschrijving),
      sortOrder: order(row)!,
      sourceIds: [options.sourceIdFor(table, row)],
    };
  };
  const modules: LibraryModule[] = [],
    hazards: LibraryHazard[] = [],
    risks: LibraryRisk[] = [],
    factors: LibraryFactor[] = [],
    controls: LibraryControl[] = [],
    links: LibraryControlLink[] = [],
    questions: LibraryQuestion[] = [];
  for (const row of tables.Modules ?? []) {
    const node = base('Modules', row);
    if (node) modules.push(node);
  }
  for (const row of tables.Gevaren ?? []) {
    const moduleId = row.ModuleId == null ? undefined : lookup('Modules', row.ModuleId);
    if (row.ModuleId != null && !moduleId) {
      warn('Gevaren', row, 'Gevaarmodule-FK heeft geen aantoonbare definitie; node blijft raw.');
      continue;
    }
    const node = base('Gevaren', row);
    if (node) hazards.push({ ...node, ...(moduleId ? { moduleId } : {}) });
  }
  for (const row of tables.Risicos ?? []) {
    const hazardId = lookup('Gevaren', row.GevaarItemId);
    if (!hazardId || !validRating(row.EffectScore)) {
      warn(
        'Risicos',
        row,
        'Risico mist exact gevaar-FK of geldige oorspronkelijke 1–3-effectrating; geen rating verzonnen/geclamped.',
      );
      continue;
    }
    const node = base('Risicos', row);
    if (node) risks.push({ ...node, hazardId, effectRating: row.EffectScore as OrdinalRating });
  }
  for (const row of tables.Risicofactoren ?? []) {
    const riskId = lookup('Risicos', row.RisicoItemId);
    if (!riskId || !validRating(row.DefaultWaarschijnlijkheidScore)) {
      warn(
        'Risicofactoren',
        row,
        'Factor mist exact risico-FK of geldige oorspronkelijke 1–3-standaardrating; raw behouden.',
      );
      continue;
    }
    const node = base('Risicofactoren', row);
    if (node)
      factors.push({
        ...node,
        riskId,
        lodDescription: string(row.LodBeschrijving),
        defaultLikelihoodRating: row.DefaultWaarschijnlijkheidScore as OrdinalRating,
      });
  }
  for (const row of tables.Beheersmaatregelen ?? []) {
    const type = controlType(row.Type);
    if (!type) {
      warn(
        'Beheersmaatregelen',
        row,
        'Oorspronkelijk maatregeltype onbekend; geen AHS-betekenis afgeleid.',
      );
      continue;
    }
    const node = base('Beheersmaatregelen', row);
    if (node) controls.push({ ...node, type });
  }
  const pairs = new Set<string>();
  for (const row of tables.BeheersmaatregelRisicofactoren ?? []) {
    const factorId = lookup('Risicofactoren', row.RisicofactorItemId),
      controlId = lookup('Beheersmaatregelen', row.BeheersmaatregelId),
      costLevel = cost(row.KostenNiveau);
    const pair = canonical([factorId, controlId]);
    if (
      !factorId ||
      !controlId ||
      !validRating(row.ReductieScore) ||
      !costLevel ||
      order(row) === undefined ||
      pairs.has(pair)
    ) {
      warn(
        'BeheersmaatregelRisicofactoren',
        row,
        'Factor–maatregelkoppeling mist een exacte relatie/rating/volgorde of is dubbel; raw behouden.',
      );
      continue;
    }
    const target = register('BeheersmaatregelRisicofactoren', row);
    if (!target) continue;
    pairs.add(pair);
    links.push({
      id: target,
      factorId,
      controlId,
      reductionRating: row.ReductieScore as OrdinalRating,
      costLevel,
      sortOrder: order(row)!,
      sourceIds: [options.sourceIdFor('BeheersmaatregelRisicofactoren', row)],
    });
  }
  for (const row of tables.BeoordelingsVragen ?? []) {
    const factorId = lookup('Risicofactoren', row.RisicofactorItemId);
    if (!factorId || !string(row.Vraagtekst).trim() || order(row) === undefined) {
      warn(
        'BeoordelingsVragen',
        row,
        'Factorvraag mist exacte factor-FK, vraagtekst of volgorde; raw behouden.',
      );
      continue;
    }
    const target = register('BeoordelingsVragen', row);
    if (target)
      questions.push({
        id: target,
        factorId,
        prompt: string(row.Vraagtekst),
        explanation: string(row.Toelichting),
        sortOrder: order(row)!,
        sourceIds: [options.sourceIdFor('BeoordelingsVragen', row)],
      });
  }
  if (!hazards.length && !controls.length) return { reviews: [], layouts: [] };
  const sourceIds = [
    ...new Set(
      [modules, hazards, risks, factors, controls, links, questions].flatMap((rows) =>
        rows.flatMap((row) => row.sourceIds),
      ),
    ),
  ];
  const library = sealRiskLibrary({
    id: options.id,
    libraryId: options.libraryId,
    version: options.version ?? '1.0.0',
    title: options.title,
    origin: 'legacy_sqlite',
    sourceIds,
    sourceSha256: options.sourceSha256,
    modules,
    hazards,
    risks,
    factors,
    controls,
    links,
    questions,
  });
  const reviews: RiskLibraryReview[] = [],
    layouts: RiskLibraryLayout[] = [];
  for (const table of ['RisicofactorBeoordelingen', 'MaatregelBeoordelingen'])
    for (const row of tables[table] ?? []) {
      const scope = options.scopeFor(row);
      if (!scope) {
        warn(
          table,
          row,
          'Oorspronkelijke beoordelingsscope is niet exact oplosbaar; raw behouden.',
        );
        continue;
      }
      const common = {
        id: options.targetIdFor(table, row),
        scope,
        origin: 'legacy_sqlite' as const,
        note: string(row.Toelichting),
        legacyUpdatedAt: string(row.UpdatedAt),
        sourceIds: [options.sourceIdFor(table, row)],
      };
      if (table === 'RisicofactorBeoordelingen') {
        const factorId = lookup('Risicofactoren', row.RisicofactorItemId),
          status = relevance(row.Relevantie);
        if (
          !factorId ||
          !status ||
          !validRating(row.BlootstellingScore) ||
          !validRating(row.WaarschijnlijkheidScore)
        ) {
          warn(
            table,
            row,
            'Factorreview mist exact doel of geldige oorspronkelijke ratings/relevantie; raw behouden.',
          );
          continue;
        }
        reviews.push(
          captureRiskLibraryReview(library, {
            ...common,
            kind: 'factor',
            factorId,
            relevance: status,
            exposureRating: row.BlootstellingScore as OrdinalRating,
            likelihoodRating: row.WaarschijnlijkheidScore as OrdinalRating,
          }),
        );
      } else {
        const linkId = lookup('BeheersmaatregelRisicofactoren', row.BeheersmaatregelRisicofactorId),
          costLevel = cost(row.KostenNiveau);
        if (
          !linkId ||
          !validRating(row.ReductieScore) ||
          !costLevel ||
          ![true, false, 0, 1].includes(row.IsInPlace as boolean)
        ) {
          warn(
            table,
            row,
            'Maatregelreview mist exact doel of oorspronkelijke ratings/aanwezigheidsstatus; raw behouden.',
          );
          continue;
        }
        reviews.push(
          captureRiskLibraryReview(library, {
            ...common,
            kind: 'control_link',
            linkId,
            reductionRating: row.ReductieScore as OrdinalRating,
            costLevel,
            isInPlace: row.IsInPlace === true || row.IsInPlace === 1,
          }),
        );
      }
    }
  const nodeTables: Record<string, [LibraryNodeType, string]> = {
    Gevaar: ['hazard', 'Gevaren'],
    Risico: ['risk', 'Risicos'],
    Risicofactor: ['factor', 'Risicofactoren'],
    Maatregel: ['control_link', 'BeheersmaatregelRisicofactoren'],
  };
  for (const row of tables.RiskMapNodeLayouts ?? []) {
    const mapping = nodeTables[string(row.NodeType)],
      scope = options.scopeFor(row),
      target = mapping && lookup(mapping[1], row.NodeId);
    if (
      !mapping ||
      !scope ||
      !target ||
      typeof row.X !== 'number' ||
      typeof row.Y !== 'number' ||
      !Number.isFinite(row.X) ||
      !Number.isFinite(row.Y) ||
      row.X < 0 ||
      row.Y < 0 ||
      row.X > 1_000_000 ||
      row.Y > 1_000_000
    ) {
      warn(
        'RiskMapNodeLayouts',
        row,
        'Kaartpositie mist exact type/doel/scope of heeft ongeldige coördinaten; raw behouden.',
      );
      continue;
    }
    layouts.push(
      captureRiskLibraryLayout(library, {
        id: options.targetIdFor('RiskMapNodeLayouts', row),
        scope,
        origin: 'legacy_sqlite',
        legacyUpdatedAt: string(row.UpdatedAt),
        note: '',
        sourceIds: [options.sourceIdFor('RiskMapNodeLayouts', row)],
        nodeType: mapping[0],
        nodeId: target,
        x: row.X,
        y: row.Y,
      }),
    );
  }
  const unambiguous = <T extends RiskLibraryReview | RiskLibraryLayout>(records: T[]): T[] =>
    records.filter((record) => {
      if (records.filter((item) => captureGroupKey(item) === captureGroupKey(record)).length === 1)
        return true;
      const table =
        'nodeType' in record
          ? 'RiskMapNodeLayouts'
          : record.kind === 'factor'
            ? 'RisicofactorBeoordelingen'
            : 'MaatregelBeoordelingen';
      const row = tables[table]?.find((item) => options.targetIdFor(table, item) === record.id);
      if (row)
        warn(
          table,
          row,
          'Meerdere oorspronkelijke vastleggingen voor dezelfde exacte scope/node zijn ambigu; alle betreffende rijen blijven raw, geen actuele versie gegokt.',
        );
      return false;
    });
  return { library, reviews: unambiguous(reviews), layouts: unambiguous(layouts) };
}
