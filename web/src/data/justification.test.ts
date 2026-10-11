import { describe, expect, it } from 'vitest';
import type { Control, Scenario } from '../domain/types';
import { range, RISK_METHOD_VERSION } from '../domain/risk';
import { captureRiskAssessment, riskAssessmentHash } from './risk-history';
import { createWorkspace } from './model';
import { exportWorkspace, importWorkspace } from './validation';
import {
  assertJustification,
  captureJustification,
  justificationHash,
  justificationMarkdown,
  justificationResult,
  type JustificationDraft,
} from './justification';

function control(id: string, reduction: number, status: Control['status'] = 'planned'): Control {
  return {
    id,
    title: `Fictieve maatregel ${id}`,
    status,
    ahs: 'collective',
    evidence: 'verified',
    evidenceNote: 'Fictieve ontwerpverificatie; geen veldbewijs.',
    rationale: 'Eén afzonderlijk W-mechanisme.',
    probabilityReduction: range(reduction),
    exposureReduction: range(0),
    effectReduction: range(0),
    independent: true,
    feasibility: 'easy',
    effort: 2,
    legalRequired: false,
  };
}
function fixture() {
  const scenario: Scenario = {
    id: 'justification-scenario',
    title: 'Fictief machinecontact',
    description: 'Softwarefixture',
    department: 'Werkplaats',
    hazard: 'Bewegend onderdeel',
    consequence: 'Fataal letsel',
    probability: 6,
    exposure: 6,
    effect: 15,
    controls: [
      control('existing', 0.5, 'existing'),
      control('selected', 0.2),
      control('other', 0.8),
    ],
  };
  const assessment = captureRiskAssessment(
    scenario,
    'Risicobeoordelaar',
    'Bevroren softwarefixture.',
  );
  const draft: JustificationDraft = {
    selectionKind: 'control',
    controlIds: ['selected'],
    costBasis: 'Fictief: EUR, één jaar; CF 2/DC 3/kostendeler 2 volgens lokale schaal.',
    costFactor: 2,
    degreeOfCorrectionFactor: 3,
    kinneyCostDivisor: 2,
    decision: 'implement',
    assessor: 'Besluitbeoordelaar',
    rationale: 'Gekozen plan afzonderlijk uitvoeren en controleren.',
  };
  return { scenario, assessment, draft };
}

describe('frozen, measure-bound justification decisions', () => {
  it('attributes only selected marginal benefit, never the benefit of an unrelated plan', () => {
    const { assessment, draft } = fixture();
    const r = justificationResult(assessment, draft);
    expect(r.current.value).toBe(270);
    expect(r.selectedTarget.value).toBeCloseTo(216);
    expect(r.improvement.value).toBeCloseTo(54);
    expect(r.kinneyExpected).toBeCloseTo(27);
    expect(r.fine).toBe(45);
    expect(r.selectedCreditedControlIds).toEqual(['existing', 'selected']);
    expect(r.nominalScoreFraction).toBeCloseTo(0.2);
    expect(r.localPriorities).toHaveLength(1);
    expect(r.localPriorities[0].score).toBeCloseTo(50.625);
  });
  it('compares an explicitly selected portfolio rather than adding standalone priorities', () => {
    const { assessment, draft } = fixture();
    draft.selectionKind = 'portfolio';
    draft.controlIds = ['selected', 'other'];
    const r = justificationResult(assessment, draft);
    expect(r.selectedTarget.value).toBeCloseTo(43.2);
    expect(r.improvement.value).toBeCloseTo(226.8);
    expect(r.kinneyExpected).toBeCloseTo(113.4);
    expect(r.localPriorities).toHaveLength(2);
    expect(r.selectedCreditedControlIds).toEqual(['existing', 'selected', 'other']);
  });
  it('retains negative sensitivity differences instead of promising a conservative return', () => {
    const { scenario, draft } = fixture();
    scenario.controls[0].probabilityReduction = range(0.5, 0.4, 0.6);
    scenario.controls[1].probabilityReduction = range(0.2, 0.1, 0.3);
    const assessment = captureRiskAssessment(
      scenario,
      'Beoordelaar',
      'Expliciete gevoeligheidsgrenzen.',
    );
    const r = justificationResult(assessment, draft);
    expect(r.improvement.min).toBeCloseTo(-75.6);
    expect(r.improvement.value).toBeCloseTo(54);
    expect(r.improvement.max).toBeCloseTo(172.8);
    expect(r.kinneyExpected).toBeCloseTo(27);
    expect(r.kinneyConservative).toBeUndefined();
    expect(r.warnings.join(' ')).toContain('geen gegarandeerde opbrengst');
  });
  it('keeps a dependency-path reversal signed and does not invent a Kinney effectiveness fraction', () => {
    const { scenario, draft } = fixture();
    scenario.controls[0].probabilityReduction = range(0.9, 0.2, 0.95);
    scenario.controls[0].dependencyGroup = 'same-mechanism';
    scenario.controls[1].probabilityReduction = range(0.5, 0.3, 0.5);
    scenario.controls[1].dependencyGroup = 'same-mechanism';
    const assessment = captureRiskAssessment(
      scenario,
      'Beoordelaar',
      'Afhankelijke alternatieve paden.',
    );
    const r = justificationResult(assessment, draft);
    expect(r.current.value).toBeCloseTo(54);
    expect(r.selectedTarget.value).toBe(270);
    expect(r.improvement.value).toBeCloseTo(-216);
    expect(r.nominalScoreFraction).toBeCloseTo(-4);
    expect(r.status).toBe('unconfirmed');
    expect(r.kinneyExpected).toBeUndefined();
    expect(r.kinneyConservative).toBeUndefined();
    expect(r.warnings.join(' ')).toContain('afhankelijkheidspad');
  });
  it('records excluded selected controls without confirming their effectiveness', () => {
    const { scenario, draft } = fixture();
    scenario.controls[1].evidence = 'unknown';
    const assessment = captureRiskAssessment(
      scenario,
      'Beoordelaar',
      'Ontbrekend maatregelbewijs.',
    );
    const r = justificationResult(assessment, draft);
    expect(r.status).toBe('unconfirmed');
    expect(r.improvement.value).toBe(0);
    expect(r.selectedExcluded[0].id).toBe('selected');
    expect(r.kinneyExpected).toBeUndefined();
    expect(() => captureJustification(assessment, draft)).not.toThrow();
  });
  it('requires an actual planned control, exact single selection and an explicit cost and decision basis', () => {
    const { assessment, draft } = fixture();
    for (const bad of [
      [],
      ['missing'],
      ['existing'],
      ['selected', 'selected'],
      ['selected', 'other'],
    ])
      expect(() => captureJustification(assessment, { ...draft, controlIds: bad })).toThrow();
    for (const field of ['costBasis', 'assessor', 'rationale'] as const)
      expect(() => captureJustification(assessment, { ...draft, [field]: '' })).toThrow();
    for (const field of ['costFactor', 'degreeOfCorrectionFactor', 'kinneyCostDivisor'] as const)
      expect(() => captureJustification(assessment, { ...draft, [field]: 0 })).toThrow();
    expect(() =>
      captureJustification(assessment, { ...draft, kinneyCostDivisor: Infinity }),
    ).toThrow();
  });
  it('preserves earlier ratings, selection, result and decision after active scenario and input draft edits', () => {
    const { scenario, assessment, draft } = fixture();
    const record = captureJustification(assessment, draft);
    const saved = JSON.parse(JSON.stringify(record));
    scenario.controls[1].probabilityReduction = range(0.9);
    scenario.probability = 1;
    draft.controlIds.push('other');
    draft.costFactor = 100;
    draft.decision = 'reject';
    expect(record).toEqual(saved);
    expect(() => assertJustification(record, assessment)).not.toThrow();
    expect(record.result.selectedTarget.value).toBeCloseTo(216);
    expect(record.methodVersion).toBe(RISK_METHOD_VERSION);
  });
  it('round-trips the complete decision with its source, and rejects a missing source on export', () => {
    const { scenario, assessment, draft } = fixture();
    const record = captureJustification(assessment, draft);
    const workspace = createWorkspace('Fictieve justificatiewerkruimte', {
      scenarios: [scenario],
      riskAssessments: [assessment],
      justifications: [record],
    });
    workspace.scenarios[0].probability = 1;
    const restored = importWorkspace(exportWorkspace(workspace));
    expect(restored.justifications).toEqual([record]);
    expect(restored.riskAssessments).toEqual([assessment]);
    expect(restored.scenarios[0].probability).toBe(1);
    workspace.riskAssessments = [];
    expect(() => exportWorkspace(workspace)).toThrow(/verwijzing bestaat niet/);
  });
  it('handles a zero current score without dividing it into a fabricated effectiveness fraction', () => {
    const { scenario, draft } = fixture();
    scenario.controls[0].probabilityReduction = range(1);
    const assessment = captureRiskAssessment(
      scenario,
      'Beoordelaar',
      'Fictieve eliminatie van deze route.',
    );
    const result = justificationResult(assessment, draft);
    expect(result.current.value).toBe(0);
    expect(result.status).toBe('unconfirmed');
    expect(result.nominalScoreFraction).toBeUndefined();
    expect(result.kinneyExpected).toBeUndefined();
    expect(result.fine).toBe(0);
  });
  it('detects changed ratings and separately rejects a rehashed fabricated result', () => {
    const { assessment, draft } = fixture();
    const record = captureJustification(assessment, draft);
    record.costFactor = 10;
    expect(() => assertJustification(record, assessment)).toThrow(/bronhash/);
    record.sha256 = justificationHash(record);
    expect(() => assertJustification(record, assessment)).toThrow(/uitkomst past niet/);
  });
  it('does not accept an assessment-ID match when the frozen source hash has changed', () => {
    const { assessment, draft } = fixture();
    const record = captureJustification(assessment, draft);
    assessment.rationale = 'Andere bronversie';
    assessment.sha256 = riskAssessmentHash(assessment);
    expect(() => assertJustification(record, assessment)).toThrow(/precies deze bevroren/);
  });
  it('refuses an unknown risk method or local policy rather than confirming a stale formula', () => {
    const { assessment, draft } = fixture();
    const record = captureJustification(assessment, draft);
    record.priorityPolicyVersion = 'unknown-policy/99';
    record.sha256 = justificationHash(record);
    expect(() => assertJustification(record, assessment)).toThrow(/Onbekende/);
    assessment.methodVersion = 'unknown-risk/99';
    assessment.sha256 = riskAssessmentHash(assessment);
    expect(() => captureJustification(assessment, draft)).toThrow(/Onbekende risicomethode/);
  });
  it('requires the justification decision to follow its frozen source assessment', () => {
    const { assessment, draft } = fixture();
    const record = captureJustification(assessment, draft);
    record.recordedAt = new Date(Date.parse(assessment.recordedAt) - 1).toISOString();
    record.sha256 = justificationHash(record);
    expect(() => assertJustification(record, assessment)).toThrow(/vóór haar bronbeoordeling/);
  });
  it('makes the basis, immutable source identity, signed difference and local policy auditable in Markdown', () => {
    const { assessment, draft } = fixture();
    const record = captureJustification(assessment, draft);
    const markdown = justificationMarkdown([record]).join('\n');
    expect(markdown).toContain(record.sha256);
    expect(markdown).toContain(assessment.sha256);
    expect(markdown).toContain(draft.costBasis);
    expect(markdown).toContain('CF=2, DC=3');
    expect(markdown).toContain('Afzonderlijke lokale prioriteit');
    expect(markdown).toContain('Getekende');
    expect(justificationMarkdown([])).toEqual([]);
  });
});
