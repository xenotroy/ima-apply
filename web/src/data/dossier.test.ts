import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { questions } from '../content/catalog';
import { createWorkspace, exportWorkspace, importWorkspace } from './index';
import { freezeQuestion, questionArtifact, evidenceHash } from './frozen';
import type { WorkspaceState, WorkspaceAnswer } from './model';

const timestamp = '2026-10-07T10:00:00.000Z';
function fixture(): WorkspaceState {
  return createWorkspace('Test', {
    organisations: [{ id: 'org', name: 'Organisatie', description: '' }],
    sites: [{ id: 'site', organisationId: 'org', name: 'Locatie', address: '' }],
    departments: [{ id: 'dept', siteId: 'site', name: 'Productie', activity: '' }],
    dossiers: [
      {
        id: 'dossier',
        title: 'RI&E',
        organisationId: 'org',
        departmentIds: ['dept'],
        scope: 'Productie',
        assessor: 'Beoordelaar',
        status: 'active',
        createdAt: timestamp,
        questions: [freezeQuestion(questions[0])],
      },
    ],
    evidence: [
      {
        id: 'proof',
        title: 'Inspectie',
        dossierId: 'dossier',
        kind: 'measurement',
        reference: 'private/test.pdf',
        description: 'Toetsing van de toepassing op de werkplek',
        recordedAt: timestamp,
        status: 'unverified',
      },
    ],
    observations: [
      {
        id: 'obs',
        title: 'Waarneming',
        dossierId: 'dossier',
        departmentId: 'dept',
        date: '2026-10-07',
        observer: 'Observator',
        facts: 'De werkplek is bezocht',
        evidenceIds: ['proof'],
      },
    ],
    findings: [
      {
        id: 'finding',
        title: 'Bevinding',
        dossierId: 'dossier',
        questionId: questions[0].id,
        description: 'Controlepunt vraagt onderbouwing',
        status: 'action_required',
        observationIds: ['obs'],
        evidenceIds: ['proof'],
        topicIds: [],
        legalIds: [],
        decisionBy: '',
        decisionNote: '',
      },
    ],
    actions: [
      {
        id: 'action',
        title: 'Verifieer werking',
        owner: '',
        dueDate: '',
        status: 'open',
        notes: 'Praktijktest',
        dossierId: 'dossier',
        findingId: 'finding',
        evidenceIds: ['proof'],
      },
    ],
  });
}
function answer(workspace: WorkspaceState): WorkspaceAnswer {
  const q = workspace.dossiers![0].questions[0];
  return {
    id: 'answer',
    dossierId: 'dossier',
    questionId: q.id,
    questionSha256: q.sha256,
    questionSnapshot: q.prompt,
    choice: 'partial',
    evidence: '',
    evidenceIds: ['proof'],
    note: '',
    answeredAt: timestamp,
  };
}
function roundtrip(w: WorkspaceState) {
  return importWorkspace(exportWorkspace(w));
}

describe('traceable assessment workflow', () => {
  it('retains organisation→assessment→answer→finding→evidence→action relationships', () => {
    const w = fixture();
    w.answers.push(answer(w));
    expect(roundtrip(w)).toEqual(w);
  });
  it('accepts early browser exports without silently deleting new records', () => {
    const old = createWorkspace('Early');
    for (const key of [
      'organisations',
      'sites',
      'departments',
      'dossiers',
      'evidence',
      'observations',
      'findings',
      'topics',
      'legalRecords',
      'investigations',
      'exposure',
    ] as const)
      delete old[key];
    expect(roundtrip(old)).toEqual(old);
  });
  it('uses SHA256 of the full ordered question artifact, checked against Node crypto', () => {
    const q = { ...questions[0], prompt: 'Vraag met é en 🛡️?' };
    const frozen = freezeQuestion(q);
    expect(frozen.sha256).toBe(createHash('sha256').update(questionArtifact(q)).digest('hex'));
    q.evidenceHints = ['Nieuwe aanwijzing'];
    expect(frozen.evidenceHints).not.toEqual(q.evidenceHints);
  });
  it.each(['prompt', 'assessmentGuidance', 'evidenceHints', 'sourceIds'])(
    'detects modifications to frozen %s before import replaces a dossier',
    (field) => {
      const w = fixture();
      const q = w.dossiers![0].questions[0] as unknown as Record<string, unknown>;
      q[field] = Array.isArray(q[field]) ? ['changed'] : 'changed';
      expect(() => roundtrip(w)).toThrow(/bronhash/);
    },
  );
  it('keeps the same question answered independently in two dossiers', () => {
    const w = fixture();
    w.dossiers!.push({ ...w.dossiers![0], id: 'second' });
    w.answers.push(answer(w), {
      ...answer(w),
      id: 'answer2',
      dossierId: 'second',
      evidenceIds: [],
      choice: 'no',
    });
    expect(roundtrip(w).answers.map((a) => a.choice)).toEqual(['partial', 'no']);
    w.answers.push({ ...answer(w), id: 'answer3' });
    expect(() => roundtrip(w)).toThrow(/meerdere antwoorden/);
  });
  it('rejects an answer pointing to a later question revision', () => {
    const w = fixture();
    w.answers.push({ ...answer(w), questionSha256: '0'.repeat(64) });
    expect(() => roundtrip(w)).toThrow(/bevroren dossiervraag/);
  });
  it('does not let a checked evidence flag stand in for verification', () => {
    const w = fixture();
    w.evidence![0].status = 'verified';
    expect(() => roundtrip(w)).toThrow(/verifiedBy/);
    Object.assign(w.evidence![0], {
      verifiedBy: 'Verificateur',
      verifiedAt: timestamp,
      verificationNote: 'Herhaald en gecontroleerd',
    });
    w.evidence![0].verifiedContentSha256 = evidenceHash(w.evidence![0]);
    expect(roundtrip(w).evidence![0].status).toBe('verified');
  });
  it('requires decision and verified evidence to close a finding', () => {
    const w = fixture();
    Object.assign(w.findings![0], {
      status: 'closed',
      decisionBy: 'Eigenaar',
      decisionNote: 'Maatregel effectief',
    });
    expect(() => roundtrip(w)).toThrow(/geverifieerd bewijs/);
    Object.assign(w.evidence![0], {
      status: 'verified',
      verifiedBy: 'Verificateur',
      verifiedAt: timestamp,
      verificationNote: 'Functietest',
    });
    w.evidence![0].verifiedContentSha256 = evidenceHash(w.evidence![0]);
    expect(roundtrip(w).findings![0].status).toBe('closed');
    expect(w.actions[0].status).toBe('open');
  });
  it('retains accepted risk as a decision without claiming it is resolved', () => {
    const w = fixture();
    Object.assign(w.findings![0], {
      status: 'risk_accepted',
      decisionBy: 'Verantwoordelijke',
      decisionNote: 'Afgebakend besluit met voorwaarden en herbeoordeling',
    });
    expect(roundtrip(w).findings![0].status).toBe('risk_accepted');
  });
  it('requires a recorded review to mark an assessment complete', () => {
    const w = fixture();
    w.dossiers![0].status = 'completed';
    expect(() => roundtrip(w)).toThrow(/reviewedBy/);
    Object.assign(w.dossiers![0], {
      reviewedBy: 'Reviewer',
      reviewedAt: timestamp,
      reviewNote: 'Scope en open punten beoordeeld',
    });
    expect(roundtrip(w).dossiers![0].status).toBe('completed');
  });
  it('rejects orphan evidence and cross-assessment observations', () => {
    const w = fixture();
    w.findings![0].evidenceIds = ['missing'];
    expect(() => roundtrip(w)).toThrow(/verwijzing bestaat niet/);
    w.findings![0].evidenceIds = ['proof'];
    w.dossiers!.push({ ...w.dossiers![0], id: 'second' });
    w.observations![0].dossierId = 'second';
    w.observations![0].evidenceIds = [];
    expect(() => roundtrip(w)).toThrow(/waarneming hoort bij een ander dossier/);
  });
  it('rejects foreign evidence from another assessment', () => {
    const w = fixture();
    w.dossiers!.push({ ...w.dossiers![0], id: 'second' });
    w.evidence![0].dossierId = 'second';
    expect(() => roundtrip(w)).toThrow(/bewijs hoort bij een ander dossier/);
  });
  it('rejects a scope containing a department belonging to another organisation', () => {
    const w = fixture();
    w.organisations!.push({ id: 'foreign', name: 'Andere', description: '' });
    w.dossiers![0].organisationId = 'foreign';
    expect(() => roundtrip(w)).toThrow(/buiten de gekozen organisatie/);
  });
  it('rejects duplicate exposure scopes instead of double counting hours', () => {
    const w = fixture();
    w.exposure = [
      {
        id: 'h1',
        period: '2026-10',
        departmentId: 'dept',
        hoursWorked: 100,
        source: 'Urenadministratie',
      },
      { id: 'h2', period: '2026-10', departmentId: 'dept', hoursWorked: 200, source: 'Nogmaals' },
    ];
    expect(() => roundtrip(w)).toThrow(/dubbele maand/);
  });
  it('rejects unsafe official references and impossible exposure months', () => {
    const w = fixture();
    w.legalRecords = [
      {
        id: 'l1',
        title: 'Signaal',
        officialUrl: 'javascript:alert(1)',
        citation: '',
        jurisdiction: 'NL',
        status: 'signal',
        effectiveOn: '',
        lastVerifiedOn: '2026-10-07',
        summary: 'Controle nodig',
        impact: '',
        topicIds: [],
      },
    ];
    expect(() => roundtrip(w)).toThrow(/http/);
    w.legalRecords = [];
    w.exposure = [
      { id: 'h1', period: '2026-13', departmentId: '', hoursWorked: 100, source: 'Administratie' },
    ];
    expect(() => roundtrip(w)).toThrow(/datum/);
  });
  it('rejects a valid department outside the assessment scope for observations', () => {
    const w = fixture();
    w.departments!.push({ id: 'foreign-dept', siteId: 'site', name: 'Andere', activity: '' });
    w.observations![0].departmentId = 'foreign-dept';
    expect(() => roundtrip(w)).toThrow(/dossierscope/);
  });
  it('rejects a cross-assessment scenario and a missing action scenario', () => {
    const w = fixture();
    w.dossiers!.push({ ...w.dossiers![0], id: 'second' });
    w.scenarios.push({
      id: 'risk',
      title: 'Scenario',
      dossierId: 'second',
      department: '',
      description: '',
      hazard: '',
      consequence: '',
      probability: 3,
      exposure: 6,
      effect: 7,
      controls: [],
    });
    w.findings![0].scenarioId = 'risk';
    expect(() => roundtrip(w)).toThrow(/scenario hoort bij een ander dossier/);
    w.findings![0].scenarioId = undefined;
    w.actions[0].scenarioId = 'missing';
    expect(() => roundtrip(w)).toThrow(/verwijzing bestaat niet/);
  });
  it('rejects altered evidence while an old verification is attached', () => {
    const w = fixture();
    const e = w.evidence![0];
    Object.assign(e, {
      status: 'verified',
      verifiedBy: 'Reviewer',
      verifiedAt: timestamp,
      verificationNote: 'Getoetst',
    });
    e.verifiedContentSha256 = evidenceHash(e);
    expect(roundtrip(w).evidence![0].status).toBe('verified');
    e.description = 'Een andere inhoud die niet is getoetst';
    expect(() => roundtrip(w)).toThrow(/gewijzigd sinds verificatie/);
  });
});
