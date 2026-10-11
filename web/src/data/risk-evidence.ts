import { sha256 } from '@noble/hashes/sha2.js';
import { evaluateRisk } from '../domain/risk';
import type { Control, LopaLayer, LopaModifier, RiskEvaluation, Scenario } from '../domain/types';
import type {
  EvidenceBinding,
  FrozenRiskEvidenceBasis,
  RiskEvidenceReview,
  RiskEvidenceContext,
  RiskSubjectContext,
  RiskTarget,
  RiskTargetKind,
  RiskTargetReference,
} from '../domain/risk-evidence-types';
import type { Evidence } from './dossier';
import { evidenceHash } from './frozen';
import {
  assertEvidenceFile,
  assertEvidenceFileCheck,
  assertEvidenceFileFields,
  DEFAULT_EVIDENCE_FILE_SESSION,
  evidenceFileBindingHash,
  evidenceFileIntegrityReady,
  getEvidenceFileSessionId,
} from './evidence-files';

export type * from '../domain/risk-evidence-types';
export const EVIDENCE_RISK_METHOD_VERSION = 'ima-risk/2.1.0';
type ReviewedTarget = RiskTarget & { evidenceReview?: RiskEvidenceReview };

export type EvidenceCurrentStatus =
  'current' | 'changed' | 'missing' | 'unverified' | 'scope-mismatch' | 'integrity-unconfirmed';
export interface EvidenceCurrentValidity {
  status: EvidenceCurrentStatus;
  reason: string;
}
export interface RiskEvidenceIssue {
  kind: RiskTargetKind;
  targetId: string;
  title: string;
  reason: string;
}

export function canonicalRiskEvidenceJson(value: unknown): string {
  function order(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(order);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, v]) => [key, order(v)]),
      );
    return item;
  }
  return JSON.stringify(order(value));
}
function digest(value: unknown): string {
  return Array.from(sha256(new TextEncoder().encode(canonicalRiskEvidenceJson(value))))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function object(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name}: object vereist.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key)))
    throw new Error(`${name}: onbekend veld.`);
  return record;
}
function required(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}: tekst vereist.`);
}
function hash(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new Error(`${name}: SHA256 vereist.`);
}
function instant(value: unknown, name: string): asserts value is string {
  required(value, name);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    throw new Error(`${name}: geldig tijdstip met tijdzone vereist.`);
}

/** Unlike evidenceHash, this identifies the human-reviewed substantive version too. */
export function evidenceVersionHash(evidence: Evidence): string {
  // A new operational recheck on another PC must not change the source version.
  const { fileCheck: _check, ...substantive } = evidence;
  return digest({ schema: 'ima.evidence-version/v1', evidence: substantive });
}

export function assertRiskEvidenceSnapshot(value: unknown): asserts value is Evidence {
  const item = object(
    value,
    [
      'id',
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
      'capturedBy',
      'file',
      'fileCheck',
      'verifiedFileBindingSha256',
    ],
    'Bewijssnapshot',
  );
  for (const key of ['id', 'title', 'description']) required(item[key], `Bewijssnapshot.${key}`);
  if (typeof item.reference !== 'string') throw new Error('Bewijssnapshot: verwijzing vereist.');
  if (item.dossierId !== undefined) required(item.dossierId, 'Bewijssnapshot.dossierId');
  if (
    !['document', 'photograph', 'interview', 'measurement', 'record', 'other'].includes(
      String(item.kind),
    )
  )
    throw new Error('Bewijssnapshot: onbekende soort.');
  if (!['verified', 'unverified'].includes(String(item.status)))
    throw new Error('Bewijssnapshot: onbekende verificatiestatus.');
  instant(item.recordedAt, 'Bewijssnapshot.recordedAt');
  for (const key of ['verifiedBy', 'verificationNote', 'capturedBy'])
    if (item[key] !== undefined && typeof item[key] !== 'string')
      throw new Error(`Bewijssnapshot.${key}: tekst vereist.`);
  if (item.verifiedAt !== undefined) instant(item.verifiedAt, 'Bewijssnapshot.verifiedAt');
  if (item.verifiedContentSha256 !== undefined)
    hash(item.verifiedContentSha256, 'Bewijssnapshot.metadatahash');
  if (item.verifiedFileBindingSha256 !== undefined)
    hash(item.verifiedFileBindingSha256, 'Bewijssnapshot.bestandspin');
  const evidence = value as Evidence;
  assertEvidenceFileFields(evidence);
  if (evidence.verifiedFileBindingSha256 !== undefined && !evidence.file)
    throw new Error('Bewijssnapshot: een menselijke bestandspin vereist een bestandsbinding.');
  if (evidence.file !== undefined) assertEvidenceFile(evidence.file);
  if (evidence.fileCheck !== undefined) assertEvidenceFileCheck(evidence.fileCheck, evidence.file);
  if (evidence.status === 'verified') {
    required(evidence.verifiedBy, 'Bewijsverificateur');
    required(evidence.verificationNote, 'Bewijsverificatiebevinding');
    instant(evidence.verifiedAt, 'Bewijsverificatietijd');
    if (evidence.verifiedContentSha256 !== evidenceHash(evidence))
      throw new Error('Bewijssnapshot: gewijzigde metadata sinds menselijke verificatie.');
    if (evidence.file && evidence.verifiedFileBindingSha256 !== evidenceFileBindingHash(evidence))
      throw new Error('Bewijssnapshot: bestand niet door deze menselijke verificatie bevestigd.');
  }
}

function scopeMatches(evidence: Evidence, dossierId?: string): boolean {
  // Global documentation may be explicitly selected; dossier evidence never widens its scope.
  return evidence.dossierId === undefined || evidence.dossierId === dossierId;
}
function historicalFileReady(evidence: Evidence, context?: RiskEvidenceContext): boolean {
  if (!evidence.file) return true;
  const proof = context?.proofs.find(
    (item) =>
      item.evidenceId === evidence.id &&
      item.fileBindingSha256 === evidenceFileBindingHash(evidence),
  );
  if (!proof || proof.check.state !== 'match') return false;
  try {
    assertEvidenceFileCheck(proof.check, evidence.file);
  } catch {
    return false;
  }
  return (
    !evidence.file.storage ||
    (proof.check.method === 'github-private-blob' && proof.check.sourceState === 'unchanged')
  );
}
function evidenceValidity(
  snapshot: Evidence,
  evidence: readonly Evidence[],
  context?: RiskEvidenceContext,
  historical = false,
): EvidenceCurrentValidity {
  const found = evidence.find((item) => item.id === snapshot.id);
  if (!found) return { status: 'missing', reason: `Bewijs ${snapshot.id} ontbreekt.` };
  if (!scopeMatches(found, context?.dossierId ?? snapshot.dossierId))
    return { status: 'scope-mismatch', reason: `Bewijs ${found.id} hoort bij een ander dossier.` };
  if (found.status !== 'verified' || found.verifiedContentSha256 !== evidenceHash(found))
    return {
      status: 'unverified',
      reason: `Bewijs ${found.id} is ingetrokken, gewijzigd of niet geverifieerd.`,
    };
  if (evidenceVersionHash(found) !== evidenceVersionHash(snapshot))
    return {
      status: 'changed',
      reason: `Bewijs ${found.id} heeft een andere inhoudelijke of menselijke verificatieversie.`,
    };
  if (found.file && found.verifiedFileBindingSha256 !== evidenceFileBindingHash(found))
    return {
      status: 'unverified',
      reason: `Bestand van bewijs ${found.id} is niet inhoudelijk geverifieerd.`,
    };
  if (
    found.fileCheck &&
    (found.fileCheck.state !== 'match' ||
      ['changed', 'missing', 'inaccessible'].includes(found.fileCheck.sourceState ?? ''))
  )
    return {
      status: 'integrity-unconfirmed',
      reason: `De actuele bestandcontrole van bewijs ${found.id} meldt afwijking, intrekking of ontbrekende toegang.`,
    };
  if (
    !(historical ? historicalFileReady(found, context) : evidenceFileIntegrityReady(found, context))
  )
    return {
      status: 'integrity-unconfirmed',
      reason: `Bestand van bewijs ${found.id} is niet actueel bereikbaar en byte-exact bevestigd in deze sessie.`,
    };
  return { status: 'current', reason: 'Exacte geverifieerde bewijsversie is actueel.' };
}
export function evidenceCurrentStatus(
  snapshot: Evidence,
  evidence: readonly Evidence[],
  context?: RiskEvidenceContext,
): EvidenceCurrentValidity {
  return evidenceValidity(snapshot, evidence, context);
}

export function riskSubjectContext(scenario: Scenario, kind: RiskTargetKind): RiskSubjectContext {
  const {
    id,
    dossierId,
    departmentId,
    department,
    description,
    hazard,
    consequence,
    probability,
    exposure,
    effect,
  } = scenario;
  return clone({
    scenarioId: id,
    ...(dossierId !== undefined ? { dossierId } : {}),
    ...(departmentId !== undefined ? { departmentId } : {}),
    department,
    description,
    hazard,
    consequence,
    probability,
    exposure,
    effect,
    ...(kind !== 'control' && scenario.lopa
      ? {
          lopa: {
            initiatingEvent: scenario.lopa.initiatingEvent,
            initiatingFrequency: scenario.lopa.initiatingFrequency,
            frequencyEvidence: scenario.lopa.frequencyEvidence,
            consequence: scenario.lopa.consequence,
            targetFrequency: scenario.lopa.targetFrequency,
            assumptions: scenario.lopa.assumptions,
          },
        }
      : {}),
  });
}
function targetWithoutReview(target: ReviewedTarget): RiskTarget {
  const { evidenceReview: _review, ...fields } = target;
  return clone(fields) as RiskTarget;
}
function assertTargetContent(target: unknown, kind: RiskTargetKind): asserts target is RiskTarget {
  if (!['control', 'lopa-layer', 'lopa-modifier'].includes(kind))
    throw new Error('Onbekende risicodoelsoort.');
  const item = object(
    target,
    kind === 'control' ? controlKeys : kind === 'lopa-layer' ? layerKeys : modifierKeys,
    'Risicodoel',
  );
  required(item.id, 'Risicodoel-ID');
  required(item.title, 'Risicodoeltitel');
  for (const key of [
    'evidenceNote',
    ...(kind === 'lopa-layer' ? ['independenceNote'] : ['rationale']),
  ])
    if (typeof item[key] !== 'string') throw new Error(`Risicodoel.${key}: tekst vereist.`);
  if (!['verified', 'unverified', 'unknown'].includes(String(item.evidence)))
    throw new Error('Risicodoel: onbekende bewijsstatus.');
  if (kind !== 'lopa-modifier' && !['existing', 'planned', 'retired'].includes(String(item.status)))
    throw new Error('Risicodoel: onbekende uitvoeringsstatus.');
  if (kind === 'lopa-modifier' && !['enabling', 'conditional'].includes(String(item.kind)))
    throw new Error('Risicodoel: onbekende modifiergroep.');
  for (const key of [
    'independent',
    ...(kind === 'control'
      ? ['legalRequired']
      : kind === 'lopa-layer'
        ? ['specific', 'independentOfInitiator', 'auditable', 'effective']
        : []),
  ])
    if (typeof item[key] !== 'boolean') throw new Error(`Risicodoel.${key}: boolean vereist.`);
  if (item.dependencyGroup !== undefined && typeof item.dependencyGroup !== 'string')
    throw new Error('Risicodoel: ongeldige afhankelijkheidsgroep.');
  if (item.evidenceReview !== undefined) assertRiskEvidenceReview(item.evidenceReview);
}
export function riskSubjectBasisHash(
  scenario: Scenario,
  kind: RiskTargetKind,
  target: RiskTarget,
): string {
  return digest({
    schema: 'ima.risk-subject-basis/v1',
    kind,
    context: riskSubjectContext(scenario, kind),
    target: targetWithoutReview(target),
  });
}
export function assertRiskEvidenceReview(value: unknown): asserts value is RiskEvidenceReview {
  const item = object(
    value,
    ['schema', 'reviewedBy', 'reviewedAt', 'rationale', 'subjectBasisSha256', 'bindings'],
    'Maatregelbewijsreview',
  );
  if (item.schema !== 'ima.risk-evidence-review/v1')
    throw new Error('Maatregelbewijsreview: onbekend schema.');
  required(item.reviewedBy, 'Maatregelbeoordelaar');
  required(item.rationale, 'Lokale bewijsbetekenis');
  instant(item.reviewedAt, 'Maatregelbeoordelingstijd');
  hash(item.subjectBasisSha256, 'Maatregelbasis');
  if (!Array.isArray(item.bindings) || !item.bindings.length)
    throw new Error('Maatregelreview vereist minimaal één bewijsversie.');
  const ids = new Set<string>();
  for (const value of item.bindings) {
    const binding = object(
      value,
      ['evidenceId', 'metadataSha256', 'versionSha256', 'snapshot'],
      'Bewijsbinding',
    );
    required(binding.evidenceId, 'Bewijs-ID');
    hash(binding.metadataSha256, 'Bewijsmetadatahash');
    hash(binding.versionSha256, 'Bewijsversiehash');
    assertRiskEvidenceSnapshot(binding.snapshot);
    if (ids.has(binding.evidenceId)) throw new Error('Maatregelreview bevat dubbel bewijs.');
    ids.add(binding.evidenceId);
    if (
      binding.evidenceId !== binding.snapshot.id ||
      binding.metadataSha256 !== evidenceHash(binding.snapshot) ||
      binding.versionSha256 !== evidenceVersionHash(binding.snapshot)
    )
      throw new Error('Bewijsbinding wijkt af van haar exacte snapshot en hashes.');
    if (binding.snapshot.status !== 'verified')
      throw new Error('Maatregelreview vereist inhoudelijk geverifieerd bewijs.');
    if (Date.parse(binding.snapshot.verifiedAt!) > Date.parse(item.reviewedAt))
      throw new Error('Bewijsverificatie ligt na de maatregelreview.');
  }
}
export function captureRiskEvidenceReview(
  scenario: Scenario,
  kind: RiskTargetKind,
  target: RiskTarget,
  evidence: readonly Evidence[],
  reviewedBy: string,
  rationale: string,
  at = new Date().toISOString(),
): RiskEvidenceReview {
  assertTargetContent(target, kind);
  if (kind !== 'control' && !scenario.lopa)
    throw new Error('De gekozen IPL/modifier mist een LOPA-basis.');
  const bindings: EvidenceBinding[] = evidence.map((item) => {
    assertRiskEvidenceSnapshot(item);
    if (!scopeMatches(item, scenario.dossierId))
      throw new Error('Gekozen bewijs hoort bij een ander dossier.');
    return {
      evidenceId: item.id,
      metadataSha256: evidenceHash(item),
      versionSha256: evidenceVersionHash(item),
      snapshot: clone(item),
    };
  });
  const review: RiskEvidenceReview = {
    schema: 'ima.risk-evidence-review/v1',
    reviewedBy: reviewedBy.trim(),
    reviewedAt: at,
    rationale: rationale.trim(),
    subjectBasisSha256: riskSubjectBasisHash(scenario, kind, target),
    bindings,
  };
  assertRiskEvidenceReview(review);
  return review;
}

function targets(scenario: Scenario): { kind: RiskTargetKind; target: ReviewedTarget }[] {
  return [
    ...scenario.controls.map((target) => ({ kind: 'control' as const, target })),
    ...(scenario.lopa?.layers.map((target) => ({ kind: 'lopa-layer' as const, target })) ?? []),
    ...(scenario.lopa?.modifiers.map((target) => ({ kind: 'lopa-modifier' as const, target })) ??
      []),
  ];
}
function findTarget(
  scenario: Scenario,
  kind: RiskTargetKind,
  targetId: string,
): ReviewedTarget | undefined {
  return targets(scenario).find((entry) => entry.kind === kind && entry.target.id === targetId)
    ?.target;
}
function reviewIssue(
  scenario: Scenario,
  kind: RiskTargetKind,
  target: ReviewedTarget,
  evidence: readonly Evidence[],
  context?: RiskEvidenceContext,
  historical = false,
): string | undefined {
  if (
    kind === 'control' &&
    'status' in target &&
    target.status === 'planned' &&
    target.evidence === 'unverified' &&
    !target.evidenceReview
  )
    return undefined; // Honest forecast; physical engine enforces a zero conservative reduction.
  const review = target.evidenceReview;
  if (!review)
    return 'Geen gekoppelde bewijsversie en menselijke maatregelreview; actuele werking niet aangetoond.';
  try {
    assertRiskEvidenceReview(review);
  } catch (error) {
    return `Bewijsreview ongeldig: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (review.subjectBasisSha256 !== riskSubjectBasisHash(scenario, kind, target))
    return 'Mechanisme, inschaling of scenarioafbakening is gewijzigd sinds de bewijsreview.';
  for (const binding of review.bindings) {
    if (!scopeMatches(binding.snapshot, scenario.dossierId))
      return 'Gebonden bewijs hoort bij een ander dossier.';
    const validity = evidenceValidity(
      binding.snapshot,
      evidence,
      context ? { ...context, dossierId: scenario.dossierId } : undefined,
      historical,
    );
    if (validity.status !== 'current') return validity.reason;
  }
  return undefined;
}
function resolveEvidence(
  scenario: Scenario,
  evidence: readonly Evidence[] = [],
  context?: RiskEvidenceContext,
  historical = false,
): { scenario: Scenario; issues: RiskEvidenceIssue[] } {
  const effective = clone(scenario);
  const issues: RiskEvidenceIssue[] = [];
  for (const { kind, target } of targets(effective)) {
    // Retired/planned LOPA targets already receive physical-engine exclusions.
    if ('status' in target && target.status === 'retired') continue;
    const reason = reviewIssue(scenario, kind, target, evidence, context, historical);
    if (!reason) continue;
    issues.push({ kind, targetId: target.id, title: target.title, reason });
    target.evidence = 'unknown'; // Effective copy only; native records are never rewritten.
  }
  return { scenario: effective, issues };
}
export function resolveRiskEvidence(
  scenario: Scenario,
  evidence: readonly Evidence[] = [],
  context?: RiskEvidenceContext,
): { scenario: Scenario; issues: RiskEvidenceIssue[] } {
  return resolveEvidence(scenario, evidence, context);
}
export function applyRiskEvidenceIssues<
  T extends { excluded: { id: string; title: string; reason: string }[]; warnings: string[] },
>(result: T, issues: RiskEvidenceIssue[]): T {
  for (const issue of issues) {
    const existing = result.excluded.find((entry) => entry.id === issue.targetId);
    if (existing) existing.reason = issue.reason;
    else result.excluded.push({ id: issue.targetId, title: issue.title, reason: issue.reason });
    result.warnings.push(`${issue.title}: ${issue.reason}`);
  }
  if (issues.length)
    result.warnings.push(
      'Gekoppelde bewijsversies zijn niet actueel bevestigd; uitsluitingen veranderen de bronregistraties niet.',
    );
  return result;
}
function evaluateResolved(resolved: ReturnType<typeof resolveRiskEvidence>): RiskEvaluation {
  const result = evaluateRisk(resolved.scenario);
  const controlIssues = resolved.issues.filter((issue) => issue.kind === 'control');
  applyRiskEvidenceIssues(result.current, controlIssues);
  applyRiskEvidenceIssues(result.target, controlIssues);
  if (result.lopa)
    applyRiskEvidenceIssues(
      result.lopa,
      resolved.issues.filter((issue) => issue.kind !== 'control'),
    );
  return result;
}
export function evaluateWorkspaceRisk(
  scenario: Scenario,
  evidence: readonly Evidence[] = [],
  context?: RiskEvidenceContext,
): RiskEvaluation {
  return evaluateResolved(resolveRiskEvidence(scenario, evidence, context));
}

export function freezeRiskEvidenceBasis(
  scenario: Scenario,
  evidence: readonly Evidence[],
  context?: RiskEvidenceContext,
): FrozenRiskEvidenceBasis {
  const ids = new Set(
    targets(scenario).flatMap(
      ({ target }) => target.evidenceReview?.bindings.map((binding) => binding.evidenceId) ?? [],
    ),
  );
  const selected = evidence.filter((item) => ids.has(item.id));
  const found = new Set(selected.map((item) => item.id));
  return clone({
    schema: 'ima.risk-evidence-basis/v1',
    currentRecords: selected,
    missingIds: [...ids].filter((id) => !found.has(id)),
    fileChecks: (context?.proofs ?? DEFAULT_EVIDENCE_FILE_SESSION.proofs)
      .filter((proof) => {
        const record = selected.find((record) => record.id === proof.evidenceId);
        return (
          record?.file &&
          proof.fileBindingSha256 === evidenceFileBindingHash(record) &&
          proof.workspaceId === (context?.workspaceId ?? record.fileCheck?.workspaceId) &&
          proof.check.workspaceId === proof.workspaceId &&
          proof.check.sessionId === getEvidenceFileSessionId() &&
          (proof.check.state !== 'match' || evidenceFileIntegrityReady(record, context))
        );
      })
      .map(({ evidenceId, fileBindingSha256, check }) => {
        const { sessionId: _session, workspaceId: _workspace, ...observation } = check;
        return { evidenceId, fileBindingSha256, check: observation };
      }),
  });
}
export function assertFrozenRiskEvidenceBasis(
  value: unknown,
  scenario?: Scenario,
): asserts value is FrozenRiskEvidenceBasis {
  const item = object(
    value,
    ['schema', 'currentRecords', 'missingIds', 'fileChecks'],
    'Historische bewijsbasis',
  );
  if (item.schema !== 'ima.risk-evidence-basis/v1')
    throw new Error('Historische bewijsbasis: onbekend schema.');
  if (
    !Array.isArray(item.currentRecords) ||
    !Array.isArray(item.missingIds) ||
    !Array.isArray(item.fileChecks)
  )
    throw new Error('Historische bewijsbasis: lijsten vereist.');
  const ids = new Set<string>();
  for (const evidence of item.currentRecords) {
    assertRiskEvidenceSnapshot(evidence);
    if (ids.has(evidence.id)) throw new Error('Historische bewijsbasis bevat dubbel bewijs.');
    ids.add(evidence.id);
  }
  for (const id of item.missingIds) {
    required(id, 'Ontbrekend bewijs-ID');
    if (ids.has(id))
      throw new Error(
        'Historische bewijsbasis bevat een dubbele of tegelijk aanwezige en ontbrekende bewijs-ID.',
      );
    ids.add(id);
  }
  const checkedIds = new Set<string>();
  for (const value of item.fileChecks) {
    const check = object(
      value,
      ['evidenceId', 'fileBindingSha256', 'check'],
      'Historische bestandcontrole',
    );
    required(check.evidenceId, 'Bestandcontrole bewijs-ID');
    hash(check.fileBindingSha256, 'Bestandcontrole basis');
    const evidence = item.currentRecords.find((record) => record.id === check.evidenceId) as
      Evidence | undefined;
    if (!evidence?.file || checkedIds.has(check.evidenceId))
      throw new Error('Historische bestandcontrole hoort niet bij uniek vastgelegd bestandbewijs.');
    checkedIds.add(check.evidenceId);
    if (check.fileBindingSha256 !== evidenceFileBindingHash(evidence))
      throw new Error('Historische bestandcontrole heeft een andere bestandsbasis.');
    assertEvidenceFileCheck(check.check, evidence.file);
  }
  if (scenario) {
    const needed = new Set(
      targets(scenario).flatMap(
        ({ target }) => target.evidenceReview?.bindings.map((binding) => binding.evidenceId) ?? [],
      ),
    );
    if (needed.size !== ids.size || [...needed].some((id) => !ids.has(id)))
      throw new Error(
        'Historische bewijsbasis bewaart niet precies de werkelijk gekoppelde bewijs-ID’s.',
      );
  }
}
function frozenContext(basis: FrozenRiskEvidenceBasis): RiskEvidenceContext {
  // Private calculation context. These observations never populate a live EvidenceFileSession.
  const workspaceId = 'ima-frozen-risk-evidence';
  return {
    workspaceId,
    proofs: basis.fileChecks.map((proof) => ({ ...clone(proof), workspaceId })),
  };
}
export function resolveFrozenRiskEvidence(
  scenario: Scenario,
  basis: FrozenRiskEvidenceBasis,
): ReturnType<typeof resolveRiskEvidence> {
  assertFrozenRiskEvidenceBasis(basis, scenario);
  return resolveEvidence(scenario, basis.currentRecords, frozenContext(basis), true);
}
export function evaluateFrozenRisk(
  scenario: Scenario,
  basis: FrozenRiskEvidenceBasis,
): RiskEvaluation {
  assertFrozenRiskEvidenceBasis(basis, scenario);
  return evaluateResolved(resolveFrozenRiskEvidence(scenario, basis));
}

const controlKeys = [
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
  'evidenceReview',
];
const layerKeys = [
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
  'evidenceReview',
];
const modifierKeys = [
  'id',
  'title',
  'kind',
  'probability',
  'evidence',
  'evidenceNote',
  'independent',
  'rationale',
  'dependencyGroup',
  'evidenceReview',
];
export function assertRiskTargetReference(value: unknown): asserts value is RiskTargetReference {
  const item = object(
    value,
    ['scenarioId', 'kind', 'targetId', 'targetSha256', 'snapshot'],
    'Actiemaatregelverwijzing',
  );
  required(item.scenarioId, 'Actiescenario-ID');
  required(item.targetId, 'Actiemaatregel-ID');
  hash(item.targetSha256, 'Actiemaatregelhash');
  if (!['control', 'lopa-layer', 'lopa-modifier'].includes(String(item.kind)))
    throw new Error('Actiemaatregel: onbekende soort.');
  const snapshot = object(item.snapshot, ['context', 'target'], 'Actiemaatregelsnapshot');
  const context = object(
    snapshot.context,
    [
      'scenarioId',
      'dossierId',
      'departmentId',
      'department',
      'description',
      'hazard',
      'consequence',
      'probability',
      'exposure',
      'effect',
      'lopa',
    ],
    'Actiescenariobasis',
  );
  assertTargetContent(snapshot.target, item.kind as RiskTargetKind);
  const target = snapshot.target as unknown as Record<string, unknown>;
  if (item.scenarioId !== context.scenarioId || item.targetId !== target.id)
    throw new Error('Actiemaatregelidentiteit past niet bij haar snapshot.');
  if (target.evidenceReview !== undefined) assertRiskEvidenceReview(target.evidenceReview);
  if (item.targetSha256 !== digest({ schema: 'ima.risk-target/v1', kind: item.kind, snapshot }))
    throw new Error('Actiemaatregel wijkt af van haar exacte versiehash.');
  const base = context as unknown as RiskSubjectContext;
  required(base.scenarioId, 'Actiescenariobasis.scenarioId');
  for (const key of ['department', 'description', 'hazard', 'consequence'] as const)
    if (typeof base[key] !== 'string') throw new Error('Actiescenariobasis bevat ongeldige tekst.');
  for (const key of ['dossierId', 'departmentId'] as const)
    if (base[key] !== undefined) required(base[key], `Actiescenariobasis.${key}`);
  for (const [key, maximum] of [
    ['probability', 10],
    ['exposure', 10],
    ['effect', 100],
  ] as const)
    if (
      typeof base[key] !== 'number' ||
      !Number.isFinite(base[key]) ||
      base[key] <= 0 ||
      base[key] > maximum
    )
      throw new Error(`Actiescenariobasis.${key}: factor buiten bereik.`);
  if (base.lopa !== undefined)
    object(
      base.lopa,
      [
        'initiatingEvent',
        'initiatingFrequency',
        'frequencyEvidence',
        'consequence',
        'targetFrequency',
        'assumptions',
      ],
      'Actie-LOPAbasis',
    );
  if (item.kind !== 'control' && !base.lopa)
    throw new Error('Actie-LOPAdoel mist zijn oorzaak-gevolgbasis.');
  const { lopa: _lopa, ...scope } = base;
  const scenario: Scenario = {
    id: base.scenarioId,
    title: 'Bevroren actiemaatregel',
    ...scope,
    controls: item.kind === 'control' ? [target as unknown as Control] : [],
    ...(base.lopa
      ? {
          lopa: {
            ...base.lopa,
            layers: item.kind === 'lopa-layer' ? [target as unknown as LopaLayer] : [],
            modifiers: item.kind === 'lopa-modifier' ? [target as unknown as LopaModifier] : [],
          },
        }
      : {}),
  };
  evaluateRisk(scenario);
}
export function captureRiskTargetReference(
  scenario: Scenario,
  kind: RiskTargetKind,
  targetId: string,
): RiskTargetReference {
  const target = findTarget(scenario, kind, targetId);
  if (!target) throw new Error('De gekozen specifieke maatregel/IPL/modifier bestaat niet.');
  const snapshot = { context: riskSubjectContext(scenario, kind), target: clone(target) };
  const reference: RiskTargetReference = {
    scenarioId: scenario.id,
    kind,
    targetId,
    targetSha256: digest({ schema: 'ima.risk-target/v1', kind, snapshot }),
    snapshot,
  };
  assertRiskTargetReference(reference);
  return reference;
}
export function riskTargetCurrentStatus(
  reference: RiskTargetReference,
  scenarios: readonly Scenario[],
): 'current' | 'changed' | 'missing' {
  const scenario = scenarios.find((item) => item.id === reference.scenarioId);
  if (!scenario || !findTarget(scenario, reference.kind, reference.targetId)) return 'missing';
  return captureRiskTargetReference(scenario, reference.kind, reference.targetId).targetSha256 ===
    reference.targetSha256
    ? 'current'
    : 'changed';
}

function evidenceChainMarkdown(scenario: Scenario, issues: RiskEvidenceIssue[]): string[] {
  return targets(scenario).flatMap(({ kind, target }) => {
    const review = target.evidenceReview;
    return [
      `Bewijsketen ${kind} ${target.id}: ${review ? `${review.reviewedBy} | ${review.reviewedAt} | ${review.rationale} | basis ${review.subjectBasisSha256}` : 'Geen gekoppelde menselijke bewijsreview'}`,
      ...(review?.bindings.map(
        (binding) =>
          `- Bewijs ${binding.evidenceId} | metadata SHA256 ${binding.metadataSha256} | versie SHA256 ${binding.versionSha256} | ${binding.snapshot.title} | ${binding.snapshot.reference}`,
      ) ?? []),
      ...issues
        .filter((issue) => issue.kind === kind && issue.targetId === target.id)
        .map((issue) => `- Geen actuele credit: ${issue.reason}`),
    ];
  });
}
export function riskEvidenceMarkdown(
  scenario: Scenario,
  evidence: readonly Evidence[],
  context?: RiskEvidenceContext,
): string[] {
  return evidenceChainMarkdown(scenario, resolveRiskEvidence(scenario, evidence, context).issues);
}
export function frozenRiskEvidenceMarkdown(
  scenario: Scenario,
  basis: FrozenRiskEvidenceBasis,
): string[] {
  const resolved = resolveFrozenRiskEvidence(scenario, basis);
  return [
    ...evidenceChainMarkdown(scenario, resolved.issues),
    ...basis.currentRecords.flatMap((record) => [
      `Vastgelegde actuele bron ${record.id}: ${record.title} | ${record.status} | versie SHA256 ${evidenceVersionHash(record)} | verificateur ${record.verifiedBy ?? 'Onbekend'} | ${record.verifiedAt ?? 'Niet geverifieerd'}`,
      `Broninhoud: ${record.description} | verwijzing ${record.reference}`,
    ]),
    ...basis.missingIds.map((id) => `Bron ontbrak bij deze beoordeling: ${id}`),
    ...basis.fileChecks.map(
      (proof) =>
        `Historische bytecontrole ${proof.evidenceId}: ${proof.check.state} | ${proof.check.checkedBy} | ${proof.check.checkedAt} | verwacht ${proof.check.expectedSha256} | waargenomen ${proof.check.observedSha256 ?? 'Niet beschikbaar'} | bronlocatie ${proof.check.sourceState ?? 'Niet gecontroleerd'}`,
    ),
  ];
}
