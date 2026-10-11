import { describe, it, expect } from 'vitest';
import {
  assertRiskAssessment,
  assertRiskAssessmentUpdate,
  captureEvidenceRiskAssessment,
  captureRiskAssessment,
  riskAssessmentHash,
} from './risk-history';
import { createWorkspace } from './model';
import { exportWorkspace, importWorkspace } from './validation';
import type { Scenario } from '../domain/types';
import type { Evidence } from './dossier';
import { evidenceHash } from './frozen';
import {
  EVIDENCE_RISK_METHOD_VERSION,
  captureRiskEvidenceReview,
  evaluateWorkspaceRisk,
} from './risk-evidence';
import { range, RISK_METHOD_VERSION } from '../domain/risk';

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

function nativeFixture() {
  const scenario = structuredClone(input);
  const evidence: Evidence = {
    id: 'native-proof',
    title: 'Fictieve afschermingstest Ω',
    kind: 'measurement',
    reference: 'Fictieve private bron',
    description: 'Test van toegang tot bewegende delen.',
    recordedAt: '2026-10-07T09:00:00Z',
    status: 'verified',
    verifiedBy: 'Verificateur',
    verifiedAt: '2026-10-07T09:00:00Z',
    verificationNote: 'Test voldoet onder deze omstandigheden.',
  };
  evidence.verifiedContentSha256 = evidenceHash(evidence);
  scenario.controls.push({
    id: 'native-control',
    title: 'Afscherming',
    ahs: 'collective',
    status: 'existing',
    evidence: 'verified',
    evidenceNote: 'Functionele test',
    rationale: 'Eén W-mechanisme',
    probabilityReduction: range(0.5),
    exposureReduction: range(0),
    effectReduction: range(0),
    independent: true,
    feasibility: 'easy',
    effort: 2,
    legalRequired: false,
  });
  scenario.controls[0].evidenceReview = captureRiskEvidenceReview(
    scenario,
    'control',
    scenario.controls[0],
    [evidence],
    'Lokale beoordelaar',
    'Test onderbouwt deze exacte lokale reductieaanname.',
    '2026-10-07T10:00:00Z',
  );
  return { scenario, evidence };
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

describe('new evidence-aware checkpoints alongside untouched historical methods', () => {
  it('captures only the actually used proof basis and retains exact results after current withdrawal or source change', () => {
    const { scenario, evidence } = nativeFixture();
    const unrelated = { ...evidence, id: 'unrelated-private' };
    unrelated.verifiedContentSha256 = evidenceHash(unrelated);
    const record = captureRiskAssessment(scenario, 'Beoordelaar', 'Gebonden bewijsbasis.', [
      evidence,
      unrelated,
    ]);
    const before = structuredClone(record);
    expect(record.methodVersion).toBe(EVIDENCE_RISK_METHOD_VERSION);
    expect(record.evidenceBasis!.currentRecords.map((proof) => proof.id)).toEqual(['native-proof']);
    expect(record.result.current.value).toBe(270);
    evidence.status = 'unverified';
    scenario.controls[0].probabilityReduction = range(0.9);
    expect(evaluateWorkspaceRisk(scenario, [evidence]).current.score.value).toBe(540);
    expect(record).toEqual(before);
    expect(() => assertRiskAssessment(record)).not.toThrow();
  });
  it('keeps the legacy three-argument route and hash byte-compatible instead of upgrading old source records', () => {
    const { scenario, evidence } = nativeFixture();
    delete scenario.controls[0].evidenceReview;
    const legacy = captureRiskAssessment(scenario, 'Oude beoordelaar', 'Oorspronkelijke regels.');
    const oldBytes = JSON.stringify(legacy);
    const native = captureEvidenceRiskAssessment(
      scenario,
      'Nieuwe beoordelaar',
      'Koppeling ontbreekt.',
      [evidence],
    );
    expect(legacy.methodVersion).toBe(RISK_METHOD_VERSION);
    expect(legacy.evidenceBasis).toBeUndefined();
    expect(legacy.result.current.value).toBe(270);
    expect(native.result.current.value).toBe(540);
    expect(native.evidenceBasis!.currentRecords).toEqual([]);
    expect(JSON.stringify(legacy)).toBe(oldBytes);
    expect(() => assertRiskAssessment(legacy)).not.toThrow();
  });
  it('rejects a new checkpoint without its own basis and rejects silently attaching one to an old method', () => {
    const { scenario, evidence } = nativeFixture();
    const record = captureEvidenceRiskAssessment(scenario, 'Beoordelaar', 'Basis', [evidence]);
    delete record.evidenceBasis;
    record.sha256 = riskAssessmentHash(record);
    expect(() => assertRiskAssessment(record)).toThrow(/mist.*bewijsbasis/);
    const legacy = captureRiskAssessment(scenario, 'Beoordelaar', 'Oud');
    legacy.evidenceBasis = {
      schema: 'ima.risk-evidence-basis/v1',
      currentRecords: [evidence],
      missingIds: [],
      fileChecks: [],
    };
    legacy.sha256 = riskAssessmentHash(legacy);
    expect(() => assertRiskAssessment(legacy)).toThrow(/opgewaardeerd/);
  });
  it('detects altered frozen source versions and rehashed fabricated results with the new method', () => {
    const { scenario, evidence } = nativeFixture();
    const record = captureEvidenceRiskAssessment(scenario, 'Beoordelaar', 'Exact', [evidence]);
    record.result.current = range(0);
    record.sha256 = riskAssessmentHash(record);
    expect(() => assertRiskAssessment(record)).toThrow(/uitkomst past niet/);
    const missing = captureEvidenceRiskAssessment(scenario, 'Beoordelaar', 'Exact', [evidence]);
    missing.evidenceBasis!.currentRecords = [];
    missing.evidenceBasis!.missingIds = [evidence.id];
    missing.sha256 = riskAssessmentHash(missing);
    expect(() => assertRiskAssessment(missing)).toThrow(/uitkomst past niet/);
    const changed = captureEvidenceRiskAssessment(scenario, 'Beoordelaar', 'Exact', [evidence]);
    changed.evidenceBasis!.currentRecords[0].verifiedAt = '2026-10-08T09:00:00Z';
    changed.sha256 = riskAssessmentHash(changed);
    expect(() => assertRiskAssessment(changed)).toThrow(/uitkomst past niet/);
  });
  it('can record a review-required current state with missing proof and no invented credited effect', () => {
    const { scenario, evidence } = nativeFixture();
    const record = captureEvidenceRiskAssessment(
      scenario,
      'Beoordelaar',
      'Bron momenteel ontbrekend.',
      [],
    );
    expect(record.evidenceBasis!.missingIds).toEqual([evidence.id]);
    expect(record.result.currentCredited).toEqual([]);
    expect(record.result.current.value).toBe(540);
    expect(() => assertRiskAssessment(record)).not.toThrow();
  });
  it('round-trips old and new checkpoints with changed current proof while preserving every old hash', () => {
    const { scenario, evidence } = nativeFixture();
    const legacy = captureRiskAssessment(scenario, 'Oude beoordelaar', 'Oude methode.');
    const native = captureEvidenceRiskAssessment(
      scenario,
      'Nieuwe beoordelaar',
      'Exacte bewijsbasis.',
      [evidence],
    );
    const old = structuredClone([legacy, native]);
    const workspace = createWorkspace('Versiegebonden bewijs Ω', {
      scenarios: [scenario],
      evidence: [{ ...evidence, status: 'unverified' }],
      riskAssessments: [legacy, native],
    });
    const restored = importWorkspace(exportWorkspace(workspace));
    expect(restored.riskAssessments).toEqual(old);
    expect(restored.evidence![0].status).toBe('unverified');
    expect(() => assertRiskAssessment(restored.riskAssessments![1])).not.toThrow();
  });
  it('enforces append-only native checkpoints independently of a coherently rehashed old edit', () => {
    const { scenario, evidence } = nativeFixture();
    const prior = captureEvidenceRiskAssessment(scenario, 'Beoordelaar', 'Basis.', [evidence]);
    const next = captureEvidenceRiskAssessment(scenario, 'Andere beoordelaar', 'Nieuw moment.', [
      evidence,
    ]);
    expect(() => assertRiskAssessmentUpdate([prior], [prior, next])).not.toThrow();
    const rewritten = structuredClone(prior);
    rewritten.rationale = 'Andere oorspronkelijke redenering';
    rewritten.sha256 = riskAssessmentHash(rewritten);
    expect(() => assertRiskAssessment(rewritten)).not.toThrow();
    expect(() => assertRiskAssessmentUpdate([prior], [rewritten, next])).toThrow(/exact behouden/);
    expect(() => assertRiskAssessmentUpdate([prior], [next])).toThrow(/exact behouden/);
    expect(() => assertRiskAssessmentUpdate([prior], [prior, prior])).toThrow(/dubbele/);
  });
});
