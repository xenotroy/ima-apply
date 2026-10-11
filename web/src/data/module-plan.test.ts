import { describe, expect, it } from 'vitest';
import { createWorkspace, exportWorkspace, importWorkspace, emptyProjectDetails } from './index';
import { questions } from '../content/catalog';
import {
  assertModulePlans,
  assertDossierModulePlanSnapshot,
  createDossierFromModulePlan,
  modulePlanOptions,
  modulePlanQuestionIds,
  modulePlanMarkdown,
  modulePlanHash,
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
