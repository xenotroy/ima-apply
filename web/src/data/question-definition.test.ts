import { describe, expect, it } from 'vitest';
import type { Question } from '../content/catalog';
import { questions as builtinQuestions } from '../content/catalog';
import { createWorkspace, exportWorkspace, importWorkspace } from './index';
import type { Dossier } from './dossier';
import type { WorkspaceRecord, WorkspaceState } from './model';
import { freezeQuestion, questionHash } from './frozen';
import {
  addQuestionDefinition,
  assertDossierQuestionPackages,
  assertManagedQuestion,
  assertQuestionDefinitions,
  assertQuestionPackageSnapshot,
  captureQuestionPackages,
  isHigherQuestionVersion,
  questionDefinitionsMarkdown,
  questionPackagesMarkdown,
  setQuestionDefinitionStatus,
  type ManagedQuestion,
  type QuestionDefinitionDraft,
  type QuestionPackageSnapshot,
} from './question-definition';
const now = '2026-10-11T10:00:00Z';
function definition(id = 'q1', version = '1.0.0', packageVersion = '1.0.0'): ManagedQuestion {
  return {
    ...structuredClone(builtinQuestions[0]),
    id,
    title: `Definitie ${id}`,
    prompt: 'Is de faalconditie gecontroleerd?',
    assessmentGuidance: 'Controleer de feitelijke werkmethode.',
    acceptanceCriteria: 'Afzonderlijk toetscriterium.',
    expectedEvidence: 'Afzonderlijk bewijsveld.',
    richFields: {
      hazard: 'Energiebron',
      risk: 'Contactscenario',
      riskFactor: 'Onbedoelde herstart',
      technicalControls: 'Isolatie',
      organisationalControls: 'Werkautorisatie',
      rootCauses: 'Onvoldoende ontwerpcontrole',
      culture: 'Stopbesluit',
      number: 'A-3',
      sortOrder: 7,
    },
    definition: {
      schema: 'ima.question-definition/v1',
      version,
      status: 'active',
      contentPackageId: 'PACK',
      contentPackageVersion: packageVersion,
      topicIds: [],
      legalIds: [],
      tags: ['ontwerp'],
      createdAt: now,
      updatedAt: now,
    },
  };
}
function fixture(...defs: ManagedQuestion[]) {
  return createWorkspace('Vraagfixture', { questions: defs as unknown as WorkspaceRecord[] });
}
function dossier(
  workspace: WorkspaceState,
  selected = ['q1'],
): Dossier & { contentPackageSnapshots: QuestionPackageSnapshot[] } {
  const snapshots = captureQuestionPackages(selected, workspace);
  return {
    id: 'd',
    title: 'Dossier',
    departmentIds: [],
    scope: 'Werkplaats',
    assessor: 'Testbeoordelaar',
    status: 'draft',
    createdAt: now,
    questions: selected.map((id) => {
      const q = workspace.questions.find((q) => q.id === id) as unknown as ManagedQuestion;
      return freezeQuestion(q, q.definition.version);
    }),
    contentPackageSnapshots: snapshots,
  };
}
function draft(q: ManagedQuestion): QuestionDefinitionDraft {
  const { id: _id, definition: meta, ...content } = structuredClone(q);
  const { schema: _schema, createdAt: _createdAt, updatedAt: _updatedAt, ...definition } = meta;
  return { ...content, definition };
}
describe('managed definitions and complete package freezes', () => {
  it('retains one authoritative content definition with separate original fields', () => {
    const q = definition();
    assertManagedQuestion(q);
    const w = fixture(q);
    const d = dossier(w);
    w.dossiers = [d];
    const frozen = d.questions[0];
    expect(frozen.prompt).toBe(q.prompt);
    expect(frozen.assessmentGuidance).toBe(q.assessmentGuidance);
    expect(frozen.acceptanceCriteria).toBe(q.acceptanceCriteria);
    expect(frozen.expectedEvidence).toBe(q.expectedEvidence);
    expect(frozen.richFields).toEqual(q.richFields);
    expect(frozen.sha256).toBe(questionHash(q));
    assertQuestionDefinitions(w);
  });
  it('freezes ALL package definitions including unselected draft and retired definitions', () => {
    const a = definition('z-selected');
    const b = definition('a-draft');
    b.definition.status = 'draft';
    const c = definition('m-retired');
    c.definition.status = 'retired';
    const w = fixture(a, b, c);
    const snapshots = captureQuestionPackages(['z-selected'], w);
    expect(snapshots[0].questions.map((q) => q.id)).toEqual(['a-draft', 'm-retired', 'z-selected']);
    expect(snapshots[0].questions.map((q) => q.definition!.status)).toEqual([
      'draft',
      'retired',
      'active',
    ]);
    assertQuestionPackageSnapshot(snapshots[0]);
    const reordered = fixture(c, a, b);
    expect(captureQuestionPackages(['z-selected'], reordered)[0].sha256).toBe(snapshots[0].sha256);
  });
  it('rejects every later change/addition/removal in a frozen package, not only selected questions', () => {
    const w = fixture(definition(), definition('q2'));
    w.dossiers = [dossier(w)];
    const changed = structuredClone(w);
    changed.questions[1].acceptanceCriteria = 'Nieuw criterium';
    expect(() => assertQuestionDefinitions(changed)).toThrow(/bevroren pakketversie is gewijzigd/);
    const added = structuredClone(w);
    added.questions.push(definition('q3') as unknown as WorkspaceRecord);
    expect(() => assertQuestionDefinitions(added)).toThrow(/late definities/);
    const removed = structuredClone(w);
    removed.questions.pop();
    expect(() => assertQuestionDefinitions(removed)).toThrow(/bevroren pakketversie is gewijzigd/);
    expect(() => addQuestionDefinition(w, draft(definition('q3')), { id: 'q3', now })).toThrow(
      /pakketversie is bevroren/,
    );
    expect(() => setQuestionDefinitionStatus(w, 'q2', 'retired', now)).toThrow(
      /pakketversie is bevroren/,
    );
  });
  it('requires same package and strictly higher question AND package versions for a successor', () => {
    const w = fixture(definition());
    const next = draft(definition('q2', '1.0.1', '1.0.1'));
    next.definition.supersedesId = 'q1';
    const created = addQuestionDefinition(w, next, { id: 'q2', now });
    expect(created.definition.supersedesId).toBe('q1');
    for (const mutate of [
      (x: QuestionDefinitionDraft) => {
        x.definition.version = '1.0.0';
      },
      (x: QuestionDefinitionDraft) => {
        x.definition.contentPackageVersion = '1.0.0';
      },
      (x: QuestionDefinitionDraft) => {
        x.definition.contentPackageId = 'OTHER';
      },
      (x: QuestionDefinitionDraft) => {
        x.definition.supersedesId = 'absent';
      },
    ]) {
      const invalid = structuredClone(next);
      mutate(invalid);
      expect(() => addQuestionDefinition(w, invalid, { id: 'q2', now })).toThrow();
    }
    expect(isHigherQuestionVersion('1.0.9007199254740993', '1.0.9007199254740992')).toBe(true);
    expect(() => isHigherQuestionVersion('01.0.1', '1.0.0')).toThrow(/x.y.z/);
  });
  it('rejects nonactive selection and mixed package versions with case-insensitive package identity', () => {
    const a = definition();
    const b = definition('q2', '2.0.0', '2.0.0');
    b.definition.contentPackageId = 'pack';
    const w = fixture(a, b);
    expect(() => captureQuestionPackages(['q1', 'q2'], w)).toThrow(/meerdere versies/);
    a.definition.status = 'draft';
    expect(() => captureQuestionPackages(['q1'], w)).toThrow(/alleen actieve/);
    expect(captureQuestionPackages([], w)).toEqual([]);
  });
  it('preserves v1 exactly after publication of a higher package/question version', () => {
    const w = fixture(definition());
    const old = dossier(w);
    w.dossiers = [old];
    const before = structuredClone(old);
    const next = draft(definition('q2', '2.0.0', '2.0.0'));
    next.definition.supersedesId = 'q1';
    next.prompt = 'Nieuwe controleerbare vraag.';
    const successor = addQuestionDefinition(w, next, { id: 'q2', now });
    w.questions.push(successor as unknown as WorkspaceRecord);
    assertQuestionDefinitions(w);
    expect(w.dossiers[0]).toEqual(before);
    const newer = dossier(w, ['q2']);
    expect(newer.questions[0].prompt).toBe(next.prompt);
    expect(newer.contentPackageSnapshots[0].version).toBe('2.0.0');
    expect(old.contentPackageSnapshots[0].version).toBe('1.0.0');
  });
  it('guards status transitions before freezing without inventing historical authors or dates', () => {
    const q = definition();
    q.definition.status = 'draft';
    delete q.definition.createdAt;
    delete q.definition.updatedAt;
    const w = fixture(q);
    assertQuestionDefinitions(w);
    const active = setQuestionDefinitionStatus(w, 'q1', 'active', now);
    expect(active.definition.createdAt).toBeUndefined();
    expect(active.definition.updatedAt).toBe(now);
    expect(() => setQuestionDefinitionStatus(fixture(active), 'q1', 'draft', now)).toThrow(
      /statusovergang/,
    );
    const retired = setQuestionDefinitionStatus(fixture(active), 'q1', 'retired', now);
    expect(() => setQuestionDefinitionStatus(fixture(retired), 'q1', 'active', now)).toThrow(
      /statusovergang/,
    );
    expect(questionDefinitionsMarkdown(w)).toContain('historisch onbekend');
  });
  it('checks topic/legal relations and rejects malformed metadata before relational reads', () => {
    const q = definition();
    q.definition.topicIds = ['missing'];
    expect(() => assertQuestionDefinitions(fixture(q))).toThrow(/onderwerp missing/);
    q.definition.topicIds = [];
    q.definition.legalIds = ['missing'];
    expect(() => assertQuestionDefinitions(fixture(q))).toThrow(/wetgevingsrecord missing/);
    for (const bad of [
      null,
      { definition: [] },
      { ...definition(), definition: { ...definition().definition, topicIds: 'not-array' } },
      { ...definition(), richFields: { bonus: 1 } },
    ])
      expect(() => assertManagedQuestion(bad)).toThrow();
  });
  it('detects package/question tampering, unsorted identities, and mismatched selected definitions', () => {
    const w = fixture(definition(), definition('q2'));
    const d = dossier(w);
    w.dossiers = [d];
    const tampered = structuredClone(d.contentPackageSnapshots[0]);
    tampered.questions[1].expectedEvidence = 'Changed';
    expect(() => assertQuestionPackageSnapshot(tampered)).toThrow(/vraaghash/);
    const reversed = structuredClone(d.contentPackageSnapshots[0]);
    reversed.questions.reverse();
    expect(() => assertQuestionPackageSnapshot(reversed)).toThrow(/gesorteerd/);
    const wrong = structuredClone(d);
    wrong.questions[0].version = '2.0.0';
    expect(() => assertDossierQuestionPackages(wrong, w)).toThrow(/ontbreekt/);
    const missing = structuredClone(d);
    missing.contentPackageSnapshots = [];
    expect(() => assertDossierQuestionPackages(missing, w)).toThrow(/pakketfreeze/);
  });
  it('keeps unmanaged original questions and historic hash compatibility', () => {
    const q = structuredClone(builtinQuestions[0]);
    const w = createWorkspace('Old', { questions: [q as unknown as WorkspaceRecord] });
    assertQuestionDefinitions(w);
    expect(captureQuestionPackages([q.id], w)).toEqual([]);
    const oldHash = questionHash(q);
    const extended: Question = { ...q, acceptanceCriteria: 'Extra criterion' };
    expect(questionHash(extended)).not.toBe(oldHash);
    expect(questionHash(q)).toBe(oldHash);
  });
  it('retains full content, predecessor and complete snapshots across JSON export/import and Markdown', () => {
    const w = fixture(definition(), definition('q2'));
    w.dossiers = [dossier(w)];
    const imported = importWorkspace(exportWorkspace(w));
    expect(imported.questions).toEqual(w.questions);
    expect(imported.dossiers).toEqual(w.dossiers);
    const markdown = questionPackagesMarkdown(w.dossiers[0]);
    expect(markdown).toContain('2 volledige definities');
    expect(markdown).toContain('Afzonderlijk toetscriterium.');
    expect(markdown).toContain('Afzonderlijk bewijsveld.');
    expect(markdown).toContain('Onbedoelde herstart');
    expect(markdown).toContain(w.dossiers[0].contentPackageSnapshots![0].sha256);
  });
});
