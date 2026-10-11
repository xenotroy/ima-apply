import { describe, expect, it } from 'vitest';
import { questions } from '../content/catalog';
import { createWorkspace, type WorkspaceAnswer, type WorkspaceState } from './model';
import { freezeQuestion } from './frozen';
import { exportWorkspace, importWorkspace } from './index';
import {
  assertResponseRelations,
  responseRelationsMarkdown,
  upsertResponse,
  type RelatedResponse,
} from './response-relations';

const editedAt = '2026-10-11T12:00:00Z';

function fixture(): WorkspaceState {
  const frozen = questions.slice(0, 2).map((question) => freezeQuestion(question));
  const dossier = (id: string) => ({
    id,
    title: `Dossier ${id}`,
    departmentIds: [],
    scope: `Begrensde scope ${id}`,
    assessor: 'Beoordelaar is geen veronderstelde respondent',
    status: 'draft' as const,
    createdAt: '2026-10-11T08:00:00Z',
    questions: structuredClone(frozen),
  });
  return createWorkspace('Responsefixture', {
    dossiers: [dossier('d1'), dossier('d2')],
    answers: [
      {
        id: 'a1',
        dossierId: 'd1',
        questionId: frozen[0].id,
        choice: 'partial',
        evidence: 'Interview en waarneming',
        note: 'Historisch antwoord; auteur niet beschikbaar',
        answeredAt: '2026-10-11T09:00:00Z',
        questionSnapshot: frozen[0].prompt,
        questionSha256: frozen[0].sha256,
        contentVersion: frozen[0].version,
      },
    ],
    observations: ['o1', 'o2', 'o-other'].map((id) => ({
      id,
      dossierId: id === 'o-other' ? 'd2' : 'd1',
      title: `Feit ${id}`,
      date: '2026-10-11',
      observer: 'Waarnemer',
      facts: `Concreet waargenomen feit ${id}`,
      evidenceIds: [],
    })),
    findings: ['f1', 'f2', 'f-other'].map((id) => ({
      id,
      dossierId: id === 'f-other' ? 'd2' : 'd1',
      // A finding's primary question is not its complete supporting-response relation.
      questionId: frozen[0].id,
      title: `Bevinding ${id}`,
      description: 'Onderbouwde tekortkoming',
      status: 'open' as const,
      observationIds: [],
      evidenceIds: [],
      topicIds: [],
      legalIds: [],
      decisionBy: '',
      decisionNote: '',
    })),
    evidence: ['e1', 'e2', 'e-other'].map((id) => ({
      id,
      dossierId: id === 'e-other' ? 'd2' : 'd1',
      title: `Bewijs ${id}`,
      kind: 'interview' as const,
      reference: '',
      description: 'Herleidbaar interviewverslag',
      recordedAt: '2026-10-11T08:30:00Z',
      status: 'unverified' as const,
    })),
  });
}

function edit(workspace: WorkspaceState, changes: Partial<RelatedResponse> = {}) {
  return {
    ...workspace,
    ...upsertResponse(workspace, {
      answer: { ...workspace.answers[0], ...changes },
      respondedBy: 'Respondent A',
      answeredAt: editedAt,
    }),
  };
}

describe('response authorship and multiple evidence, observation and finding relations', () => {
  it('keeps historically unknown authors and relations absent until an actual edit', () => {
    const workspace = fixture();
    const original = JSON.stringify(workspace);
    expect(() => assertResponseRelations(workspace)).not.toThrow();
    const report = responseRelationsMarkdown(workspace).join('\n');
    expect(report).toContain('Respondent: Historisch niet vastgelegd');
    expect(report).toContain('Waarnemingen: Historisch niet vastgelegd');
    expect(JSON.stringify(workspace)).toBe(original);
    const changed = edit(workspace);
    expect((changed.answers[0] as RelatedResponse).respondedBy).toBe('Respondent A');
    expect(changed.answers[0].answeredAt).toBe(editedAt);
    expect((changed.answers[0] as RelatedResponse).observationIds).toBeUndefined();
    expect((workspace.answers[0] as RelatedResponse).respondedBy).toBeUndefined();
  });

  it('atomically links multiple same-dossier targets in both directions without changing other scopes', () => {
    const workspace = fixture();
    const before = JSON.stringify(workspace);
    const otherObservation = workspace.observations![2];
    const otherFinding = workspace.findings![2];
    const patch = upsertResponse(workspace, {
      answer: workspace.answers[0],
      respondedBy: '  Interviewer B  ',
      answeredAt: editedAt,
      observationIds: ['o1', 'o2'],
      findingIds: ['f1', 'f2'],
      evidenceIds: ['e1', 'e2'],
    });
    const changed = { ...workspace, ...patch };
    expect(changed.answers[0]).toMatchObject({
      id: 'a1',
      respondedBy: 'Interviewer B',
      observationIds: ['o1', 'o2'],
      findingIds: ['f1', 'f2'],
      evidenceIds: ['e1', 'e2'],
    });
    expect(changed.observations?.slice(0, 2)).toEqual([
      { ...workspace.observations![0], responseIds: ['a1'] },
      { ...workspace.observations![1], responseIds: ['a1'] },
    ]);
    expect(changed.findings?.slice(0, 2)).toEqual([
      { ...workspace.findings![0], responseIds: ['a1'] },
      { ...workspace.findings![1], responseIds: ['a1'] },
    ]);
    expect(changed.observations?.[2]).toBe(otherObservation);
    expect(changed.findings?.[2]).toBe(otherFinding);
    expect(JSON.stringify(workspace)).toBe(before);
    expect(() => assertResponseRelations(changed)).not.toThrow();
  });

  it('preserves the existing ID and all links when choice, note or evidence text changes', () => {
    let workspace = fixture();
    workspace = {
      ...workspace,
      ...upsertResponse(workspace, {
        answer: workspace.answers[0],
        respondedBy: 'Respondent A',
        observationIds: ['o1'],
        findingIds: ['f1'],
        evidenceIds: ['e1'],
      }),
    };
    const changed = edit(workspace, {
      id: 'proposed-new-id-must-not-replace-existing',
      choice: 'yes',
      note: 'Nadere uitleg',
      evidence: 'Aanvullend interview',
    });
    expect(changed.answers).toHaveLength(1);
    expect(changed.answers[0]).toMatchObject({
      id: 'a1',
      choice: 'yes',
      note: 'Nadere uitleg',
      evidence: 'Aanvullend interview',
      observationIds: ['o1'],
      findingIds: ['f1'],
      evidenceIds: ['e1'],
    });
    expect(changed.observations![0]).toBe(workspace.observations![0]);
    expect(changed.findings![0]).toBe(workspace.findings![0]);
  });

  it('supports many responses to one observation/finding without changing the primary finding question', () => {
    let workspace = fixture();
    workspace = {
      ...workspace,
      ...upsertResponse(workspace, {
        answer: workspace.answers[0],
        respondedBy: 'A',
        observationIds: ['o1'],
        findingIds: ['f1'],
      }),
    };
    const second = workspace.dossiers![0].questions[1];
    const changed = {
      ...workspace,
      ...upsertResponse(workspace, {
        answer: {
          id: 'a2',
          dossierId: 'd1',
          questionId: second.id,
          choice: 'no',
          note: 'Aanvullende onderbouwing van dezelfde bevinding',
          evidence: '',
          answeredAt: editedAt,
          questionSnapshot: second.prompt,
          questionSha256: second.sha256,
          contentVersion: second.version,
        },
        respondedBy: 'B',
        observationIds: ['o1'],
        findingIds: ['f1'],
      }),
    };
    expect(changed.answers).toHaveLength(2);
    expect(changed.observations![0]).toMatchObject({ responseIds: ['a1', 'a2'] });
    expect(changed.findings![0]).toMatchObject({ responseIds: ['a1', 'a2'] });
    expect(changed.findings![0].questionId).toBe(questions[0].id);
    expect(() => assertResponseRelations(changed)).not.toThrow();

    const removed = {
      ...changed,
      ...upsertResponse(changed, {
        answer: changed.answers[0],
        respondedBy: 'A',
        observationIds: [],
        findingIds: [],
      }),
    };
    expect(removed.observations![0]).toMatchObject({ responseIds: ['a2'] });
    expect(removed.findings![0]).toMatchObject({ responseIds: ['a2'] });
    expect(removed.answers[1]).toBe(changed.answers[1]);
    expect(() => assertResponseRelations(removed)).not.toThrow();
  });

  it('round-trips the complete relationship graph and actual respondent through JSON export/import', () => {
    const workspace = fixture();
    const changed = {
      ...workspace,
      ...upsertResponse(workspace, {
        answer: workspace.answers[0],
        respondedBy: 'Interviewer',
        answeredAt: editedAt,
        observationIds: ['o1', 'o2'],
        findingIds: ['f1', 'f2'],
        evidenceIds: ['e1', 'e2'],
      }),
    };
    const reloaded = importWorkspace(exportWorkspace(changed));
    expect(reloaded.answers).toEqual(changed.answers);
    expect(reloaded.observations).toEqual(changed.observations);
    expect(reloaded.findings).toEqual(changed.findings);
    expect(() => assertResponseRelations(reloaded)).not.toThrow();
  });

  it.each([
    ['observationIds', ['o-other']],
    ['findingIds', ['f-other']],
    ['evidenceIds', ['e-other']],
  ] as const)('rejects cross-dossier %s links before mutating anything', (key, value) => {
    const workspace = fixture();
    const before = JSON.stringify(workspace);
    expect(() =>
      upsertResponse(workspace, {
        answer: workspace.answers[0],
        respondedBy: 'Respondent',
        [key]: value,
      }),
    ).toThrow(/ander dossier/);
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it.each([
    ['observationIds', ['missing']],
    ['findingIds', ['missing']],
    ['evidenceIds', ['missing']],
    ['observationIds', ['o1', 'o1']],
    ['findingIds', ['f1', 'f1']],
    ['evidenceIds', ['e1', 'e1']],
  ] as const)('rejects missing or duplicate %s references', (key, value) => {
    const workspace = fixture();
    expect(() =>
      upsertResponse(workspace, {
        answer: workspace.answers[0],
        respondedBy: 'Respondent',
        [key]: value,
      }),
    ).toThrow(/bestaat niet|dubbele verwijzing/);
  });

  it('rejects unilateral, contradictory, nonexistent and cross-dossier inverse references', () => {
    const workspace = fixture();
    const answer = workspace.answers[0] as RelatedResponse;
    answer.observationIds = ['o1'];
    expect(() => assertResponseRelations(workspace)).toThrow(/verwijst niet terug/);
    workspace.observations![0] = { ...workspace.observations![0], responseIds: ['a1'] };
    expect(() => assertResponseRelations(workspace)).not.toThrow();
    answer.observationIds = [];
    expect(() => assertResponseRelations(workspace)).toThrow(/verwijst niet terug/);
    workspace.observations![0] = { ...workspace.observations![0], responseIds: ['missing'] };
    expect(() => assertResponseRelations(workspace)).toThrow(/bestaat niet/);
    workspace.observations![0] = { ...workspace.observations![0], responseIds: [] };
    workspace.observations![2] = { ...workspace.observations![2], responseIds: ['a1'] };
    expect(() => assertResponseRelations(workspace)).toThrow(/ander dossier/);
  });

  it('rejects multiple existing responses for one question/scope and response-ID appropriation', () => {
    const workspace = fixture();
    workspace.answers.push({ ...workspace.answers[0], id: 'duplicate-pair' });
    expect(() => assertResponseRelations(workspace)).toThrow(/meerdere antwoorden/);
    workspace.answers[1].questionId = workspace.dossiers![0].questions[1].id;
    expect(() =>
      upsertResponse(workspace, {
        answer: { ...workspace.answers[0], id: 'duplicate-pair' },
        respondedBy: 'Respondent',
      }),
    ).toThrow(/andere vraag of dossier/);
  });

  it('requires explicit human authorship and a valid edit timestamp without inferring the assessor', () => {
    const workspace = fixture();
    expect(() =>
      upsertResponse(workspace, { answer: workspace.answers[0], respondedBy: '   ' }),
    ).toThrow(/respondent/);
    expect(() =>
      upsertResponse(workspace, {
        answer: workspace.answers[0],
        respondedBy: 'Respondent',
        answeredAt: '2026-10-11T12:00:00',
      }),
    ).toThrow(/tijdzone/);
    const changed = edit(workspace);
    expect((changed.answers[0] as RelatedResponse).respondedBy).not.toBe(
      workspace.dossiers![0].assessor,
    );
  });

  it('keeps unmanaged legacy answers usable while forbidding scoped observation links', () => {
    const workspace = fixture();
    const unmanaged: WorkspaceAnswer = {
      id: 'unmanaged',
      questionId: 'old-unmanaged-question',
      choice: 'unknown',
      evidence: '',
      note: '',
      answeredAt: '2020-01-01T00:00:00Z',
    };
    workspace.answers.push(unmanaged);
    expect(() => assertResponseRelations(workspace)).not.toThrow();
    const patch = upsertResponse(workspace, {
      answer: unmanaged,
      respondedBy: 'Actuele respondent',
    });
    expect((patch.answers![1] as RelatedResponse).respondedBy).toBe('Actuele respondent');
    expect(() =>
      upsertResponse(workspace, {
        answer: unmanaged,
        respondedBy: 'Respondent',
        observationIds: ['o1'],
      }),
    ).toThrow(/ander dossier/);
  });

  it('retains old unscoped evidence without treating it as new same-dossier evidence', () => {
    const workspace = fixture();
    delete workspace.evidence![0].dossierId;
    workspace.answers[0].evidenceIds = ['e1'];
    expect(() => assertResponseRelations(workspace)).not.toThrow();
    expect(edit(workspace).answers[0].evidenceIds).toEqual(['e1']);
    expect(() =>
      upsertResponse(workspace, {
        answer: workspace.answers[0],
        respondedBy: 'Respondent',
        evidenceIds: ['e1'],
      }),
    ).toThrow(/geen vastgelegde dossierscope/);
  });

  it('reports actual IDs, explicit empty lists and the correct dossier while escaping free text', () => {
    const workspace = fixture();
    const changed = {
      ...workspace,
      ...upsertResponse(workspace, {
        answer: workspace.answers[0],
        respondedBy: '[persoon] #1',
        observationIds: ['o1'],
        findingIds: [],
      }),
    };
    const report = responseRelationsMarkdown(changed, 'd1').join('\n');
    expect(report).toContain('Respondent: \\[persoon\\] \\#1');
    expect(report).toContain('Feit o1 (o1)');
    expect(report).toContain('Bevindingen: Geen gekoppeld');
    expect(responseRelationsMarkdown(changed, 'd2')).toEqual([]);
  });
});
