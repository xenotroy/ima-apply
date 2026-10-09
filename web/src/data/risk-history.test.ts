import { describe, it, expect } from 'vitest';
import { captureRiskAssessment, riskAssessmentHash } from './risk-history';
import { createWorkspace } from './model';
import { exportWorkspace, importWorkspace } from './validation';
import type { Scenario } from '../domain/types';

const input: Scenario = {
  id: 'history-scenario',
  title: 'Fictief valgevaar',
  description: 'Historische invoer',
  department: 'Werkplaats',
  hazard: 'Open rand',
  consequence: 'Ernstig letsel',
  probability: 6,
  exposure: 6,
  effect: 15,
  controls: [],
};
function fixture() {
  const scenario = structuredClone(input);
  return createWorkspace('Test', {
    scenarios: [scenario],
    riskAssessments: [
      captureRiskAssessment(scenario, 'Beoordelaar', 'Vastgelegde uitgangssituatie'),
    ],
  });
}

describe('deliberate risk-assessment checkpoints', () => {
  it('preserves complete historical input and score after the active scenario changes', () => {
    const w = fixture();
    w.scenarios[0].probability = 1;
    w.scenarios[0].description = 'Nieuwe situatie';
    const restored = importWorkspace(exportWorkspace(w));
    expect(restored.riskAssessments![0].input.probability).toBe(6);
    expect(restored.riskAssessments![0].input.description).toBe('Historische invoer');
    expect(restored.riskAssessments![0].result.current.value).toBe(540);
    expect(restored.scenarios[0].probability).toBe(1);
  });
  it('requires an explicit assessor and rationale instead of inventing a review', () => {
    expect(() => captureRiskAssessment(input, '', 'Basis')).toThrow(/beoordelaar/);
    expect(() => captureRiskAssessment(input, 'Beoordelaar', '')).toThrow(/onderbouwing/);
  });
  it('detects changed historical input, including a control added afterwards', () => {
    const w = fixture();
    w.riskAssessments![0].input.consequence = 'Gewijzigd';
    expect(() => exportWorkspace(w)).toThrow(/bronhash/);
  });
  it('recomputes the known method so a rehashed fabricated result remains invalid', () => {
    const w = fixture(),
      record = w.riskAssessments![0];
    record.result.current.value = 0;
    record.result.current.min = 0;
    record.result.current.max = 0;
    record.sha256 = riskAssessmentHash(record);
    expect(() => exportWorkspace(w)).toThrow(/uitkomst past niet/);
  });
  it('rejects missing scenario references and mismatched historical identities', () => {
    const w = fixture();
    w.scenarios = [];
    expect(() => exportWorkspace(w)).toThrow(/verwijzing bestaat niet/);
    const other = fixture(),
      record = other.riskAssessments![0];
    record.input.id = 'other';
    record.sha256 = riskAssessmentHash(record);
    expect(() => exportWorkspace(other)).toThrow(/ander scenario/);
  });
});
