import { sha256 } from '@noble/hashes/sha2.js';
import { evaluateRisk, RISK_METHOD_VERSION } from '../domain/risk';
import type { Estimate, LopaResult, Scenario } from '../domain/types';

export interface RiskAssessment {
  id: string;
  scenarioId: string;
  recordedAt: string;
  assessor: string;
  rationale: string;
  methodVersion: string;
  input: Scenario;
  result: {
    current: Estimate;
    target: Estimate;
    currentCredited: string[];
    targetCredited: string[];
    lopaFrequency?: Estimate;
    lopaComparison?: LopaResult['comparison'];
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
export function riskAssessmentResult(input: Scenario): RiskAssessment['result'] {
  const r = evaluateRisk(input);
  return {
    current: r.current.score,
    target: r.target.score,
    currentCredited: r.current.creditedControlIds,
    targetCredited: r.target.creditedControlIds,
    ...(r.lopa ? { lopaFrequency: r.lopa.frequency, lopaComparison: r.lopa.comparison } : {}),
  };
}
export function captureRiskAssessment(
  input: Scenario,
  assessor: string,
  rationale: string,
): RiskAssessment {
  if (!assessor.trim() || !rationale.trim())
    throw new Error('Leg beoordelaar en onderbouwing vast.');
  const copy: Scenario = JSON.parse(JSON.stringify(input));
  const artifact = {
    id: crypto.randomUUID(),
    scenarioId: copy.id,
    recordedAt: new Date().toISOString(),
    assessor: assessor.trim(),
    rationale: rationale.trim(),
    methodVersion: RISK_METHOD_VERSION,
    input: copy,
    result: riskAssessmentResult(copy),
  };
  return { ...artifact, sha256: riskAssessmentHash(artifact) };
}
export function assertRiskAssessment(record: RiskAssessment): void {
  if (record.input.id !== record.scenarioId)
    throw new Error('De historische invoer hoort bij een ander scenario.');
  if (record.sha256 !== riskAssessmentHash(record))
    throw new Error('De risicobeoordeling wijkt af van haar bronhash.');
  if (
    record.methodVersion === RISK_METHOD_VERSION &&
    canonical(record.result) !== canonical(riskAssessmentResult(record.input))
  )
    throw new Error('De historische uitkomst past niet bij de vastgelegde invoer en methode.');
}
