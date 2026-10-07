import type { WorkspaceState } from './model';
import type { Scenario } from '../domain/types';
import { evaluateRisk } from '../domain/risk';

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
  ]);
  id(item.id, `${path}.id`);
  text(item.title, `${path}.title`, true, 1_000);
  date(item.date, `${path}.date`);
  text(item.department, `${path}.department`);
  choice(item.type, ['incident', 'near_miss', 'observation'], `${path}.type`);
  text(item.description, `${path}.description`);
  if (item.scenarioId !== undefined) text(item.scenarioId, `${path}.scenarioId`, false, 160);
  strings(item.actionIds, `${path}.actionIds`);
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
