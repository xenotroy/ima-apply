import { describe, expect, it } from 'vitest';
import type { Evidence } from './dossier';
import type { Control, Scenario } from '../domain/types';
import { range } from '../domain/risk';
import { evidenceHash } from './frozen';
import {
  assertFrozenRiskEvidenceBasis,
  assertRiskEvidenceReview,
  assertRiskTargetReference,
  captureRiskEvidenceReview,
  captureRiskTargetReference,
  evidenceCurrentStatus,
  evidenceVersionHash,
  evaluateFrozenRisk,
  evaluateWorkspaceRisk,
  freezeRiskEvidenceBasis,
  resolveRiskEvidence,
  riskTargetCurrentStatus,
} from './risk-evidence';
import {
  EvidenceFileSession,
  evidenceFileBindingHash,
  makeEvidenceFileCheck,
} from './evidence-files';

const VERIFIED_AT = '2026-10-07T09:00:00.000Z';
const REVIEWED_AT = '2026-10-07T10:00:00.000Z';
function proof(id = 'evidence-1', dossierId?: string): Evidence {
  const record: Evidence = {
    id,
    title: 'Functionele test Ω',
    kind: 'measurement',
    reference: 'Private proefreferentie',
    description: 'Test onder de beschreven lokale omstandigheden.',
    recordedAt: VERIFIED_AT,
    status: 'verified',
    verifiedBy: 'Verificateur',
    verifiedAt: VERIFIED_AT,
    verificationNote: 'Proefresultaat inhoudelijk beoordeeld.',
    ...(dossierId ? { dossierId } : {}),
  };
  record.verifiedContentSha256 = evidenceHash(record);
  return record;
}
function control(id = 'control-1'): Control {
  return {
    id,
    title: 'Afscherming',
    ahs: 'collective',
    status: 'existing',
    evidence: 'verified',
    evidenceNote: 'Functionele test',
    rationale: 'Voorkomt toegang tot het gevaar.',
    probabilityReduction: range(0.5),
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
    id: 'scenario-1',
    title: 'Machinecontact',
    description: 'Lokale afbakening Ω',
    department: 'Werkplaats',
    hazard: 'Bewegende delen',
    consequence: 'Ernstig letsel',
    probability: 6,
    exposure: 6,
    effect: 15,
    controls: [control()],
    lopa: {
      initiatingEvent: 'Onbedoelde start',
      initiatingFrequency: range(1),
      frequencyEvidence: 'Fictieve frequentiebron',
      consequence: 'Ernstig letsel',
      targetFrequency: 0.1,
      assumptions: 'Expliciet lokaal criterium',
      layers: [
        {
          id: 'layer-1',
          title: 'Afzonderlijke stop',
          status: 'existing',
          evidence: 'verified',
          evidenceNote: 'Proef',
          pfd: range(0.1),
          specific: true,
          independent: true,
          independentOfInitiator: true,
          auditable: true,
          effective: true,
          independenceNote: 'Apart van initiator en overige bescherming.',
        },
      ],
      modifiers: [
        {
          id: 'modifier-1',
          title: 'Conditionele aanwezigheid',
          kind: 'conditional',
          probability: range(0.2),
          evidence: 'verified',
          evidenceNote: 'Metingen',
          independent: true,
          rationale: 'Geen overlap met IPL of initiator.',
        },
      ],
    },
  };
  const evidence = [proof()];
  scenario.controls[0].evidenceReview = captureRiskEvidenceReview(
    scenario,
    'control',
    scenario.controls[0],
    evidence,
    'Beoordelaar',
    'Deze test onderbouwt het lokale W-mechanisme.',
    REVIEWED_AT,
  );
  const layer = scenario.lopa!.layers[0],
    modifier = scenario.lopa!.modifiers[0];
  layer.evidenceReview = captureRiskEvidenceReview(
    scenario,
    'lopa-layer',
    layer,
    evidence,
    'Beoordelaar',
    'Afzonderlijke IPL en opgegeven PFD onderbouwd.',
    REVIEWED_AT,
  );
  modifier.evidenceReview = captureRiskEvidenceReview(
    scenario,
    'lopa-modifier',
    modifier,
    evidence,
    'Beoordelaar',
    'Conditionele kans afzonderlijk onderbouwd.',
    REVIEWED_AT,
  );
  return { scenario, evidence };
}

describe('version-bound risk evidence, without inferred credit', () => {
  it('uses one shared proof for distinct control/IPL/modifier identities and leaves all source fields intact', () => {
    const { scenario, evidence } = fixture();
    const original = structuredClone({ scenario, evidence });
    const result = evaluateWorkspaceRisk(scenario, evidence);
    expect(result.current.score.value).toBe(270);
    expect(result.current.creditedControlIds).toEqual(['control-1']);
    expect(result.lopa!.frequency.value).toBeCloseTo(0.02);
    expect(result.lopa!.creditedLayerIds).toEqual(['layer-1']);
    expect(result.lopa!.creditedModifierIds).toEqual(['modifier-1']);
    expect({ scenario, evidence }).toEqual(original);
  });
  it('withdrawal and exact-version changes stop new current credit but preserve old frozen results', () => {
    const { scenario, evidence } = fixture();
    const basis = freezeRiskEvidenceBasis(scenario, evidence);
    const old = evaluateFrozenRisk(scenario, basis);
    evidence[0].status = 'unverified';
    const current = evaluateWorkspaceRisk(scenario, evidence);
    expect(current.current.score.value).toBe(540);
    expect(current.lopa!.frequency.value).toBe(1);
    expect(current.current.excluded[0].reason).toContain('ingetrokken');
    expect(evaluateFrozenRisk(scenario, basis)).toEqual(old);
    evidence[0] = { ...proof(), verifiedAt: '2026-10-08T09:00:00.000Z' };
    expect(evidenceHash(evidence[0])).toBe(evidenceHash(basis.currentRecords[0]));
    expect(evaluateWorkspaceRisk(scenario, evidence).current.score.value).toBe(540);
    expect(evidenceCurrentStatus(basis.currentRecords[0], evidence).status).toBe('changed');
  });
  it('requires a new explicit target review after reverified source or a changed numerical/causal/scope basis', () => {
    const { scenario, evidence } = fixture();
    for (const mutate of [
      (s: Scenario) => {
        s.controls[0].probabilityReduction = range(0.9);
      },
      (s: Scenario) => {
        s.controls[0].rationale = 'Ander mechanisme';
      },
      (s: Scenario) => {
        s.description = 'Andere afbakening';
      },
      (s: Scenario) => {
        s.department = 'Andere lokale omgeving';
      },
    ]) {
      const altered = structuredClone(scenario);
      mutate(altered);
      expect(evaluateWorkspaceRisk(altered, evidence).current.score.value).toBe(540);
      expect(evaluateWorkspaceRisk(altered, evidence).current.excluded[0].reason).toContain(
        'gewijzigd',
      );
    }
    scenario.lopa!.layers[0].pfd = range(0.001);
    expect(evaluateWorkspaceRisk(scenario, evidence).lopa!.creditedLayerIds).toEqual([]);
    evidence[0].verifiedAt = '2026-10-08T09:00:00.000Z';
    scenario.controls[0].evidenceReview = captureRiskEvidenceReview(
      scenario,
      'control',
      scenario.controls[0],
      evidence,
      'Nieuwe beoordelaar',
      'Nieuwe exacte verificatieversie beoordeeld.',
      '2026-10-08T10:00:00.000Z',
    );
    expect(evaluateWorkspaceRisk(scenario, evidence).current.score.value).toBe(270);
    expect(evaluateWorkspaceRisk(scenario, evidence).lopa!.creditedModifierIds).toEqual([]);
  });
  it('allows an explicitly selected global proof but refuses foreign-dossier proof and unknown source actors', () => {
    const { scenario, evidence } = fixture();
    scenario.dossierId = 'dossier-a';
    expect(() =>
      captureRiskEvidenceReview(
        scenario,
        'control',
        scenario.controls[0],
        evidence,
        'Beoordelaar',
        'Globale documentbasis expliciet van toepassing.',
        REVIEWED_AT,
      ),
    ).not.toThrow();
    expect(() =>
      captureRiskEvidenceReview(
        scenario,
        'control',
        scenario.controls[0],
        [proof('foreign', 'dossier-b')],
        'Beoordelaar',
        'Review',
        REVIEWED_AT,
      ),
    ).toThrow(/ander dossier/);
    expect(() =>
      captureRiskEvidenceReview(
        scenario,
        'control',
        scenario.controls[0],
        evidence,
        '',
        'Review',
        REVIEWED_AT,
      ),
    ).toThrow(/beoordelaar/);
    expect(() =>
      captureRiskEvidenceReview(
        scenario,
        'control',
        scenario.controls[0],
        [{ ...proof(), verifiedBy: '' }],
        'Beoordelaar',
        'Review',
        REVIEWED_AT,
      ),
    ).toThrow(/verificateur/);
    expect(() =>
      captureRiskEvidenceReview(
        scenario,
        'control',
        scenario.controls[0],
        evidence,
        'Beoordelaar',
        '',
        REVIEWED_AT,
      ),
    ).toThrow(/bewijsbetekenis/);
  });
  it('requires every declared source, preserves missing IDs and stores only actually linked records', () => {
    const { scenario, evidence } = fixture();
    const second = proof('evidence-2');
    scenario.controls[0].evidenceReview = captureRiskEvidenceReview(
      scenario,
      'control',
      scenario.controls[0],
      [...evidence, second],
      'Beoordelaar',
      'Beide bronnen nodig.',
      REVIEWED_AT,
    );
    const basis = freezeRiskEvidenceBasis(scenario, [...evidence, proof('unrelated-private')]);
    expect(basis.currentRecords.map((p) => p.id)).toEqual(['evidence-1']);
    expect(basis.missingIds).toEqual(['evidence-2']);
    expect(evaluateFrozenRisk(scenario, basis).current.creditedControlIds).toEqual([]);
    expect(evaluateFrozenRisk(scenario, basis).current.excluded[0].reason).toContain('evidence-2');
    expect(() => assertFrozenRiskEvidenceBasis({ ...basis, missingIds: [] }, scenario)).toThrow(
      /precies/,
    );
  });
  it('keeps old unlinked data readable while withholding new current credit and preserving an honest planned forecast', () => {
    const { scenario } = fixture();
    delete scenario.controls[0].evidenceReview;
    const plan = {
      ...control('planned'),
      status: 'planned' as const,
      evidence: 'unverified' as const,
    };
    scenario.controls.push(plan);
    const result = evaluateWorkspaceRisk(scenario);
    expect(result.current.score.value).toBe(540);
    expect(result.current.creditedControlIds).toEqual([]);
    expect(result.target.creditedControlIds).toEqual(['planned']);
    expect(result.target.score.value).toBe(270);
    expect(result.target.score.max).toBe(540);
    expect(scenario.controls[0].evidence).toBe('verified');
    expect(plan.probabilityReduction.min).toBe(0.5);
  });
  it('does not replace independence, dependence or qualification checks with a valid proof binding', () => {
    const { scenario, evidence } = fixture();
    const layer = scenario.lopa!.layers[0];
    layer.independentOfInitiator = false;
    layer.evidenceReview = captureRiskEvidenceReview(
      scenario,
      'lopa-layer',
      layer,
      evidence,
      'Beoordelaar',
      'Deze bewijsbinding bevestigt geen onafhankelijkheid.',
      REVIEWED_AT,
    );
    expect(evaluateWorkspaceRisk(scenario, evidence).lopa!.creditedLayerIds).toEqual([]);
    scenario.controls[0].probabilityReduction = range(0.5, 0.4, 0.6);
    expect(resolveRiskEvidence(scenario, evidence).issues[0].targetId).toBe('control-1');
  });
  it('rejects rehashed/retitled wrong source snapshots, duplicate bindings, bad times and future human verification', () => {
    const { scenario, evidence } = fixture();
    const review = scenario.controls[0].evidenceReview!;
    expect(() =>
      assertRiskEvidenceReview({ ...review, bindings: [...review.bindings, review.bindings[0]] }),
    ).toThrow(/dubbel/);
    const altered = structuredClone(review);
    altered.bindings[0].snapshot.description = 'Herschreven';
    expect(() => assertRiskEvidenceReview(altered)).toThrow(/metadata/);
    const wrong = structuredClone(review);
    wrong.bindings[0].evidenceId = 'wrong';
    expect(() => assertRiskEvidenceReview(wrong)).toThrow(/snapshot/);
    expect(() =>
      assertRiskEvidenceReview({ ...review, reviewedAt: '2026-02-30T10:00:00Z' }),
    ).toThrow(/tijdstip/);
    expect(() =>
      captureRiskEvidenceReview(
        scenario,
        'control',
        scenario.controls[0],
        evidence,
        'Beoordelaar',
        'Te vroeg',
        '2026-10-06T10:00:00Z',
      ),
    ).toThrow(/na de/);
  });
  it('pins typed target identity and exact version for actions even when Control and IPL IDs coincide', () => {
    const { scenario } = fixture();
    scenario.lopa!.layers[0].id = 'control-1';
    const controlRef = captureRiskTargetReference(scenario, 'control', 'control-1');
    const layerRef = captureRiskTargetReference(scenario, 'lopa-layer', 'control-1');
    expect(controlRef.targetSha256).not.toBe(layerRef.targetSha256);
    expect(riskTargetCurrentStatus(controlRef, [scenario])).toBe('current');
    const old = structuredClone(controlRef);
    scenario.controls[0].title = 'Ander actiedoel';
    expect(riskTargetCurrentStatus(controlRef, [scenario])).toBe('changed');
    expect(controlRef).toEqual(old);
    scenario.controls = [];
    expect(riskTargetCurrentStatus(controlRef, [scenario])).toBe('missing');
    expect(() => assertRiskTargetReference(controlRef)).not.toThrow();
    expect(() => assertRiskTargetReference({ ...controlRef, targetId: 'forged' })).toThrow(
      /identiteit/,
    );
    expect(() => assertRiskTargetReference({ ...layerRef, kind: 'control' })).toThrow();
    expect(() => assertRiskTargetReference({ ...controlRef, invented: true })).toThrow(
      /onbekend veld/,
    );
  });
  it('keeps operational rechecks outside the substantive version, but file/human changes inside it', () => {
    const evidence = proof();
    evidence.file = {
      schema: 'ima.evidence-file/v1',
      expectedSha256: '1'.repeat(64),
      expectedByteLength: 5,
      mimeTypeOrigin: 'unknown',
    };
    evidence.capturedBy = 'Werkelijke vastlegger';
    evidence.verifiedFileBindingSha256 = evidenceFileBindingHash(evidence);
    const version = evidenceVersionHash(evidence);
    evidence.fileCheck = makeEvidenceFileCheck(evidence.file, 'Controleur', 'selected-file', {
      sha256: '1'.repeat(64),
      byteLength: 5,
    });
    expect(evidenceVersionHash(evidence)).toBe(version);
    evidence.verificationNote = 'Ander menselijk oordeel';
    expect(evidenceVersionHash(evidence)).not.toBe(version);
    evidence.verificationNote = 'Proefresultaat inhoudelijk beoordeeld.';
    evidence.file.originalFileName = 'Andere bronnaam';
    expect(evidenceVersionHash(evidence)).not.toBe(version);
  });
  it('freezes historical byte checks without restoring live readiness after a session loses access', () => {
    const { scenario, evidence } = fixture();
    const record = evidence[0];
    record.file = {
      schema: 'ima.evidence-file/v1',
      expectedSha256: '1'.repeat(64),
      expectedByteLength: 5,
      mimeTypeOrigin: 'unknown',
    };
    record.verifiedFileBindingSha256 = evidenceFileBindingHash(record);
    const session = new EvidenceFileSession();
    record.fileCheck = session.record(
      'workspace-a',
      record,
      makeEvidenceFileCheck(record.file, 'Controleur', 'selected-file', {
        sha256: '1'.repeat(64),
        byteLength: 5,
      }),
    );
    scenario.controls[0].evidenceReview = captureRiskEvidenceReview(
      scenario,
      'control',
      scenario.controls[0],
      evidence,
      'Beoordelaar',
      'Bestandinhoud voor werking beoordeeld.',
      REVIEWED_AT,
    );
    const context = { workspaceId: 'workspace-a', proofs: session.proofs };
    expect(evaluateWorkspaceRisk(scenario, evidence, context).current.score.value).toBe(270);
    const basis = freezeRiskEvidenceBasis(scenario, evidence, context);
    expect(basis.fileChecks).toHaveLength(1);
    expect(basis.fileChecks[0].check.sessionId).toBeUndefined();
    session.clear();
    expect(
      evaluateWorkspaceRisk(scenario, evidence, {
        workspaceId: 'workspace-a',
        proofs: session.proofs,
      }).current.score.value,
    ).toBe(540);
    expect(evaluateFrozenRisk(scenario, basis).current.score.value).toBe(270);
    const earlierSession = {
      ...context,
      proofs: context.proofs.map((proof) => ({
        ...proof,
        check: { ...proof.check, sessionId: 'prior-browser-session' },
      })),
    };
    expect(evaluateWorkspaceRisk(scenario, evidence, earlierSession).current.score.value).toBe(540);
    const capturedWithoutCurrentCheck = freezeRiskEvidenceBasis(scenario, evidence, earlierSession);
    expect(capturedWithoutCurrentCheck.fileChecks).toEqual([]);
    expect(evaluateFrozenRisk(scenario, capturedWithoutCurrentCheck).current.score.value).toBe(540);
    record.fileCheck = { ...record.fileCheck, state: 'mismatch', observedSha256: '2'.repeat(64) };
    expect(evaluateWorkspaceRisk(scenario, evidence, context).current.score.value).toBe(540);
    expect(evaluateFrozenRisk(scenario, basis).current.score.value).toBe(270);
  });
});
