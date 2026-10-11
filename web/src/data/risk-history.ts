import { sha256 } from '@noble/hashes/sha2.js';
import { evaluateRisk, RISK_METHOD_VERSION } from '../domain/risk';
import type { Estimate, LopaResult, Scenario } from '../domain/types';
import type { Evidence } from './dossier';
import type { FrozenRiskEvidenceBasis, RiskEvidenceContext } from '../domain/risk-evidence-types';
import {
  EVIDENCE_RISK_METHOD_VERSION,
  assertFrozenRiskEvidenceBasis,
  evaluateFrozenRisk,
  freezeRiskEvidenceBasis,
} from './risk-evidence';

export interface RiskAssessment {
  id: string;
  scenarioId: string;
  recordedAt: string;
  assessor: string;
  rationale: string;
  methodVersion: string;
  input: Scenario;
  /** Present only for the evidence-aware method; old records are never upgraded. */
  evidenceBasis?: FrozenRiskEvidenceBasis;
  result: {
    current: Estimate;
    target: Estimate;
    currentCredited: string[];
    targetCredited: string[];
    lopaFrequency?: Estimate;
    lopaComparison?: LopaResult['comparison'];
    lopaCreditedLayers?: string[];
    lopaCreditedModifiers?: string[];
  };
  sha256: string;
}
function canonical(value: unknown): string {
  function order(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(order);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, order(v)]),
      );
    return item;
  }
  return JSON.stringify(order(value));
}
export function riskAssessmentHash(
  record: Omit<RiskAssessment, 'sha256'> | RiskAssessment,
): string {
  const { sha256: _hash, ...artifact } = record as RiskAssessment;
  return Array.from(sha256(new TextEncoder().encode(canonical(artifact))))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export function riskAssessmentResult(
  input: Scenario,
  evidenceBasis?: FrozenRiskEvidenceBasis,
): RiskAssessment['result'] {
  const r = evidenceBasis ? evaluateFrozenRisk(input, evidenceBasis) : evaluateRisk(input);
  return {
    current: r.current.score,
    target: r.target.score,
    currentCredited: r.current.creditedControlIds,
    targetCredited: r.target.creditedControlIds,
    ...(r.lopa
      ? {
          lopaFrequency: r.lopa.frequency,
          lopaComparison: r.lopa.comparison,
          ...(evidenceBasis
            ? {
                lopaCreditedLayers: r.lopa.creditedLayerIds,
                lopaCreditedModifiers: r.lopa.creditedModifierIds,
              }
            : {}),
        }
      : {}),
  };
}
export function captureRiskAssessment(
  input: Scenario,
  assessor: string,
  rationale: string,
  evidence?: readonly Evidence[],
  context?: RiskEvidenceContext,
): RiskAssessment {
  if (!assessor.trim() || !rationale.trim())
    throw new Error('Leg beoordelaar en onderbouwing vast.');
  const copy: Scenario = JSON.parse(JSON.stringify(input));
  const evidenceBasis =
    evidence !== undefined ? freezeRiskEvidenceBasis(copy, evidence, context) : undefined;
  const artifact = {
    id: crypto.randomUUID(),
    scenarioId: copy.id,
    recordedAt: new Date().toISOString(),
    assessor: assessor.trim(),
    rationale: rationale.trim(),
    methodVersion: evidenceBasis ? EVIDENCE_RISK_METHOD_VERSION : RISK_METHOD_VERSION,
    input: copy,
    ...(evidenceBasis ? { evidenceBasis } : {}),
    result: riskAssessmentResult(copy, evidenceBasis),
  };
  return { ...artifact, sha256: riskAssessmentHash(artifact) };
}
/** Explicit native route; the three-argument legacy function remains byte compatible. */
export function captureEvidenceRiskAssessment(
  input: Scenario,
  assessor: string,
  rationale: string,
  evidence: readonly Evidence[] = [],
  context?: RiskEvidenceContext,
): RiskAssessment {
  return captureRiskAssessment(input, assessor, rationale, evidence, context);
}
export function isSupportedRiskMethod(version: string): boolean {
  return version === RISK_METHOD_VERSION || version === EVIDENCE_RISK_METHOD_VERSION;
}
/** Native edits append checkpoints; replacing or trimming a prior record is never implicit. */
export function assertRiskAssessmentUpdate(
  previous: readonly RiskAssessment[],
  next: readonly RiskAssessment[],
): void {
  const records = new Map(next.map((record) => [record.id, record]));
  if (records.size !== next.length) throw new Error('Beoordelingsmomenten bevatten dubbele IDs.');
  for (const record of previous) {
    const found = records.get(record.id);
    if (!found || canonical(found) !== canonical(record))
      throw new Error(
        'Een vastgelegd beoordelingsmoment blijft exact behouden; voeg een nieuwe beoordeling toe.',
      );
  }
}
export function assertRiskAssessment(record: RiskAssessment): void {
  if (record.input.id !== record.scenarioId)
    throw new Error('De historische invoer hoort bij een ander scenario.');
  if (record.sha256 !== riskAssessmentHash(record))
    throw new Error('De risicobeoordeling wijkt af van haar bronhash.');
  if (record.methodVersion === EVIDENCE_RISK_METHOD_VERSION) {
    if (!record.evidenceBasis)
      throw new Error('De bewijsbewuste beoordeling mist haar bevroren bewijsbasis.');
    assertFrozenRiskEvidenceBasis(record.evidenceBasis, record.input);
  }
  if (record.methodVersion === RISK_METHOD_VERSION && record.evidenceBasis !== undefined)
    throw new Error(
      'Een oude risicobeoordeling mag niet stil naar een nieuwe bewijsbasis worden opgewaardeerd.',
    );
  if (
    isSupportedRiskMethod(record.methodVersion) &&
    canonical(record.result) !== canonical(riskAssessmentResult(record.input, record.evidenceBasis))
  )
    throw new Error('De historische uitkomst past niet bij de vastgelegde invoer en methode.');
}
