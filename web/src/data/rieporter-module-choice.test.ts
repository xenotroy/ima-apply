import { describe, expect, it } from 'vitest';
import type { Question } from '../content/catalog';
import {
  createWorkspace,
  emptyProjectDetails,
  exportWorkspace,
  importWorkspace,
  type WorkspaceRecord,
} from './index';
import type { PiQuestionBinding, PiRouterBindings } from './pi-router';
import { modulePlanQuestionIds, type ModulePlan } from './module-plan';
import {
  assertRieporterSelectionAvailable,
  createRieporterProjectWorkspace,
  rieporterDepartmentOrganisationId,
  rieporterDepartmentPlans,
  rieporterModuleCatalog,
  rieporterProcessModuleId,
} from './rieporter-module-choice';

const binding = (questionId: string, process: string, aspect = 'Aspect Ω'): PiQuestionBinding => ({
  questionId,
  process,
  aspect,
  key: `occurrence:${questionId}`,
  code: 'DUPLICATE-VISIBLE-CODE',
  sourceId: 'pdf-source',
  page: 3,
  mappingStatus: 'candidate',
  topicIds: ['fire'],
});
const question = (id: string): Question => ({
  id,
  themeId: 'private-bank',
  title: `Bronvraag ${id}`,
  prompt: `Exacte fictieve inhoud ${id}`,
  route: 'kern',
  evidenceHints: [],
  assessmentGuidance: '',
  sourceIds: ['pdf-source'],
  suggestedHierarchy: [],
  roles: [],
});
function fixture() {
  const bank: PiRouterBindings = {
    id: 'actual-bank:Ω',
    schema: 'ima.pi-router-bindings/v1',
    sourceIds: ['pdf-source', 'bank-provenance'],
    sourceSha256: 'a'.repeat(64),
    bankDate: '2026-09-07',
    status: 'proposal',
    coverage: 'full_source',
    questions: [
      binding('q1', 'Proces exact Ω', 'A'),
      binding('q2', 'Proces exact Ω', 'B'),
      binding('q3', 'Proces exact B', 'C'),
    ],
  };
  const questions = bank.questions.map((entry) => question(entry.questionId));
  const workspace = createWorkspace('Fictieve bronwerkruimte', {
    questions: structuredClone(questions) as unknown as WorkspaceRecord[],
    sources: [
      { id: 'pdf-source', title: 'Fictieve bronpdf' },
      { id: 'bank-provenance', title: 'Exacte bankprovenance' },
      { id: 'unrelated', title: 'Niet betrokken bron' },
    ],
    contentRecords: [structuredClone(bank) as unknown as WorkspaceRecord],
    organisations: [
      { id: 'org', name: 'Werkelijke organisatie', description: '' },
      { id: 'other-org', name: 'Andere organisatie', description: '' },
    ],
    sites: [{ id: 'site', organisationId: 'org', name: 'Werkelijke locatie', address: '' }],
    departments: [
      { id: 'dept', siteId: 'site', name: 'Werkelijke afdeling', activity: '' },
      { id: 'direct', organisationId: 'org', name: 'Afdeling zonder locatie', activity: '' },
    ],
    projectContexts: [
      {
        id: 'context',
        title: 'Werkelijke context',
        organisationText: '',
        locationText: '',
        contactName: '',
        contactEmail: '',
        organisationIds: ['org'],
        details: emptyProjectDetails(),
        sourceIds: [],
      },
    ],
    answers: [
      {
        id: 'old-answer',
        questionId: 'q1',
        choice: 'unknown',
        evidence: '',
        note: 'Oud interview',
        answeredAt: '2026-10-01T09:00:00Z',
      },
    ],
  });
  return { workspace, bank, questions };
}
const fields = {
  id: 'new-dossier',
  title: 'Nieuwe afzonderlijke afdeling',
  scope: 'Exacte onderzoeksscope',
  assessor: 'Fictieve onderzoeker',
  createdAt: '2026-10-12T08:00:00Z',
};
function planFor(
  workspace: ReturnType<typeof fixture>['workspace'],
  questions: Question[],
): ModulePlan {
  const catalog = rieporterModuleCatalog(workspace, questions);
  return {
    id: 'manual-plan',
    title: 'Handmatige proceskeuze',
    scope: 'department',
    organisationId: 'org',
    departmentId: 'dept',
    projectContextId: 'context',
    modules: catalog.modules.map((module, index) => ({ ...module, enabled: index === 0 })),
    revision: 1,
    sourceIds: ['bank-provenance'],
  };
}
const validate = (workspace: ReturnType<typeof fixture>['workspace']) =>
  importWorkspace(JSON.stringify(workspace));

describe('runtime RIEporter source-bank process catalogue', () => {
  it('keeps exact process/aspect/occurrence identities and duplicate visible codes, with all bank provenance', () => {
    const { workspace, questions } = fixture(),
      before = structuredClone(workspace);
    const catalog = rieporterModuleCatalog(workspace, questions);
    expect(catalog.modules).toHaveLength(2);
    expect(catalog.modules[0]).toMatchObject({
      origin: 'imported_theme',
      title: 'Proces exact Ω',
      code: 'Proces exact Ω',
      enabled: false,
      questionIds: ['q1', 'q2'],
      sourceIds: ['pdf-source', 'bank-provenance'],
    });
    expect(catalog.questionMetadata.q1.code).toBe(catalog.questionMetadata.q2.code);
    expect(catalog.questionMetadata.q1.key).not.toBe(catalog.questionMetadata.q2.key);
    expect(catalog.questionMetadata.q1).toEqual({
      code: 'DUPLICATE-VISIBLE-CODE',
      key: 'occurrence:q1',
      aspect: 'A',
      process: 'Proces exact Ω',
      sourceId: 'pdf-source',
      page: 3,
      mappingStatus: 'candidate',
    });
    expect(catalog.banks[0]).toMatchObject({
      boundQuestionCount: 3,
      declaredQuestionCount: 3,
      availableQuestionCount: 3,
      processCount: 2,
      aspectCount: 3,
    });
    expect(workspace).toEqual(before);
  });
  it('uses bank identity and the exact process string, independent of bank/question ordering or duplicate labels', () => {
    const { workspace, bank, questions } = fixture();
    const original = rieporterModuleCatalog(workspace, questions);
    const reordered = structuredClone(bank);
    reordered.questions.reverse();
    workspace.contentRecords = [reordered as unknown as WorkspaceRecord];
    const result = rieporterModuleCatalog(workspace, questions);
    expect(result.modules.map((module) => module.id).sort()).toEqual(
      original.modules.map((module) => module.id).sort(),
    );
    expect(rieporterProcessModuleId(bank.id, 'Proces exact Ω')).not.toBe(
      rieporterProcessModuleId(bank.id, 'Proces exact Ω '),
    );
    const other = {
      ...structuredClone(bank),
      id: 'other-bank',
      questions: [binding('other-q', 'Proces exact Ω')],
    };
    workspace.contentRecords.push(other as unknown as WorkspaceRecord);
    expect(
      rieporterModuleCatalog(workspace, [...questions, question('other-q')]).modules,
    ).toHaveLength(3);
    expect(rieporterProcessModuleId(other.id, 'Proces exact Ω')).not.toBe(original.modules[0].id);
  });
  it('distinguishes declared original size, scoped bindings and genuinely missing definitions without dropping members', () => {
    const { workspace, bank, questions } = fixture();
    bank.coverage = 'scoped_selection';
    bank.originalQuestionCount = 1300;
    workspace.contentRecords = [bank as unknown as WorkspaceRecord];
    const catalog = rieporterModuleCatalog(
      workspace,
      questions.filter((question) => question.id !== 'q2'),
    );
    expect(catalog.banks[0]).toMatchObject({
      coverage: 'scoped_selection',
      declaredQuestionCount: 1300,
      boundQuestionCount: 3,
      availableQuestionCount: 2,
      missingQuestionIds: ['q2'],
      sourceSha256: bank.sourceSha256,
    });
    expect(catalog.modules[0].questionIds).toEqual(['q1', 'q2']);
    const blocked = { ...catalog.modules[0], enabled: true, excludedQuestionIds: ['q2'] };
    expect(() => assertRieporterSelectionAvailable(catalog, [blocked])).toThrow(
      /Herstel de bronbank/,
    );
    expect(() =>
      assertRieporterSelectionAvailable(catalog, [{ ...catalog.modules[1], enabled: true }]),
    ).not.toThrow();
  });
  it('blocks ambiguous metadata/definitions and missing or duplicated actual source IDs', () => {
    const { workspace, bank, questions } = fixture();
    const conflicting = {
      ...structuredClone(bank),
      id: 'other-bank',
      questions: [binding('q1', 'Changed process')],
    };
    workspace.contentRecords!.push(conflicting as unknown as WorkspaceRecord);
    const collision = rieporterModuleCatalog(workspace, questions);
    expect(collision.ambiguousQuestionIds).toEqual(['q1']);
    expect(collision.questionMetadata).not.toHaveProperty('q1');
    expect(collision.moduleAvailability[collision.modules[0].id].blocked).toBe(true);
    workspace.contentRecords = [bank as unknown as WorkspaceRecord];
    const duplicate = rieporterModuleCatalog(workspace, [...questions, question('q1')]);
    expect(duplicate.ambiguousQuestionIds).toEqual(['q1']);
    workspace.sources.push(structuredClone(workspace.sources[0]));
    expect(rieporterModuleCatalog(workspace, questions).banks[0].missingSourceIds).toEqual([
      'pdf-source',
    ]);
    workspace.sources.pop();
    workspace.sources = workspace.sources.filter((source) => source.id !== 'bank-provenance');
    const missing = rieporterModuleCatalog(workspace, questions);
    expect(missing.banks[0].missingSourceIds).toEqual(['bank-provenance']);
    expect(() =>
      assertRieporterSelectionAvailable(missing, [{ ...missing.modules[0], enabled: true }]),
    ).toThrow(/Herstel/);
  });
  it('rejects modified source membership, foreign module IDs and empty effective choices', () => {
    const { workspace, questions } = fixture(),
      catalog = rieporterModuleCatalog(workspace, questions);
    const chosen = { ...catalog.modules[0], enabled: true };
    expect(() =>
      assertRieporterSelectionAvailable(catalog, [{ ...chosen, questionIds: ['q1'] }]),
    ).toThrow(/vraagleden/);
    expect(() =>
      assertRieporterSelectionAvailable(catalog, [{ ...chosen, sourceIds: ['pdf-source'] }]),
    ).toThrow(/bronkoppelingen/);
    expect(() =>
      assertRieporterSelectionAvailable(catalog, [{ ...chosen, id: 'native-id-invented' }]),
    ).toThrow(/catalogus/);
    expect(() =>
      assertRieporterSelectionAvailable(catalog, [
        { ...chosen, excludedQuestionIds: ['q1', 'q2'] },
      ]),
    ).toThrow(/minimaal/);
  });
  it('leaves an empty workspace empty and never bundles or invents a source bank', () => {
    const catalog = rieporterModuleCatalog(createWorkspace('Leeg'), []);
    expect(catalog.modules).toEqual([]);
    expect(catalog.banks).toEqual([]);
    expect(catalog.moduleCount).toBe(0);
    expect(catalog.availableQuestionCount).toBe(0);
  });
  it('resolves exact department organisation/site edges and keeps project-wide plans separate', () => {
    const { workspace, questions } = fixture(),
      plan = planFor(workspace, questions);
    workspace.modulePlans = [
      plan,
      { ...plan, id: 'other-dept', departmentId: 'direct' },
      { ...plan, id: 'project-plan', scope: 'project', departmentId: undefined },
    ];
    expect(rieporterDepartmentOrganisationId(workspace, 'dept')).toBe('org');
    expect(rieporterDepartmentOrganisationId(workspace, 'direct')).toBe('org');
    expect(rieporterDepartmentOrganisationId(workspace, 'missing')).toBeUndefined();
    expect(rieporterDepartmentPlans(workspace, 'dept').map((plan) => plan.id)).toEqual([
      'manual-plan',
    ]);
  });
});

describe('explicit separate manual-choice project export', () => {
  it('refuses managed source metadata instead of freezing a scoped copy as a complete package version', () => {
    const { workspace, questions } = fixture(),
      plan = planFor(workspace, questions);
    questions[0].definition = {
      schema: 'ima.question-definition/v1',
      version: '1.0.0',
      status: 'draft',
      contentPackageId: 'actual-managed-package',
      contentPackageVersion: '1.0.0',
      topicIds: [],
      legalIds: [],
      tags: [],
    };
    workspace.questions = structuredClone(questions) as unknown as WorkspaceRecord[];
    const before = structuredClone({ workspace, plan, questions });
    expect(() =>
      createRieporterProjectWorkspace(workspace, plan, questions, fields, validate),
    ).toThrow(/volledige pakketversie/);
    expect({ workspace, plan, questions }).toEqual(before);
  });
  it('retains original module members/omissions, freezes exactly effective questions and copies real scope/provenance without old interviews', () => {
    const { workspace, bank, questions } = fixture(),
      plan = planFor(workspace, questions);
    plan.modules[0].excludedQuestionIds = ['q2'];
    const before = structuredClone({ workspace, plan, questions });
    const project = createRieporterProjectWorkspace(workspace, plan, questions, fields, validate);
    expect(project.id).not.toBe(workspace.id);
    expect(project.modulePlans![0].modules).toHaveLength(1);
    expect(project.modulePlans![0].modules[0].questionIds).toEqual(['q1', 'q2']);
    expect(project.modulePlans![0].modules[0].excludedQuestionIds).toEqual(['q2']);
    expect(project.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(project.dossiers![0].questions.map((q) => q.id)).toEqual(['q1']);
    expect(modulePlanQuestionIds(project.dossiers![0].modulePlanSnapshot!)).toEqual(['q1']);
    expect(project.departments!.map((d) => d.id)).toEqual(['dept']);
    expect(project.organisations!.map((o) => o.id)).toEqual(['org']);
    expect(project.sites!.map((s) => s.id)).toEqual(['site']);
    expect(project.projectContexts!.map((c) => c.id)).toEqual(['context']);
    expect(project.dossiers![0]).toMatchObject({
      departmentIds: ['dept'],
      organisationId: 'org',
      projectContextId: 'context',
    });
    const sourceBank = project.contentRecords![0] as unknown as PiRouterBindings;
    expect(sourceBank).toMatchObject({
      id: bank.id,
      coverage: 'scoped_selection',
      originalQuestionCount: 3,
      sourceSha256: bank.sourceSha256,
      bankDate: bank.bankDate,
    });
    expect(sourceBank.questions.map((q) => q.questionId)).toEqual(['q1', 'q2']);
    expect(sourceBank.scopeNote).toContain('Handmatige modulekeuze manual-plan');
    expect(
      project.contentRecords!.every((record) => record.schema === 'ima.pi-router-bindings/v1'),
    ).toBe(true);
    expect(project.sources.map((s) => s.id)).toEqual(['pdf-source', 'bank-provenance']);
    expect(project.answers).toEqual([]);
    expect(project.actions).toEqual([]);
    expect(project.evidence).toEqual([]);
    expect({ workspace, plan, questions }).toEqual(before);
  });
  it('does not transfer cross-organisation scope or unmatched sources', () => {
    const { workspace, questions } = fixture(),
      plan = planFor(workspace, questions);
    expect(() =>
      createRieporterProjectWorkspace(
        workspace,
        { ...plan, organisationId: 'other-org' },
        questions,
        fields,
        validate,
      ),
    ).toThrow(/niet overeen/);
    workspace.sources = workspace.sources.filter((source) => source.id !== 'pdf-source');
    expect(() =>
      createRieporterProjectWorkspace(workspace, plan, questions, fields, validate),
    ).toThrow(/Herstel/);
  });
  it('enforces the real 2MB native boundary when freezing would duplicate a large but valid source workspace', () => {
    const { workspace, bank } = fixture();
    bank.questions = Array.from({ length: 19 }, (_, index) =>
      binding(`large-${index}`, 'Groot bronproces'),
    );
    workspace.contentRecords = [bank as unknown as WorkspaceRecord];
    const questions = bank.questions.map((q) => ({
      ...question(q.questionId),
      prompt: 'Ω'.repeat(40_000),
    }));
    workspace.questions = questions as unknown as WorkspaceRecord[];
    expect(Buffer.byteLength(exportWorkspace(workspace))).toBeLessThan(2_000_000);
    const plan = planFor(workspace, questions),
      before = structuredClone(workspace);
    expect(() =>
      createRieporterProjectWorkspace(workspace, plan, questions, fields, validate),
    ).toThrow(/groter dan 2000000 bytes/);
    expect(workspace).toEqual(before);
  });
});
