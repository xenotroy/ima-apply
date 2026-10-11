import { sha256 } from '@noble/hashes/sha2.js';
import type { Question, QuestionDefinitionMetadata, QuestionRichFields } from '../content/catalog';
import type { Dossier, FrozenQuestion } from './dossier';
import type { WorkspaceRecord, WorkspaceState } from './model';
import { freezeQuestion, questionHash } from './frozen';

export type QuestionDefinitionStatus = QuestionDefinitionMetadata['status'];
export interface QuestionPackageSnapshot {
  schema: 'ima.question-package-snapshot/v1';
  id: string;
  version: string;
  /** Every definition in this package/version, including unselected, draft and retired ones. */
  questions: FrozenQuestion[];
  sha256: string;
}
export type ManagedQuestion = Question & { definition: QuestionDefinitionMetadata };
export type QuestionDefinitionDraft = Omit<Question, 'id' | 'definition'> & {
  definition: Omit<QuestionDefinitionMetadata, 'schema' | 'createdAt' | 'updatedAt'>;
};
export const questionDefinitionStatusLabels: Record<QuestionDefinitionStatus, string> = {
  draft: 'Concept',
  active: 'Actief',
  retired: 'Teruggetrokken',
};
function fail(message: string): never {
  throw new Error(`Vraagdefinitie: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object verwacht.');
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail('onbekend metadataveld.');
}
function text(value: unknown, required = false): asserts value is string {
  if (typeof value !== 'string' || (required && !value.trim())) fail('tekst ontbreekt.');
}
function id(value: unknown): asserts value is string {
  text(value, true);
  if (value.length > 160 || value !== value.trim()) fail('ongeldige identiteit.');
}
function ids(value: unknown): asserts value is string[] {
  if (!Array.isArray(value)) fail('lijst ontbreekt.');
  value.forEach(id);
  if (new Set(value).size !== value.length) fail('dubbele relaties.');
}
function semanticVersion(value: unknown): asserts value is string {
  text(value, true);
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) || value.length > 80)
    fail('versie moet een semantische x.y.z-versie zijn.');
}
/** BigInt prevents larger imported version segments from rounding to the same number. */
export function isHigherQuestionVersion(next: string, previous: string): boolean {
  semanticVersion(next);
  semanticVersion(previous);
  const a = next.split('.').map(BigInt),
    b = previous.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function timestamp(value: unknown): asserts value is string {
  text(value, true);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    fail('tijdstip vereist een expliciete tijdzone.');
}
export function assertQuestionRichFields(value: unknown): asserts value is QuestionRichFields {
  const rich = object(value);
  const fields = [
    'number',
    'hazard',
    'risk',
    'riskFactor',
    'technicalControls',
    'organisationalControls',
    'rootCauses',
    'culture',
  ];
  exactKeys(rich, [...fields, 'sortOrder']);
  for (const key of fields) if (rich[key] !== undefined) text(rich[key]);
  if (rich.sortOrder !== undefined && !Number.isSafeInteger(rich.sortOrder))
    fail('volgorde moet een geheel getal zijn.');
}
export function assertQuestionDefinitionMetadata(
  value: unknown,
): asserts value is QuestionDefinitionMetadata {
  const meta = object(value);
  exactKeys(meta, [
    'schema',
    'version',
    'status',
    'contentPackageId',
    'contentPackageVersion',
    'supersedesId',
    'topicIds',
    'legalIds',
    'tags',
    'createdAt',
    'updatedAt',
    'sourcePath',
    'sourceSha256',
  ]);
  if (meta.schema !== 'ima.question-definition/v1') fail('onbekende definitieversie.');
  semanticVersion(meta.version);
  semanticVersion(meta.contentPackageVersion);
  id(meta.contentPackageId);
  if (/[\s@#]/.test(meta.contentPackageId)) fail('pakketidentiteit bevat een gereserveerd teken.');
  if (!['draft', 'active', 'retired'].includes(String(meta.status))) fail('onbekende vraagstatus.');
  if (meta.supersedesId !== undefined) id(meta.supersedesId);
  ids(meta.topicIds);
  ids(meta.legalIds);
  ids(meta.tags);
  for (const key of ['createdAt', 'updatedAt']) if (meta[key] !== undefined) timestamp(meta[key]);
  if (
    meta.createdAt &&
    meta.updatedAt &&
    Date.parse(String(meta.updatedAt)) < Date.parse(String(meta.createdAt))
  )
    fail('wijziging ligt vóór de vastlegging.');
  if (meta.sourcePath !== undefined) text(meta.sourcePath);
  if (
    meta.sourceSha256 !== undefined &&
    (typeof meta.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(meta.sourceSha256))
  )
    fail('ongeldige bronhash.');
}
/** Safe for unmanaged historical questions too: absent provenance is never fabricated. */
export function assertQuestionContentExtensions(value: unknown): void {
  const q = object(value);
  for (const key of ['acceptanceCriteria', 'expectedEvidence'])
    if (q[key] !== undefined) text(q[key]);
  if (q.richFields !== undefined) assertQuestionRichFields(q.richFields);
  if (q.definition !== undefined) assertQuestionDefinitionMetadata(q.definition);
}
export function assertManagedQuestion(value: unknown): asserts value is ManagedQuestion {
  const q = object(value);
  id(q.id);
  id(q.themeId);
  text(q.title, true);
  text(q.prompt, true);
  text(q.assessmentGuidance);
  for (const key of ['evidenceHints', 'sourceIds', 'roles']) {
    if (!Array.isArray(q[key]) || (q[key] as unknown[]).some((item) => typeof item !== 'string'))
      fail('vraaglijstveld ontbreekt.');
  }
  ids(q.sourceIds);
  if (!['kern', 'verdieping'].includes(String(q.route))) fail('onbekende vraagroute.');
  if (
    !Array.isArray(q.suggestedHierarchy) ||
    q.suggestedHierarchy.some(
      (level) =>
        !['eliminate', 'source', 'collective', 'individual', 'ppe'].includes(String(level)),
    )
  )
    fail('onbekende maatregelhiërarchie.');
  if (q.legalReferences !== undefined) text(q.legalReferences);
  assertQuestionContentExtensions(q);
  if (q.definition === undefined) fail('beheerde metadata ontbreken.');
}
export function managedQuestion(record: WorkspaceRecord | Question): ManagedQuestion | undefined {
  if (record.definition === undefined) return undefined;
  assertManagedQuestion(record);
  return record;
}
function packageKey(id: string, version: string): string {
  return JSON.stringify([id.toLowerCase(), version]);
}
function packageQuestions(
  workspace: WorkspaceState,
  packageId: string,
  version: string,
): ManagedQuestion[] {
  return workspace.questions
    .map(managedQuestion)
    .filter((q): q is ManagedQuestion =>
      Boolean(
        q &&
        packageKey(q.definition.contentPackageId, q.definition.contentPackageVersion) ===
          packageKey(packageId, version),
      ),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
function digest(value: string): string {
  return Array.from(sha256(new TextEncoder().encode(value)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
/** Full content is retained; the package hash covers the sorted complete question references. */
export function questionPackageHash(
  snapshot: Pick<QuestionPackageSnapshot, 'id' | 'version' | 'questions'>,
): string {
  return digest(
    JSON.stringify({
      schema: 'ima.question-package-snapshot/v1',
      id: snapshot.id.toLowerCase(),
      version: snapshot.version,
      questions: snapshot.questions.map((q) => ({
        id: q.id,
        version: q.version,
        sha256: q.sha256,
      })),
    }),
  );
}
type DossierWithPackages = Dossier & { contentPackageSnapshots?: QuestionPackageSnapshot[] };
export function isQuestionPackageFrozen(
  workspace: WorkspaceState,
  packageId: string,
  version: string,
): boolean {
  return (workspace.dossiers ?? []).some((dossier) =>
    (dossier as DossierWithPackages).contentPackageSnapshots?.some(
      (snapshot) => packageKey(snapshot.id, snapshot.version) === packageKey(packageId, version),
    ),
  );
}
export function assertQuestionDefinitions(workspace: WorkspaceState): void {
  const lookup = new Map<string, ManagedQuestion>();
  for (const record of workspace.questions) {
    assertQuestionContentExtensions(record);
    const q = managedQuestion(record);
    if (!q) continue;
    if (lookup.has(q.id)) fail('dubbele vraagidentiteit.');
    lookup.set(q.id, q);
  }
  const topicIds = new Set((workspace.topics ?? []).map((topic) => topic.id));
  const legalIds = new Set((workspace.legalRecords ?? []).map((record) => record.id));
  for (const q of lookup.values()) {
    const meta = q.definition;
    for (const topic of meta.topicIds)
      if (!topicIds.has(topic)) fail(`onderwerp ${topic} bestaat niet.`);
    for (const legal of meta.legalIds)
      if (!legalIds.has(legal)) fail(`wetgevingsrecord ${legal} bestaat niet.`);
    if (!meta.supersedesId) continue;
    const before = lookup.get(meta.supersedesId);
    if (!before || before.id === q.id) fail('voorgaande beheerde definitie ontbreekt.');
    if (before.definition.contentPackageId.toLowerCase() !== meta.contentPackageId.toLowerCase())
      fail('opvolger hoort bij een ander pakket.');
    if (!isHigherQuestionVersion(meta.version, before.definition.version))
      fail('opvolger vereist een hogere vraagversie.');
    if (
      !isHigherQuestionVersion(meta.contentPackageVersion, before.definition.contentPackageVersion)
    )
      fail('opvolger vereist een hogere pakketversie.');
    if (
      meta.createdAt &&
      before.definition.createdAt &&
      Date.parse(meta.createdAt) < Date.parse(before.definition.createdAt)
    )
      fail('opvolger is ouder dan zijn voorganger.');
  }
  for (const dossier of workspace.dossiers ?? []) assertDossierQuestionPackages(dossier, workspace);
}
export function addQuestionDefinition(
  workspace: WorkspaceState,
  draft: QuestionDefinitionDraft,
  identity: { id: string; now: string },
): ManagedQuestion {
  if (workspace.questions.some((q) => q.id === identity.id)) fail('identiteit bestaat al.');
  if (
    isQuestionPackageFrozen(
      workspace,
      draft.definition.contentPackageId,
      draft.definition.contentPackageVersion,
    )
  )
    fail('pakketversie is bevroren; kies een hogere pakketversie.');
  const q: ManagedQuestion = {
    ...structuredClone(draft),
    id: identity.id,
    definition: {
      ...structuredClone(draft.definition),
      schema: 'ima.question-definition/v1',
      createdAt: identity.now,
      updatedAt: identity.now,
    },
  };
  assertManagedQuestion(q);
  assertQuestionDefinitions({
    ...workspace,
    questions: [...workspace.questions, q as unknown as WorkspaceRecord],
  });
  return q;
}
export function setQuestionDefinitionStatus(
  workspace: WorkspaceState,
  questionId: string,
  status: QuestionDefinitionStatus,
  now: string,
): ManagedQuestion {
  const record = workspace.questions.find((q) => q.id === questionId);
  const q = record && managedQuestion(record);
  if (!q) fail('beheerde definitie bestaat niet.');
  if (
    isQuestionPackageFrozen(
      workspace,
      q.definition.contentPackageId,
      q.definition.contentPackageVersion,
    )
  )
    fail('pakketversie is bevroren; gebruik een opvolger.');
  if (q.definition.status === status) fail('status is niet gewijzigd.');
  if (!(
    (q.definition.status === 'draft' && ['active', 'retired'].includes(status)) ||
    (q.definition.status === 'active' && status === 'retired')
  ))
    fail('statusovergang is niet toegestaan.');
  const next: ManagedQuestion = {
    ...structuredClone(q),
    definition: { ...q.definition, status, updatedAt: now },
  };
  assertManagedQuestion(next);
  return next;
}
export function captureQuestionPackages(
  selectedQuestionIds: readonly string[],
  workspace: WorkspaceState,
): QuestionPackageSnapshot[] {
  assertQuestionDefinitions(workspace);
  const selected = selectedQuestionIds
    .map((id) => workspace.questions.find((q) => q.id === id))
    .filter((q): q is WorkspaceRecord => Boolean(q))
    .map(managedQuestion)
    .filter((q): q is ManagedQuestion => Boolean(q));
  const packages = new Map<string, { id: string; version: string }>();
  for (const q of selected) {
    const meta = q.definition;
    if (meta.status !== 'active')
      fail('nieuw dossier kan alleen actieve beheerde definities gebruiken.');
    const key = meta.contentPackageId.toLowerCase();
    if (packages.has(key) && packages.get(key)!.version !== meta.contentPackageVersion)
      fail('nieuw dossier selecteert meerdere versies van hetzelfde pakket.');
    packages.set(key, { id: meta.contentPackageId, version: meta.contentPackageVersion });
  }
  return [...packages.values()]
    .sort((a, b) => (a.id.toLowerCase() < b.id.toLowerCase() ? -1 : 1))
    .map((pack) => {
      const questions = packageQuestions(workspace, pack.id, pack.version).map((q) =>
        freezeQuestion(q, q.definition.version),
      );
      const snapshot: QuestionPackageSnapshot = {
        schema: 'ima.question-package-snapshot/v1',
        id: pack.id,
        version: pack.version,
        questions,
        sha256: '',
      };
      snapshot.sha256 = questionPackageHash(snapshot);
      return snapshot;
    });
}
export function assertQuestionPackageSnapshot(
  value: unknown,
): asserts value is QuestionPackageSnapshot {
  const snapshot = object(value);
  exactKeys(snapshot, ['schema', 'id', 'version', 'questions', 'sha256']);
  if (snapshot.schema !== 'ima.question-package-snapshot/v1')
    fail('onbekende pakketsnapshotversie.');
  id(snapshot.id);
  semanticVersion(snapshot.version);
  if (!Array.isArray(snapshot.questions) || !snapshot.questions.length)
    fail('pakketsnapshot is leeg.');
  let previous = '';
  for (const question of snapshot.questions) {
    assertManagedQuestion(question);
    const frozen = question as FrozenQuestion & ManagedQuestion;
    if (frozen.id <= previous) fail('pakketvragen moeten uniek en op identiteit gesorteerd zijn.');
    previous = frozen.id;
    if (
      packageKey(frozen.definition.contentPackageId, frozen.definition.contentPackageVersion) !==
        packageKey(snapshot.id, snapshot.version) ||
      frozen.version !== frozen.definition.version
    )
      fail('vraag behoort niet tot deze bevroren pakketversie.');
    if (frozen.sha256 !== questionHash(frozen)) fail('bevroren vraaghash komt niet overeen.');
  }
  if (snapshot.sha256 !== questionPackageHash(snapshot as unknown as QuestionPackageSnapshot))
    fail('pakketinhoud en hash komen niet overeen.');
}
export function assertDossierQuestionPackages(dossier: Dossier, workspace: WorkspaceState): void {
  const snapshots = (dossier as DossierWithPackages).contentPackageSnapshots ?? [];
  const selected = dossier.questions.filter((q) => q.definition !== undefined);
  if (!Array.isArray(snapshots)) fail('pakketsnapshots moeten een lijst zijn.');
  const pairs = new Set<string>(),
    packageIds = new Set<string>();
  for (const snapshot of snapshots) {
    assertQuestionPackageSnapshot(snapshot);
    const key = packageKey(snapshot.id, snapshot.version);
    if (pairs.has(key) || packageIds.has(snapshot.id.toLowerCase()))
      fail('dubbele of gemengde bevroren pakketversies.');
    pairs.add(key);
    packageIds.add(snapshot.id.toLowerCase());
    const current = packageQuestions(workspace, snapshot.id, snapshot.version).map((q) =>
      freezeQuestion(q, q.definition.version),
    );
    if (questionPackageHash({ ...snapshot, questions: current }) !== snapshot.sha256)
      fail('bevroren pakketversie is gewijzigd of kreeg late definities.');
    if (
      !selected.some(
        (q) =>
          q.definition &&
          packageKey(q.definition.contentPackageId, q.definition.contentPackageVersion) === key,
      )
    )
      fail('pakket is niet gebruikt door dit dossier.');
  }
  for (const question of selected) {
    assertManagedQuestion(question);
    const meta = question.definition!;
    if (meta.status !== 'active') fail('bevroren geselecteerde vraag was niet actief.');
    const snapshot = snapshots.find(
      (pack) =>
        packageKey(pack.id, pack.version) ===
        packageKey(meta.contentPackageId, meta.contentPackageVersion),
    );
    const member = snapshot?.questions.find((q) => q.id === question.id);
    if (!member || member.version !== question.version || member.sha256 !== question.sha256)
      fail('geselecteerde vraag ontbreekt in de volledige pakketfreeze.');
  }
}
function lines(label: string, value: string | undefined): string[] {
  return value === undefined ? [] : [`### ${label}`, '', value || '(leeg bronveld)', ''];
}
export function questionDefinitionsMarkdown(workspace: WorkspaceState): string {
  const definitions = workspace.questions
    .map(managedQuestion)
    .filter((q): q is ManagedQuestion => Boolean(q));
  if (!definitions.length) return '';
  return [
    '## Beheerde vraagdefinities',
    '',
    ...definitions.flatMap((q) => [
      `### ${q.title}`,
      '',
      `- Vraag: ${q.id} · versie ${q.definition.version} · ${questionDefinitionStatusLabels[q.definition.status]}`,
      `- Pakket: ${q.definition.contentPackageId}@${q.definition.contentPackageVersion}`,
      `- Voorganger: ${q.definition.supersedesId ?? 'niet vastgelegd'}`,
      `- Vastgelegd: ${q.definition.createdAt ?? 'historisch onbekend'} · bronpad: ${q.definition.sourcePath ?? 'niet vastgelegd'}`,
      `- Onderwerpen: ${q.definition.topicIds.join(', ') || 'geen'} · wetgeving: ${q.definition.legalIds.join(', ') || 'geen'} · tags: ${q.definition.tags.join(', ') || 'geen'}`,
      '',
      ...lines('Vraagtekst', q.prompt),
      ...lines('Toelichting', q.assessmentGuidance),
      ...lines('Acceptatiecriteria', q.acceptanceCriteria),
      ...lines('Verwacht bewijs', q.expectedEvidence),
      ...(q.richFields
        ? Object.entries(q.richFields).flatMap(([key, value]) => [`- ${key}: ${value}`, ''])
        : []),
    ]),
  ].join('\n');
}
export function questionPackagesMarkdown(dossier: Dossier): string {
  const packages = (dossier as DossierWithPackages).contentPackageSnapshots ?? [];
  const unmanagedCount = dossier.questions.filter((q) => !q.definition).length;
  if (!packages.length)
    return unmanagedCount
      ? 'Beheerde pakketversie: niet beschikbaar voor historische of onbeheerde bronvragen.\n'
      : '';
  return [
    '### Bevroren contentpakketten',
    '',
    ...(unmanagedCount
      ? [
          `${unmanagedCount} geselecteerde bronvragen hebben geen beheerde pakketversie. Hun afzonderlijke bevroren broninhoud blijft behouden; status en pakketversie zijn niet afgeleid.`,
          '',
        ]
      : []),
    ...packages.flatMap((pack) => [
      `- ${pack.id}@${pack.version}#sha256:${pack.sha256} · ${pack.questions.length} volledige definities`,
      '',
      ...pack.questions.flatMap((q) => [
        `#### ${q.title} (${q.id}@${q.version})`,
        '',
        `Hash: ${q.sha256} · ${q.definition?.status ?? 'onbekend'}`,
        '',
        ...lines('Vraagtekst', q.prompt),
        ...lines('Toelichting', q.assessmentGuidance),
        ...lines('Acceptatiecriteria', q.acceptanceCriteria),
        ...lines('Verwacht bewijs', q.expectedEvidence),
        ...(q.richFields
          ? Object.entries(q.richFields).map(([key, value]) => `- ${key}: ${value}`)
          : []),
        '',
      ]),
    ]),
  ].join('\n');
}
