import { describe, expect, it } from 'vitest';
import { questions } from '../content/catalog';
import { newControl, newScenario } from '../demo';
import { captureJustification, justificationHash } from './justification';
import { captureRiskAssessment } from './risk-history';
import { createWorkspace } from './model';
import { createDossierFromModulePlan, type ModulePlan } from './module-plan';
import { exportWorkspace, importWorkspace } from './validation';

function fixture() {
  const scenario = newScenario();
  scenario.controls = [
    newControl({
      id: 'chosen-plan',
      title: 'Fictieve bronmaatregel',
      independent: true,
      rationale: 'Fictieve projectie',
      probabilityReduction: { min: 0.4, value: 0.5, max: 0.6 },
    }),
  ];
  const assessment = captureRiskAssessment(
    scenario,
    'Testbeoordelaar',
    'Fictieve uitgangssituatie',
  );
  const justification = captureJustification(assessment, {
    selectionKind: 'control',
    controlIds: ['chosen-plan'],
    costBasis: 'Fictieve lokale ratings',
    costFactor: 2,
    degreeOfCorrectionFactor: 3,
    kinneyCostDivisor: 4,
    decision: 'review_required',
    assessor: 'Testbeslisser',
    rationale: 'Eerst projectbewijs verzamelen',
  });
  const workspace = createWorkspace('Fictief integratiedossier', {
    scenarios: [scenario],
    riskAssessments: [assessment],
    justifications: [justification],
    organisations: [{ id: 'org', name: 'Fictieve organisatie', description: '' }],
  });
  const selected = questions.slice(0, 2);
  const plan: ModulePlan = {
    id: 'plan',
    title: 'Fictieve modulekeuze',
    scope: 'project',
    organisationId: 'org',
    revision: 0,
    sourceIds: [],
    modules: [
      {
        id: 'module',
        code: 'test',
        title: 'Fictieve module',
        origin: 'catalog_theme',
        enabled: true,
        questionIds: selected.map((question) => question.id),
        scopeNotes: 'Oorspronkelijke afbakening',
        sortOrder: 2,
        sourceIds: [],
      },
    ],
  };
  workspace.modulePlans = [plan];
  workspace.dossiers = [
    createDossierFromModulePlan(plan, selected, workspace, {
      id: 'dossier',
      title: 'Fictief dossier',
      scope: 'Moduleproef',
      assessor: 'Testbeoordelaar',
      createdAt: new Date().toISOString(),
    }),
  ];
  return workspace;
}

describe('workspace decision and module-scope integrity', () => {
  it('roundtrips frozen decisions and unanswered selected questions after active content changes', () => {
    const workspace = fixture();
    const frozen = structuredClone(workspace.dossiers![0]);
    const decision = structuredClone(workspace.justifications![0]);
    workspace.scenarios[0].controls = [];
    workspace.modulePlans![0].modules[0].enabled = false;
    workspace.modulePlans![0].modules[0].scopeNotes = 'Nieuwe afbakening';
    workspace.modulePlans![0].revision += 1;
    const restored = importWorkspace(exportWorkspace(workspace));
    expect(restored.dossiers![0]).toEqual(frozen);
    expect(restored.dossiers![0].questions).toHaveLength(2);
    expect(restored.answers).toHaveLength(0);
    expect(restored.justifications![0]).toEqual(decision);
  });
  it('rejects a decision whose immutable source assessment was removed or replaced', () => {
    const workspace = fixture();
    workspace.riskAssessments = [];
    expect(() => exportWorkspace(workspace)).toThrow(/bronbeoordeling.*verwijzing/);
    const replaced = fixture();
    replaced.justifications![0].assessmentSha256 = '0'.repeat(64);
    replaced.justifications![0].sha256 = justificationHash(replaced.justifications![0]);
    expect(() => exportWorkspace(replaced)).toThrow(/precies deze bevroren/);
  });
  it('rejects rehashed fabricated results and duplicate decision identities', () => {
    const workspace = fixture();
    workspace.justifications![0].result.fine += 1;
    workspace.justifications![0].sha256 = justificationHash(workspace.justifications![0]);
    expect(() => exportWorkspace(workspace)).toThrow(/uitkomst past niet/);
    const duplicate = fixture();
    duplicate.justifications!.push(structuredClone(duplicate.justifications![0]));
    expect(() => exportWorkspace(duplicate)).toThrow(/dubbele id/);
  });
  it('rejects malformed imported collections before displaying them', () => {
    for (const value of [null, {}, [null]]) {
      const workspace = fixture();
      expect(() =>
        importWorkspace(JSON.stringify({ ...workspace, justifications: value })),
      ).toThrow();
      expect(() => importWorkspace(JSON.stringify({ ...workspace, modulePlans: value }))).toThrow();
    }
  });
  it('rejects silent scope-note changes in a frozen dossier and missing live plan relations', () => {
    const workspace = fixture();
    workspace.dossiers![0].modulePlanSnapshot!.modules[0].scopeNotes = 'Achteraf aangepast';
    expect(() => exportWorkspace(workspace)).toThrow(/hash/);
    const missing = fixture();
    missing.modulePlans![0].organisationId = 'missing';
    expect(() => exportWorkspace(missing)).toThrow(/organisatie bestaat niet/);
  });
  it('continues to import earlier exports without the additive collections', () => {
    const workspace = fixture();
    delete workspace.justifications;
    delete workspace.modulePlans;
    delete workspace.dossiers![0].modulePlanSnapshot;
    delete workspace.dossiers![0].modulePlanSnapshotSha256;
    expect(importWorkspace(exportWorkspace(workspace)).justifications).toBeUndefined();
  });
  it('rejects a false declared answer version while preserving earlier unknown version labels', () => {
    const workspace = fixture();
    const question = workspace.dossiers![0].questions[0];
    workspace.answers.push({
      id: 'answer',
      dossierId: 'dossier',
      questionId: question.id,
      choice: 'unknown',
      evidence: '',
      note: '',
      answeredAt: new Date().toISOString(),
      questionSnapshot: question.prompt,
      questionSha256: question.sha256,
      contentVersion: 'false-version',
    });
    expect(() => exportWorkspace(workspace)).toThrow(/vraagversie verschilt/);
    workspace.answers[0].contentVersion = question.version;
    expect(importWorkspace(exportWorkspace(workspace)).answers[0].contentVersion).toBe(
      question.version,
    );
    delete workspace.answers[0].contentVersion;
    expect(importWorkspace(exportWorkspace(workspace)).answers[0].contentVersion).toBeUndefined();
  });
});
