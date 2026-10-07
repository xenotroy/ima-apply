import type { WorkspaceState } from './model';
import type { Scenario } from '../domain/types';
import { evaluateRisk } from '../domain/risk';
import type { Question } from '../content/catalog';
import { questionHash, evidenceHash } from './frozen';
import type { Evidence } from './dossier';

// Keep below the GitHub Contents API's 1 MB complete-response limit.
export const MAX_WORKSPACE_BYTES = 900_000;
const MAX_RECORDS = 5_000;
const MAX_TEXT_LENGTH = 100_000;
const credentialPattern = /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/;
const secretKeyPattern = /(?:^|_)(?:token|password|secret|api_?key|authorization|credentials?)s?$/i;

export class WorkspaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceValidationError';
  }
}

function fail(path: string, message: string): never {
  throw new WorkspaceValidationError(`${path}: ${message}`);
}

function jsonSafety(value: unknown, depth = 0): void {
  if (depth > 20) fail('Werkruimte', 'gegevens zijn te diep genest.');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT_LENGTH) fail('Werkruimte', 'een tekstveld is te groot.');
    if (credentialPattern.test(value))
      fail('Werkruimte', 'bevat een toegangstoken; verwijder dit vóór opslag.');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_RECORDS) fail('Werkruimte', 'te veel items in een collectie.');
    value.forEach((item) => jsonSafety(item, depth + 1));
    return;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.replace(/([a-z])([A-Z])/g, '$1_$2');
      if (
        ['__proto__', 'prototype', 'constructor'].includes(key) ||
        secretKeyPattern.test(normalizedKey)
      ) {
        fail('Werkruimte', 'bevat een verboden veld of inloggegevens.');
      }
      // TypeScript optional fields may be explicitly undefined. JSON.stringify
      // omits these object properties; required-field validators still reject them.
      if (item === undefined) continue;
      jsonSafety(item, depth + 1);
    }
    return;
  }
  fail('Werkruimte', 'alle waarden moeten gewone JSON-gegevens zijn.');
}

function object(value: unknown, path: string, allowed?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'object verwacht.');
  const result = value as Record<string, unknown>;
  if (allowed && Object.keys(result).some((key) => !allowed.includes(key)))
    fail(path, 'onbekend veld.');
  return result;
}

function text(
  value: unknown,
  path: string,
  required = false,
  limit = MAX_TEXT_LENGTH,
): asserts value is string {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
    fail(path, 'geldige tekst verwacht.');
  }
}

function id(value: unknown, path: string): void {
  text(value, path, true, 160);
}

function number(
  value: unknown,
  path: string,
  min = 0,
  max = Number.MAX_VALUE,
  positive = false,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (positive && value <= 0)
  ) {
    fail(path, 'getal buiten het toegestane bereik.');
  }
}

function bool(value: unknown, path: string): void {
  if (typeof value !== 'boolean') fail(path, 'boolean verwacht.');
}

function choice(value: unknown, options: readonly string[], path: string): void {
  if (typeof value !== 'string' || !options.includes(value)) fail(path, 'onbekende keuze.');
}

function timestamp(value: unknown, path: string): void {
  text(value, path, true, 64);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail(path, 'ISO-datum met tijdzone verwacht.');
  }
}

function date(value: unknown, path: string, allowEmpty = false): void {
  text(value, path, !allowEmpty, 10);
  if (allowEmpty && value === '') return;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    fail(path, 'geldige datum YYYY-MM-DD verwacht.');
  }
}

function list(
  value: unknown,
  path: string,
  validator: (value: unknown, path: string) => void,
  uniqueIds = true,
): void {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) fail(path, 'geldige lijst verwacht.');
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    validator(item, itemPath);
    if (uniqueIds) {
      const key = object(item, itemPath).id;
      id(key, `${itemPath}.id`);
      if (seen.has(key as string)) fail(path, 'dubbele id in dezelfde collectie.');
      seen.add(key as string);
    }
  });
}

function strings(value: unknown, path: string): void {
  list(value, path, (item, itemPath) => text(item, itemPath, true, 1_000), false);
}

function estimate(
  value: unknown,
  path: string,
  max = 1,
  positiveMin = false,
  positiveValue = false,
): void {
  const item = object(value, path, ['min', 'value', 'max']);
  number(item.min, `${path}.min`, 0, max, positiveMin);
  number(item.value, `${path}.value`, 0, max, positiveValue);
  number(item.max, `${path}.max`, 0, max);
  if (item.min > item.value || item.value > item.max) fail(path, 'verwacht min ≤ value ≤ max.');
}

function statusAndEvidence(item: Record<string, unknown>, path: string): void {
  choice(item.status, ['existing', 'planned', 'retired'], `${path}.status`);
  choice(item.evidence, ['verified', 'unverified', 'unknown'], `${path}.evidence`);
  text(item.evidenceNote, `${path}.evidenceNote`);
  if (item.dependencyGroup !== undefined)
    text(item.dependencyGroup, `${path}.dependencyGroup`, false, 160);
}

function control(value: unknown, path: string): void {
  const item = object(value, path, [
    'id',
    'title',
    'ahs',
    'status',
    'evidence',
    'evidenceNote',
    'rationale',
    'probabilityReduction',
    'exposureReduction',
    'effectReduction',
    'independent',
    'dependencyGroup',
    'feasibility',
    'effort',
    'legalRequired',
  ]);
  id(item.id, `${path}.id`);
  text(item.title, `${path}.title`, true, 1_000);
  choice(item.ahs, ['source', 'collective', 'individual', 'ppe'], `${path}.ahs`);
  statusAndEvidence(item, path);
  text(item.rationale, `${path}.rationale`);
  estimate(item.probabilityReduction, `${path}.probabilityReduction`);
  estimate(item.exposureReduction, `${path}.exposureReduction`);
  estimate(item.effectReduction, `${path}.effectReduction`);
  bool(item.independent, `${path}.independent`);
  choice(item.feasibility, ['easy', 'moderate', 'hard'], `${path}.feasibility`);
  number(item.effort, `${path}.effort`, 0, Number.MAX_VALUE, true);
  bool(item.legalRequired, `${path}.legalRequired`);
}

function lopaLayer(value: unknown, path: string): void {
  const item = object(value, path, [
    'id',
    'title',
    'status',
    'evidence',
    'evidenceNote',
    'pfd',
    'specific',
    'independent',
    'independentOfInitiator',
    'auditable',
    'effective',
    'independenceNote',
    'dependencyGroup',
  ]);
  id(item.id, `${path}.id`);
  text(item.title, `${path}.title`, true, 1_000);
  statusAndEvidence(item, path);
  estimate(item.pfd, `${path}.pfd`, 1, true);
  for (const field of [
    'specific',
    'independent',
    'independentOfInitiator',
    'auditable',
    'effective',
  ])
    bool(item[field], `${path}.${field}`);
  text(item.independenceNote, `${path}.independenceNote`);
}

function lopaModifier(value: unknown, path: string): void {
  const item = object(value, path, [
    'id',
    'title',
    'kind',
    'probability',
    'evidence',
    'evidenceNote',
    'independent',
    'rationale',
    'dependencyGroup',
  ]);
  id(item.id, `${path}.id`);
  text(item.title, `${path}.title`, true, 1_000);
  choice(item.kind, ['enabling', 'conditional'], `${path}.kind`);
  estimate(item.probability, `${path}.probability`, 1, true);
  choice(item.evidence, ['verified', 'unverified', 'unknown'], `${path}.evidence`);
  text(item.evidenceNote, `${path}.evidenceNote`);
  bool(item.independent, `${path}.independent`);
  text(item.rationale, `${path}.rationale`);
  if (item.dependencyGroup !== undefined)
    text(item.dependencyGroup, `${path}.dependencyGroup`, false, 160);
}

function lopa(value: unknown, path: string): void {
  const item = object(value, path, [
    'initiatingEvent',
    'initiatingFrequency',
    'frequencyEvidence',
    'consequence',
    'layers',
    'modifiers',
    'targetFrequency',
    'assumptions',
  ]);
  text(item.initiatingEvent, `${path}.initiatingEvent`, true);
  estimate(item.initiatingFrequency, `${path}.initiatingFrequency`, Number.MAX_VALUE, false, true);
  text(item.frequencyEvidence, `${path}.frequencyEvidence`, true);
  text(item.consequence, `${path}.consequence`, true);
  list(item.layers, `${path}.layers`, lopaLayer);
  list(item.modifiers, `${path}.modifiers`, lopaModifier);
  const combinedIds = [
    ...(item.layers as { id: string }[]),
    ...(item.modifiers as { id: string }[]),
  ].map((entry) => entry.id);
  if (new Set(combinedIds).size !== combinedIds.length)
    fail(path, 'LOPA-lagen en modifiers moeten onderling unieke IDs hebben.');
  number(item.targetFrequency, `${path}.targetFrequency`, 0, Number.MAX_VALUE, true);
  text(item.assumptions, `${path}.assumptions`);
}

function scenario(value: unknown, path: string): void {
  const item = object(value, path, [
    'id',
    'title',
    'description',
    'department',
    'hazard',
    'consequence',
    'probability',
    'exposure',
    'effect',
    'controls',
    'lopa',
    'sourceIds',
    'assessmentNotes',
    'dossierId',
    'departmentId',
  ]);
  id(item.id, `${path}.id`);
  text(item.title, `${path}.title`, true, 1_000);
  for (const field of ['description', 'department', 'hazard', 'consequence'])
    text(item[field], `${path}.${field}`);
  number(item.probability, `${path}.probability`, 0, 10, true);
  number(item.exposure, `${path}.exposure`, 0, 10, true);
  number(item.effect, `${path}.effect`, 0, 100, true);
  list(item.controls, `${path}.controls`, control);
  if (item.lopa !== undefined) lopa(item.lopa, `${path}.lopa`);
  if (item.sourceIds !== undefined) strings(item.sourceIds, `${path}.sourceIds`);
  if (item.assessmentNotes !== undefined) text(item.assessmentNotes, `${path}.assessmentNotes`);
  optionalId(item, 'dossierId', path);
  optionalId(item, 'departmentId', path);
  // Valid JSON ranges can still create numerical underflow/overflow or an
  // unrenderable result. Reject them before replacing the open workspace.
  try {
    evaluateRisk(item as unknown as Scenario);
  } catch (error) {
    fail(
      path,
      `risicoberekening is ongeldig: ${error instanceof Error ? error.message : 'controleer factoren en intervallen.'}`,
    );
  }
}

function answer(value: unknown, path: string): void {
  const item = object(value, path, [
    'id',
    'questionId',
    'choice',
    'evidence',
    'note',
    'answeredAt',
    'questionSnapshot',
    'sourceIds',
    'contentVersion',
    'dossierId',
    'questionSha256',
    'evidenceIds',
  ]);
  id(item.id, `${path}.id`);
  id(item.questionId, `${path}.questionId`);
  choice(item.choice, ['yes', 'partial', 'no', 'unknown', 'na'], `${path}.choice`);
  text(item.evidence, `${path}.evidence`);
  text(item.note, `${path}.note`);
  timestamp(item.answeredAt, `${path}.answeredAt`);
  if (item.questionSnapshot !== undefined) text(item.questionSnapshot, `${path}.questionSnapshot`);
  if (item.sourceIds !== undefined) strings(item.sourceIds, `${path}.sourceIds`);
  if (item.contentVersion !== undefined)
    text(item.contentVersion, `${path}.contentVersion`, true, 160);
  optionalId(item, 'dossierId', path);
  if (item.questionSha256 !== undefined) digest(item.questionSha256, `${path}.questionSha256`);
  if (item.evidenceIds !== undefined) strings(item.evidenceIds, `${path}.evidenceIds`);
}

function action(value: unknown, path: string): void {
  const item = object(value, path, [
    'id',
    'title',
    'scenarioId',
    'owner',
    'dueDate',
    'status',
    'notes',
    'effectCheck',
    'verifiedAt',
    'dossierId',
    'findingId',
    'evidenceIds',
  ]);
  id(item.id, `${path}.id`);
  text(item.title, `${path}.title`, true, 1_000);
  if (item.scenarioId !== undefined) text(item.scenarioId, `${path}.scenarioId`, false, 160);
  text(item.owner, `${path}.owner`, false, 1_000);
  date(item.dueDate, `${path}.dueDate`, true);
  choice(item.status, ['open', 'in_progress', 'done'], `${path}.status`);
  text(item.notes, `${path}.notes`);
  if (item.effectCheck !== undefined) text(item.effectCheck, `${path}.effectCheck`);
  if (item.verifiedAt !== undefined) timestamp(item.verifiedAt, `${path}.verifiedAt`);
  optionalId(item, 'dossierId', path);
  optionalId(item, 'findingId', path);
  if (item.evidenceIds !== undefined) strings(item.evidenceIds, `${path}.evidenceIds`);
  if (item.status === 'done') {
    text(item.owner, `${path}.owner`, true, 1_000);
    text(item.effectCheck, `${path}.effectCheck`, true);
    timestamp(item.verifiedAt, `${path}.verifiedAt`);
  }
}

function incident(value: unknown, path: string): void {
  const item = object(value, path, [
    'id',
    'title',
    'date',
    'department',
    'type',
    'description',
    'scenarioId',
    'actionIds',
    'departmentId',
    'actualSeverity',
    'potentialSeverity',
    'recordable',
    'lostTime',
    'lostTimeDays',
    'reportedBy',
    'activity',
    'immediateControls',
    'openQuestions',
  ]);
  id(item.id, `${path}.id`);
  text(item.title, `${path}.title`, true, 1_000);
  date(item.date, `${path}.date`);
  text(item.department, `${path}.department`);
  choice(item.type, ['incident', 'near_miss', 'observation'], `${path}.type`);
  text(item.description, `${path}.description`);
  if (item.scenarioId !== undefined) text(item.scenarioId, `${path}.scenarioId`, false, 160);
  strings(item.actionIds, `${path}.actionIds`);
  for (const key of ['reportedBy', 'activity', 'immediateControls', 'openQuestions'])
    if (item[key] !== undefined) text(item[key], `${path}.${key}`);
  optionalId(item, 'departmentId', path);
  for (const key of ['actualSeverity', 'potentialSeverity'])
    if (item[key] !== undefined)
      choice(
        item[key],
        [
          'none',
          'first_aid',
          'medical_treatment',
          'lost_time',
          'major',
          'permanent_injury',
          'fatality',
        ],
        `${path}.${key}`,
      );
  for (const key of ['recordable', 'lostTime'])
    if (item[key] !== undefined) bool(item[key], `${path}.${key}`);
  if (item.lostTimeDays !== undefined) {
    number(item.lostTimeDays, `${path}.lostTimeDays`, 0, 1_000_000);
    if (!Number.isInteger(item.lostTimeDays))
      fail(path, 'verzuimdagen moeten een geheel getal zijn.');
  }
}

function optionalId(item: Record<string, unknown>, key: string, path: string): void {
  if (item[key] !== undefined) id(item[key], `${path}.${key}`);
}
function digest(value: unknown, path: string): void {
  text(value, path, true, 64);
  if (!/^[a-f0-9]{64}$/.test(value)) fail(path, 'SHA-256 verwacht.');
}
function baseRecord(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  const item = object(value, path, ['id', ...keys]);
  id(item.id, `${path}.id`);
  return item;
}
function organisation(value: unknown, path: string): void {
  const item = baseRecord(value, path, ['name', 'description']);
  text(item.name, `${path}.name`, true);
  text(item.description, `${path}.description`);
}
function site(value: unknown, path: string): void {
  const item = baseRecord(value, path, ['name', 'organisationId', 'address']);
  text(item.name, `${path}.name`, true);
  id(item.organisationId, `${path}.organisationId`);
  text(item.address, `${path}.address`);
}
function department(value: unknown, path: string): void {
  const item = baseRecord(value, path, ['name', 'siteId', 'activity']);
  text(item.name, `${path}.name`, true);
  id(item.siteId, `${path}.siteId`);
  text(item.activity, `${path}.activity`);
}
function frozenQuestion(value: unknown, path: string): void {
  question(value, path);
  const item = object(value, path);
  text(item.title, `${path}.title`, true);
  choice(item.route, ['kern', 'verdieping'], `${path}.route`);
  text(item.version, `${path}.version`, true, 160);
  digest(item.sha256, `${path}.sha256`);
  if (questionHash(item as unknown as Question) !== item.sha256)
    fail(path, 'bevroren vraaginhoud wijkt af van de bronhash.');
}
function dossier(value: unknown, path: string): void {
  const item = baseRecord(value, path, [
    'title',
    'organisationId',
    'departmentIds',
    'scope',
    'assessor',
    'status',
    'createdAt',
    'questions',
    'sourceSnapshots',
    'reviewedBy',
    'reviewedAt',
    'reviewNote',
  ]);
  text(item.title, `${path}.title`, true);
  optionalId(item, 'organisationId', path);
  strings(item.departmentIds, `${path}.departmentIds`);
  text(item.scope, `${path}.scope`, item.status !== 'draft');
  text(item.assessor, `${path}.assessor`, item.status !== 'draft');
  choice(item.status, ['draft', 'active', 'completed', 'archived'], `${path}.status`);
  timestamp(item.createdAt, `${path}.createdAt`);
  list(item.questions, `${path}.questions`, frozenQuestion);
  if (item.sourceSnapshots !== undefined)
    list(item.sourceSnapshots, `${path}.sourceSnapshots`, genericRecord);
  for (const key of ['reviewedBy', 'reviewNote'])
    if (item[key] !== undefined) text(item[key], `${path}.${key}`);
  if (item.reviewedAt !== undefined) timestamp(item.reviewedAt, `${path}.reviewedAt`);
  if (item.status === 'completed') {
    text(item.reviewedBy, `${path}.reviewedBy`, true);
    text(item.reviewNote, `${path}.reviewNote`, true);
    timestamp(item.reviewedAt, `${path}.reviewedAt`);
  }
}
function evidence(value: unknown, path: string): void {
  const item = baseRecord(value, path, [
    'title',
    'dossierId',
    'kind',
    'reference',
    'description',
    'recordedAt',
    'status',
    'verifiedBy',
    'verifiedAt',
    'verificationNote',
    'verifiedContentSha256',
  ]);
  text(item.title, `${path}.title`, true);
  optionalId(item, 'dossierId', path);
  choice(
    item.kind,
    ['document', 'photograph', 'interview', 'measurement', 'record', 'other'],
    `${path}.kind`,
  );
  text(item.reference, `${path}.reference`);
  text(item.description, `${path}.description`, true);
  timestamp(item.recordedAt, `${path}.recordedAt`);
  choice(item.status, ['unverified', 'verified'], `${path}.status`);
  for (const key of ['verifiedBy', 'verificationNote'])
    if (item[key] !== undefined) text(item[key], `${path}.${key}`);
  if (item.verifiedAt !== undefined) timestamp(item.verifiedAt, `${path}.verifiedAt`);
  if (item.verifiedContentSha256 !== undefined)
    digest(item.verifiedContentSha256, `${path}.verifiedContentSha256`);
  if (item.status === 'verified') {
    text(item.verifiedBy, `${path}.verifiedBy`, true);
    text(item.verificationNote, `${path}.verificationNote`, true);
    timestamp(item.verifiedAt, `${path}.verifiedAt`);
    digest(item.verifiedContentSha256, `${path}.verifiedContentSha256`);
    if (evidenceHash(item as unknown as Evidence) !== item.verifiedContentSha256)
      fail(path, 'de bewijsinhoud is gewijzigd sinds verificatie; verifieer de nieuwe inhoud.');
  }
}
function observation(value: unknown, path: string): void {
  const item = baseRecord(value, path, [
    'title',
    'dossierId',
    'departmentId',
    'date',
    'observer',
    'facts',
    'evidenceIds',
  ]);
  text(item.title, `${path}.title`, true);
  id(item.dossierId, `${path}.dossierId`);
  optionalId(item, 'departmentId', path);
  date(item.date, `${path}.date`);
  text(item.observer, `${path}.observer`, true);
  text(item.facts, `${path}.facts`, true);
  strings(item.evidenceIds, `${path}.evidenceIds`);
}
function finding(value: unknown, path: string): void {
  const item = baseRecord(value, path, [
    'title',
    'dossierId',
    'questionId',
    'scenarioId',
    'description',
    'status',
    'observationIds',
    'evidenceIds',
    'topicIds',
    'legalIds',
    'decisionBy',
    'decisionNote',
  ]);
  text(item.title, `${path}.title`, true);
  id(item.dossierId, `${path}.dossierId`);
  optionalId(item, 'questionId', path);
  optionalId(item, 'scenarioId', path);
  text(item.description, `${path}.description`, true);
  choice(
    item.status,
    ['open', 'action_required', 'risk_accepted', 'resolved', 'closed'],
    `${path}.status`,
  );
  for (const key of ['observationIds', 'evidenceIds', 'topicIds', 'legalIds'])
    strings(item[key], `${path}.${key}`);
  text(item.decisionBy, `${path}.decisionBy`);
  text(item.decisionNote, `${path}.decisionNote`);
  if (['risk_accepted', 'resolved', 'closed'].includes(item.status as string)) {
    text(item.decisionBy, `${path}.decisionBy`, true);
    text(item.decisionNote, `${path}.decisionNote`, true);
  }
}
function topic(value: unknown, path: string): void {
  const item = baseRecord(value, path, ['title', 'category', 'description', 'aliases']);
  text(item.title, `${path}.title`, true);
  text(item.category, `${path}.category`);
  text(item.description, `${path}.description`);
  strings(item.aliases, `${path}.aliases`);
}
function legalRecord(value: unknown, path: string): void {
  const item = baseRecord(value, path, [
    'title',
    'officialUrl',
    'citation',
    'jurisdiction',
    'status',
    'effectiveOn',
    'lastVerifiedOn',
    'summary',
    'impact',
    'topicIds',
  ]);
  text(item.title, `${path}.title`, true);
  text(item.officialUrl, `${path}.officialUrl`, true);
  try {
    const url = new URL(item.officialUrl as string);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    fail(path, 'officiële verwijzing moet een http(s)-URL zijn.');
  }
  text(item.citation, `${path}.citation`);
  text(item.jurisdiction, `${path}.jurisdiction`, true);
  choice(
    item.status,
    ['signal', 'published', 'effective', 'superseded', 'withdrawn'],
    `${path}.status`,
  );
  date(item.effectiveOn, `${path}.effectiveOn`, true);
  date(item.lastVerifiedOn, `${path}.lastVerifiedOn`);
  text(item.summary, `${path}.summary`, true);
  text(item.impact, `${path}.impact`);
  strings(item.topicIds, `${path}.topicIds`);
}
function investigation(value: unknown, path: string): void {
  const item = baseRecord(value, path, [
    'title',
    'incidentId',
    'method',
    'methodVersion',
    'status',
    'facts',
    'whyChain',
    'topEvent',
    'threats',
    'preventiveBarriers',
    'recoveryBarriers',
    'consequences',
    'basisRiskFactors',
    'evidenceIds',
    'actionIds',
    'conclusion',
    'reviewedBy',
    'reviewNote',
  ]);
  text(item.title, `${path}.title`, true);
  id(item.incidentId, `${path}.incidentId`);
  choice(item.method, ['five_whys', 'bow_tie'], `${path}.method`);
  text(item.methodVersion, `${path}.methodVersion`, true);
  choice(item.status, ['draft', 'reviewed'], `${path}.status`);
  for (const key of ['facts', 'topEvent', 'conclusion', 'reviewedBy', 'reviewNote'])
    text(item[key], `${path}.${key}`);
  for (const key of [
    'whyChain',
    'threats',
    'preventiveBarriers',
    'recoveryBarriers',
    'consequences',
    'basisRiskFactors',
    'evidenceIds',
    'actionIds',
  ])
    strings(item[key], `${path}.${key}`);
  if (item.status === 'reviewed') {
    for (const key of ['facts', 'conclusion', 'reviewedBy', 'reviewNote'])
      text(item[key], `${path}.${key}`, true);
    if (!(item.evidenceIds as string[]).length)
      fail(path, 'een beoordeeld onderzoek vraagt gekoppeld bewijs.');
    if (item.method === 'five_whys' && !(item.whyChain as string[]).length)
      fail(path, 'de waaromketen ontbreekt.');
    if (item.method === 'bow_tie') {
      text(item.topEvent, `${path}.topEvent`, true);
      if (!(item.threats as string[]).length || !(item.consequences as string[]).length)
        fail(path, 'BowTie vraagt oorzaken en gevolgen.');
    }
  }
}
function exposure(value: unknown, path: string): void {
  const item = baseRecord(value, path, ['period', 'hoursWorked', 'departmentId', 'source']);
  text(item.period, `${path}.period`, true, 7);
  date(`${item.period}-01`, `${path}.period`);
  number(item.hoursWorked, `${path}.hoursWorked`, 0, 1_000_000_000);
  text(item.departmentId, `${path}.departmentId`, false, 160);
  text(item.source, `${path}.source`, true);
}

function relations(workspace: WorkspaceState): void {
  const lookup = (items: { id: string }[] | undefined) => new Set(items?.map((item) => item.id));
  const dossiers = new Map(workspace.dossiers?.map((d) => [d.id, d]));
  const evidence = new Map(workspace.evidence?.map((e) => [e.id, e]));
  const organisations = lookup(workspace.organisations),
    sites = lookup(workspace.sites),
    departments = lookup(workspace.departments),
    scenarios = lookup(workspace.scenarios),
    findings = lookup(workspace.findings),
    observations = lookup(workspace.observations),
    topics = lookup(workspace.topics),
    legal = lookup(workspace.legalRecords),
    actions = lookup(workspace.actions),
    incidents = lookup(workspace.incidents);
  const ref = (value: string | undefined, ids: Set<string>, path: string) => {
    if (value !== undefined && !ids.has(value)) fail(path, 'verwijzing bestaat niet.');
  };
  const refs = (values: string[] | undefined, ids: Set<string>, path: string) =>
    values?.forEach((value) => ref(value, ids, path));
  const dossierIds = new Set(dossiers.keys()),
    evidenceIds = new Set(evidence.keys());
  const departmentInDossier = (
    departmentId: string | undefined,
    dossierId: string | undefined,
    path: string,
  ) => {
    ref(departmentId, departments, path);
    const dossier = dossierId ? dossiers.get(dossierId) : undefined;
    if (!departmentId || !dossier) return;
    if (dossier.departmentIds.length && !dossier.departmentIds.includes(departmentId))
      fail(path, 'afdeling valt buiten de dossierscope.');
    const dep = workspace.departments?.find((d) => d.id === departmentId);
    const site = workspace.sites?.find((s) => s.id === dep?.siteId);
    if (dossier.organisationId && site?.organisationId !== dossier.organisationId)
      fail(path, 'afdeling valt buiten de dossierorganisatie.');
  };
  const scenarioInDossier = (
    scenarioId: string | undefined,
    dossierId: string | undefined,
    path: string,
  ) => {
    ref(scenarioId, scenarios, path);
    const scenario = workspace.scenarios.find((s) => s.id === scenarioId);
    if (scenario?.dossierId && scenario.dossierId !== dossierId)
      fail(path, 'scenario hoort bij een ander dossier.');
  };
  workspace.sites?.forEach((s) => ref(s.organisationId, organisations, 'Locatie.organisatie'));
  workspace.departments?.forEach((d) => ref(d.siteId, sites, 'Afdeling.locatie'));
  workspace.dossiers?.forEach((d) => {
    ref(d.organisationId, organisations, 'Dossier.organisatie');
    refs(d.departmentIds, departments, 'Dossier.afdelingen');
    if (d.organisationId)
      for (const departmentId of d.departmentIds) {
        const dep = workspace.departments?.find((entry) => entry.id === departmentId);
        const site = workspace.sites?.find((entry) => entry.id === dep?.siteId);
        if (site?.organisationId !== d.organisationId)
          fail('Dossier', 'afdeling valt buiten de gekozen organisatie.');
      }
  });
  const evidenceInDossier = (
    ids: string[] | undefined,
    dossierId: string | undefined,
    path: string,
  ) => {
    refs(ids, evidenceIds, path);
    ids?.forEach((e) => {
      const record = evidence.get(e);
      if (record?.dossierId && dossierId && record.dossierId !== dossierId)
        fail(path, 'bewijs hoort bij een ander dossier.');
    });
  };
  const pairs = new Set<string>();
  workspace.answers.forEach((a) => {
    ref(a.dossierId, dossierIds, 'Antwoord.dossier');
    evidenceInDossier(a.evidenceIds, a.dossierId, 'Antwoord.bewijs');
    const key = JSON.stringify([a.dossierId ?? null, a.questionId]);
    if (pairs.has(key))
      fail('Antwoorden', 'dezelfde vraag heeft meerdere antwoorden binnen één dossier.');
    pairs.add(key);
    if (a.dossierId) {
      const q = dossiers.get(a.dossierId)?.questions.find((q) => q.id === a.questionId);
      if (!q || a.questionSha256 !== q.sha256 || a.questionSnapshot !== q.prompt)
        fail('Antwoord', 'antwoord hoort niet bij de bevroren dossiervraag.');
    }
  });
  workspace.scenarios.forEach((s) => {
    ref(s.dossierId, dossierIds, 'Scenario.dossier');
    departmentInDossier(s.departmentId, s.dossierId, 'Scenario.afdeling');
  });
  workspace.evidence?.forEach((e) => ref(e.dossierId, dossierIds, 'Bewijs.dossier'));
  workspace.observations?.forEach((o) => {
    ref(o.dossierId, dossierIds, 'Waarneming.dossier');
    departmentInDossier(o.departmentId, o.dossierId, 'Waarneming.afdeling');
    evidenceInDossier(o.evidenceIds, o.dossierId, 'Waarneming.bewijs');
  });
  workspace.findings?.forEach((f) => {
    ref(f.dossierId, dossierIds, 'Bevinding.dossier');
    scenarioInDossier(f.scenarioId, f.dossierId, 'Bevinding.scenario');
    evidenceInDossier(f.evidenceIds, f.dossierId, 'Bevinding.bewijs');
    refs(f.observationIds, observations, 'Bevinding.waarnemingen');
    refs(f.topicIds, topics, 'Bevinding.onderwerpen');
    refs(f.legalIds, legal, 'Bevinding.regelgeving');
    if (f.questionId && !dossiers.get(f.dossierId)?.questions.some((q) => q.id === f.questionId))
      fail('Bevinding', 'vraag valt buiten het dossier.');
    f.observationIds.forEach((id) => {
      if (workspace.observations?.find((o) => o.id === id)?.dossierId !== f.dossierId)
        fail('Bevinding', 'waarneming hoort bij een ander dossier.');
    });
    if (
      ['resolved', 'closed'].includes(f.status) &&
      !f.evidenceIds.some((id) => evidence.get(id)?.status === 'verified')
    )
      fail('Bevinding', 'oplossen/afsluiten vraagt geverifieerd bewijs.');
  });
  workspace.actions.forEach((a) => {
    ref(a.dossierId, dossierIds, 'Actie.dossier');
    scenarioInDossier(a.scenarioId, a.dossierId, 'Actie.scenario');
    ref(a.findingId, findings, 'Actie.bevinding');
    evidenceInDossier(a.evidenceIds, a.dossierId, 'Actie.bewijs');
    if (
      a.findingId &&
      workspace.findings?.find((f) => f.id === a.findingId)?.dossierId !== a.dossierId
    )
      fail('Actie', 'bevinding en actie horen bij verschillende dossiers.');
  });
  workspace.legalRecords?.forEach((l) => refs(l.topicIds, topics, 'Regelgeving.onderwerpen'));
  workspace.investigations?.forEach((i) => {
    ref(i.incidentId, incidents, 'Onderzoek.incident');
    refs(i.evidenceIds, evidenceIds, 'Onderzoek.bewijs');
    refs(i.actionIds, actions, 'Onderzoek.acties');
  });
  workspace.incidents.forEach((i) => ref(i.departmentId, departments, 'Incident.afdeling'));
  const periods = new Set<string>();
  workspace.exposure?.forEach((e) => {
    if (e.departmentId) ref(e.departmentId, departments, 'Blootstelling.afdeling');
    const key = JSON.stringify([e.period, e.departmentId]);
    if (periods.has(key))
      fail('Blootstelling', 'dubbele maand binnen dezelfde scope; werk het bestaande record bij.');
    periods.add(key);
  });
}

function genericRecord(value: unknown, path: string): void {
  id(object(value, path).id, `${path}.id`);
}

function question(value: unknown, path: string): void {
  const item = object(value, path);
  id(item.id, `${path}.id`);
  id(item.themeId, `${path}.themeId`);
  text(item.prompt, `${path}.prompt`, true);
  text(item.assessmentGuidance, `${path}.assessmentGuidance`);
  strings(item.evidenceHints, `${path}.evidenceHints`);
  strings(item.sourceIds, `${path}.sourceIds`);
  strings(item.roles, `${path}.roles`);
  if (item.legalReferences !== undefined) text(item.legalReferences, `${path}.legalReferences`);
  list(
    item.suggestedHierarchy,
    `${path}.suggestedHierarchy`,
    (value, itemPath) =>
      choice(value, ['eliminate', 'source', 'collective', 'individual', 'ppe'], itemPath),
    false,
  );
}

export function validateWorkspace(value: unknown): asserts value is WorkspaceState {
  jsonSafety(value);
  const item = object(value, 'Werkruimte', [
    'schemaVersion',
    'id',
    'name',
    'createdAt',
    'updatedAt',
    'revision',
    'deviceId',
    'scenarios',
    'questions',
    'answers',
    'actions',
    'incidents',
    'sources',
    'organisations',
    'sites',
    'departments',
    'dossiers',
    'evidence',
    'observations',
    'findings',
    'topics',
    'legalRecords',
    'investigations',
    'exposure',
    'contentRecords',
  ]);
  if (item.schemaVersion !== 1)
    fail('Werkruimte', 'niet-ondersteunde schemaversie; verwacht versie 1.');
  id(item.id, 'Werkruimte.id');
  id(item.deviceId, 'Werkruimte.deviceId');
  text(item.name, 'Werkruimte.name', true, 1_000);
  timestamp(item.createdAt, 'Werkruimte.createdAt');
  timestamp(item.updatedAt, 'Werkruimte.updatedAt');
  number(item.revision, 'Werkruimte.revision', 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(item.revision)) fail('Werkruimte.revision', 'geheel getal verwacht.');
  list(item.scenarios, 'Scenario’s', scenario);
  list(item.questions, 'Vragen', question);
  list(item.answers, 'Antwoorden', answer);
  list(item.actions, 'Acties', action);
  list(item.incidents, 'Incidenten', incident);
  list(item.sources, 'Bronnen', genericRecord);
  const extra: Record<string, (value: unknown, path: string) => void> = {
    organisations: organisation,
    sites: site,
    departments: department,
    dossiers: dossier,
    evidence,
    observations: observation,
    findings: finding,
    topics: topic,
    legalRecords: legalRecord,
    investigations: investigation,
    exposure,
  };
  for (const [key, validator] of Object.entries(extra))
    if (item[key] !== undefined) list(item[key], key, validator);
  if (item.contentRecords !== undefined) list(item.contentRecords, 'Contentrecords', genericRecord);
  relations(item as unknown as WorkspaceState);
}

export function importWorkspace(input: string): WorkspaceState {
  if (
    typeof input !== 'string' ||
    input.length > MAX_WORKSPACE_BYTES ||
    new TextEncoder().encode(input).byteLength > MAX_WORKSPACE_BYTES
  ) {
    fail('Werkruimte', `bestand groter dan ${MAX_WORKSPACE_BYTES} bytes.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    fail('Werkruimte', 'ongeldig JSON-bestand.');
  }
  validateWorkspace(parsed);
  return parsed;
}

export function exportWorkspace(workspace: WorkspaceState): string {
  validateWorkspace(workspace);
  const result = JSON.stringify(workspace, null, 2) + '\n';
  if (new TextEncoder().encode(result).byteLength > MAX_WORKSPACE_BYTES) {
    fail('Werkruimte', `bestand groter dan ${MAX_WORKSPACE_BYTES} bytes.`);
  }
  return result;
}
