import { describe, expect, it } from 'vitest';
import { createWorkspace, exportWorkspace, importWorkspace, emptyProjectDetails } from './index';
import { questions } from '../content/catalog';
import {
  assertModulePlans,
  assertModulePlan,
  assertDossierModulePlanSnapshot,
  createDossierFromModulePlan,
  modulePlanOptions,
  modulePlanQuestionIds,
  modulePlanMarkdown,
  modulePlanHash,
  moduleQuestionIds,
  type ModulePlan,
} from './module-plan';

function fixture() {
  const workspace = createWorkspace('Modulefixture', {
    organisations: [
      { id: 'org', name: 'Org', description: '' },
      { id: 'other', name: 'Other', description: '' },
    ],
    departments: [{ id: 'dept', organisationId: 'org', name: 'Productie', activity: '' }],
    projectContexts: [
      {
        id: 'context',
        title: 'Project',
        organisationText: '',
        locationText: '',
        contactName: '',
        contactEmail: '',
        organisationIds: ['org'],
        details: emptyProjectDetails(),
        sourceIds: [],
      },
    ],
    sources: [{ id: 'legacy-source', title: 'Exacte moduletoewijzing' }],
  });
  const plan: ModulePlan = {
    id: 'plan',
    title: 'Afdeling modules',
    scope: 'department',
    projectContextId: 'context',
    organisationId: 'org',
    departmentId: 'dept',
    revision: 0,
    sourceIds: ['legacy-source'],
    modules: [
      {
        id: 'legacy-m1',
        origin: 'legacy_module',
        code: 'M1',
        title: 'Machines',
        questionIds: [questions[1].id, questions[0].id],
        enabled: true,
        scopeNotes: 'Alleen werkplaats',
        sortOrder: 7,
        definitionSortOrder: 2,
        sourceIds: ['legacy-source'],
      },
      {
        id: 'catalog:disabled',
        origin: 'catalog_theme',
        code: 'X',
        title: 'Later',
        questionIds: [questions[2].id],
        enabled: false,
        scopeNotes: '',
        sourceIds: [],
      },
    ],
  };
  workspace.modulePlans = [plan];
  return { workspace, plan };
}
const fields = {
  id: 'dossier',
  title: 'Nieuwe beoordeling',
  scope: 'Werkplaats, afgebakend proces',
  assessor: 'Beoordelaar',
  createdAt: '2026-10-11T08:00:00Z',
};
describe('module selection with real scope and frozen dossier membership', () => {
  it('retains the exact pre-exclusion hash dialect when the additive field is absent', () => {
    const plan: ModulePlan = {
      id: 'golden-plan',
      title: 'Oorspronkelijk plan',
      scope: 'project',
      organisationId: 'org',
      revision: 3,
      sourceIds: [],
      modules: [
        {
          id: 'golden-module',
          origin: 'legacy_module',
          code: 'M01',
          title: 'Exacte oorspronkelijke module',
          questionIds: ['q1', 'q2'],
          enabled: true,
          scopeNotes: 'Oude scope Ω',
          sortOrder: 7,
          definitionSortOrder: 2,
          sourceIds: [],
        },
      ],
    };
    // Captured from the existing 2.4.0 implementation before adding the optional field.
    expect(modulePlanHash(plan)).toBe(
      '54c51c19c8fe393daf389f5ee947fbe665f0d186eb1cf07ca88fd91f7d95a284',
    );
    const { workspace } = fixture();
    const before = JSON.stringify(workspace.modulePlans);
    const loaded = importWorkspace(exportWorkspace(workspace));
    expect(JSON.stringify(loaded.modulePlans)).toBe(before);
    expect(loaded.modulePlans![0].modules[0]).not.toHaveProperty('excludedQuestionIds');
  });
  it('freezes only individually selected questions while preserving the original membership and omission IDs', () => {
    const { workspace, plan } = fixture();
    plan.modules[0].excludedQuestionIds = [questions[1].id];
    const originalMembership = [...plan.modules[0].questionIds];
    const dossier = createDossierFromModulePlan(plan, questions, workspace, fields);
    expect(moduleQuestionIds(plan.modules[0])).toEqual([questions[0].id]);
    expect(dossier.questions.map((question) => question.id)).toEqual([questions[0].id]);
    expect(dossier.modulePlanSnapshot!.modules[0].questionIds).toEqual(originalMembership);
    expect(dossier.modulePlanSnapshot!.modules[0].excludedQuestionIds).toEqual([questions[1].id]);
    workspace.dossiers = [dossier];
    expect(importWorkspace(exportWorkspace(workspace)).dossiers![0]).toEqual(dossier);
    const report = modulePlanMarkdown(workspace).join('\n');
    expect(report).toContain(`| vragen ${questions[0].id}\n`);
    expect(report).toContain(
      `Oorspronkelijk vraaglidmaatschap: ${originalMembership.join(', ')} | uitgesloten vragen: ${questions[1].id}`,
    );
    const frozen = JSON.stringify(dossier);
    plan.modules[0].excludedQuestionIds = [];
    plan.revision++;
    expect(JSON.stringify(dossier)).toBe(frozen);
    expect(() => assertDossierModulePlanSnapshot(dossier, workspace)).not.toThrow();
  });
  it('validates omissions as unique original members and detects omission tampering through the frozen hash', () => {
    const { workspace, plan } = fixture();
    for (const excludedQuestionIds of [null, 'q', [questions[0].id, questions[0].id], ['foreign']])
      expect(() =>
        assertModulePlan({ ...plan, modules: [{ ...plan.modules[0], excludedQuestionIds }] }),
      ).toThrow(/Moduleplan/);
    plan.modules[0].excludedQuestionIds = [questions[1].id];
    const dossier = createDossierFromModulePlan(plan, questions, workspace, fields);
    dossier.modulePlanSnapshot!.modules[0].excludedQuestionIds = [];
    expect(() => assertDossierModulePlanSnapshot(dossier, workspace)).toThrow(/hash/);
  });
  it('refuses an empty effective dossier even when the module itself is enabled', () => {
    const { workspace, plan } = fixture();
    plan.modules[0].excludedQuestionIds = [...plan.modules[0].questionIds];
    expect(modulePlanQuestionIds(plan)).toEqual([]);
    expect(() => assertModulePlans(workspace)).not.toThrow(); // An unfinished plan remains editable.
    expect(() => createDossierFromModulePlan(plan, questions, workspace, fields)).toThrow(
      /minimaal één/,
    );
    const forged = {
      ...fields,
      organisationId: 'org',
      projectContextId: 'context',
      departmentIds: ['dept'],
      status: 'active' as const,
      questions: [],
      sourceSnapshots: [workspace.sources[0]],
      modulePlanSnapshot: { ...plan, modules: [plan.modules[0]] },
    };
    expect(() =>
      assertDossierModulePlanSnapshot(
        { ...forged, modulePlanSnapshotSha256: modulePlanHash(forged.modulePlanSnapshot) },
        workspace,
      ),
    ).toThrow(/minimaal één/);
  });
  it('keeps a shared question selected through another enabled module after a local omission', () => {
    const { plan } = fixture();
    plan.modules[0].excludedQuestionIds = [questions[0].id];
    plan.modules[1].enabled = true;
    plan.modules[1].questionIds = [questions[0].id, questions[2].id];
    expect(modulePlanQuestionIds(plan)).toEqual([
      questions[1].id,
      questions[0].id,
      questions[2].id,
    ]);
  });
  it('round-trips exact selected/unselected definitions, source notes and two separate order values', () => {
    const { workspace } = fixture();
    expect(importWorkspace(exportWorkspace(workspace)).modulePlans).toEqual(workspace.modulePlans);
    expect(modulePlanQuestionIds(workspace.modulePlans![0])).toEqual([
      questions[1].id,
      questions[0].id,
    ]);
  });
  it('creates exactly the ordered selected questions and actual scope without creating answers', () => {
    const { workspace, plan } = fixture();
    const dossier = createDossierFromModulePlan(plan, questions, workspace, fields);
    expect(dossier.departmentIds).toEqual(['dept']);
    expect(dossier.organisationId).toBe('org');
    expect(dossier.questions.map((question) => question.id)).toEqual([
      questions[1].id,
      questions[0].id,
    ]);
    expect(workspace.answers).toEqual([]);
    expect(dossier.modulePlanSnapshot!.modules).toHaveLength(1);
    expect(dossier.modulePlanSnapshotSha256).toBe(modulePlanHash(dossier.modulePlanSnapshot!));
    workspace.dossiers = [dossier];
    expect(importWorkspace(exportWorkspace(workspace)).dossiers?.[0]).toEqual(dossier);
  });
  it('keeps a previous dossier source version and notes immutable when the live plan changes', () => {
    const { workspace, plan } = fixture();
    const dossier = createDossierFromModulePlan(plan, questions, workspace, fields);
    const before = JSON.stringify(dossier);
    plan.modules[0].enabled = false;
    plan.modules[1].enabled = true;
    plan.modules[0].scopeNotes = 'Andere scope';
    plan.revision++;
    expect(JSON.stringify(dossier)).toBe(before);
    expect(() => assertDossierModulePlanSnapshot(dossier, workspace)).not.toThrow();
    workspace.dossiers = [dossier];
    const report = modulePlanMarkdown(workspace).join('\n');
    expect(report).toContain('Andere scope');
    expect(report).toContain('Alleen werkplaats');
    expect(report).toContain(dossier.modulePlanSnapshotSha256);
  });
  it('rejects missing questions, cross-organisation scope, unknown fields and contradictory snapshot membership', () => {
    const { workspace, plan } = fixture();
    expect(() => createDossierFromModulePlan(plan, [], workspace, fields)).toThrow(
      /niet beschikbaar/,
    );
    plan.organisationId = 'other';
    expect(() => assertModulePlans(workspace)).toThrow(/niet overeen/);
    plan.organisationId = 'org';
    expect(() =>
      assertModulePlans({ ...workspace, modulePlans: [{ ...plan, invented: true } as ModulePlan] }),
    ).toThrow(/onbekend veld/);
    const dossier = createDossierFromModulePlan(plan, questions, workspace, fields);
    dossier.questions.reverse();
    expect(() => assertDossierModulePlanSnapshot(dossier, workspace)).toThrow(/dossiervragen/);
  });
  it('detects altered notes through the snapshot hash and rejects duplicate or unresolved provenance', () => {
    const { workspace, plan } = fixture();
    const dossier = createDossierFromModulePlan(plan, questions, workspace, fields);
    dossier.modulePlanSnapshot!.modules[0].scopeNotes = 'Onopgemerkte wijziging';
    expect(() => assertDossierModulePlanSnapshot(dossier, workspace)).toThrow(/hash/);
    plan.modules[0].sourceIds = ['missing'];
    expect(() => assertModulePlans(workspace)).toThrow(/bron missing/);
    plan.modules[0].sourceIds = ['legacy-source'];
    plan.modules[0].questionIds.push(questions[0].id);
    expect(() => assertModulePlans(workspace)).toThrow(/dubbel/);
  });
  it('separates catalog/imported themes from genuine legacy module IDs, while retaining deselected identities', () => {
    const { workspace, plan } = fixture();
    plan.modules[0].enabled = false;
    const imported = { ...questions[3], id: 'private-q', themeId: questions[3].themeId };
    workspace.questions = [imported];
    const options = modulePlanOptions(workspace, [...questions, imported]);
    expect(options.find((option) => option.id === 'legacy-m1')?.origin).toBe('legacy_module');
    expect(options.some((option) => option.origin === 'catalog_theme')).toBe(true);
    expect(options.find((option) => option.origin === 'imported_theme')?.questionIds).toEqual([
      'private-q',
    ]);
    expect(
      options
        .filter((option) => option.origin !== 'legacy_module')
        .flatMap((option) => option.questionIds),
    ).not.toContain(questions[0].id);
  });
  it('merges overlapping module question IDs once without changing the first chosen order', () => {
    const { plan } = fixture();
    plan.modules[1].enabled = true;
    plan.modules[1].questionIds = [questions[0].id, questions[2].id];
    expect(modulePlanQuestionIds(plan)).toEqual([
      questions[1].id,
      questions[0].id,
      questions[2].id,
    ]);
  });
  it('rejects malformed imported structures before walking relations', () => {
    const { workspace } = fixture();
    for (const modules of [null, 'string', [{ id: 'broken' }], [null]]) {
      expect(() =>
        importWorkspace(
          JSON.stringify({
            ...workspace,
            modulePlans: [{ ...workspace.modulePlans![0], modules }],
          }),
        ),
      ).toThrow(/Moduleplan/);
    }
  });
});
