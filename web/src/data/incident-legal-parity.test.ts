import { describe, expect, it } from 'vitest';
import { createWorkspace, exportWorkspace, importWorkspace, type WorkspaceState } from './index';
import { dossierMarkdown } from '../components/DossierReport';
import { calculateSafetyAnalytics } from './analytics';

function fixture(): WorkspaceState {
  return createWorkspace('Fictieve veldpariteit Ω', {
    dossiers: [
      {
        id: 'dossier',
        title: 'Fictief dossier',
        departmentIds: [],
        scope: 'Fictieve scope',
        assessor: 'Fictieve onderzoeker',
        status: 'draft',
        createdAt: '2026-10-01T10:00:00Z',
        questions: [],
      },
    ],
    topics: [
      { id: 'parent', title: 'Fictieve hoofdgroep', category: '', description: '', aliases: [] },
      {
        id: 'child',
        title: 'Fictief kind',
        category: '',
        description: '',
        aliases: [],
        parentId: 'parent',
        tags: ['Ω'],
        status: 'bronstatus',
      },
    ],
    incidents: [
      {
        id: 'incident',
        title: 'Fictieve ziekte',
        date: '2026-10-01',
        department: '',
        type: 'incident',
        description: 'Fictieve feiten',
        actionIds: [],
        kind: 'illness',
        occurredAt: '2026-10-01T00:30:00.1234567+02:00',
        reportedAt: '2026-10-02T11:00:00+02:00',
        organisation: 'Fictieve organisatie',
        location: 'Fictieve locatie',
        scopeId: 'original-scope',
        topicIds: ['child'],
        tags: ['Ω'],
        recordable: true,
        lostTime: false,
        sourceCreatedAt: '2026-10-02T11:30:00.1234567+02:00',
      },
    ],
    observations: [
      {
        id: 'observation',
        title: 'Fictieve waarneming',
        dossierId: 'dossier',
        date: '2026-10-01',
        observer: 'Fictieve onderzoeker',
        facts: 'Fictieve feiten',
        evidenceIds: [],
        topicIds: ['child'],
        observedAt: '2026-10-01T00:15:00.7654321+02:00',
        location: 'Fictieve locatie',
        context: 'Fictieve procescontext',
        scopeId: 'original-scope',
      },
    ],
    actions: [
      { id: 'action', title: 'Fictieve actie', owner: '', dueDate: '', status: 'open', notes: '' },
    ],
    findings: [
      {
        id: 'finding',
        title: 'Fictieve bevinding',
        dossierId: 'dossier',
        description: 'Fictieve bevinding',
        status: 'open',
        observationIds: [],
        evidenceIds: [],
        topicIds: [],
        legalIds: [],
        decisionBy: '',
        decisionNote: '',
      },
    ],
    legalRecords: [
      {
        id: 'legal',
        title: 'Fictief wetsignaal',
        officialUrl: 'https://example.org/fictitious',
        citation: '',
        jurisdiction: 'Fictief',
        status: 'signal',
        publishedOn: '2026-09-01',
        effectiveOn: '2027-01-01',
        lastVerifiedOn: '2026-10-01',
        summary: 'Fictieve samenvatting',
        impact: 'Fictieve aandachtspunten',
        topicIds: ['child'],
        affectedRefs: [
          { kind: 'workspace', collection: 'findings', id: 'finding' },
          { kind: 'workspace', collection: 'actions', id: 'action' },
          { kind: 'unresolved', originalId: 'original-unknown', rawSourceId: 'raw-source' },
        ],
      },
    ],
    sources: [{ id: 'raw-source', title: 'Fictieve bewaarde bron' }],
    exposure: [
      {
        id: 'hours',
        period: '2026-10',
        hoursWorked: 1000,
        departmentId: '',
        source: 'Fictieve volledige maand',
      },
    ],
  });
}

describe('native incident and legal meaning parity', () => {
  it('preserves exact source time, calendar, typed links and independent dates in JSON and Markdown', () => {
    const workspace = fixture();
    const loaded = importWorkspace(exportWorkspace(workspace));
    expect(loaded).toEqual(workspace);
    const markdown = dossierMarkdown(loaded).join('\n');
    for (const value of [
      '2026-10-01T00:30:00.1234567+02:00',
      '2026-10-01T00:15:00.7654321+02:00',
      '2026-09-01',
      '2027-01-01',
      'original-scope',
      'original-unknown',
      'finding',
      'action',
      'parent',
      'child',
    ])
      expect(markdown).toContain(value);
    expect(loaded.findings![0].legalIds).toEqual([]);
  });
  it('rejects a different source calendar, wrong typed affected object and topic cycle', () => {
    const wrongDate = fixture();
    wrongDate.incidents[0].date = '2026-09-30';
    expect(() => exportWorkspace(wrongDate)).toThrow();
    const wrongCollection = fixture();
    wrongCollection.legalRecords![0].affectedRefs = [
      { kind: 'workspace', collection: 'evidence', id: 'finding' },
    ];
    expect(() => exportWorkspace(wrongCollection)).toThrow();
    const cycle = fixture();
    cycle.topics![0].parentId = 'child';
    expect(() => exportWorkspace(cycle)).toThrow();
  });
  it('does not change independent recordable flags or rate semantics when a specific kind is added', () => {
    const original = fixture();
    const withKind = calculateSafetyAnalytics(original, {
      from: '2026-10',
      through: '2026-10',
      asOf: '2026-11-01',
    });
    delete original.incidents[0].kind;
    const withoutKind = calculateSafetyAnalytics(original, {
      from: '2026-10',
      through: '2026-10',
      asOf: '2026-11-01',
    });
    expect(withKind).toEqual(withoutKind);
    expect(withKind.recordableFrequencyRate).toBe(1000);
  });
  it('keeps early date-only exports free of invented source fields', () => {
    const original = createWorkspace('Fictief vroeg bestand', {
      incidents: [
        {
          id: 'old',
          title: 'Fictief signaal',
          date: '2026-10-01',
          type: 'near_miss',
          department: '',
          description: '',
          actionIds: [],
        },
      ],
    });
    const loaded = importWorkspace(exportWorkspace(original));
    expect(loaded).toEqual(original);
    expect(loaded.incidents[0]).not.toHaveProperty('occurredAt');
    expect(loaded.incidents[0]).not.toHaveProperty('kind');
    expect(loaded.incidents[0]).not.toHaveProperty('recordable');
  });
});
