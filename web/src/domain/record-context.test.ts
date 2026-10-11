import { describe, expect, it } from 'vitest';
import {
  createWorkspace,
  type WorkspaceState,
  type Topic,
  type LegalRecord,
  type Observation,
} from '../data/model';
import {
  assertRecordContextRelations,
  assertRecordContextStructure,
  isSourceCalendarDate,
  isSourceOffsetTimestamp,
  recordContextMarkdown,
} from './record-context';
import type { ActionSourceRef } from './action-context';

function topic(id: string, parentId?: string): Topic {
  return {
    id,
    title: id,
    description: '',
    category: '',
    aliases: [],
    ...(parentId ? { parentId } : {}),
  };
}
function legal(): LegalRecord {
  return {
    id: 'legal-1',
    title: 'Gepubliceerde wijziging',
    officialUrl: 'https://example.org/rule',
    citation: '',
    jurisdiction: 'NL',
    status: 'published',
    effectiveOn: '',
    lastVerifiedOn: '2026-10-11',
    summary: 'Bronbericht',
    impact: '',
    topicIds: [],
  };
}
function observation(): Observation {
  return {
    id: 'observation-1',
    title: 'Bronwaarneming',
    dossierId: 'dossier-1',
    date: '2026-10-11',
    observer: 'Expliciete vastlegger',
    facts: 'Vastgesteld feit',
    evidenceIds: [],
  };
}
function workspace(): WorkspaceState {
  return createWorkspace('Recordcontext', {
    sources: [{ id: 'raw-1', title: 'Raw bron' }],
    topics: [topic('topic-a'), topic('topic-b', 'topic-a')],
    legalRecords: [legal()],
    observations: [observation()],
    actions: [
      {
        id: 'action-1',
        title: 'Werkelijk actieobject',
        owner: '',
        dueDate: '',
        notes: '',
        status: 'open',
      },
    ],
  });
}

describe('source-faithful additive record context', () => {
  it('accepts old records without filling missing status, context or source timestamps', () => {
    const records = [
      ['topic', topic('topic-old')],
      ['legal', legal()],
      ['observation', observation()],
    ] as const;
    for (const [kind, record] of records) {
      const before = JSON.stringify(record);
      assertRecordContextStructure(kind, record);
      expect(recordContextMarkdown(kind, record)).toEqual([]);
      expect(JSON.stringify(record)).toBe(before);
    }
    const ws = workspace(),
      before = JSON.stringify(ws);
    assertRecordContextRelations(ws);
    expect(JSON.stringify(ws)).toBe(before);
  });
  it('retains arbitrary source status labels and separates absent from explicitly empty lists/text', () => {
    const value = { tags: [], status: '', category: 'Baseline is not this validator’s concern' };
    assertRecordContextStructure('topic', value);
    expect(recordContextMarkdown('topic', value)).toEqual([
      'Tags: (expliciet leeg)',
      'Onderwerpstatus (bronlabel): (expliciet leeg)',
    ]);
    expect(() =>
      assertRecordContextStructure('topic', { status: 'historical-custom' }),
    ).not.toThrow();
    expect(() => assertRecordContextStructure('topic', { tags: ['x'.repeat(1000)] })).not.toThrow();
    for (const value of [
      { parentId: '' },
      { parentId: '  ' },
      { parentId: 1 },
      { status: false },
      { tags: ['a', 'a'] },
      { tags: [''] },
      { tags: ['x'.repeat(1001)] },
    ])
      expect(() => assertRecordContextStructure('topic', value)).toThrow();
  });
  it('requires an actual unique parent and rejects self links and indirect cycles', () => {
    const ws = workspace();
    assertRecordContextRelations(ws);
    ws.topics![0].parentId = 'absent';
    expect(() => assertRecordContextRelations(ws)).toThrow(/Bovenliggend onderwerp/);
    ws.topics![0].parentId = 'topic-a';
    expect(() => assertRecordContextRelations(ws)).toThrow(/eigen ouder/);
    ws.topics![0].parentId = 'topic-b';
    expect(() => assertRecordContextRelations(ws)).toThrow(/cyclus/);
    delete ws.topics![0].parentId;
    ws.topics!.push(topic('topic-a'));
    expect(() => assertRecordContextRelations(ws)).toThrow(/niet uniek/);
  });
  it('validates a deep source hierarchy iteratively, without altering its order or content', () => {
    const ws = workspace();
    ws.topics = Array.from({ length: 1500 }, (_, index) =>
      topic(`topic-${index}`, index ? `topic-${index - 1}` : undefined),
    ).reverse();
    const before = JSON.stringify(ws.topics);
    assertRecordContextRelations(ws);
    expect(JSON.stringify(ws.topics)).toBe(before);
  });
  it('resolves only the explicit affected collection and preserves unresolved original IDs', () => {
    const ws = workspace();
    ws.legalRecords![0].affectedRefs = [
      { kind: 'workspace', collection: 'actions', id: 'action-1' },
      { kind: 'unresolved', originalId: 'actual-original-id', rawSourceId: 'raw-1' },
      { kind: 'unresolved', originalId: 'another-unavailable-original-id' },
    ];
    assertRecordContextRelations(ws);
    expect(recordContextMarkdown('legal', ws.legalRecords![0]).join('\n')).toContain(
      'actions [action-1]',
    );
    expect(recordContextMarkdown('legal', ws.legalRecords![0]).join('\n')).toContain(
      'Onopgelost oorspronkelijk object [actual-original-id] · raw bron [raw-1]',
    );
    const before = JSON.stringify(ws);
    assertRecordContextRelations(ws);
    expect(JSON.stringify(ws)).toBe(before);
    ws.legalRecords![0].affectedRefs![0] = {
      kind: 'workspace',
      collection: 'sources',
      id: 'action-1',
    };
    expect(() => assertRecordContextRelations(ws)).toThrow(/gekozen collectie/);
    ws.legalRecords![0].affectedRefs = [
      { kind: 'unresolved', originalId: 'old', rawSourceId: 'missing' },
    ];
    expect(() => assertRecordContextRelations(ws)).toThrow(/raw bronrecord/);
  });
  it('rejects false reference dialects and duplicate/ambiguous affected objects without adding reverse relationships', () => {
    const ws = workspace(),
      ref: ActionSourceRef = { kind: 'workspace', collection: 'actions', id: 'action-1' };
    for (const affectedRefs of [
      [ref, ref],
      [{ kind: 'workspace', collection: 'invented', id: 'action-1' }],
      [{ ...ref, approved: true }],
      [{ kind: 'unresolved', originalId: '' }],
    ])
      expect(() => assertRecordContextStructure('legal', { affectedRefs })).toThrow();
    ws.legalRecords![0].affectedRefs = [ref];
    ws.actions.push({ ...ws.actions[0] });
    expect(() => assertRecordContextRelations(ws)).toThrow(/niet uniek/);
    ws.actions.pop();
    const before = JSON.stringify(ws.actions);
    assertRecordContextRelations(ws);
    expect(JSON.stringify(ws.actions)).toBe(before);
  });
  it('requires actual observation topics but leaves original scope IDs as source text', () => {
    const ws = workspace();
    Object.assign(ws.observations![0], {
      topicIds: ['topic-a'],
      scopeId: 'original-scope:not-a-browser-dossier',
      location: 'Vloer 2',
      context: 'Exact\nbroncontext',
    });
    assertRecordContextRelations(ws);
    expect(recordContextMarkdown('observation', ws.observations![0]).join('\n')).toContain(
      'Exact\nbroncontext',
    );
    ws.observations![0].topicIds = ['missing'];
    expect(() => assertRecordContextRelations(ws)).toThrow(/Waarnemingsonderwerp/);
    expect(() =>
      assertRecordContextStructure('observation', { topicIds: ['topic-a', 'topic-a'] }),
    ).toThrow();
  });
  it('checks Gregorian calendar dates instead of accepting JavaScript rollover', () => {
    for (const date of ['2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31']) {
      expect(isSourceCalendarDate(date)).toBe(true);
      expect(() => assertRecordContextStructure('legal', { publishedOn: date })).not.toThrow();
    }
    for (const date of [
      '2023-02-29',
      '1900-02-29',
      '2026-04-31',
      '0000-01-01',
      '2026-13-01',
      '2026-10-00',
      '2026-1-01',
      '2026-10-11T00:00:00Z',
      '',
      null,
    ]) {
      expect(isSourceCalendarDate(date)).toBe(false);
      expect(() => assertRecordContextStructure('legal', { publishedOn: date })).toThrow(
        /kalenderdatum/,
      );
    }
  });
  it('preserves seven fractional digits, offsets and source-local calendar day in every time field', () => {
    const times = {
      observedAt: '2026-10-11T00:30:00.1234567+02:00',
      sourceCreatedAt: '2020-02-29T23:01:02.7654321-03:30',
      sourceUpdatedAt: '2026-10-12T12:00:00.0000001Z',
    };
    const value = { ...observation(), ...times };
    const before = JSON.stringify(value);
    assertRecordContextStructure('observation', value);
    const md = recordContextMarkdown('observation', value).join('\n');
    Object.values(times).forEach((time) => expect(md).toContain(time));
    expect(JSON.stringify(value)).toBe(before);
    expect(() =>
      assertRecordContextStructure('observation', { ...value, date: '2026-10-10' }),
    ).toThrow(/bronkalenderdatum/);
    expect(isSourceOffsetTimestamp('0001-01-01T00:00:00.0000000Z')).toBe(true);
    expect(isSourceOffsetTimestamp('9999-12-31T23:59:59.9999999Z')).toBe(true);
    expect(isSourceOffsetTimestamp('2026-10-11T00:00:00+14:00')).toBe(true);
    expect(isSourceOffsetTimestamp('2026-10-11T00:00:00-14:00')).toBe(true);
  });
  it('rejects timezone-free, impossible, overprecision and overflowing DateTimeOffset values', () => {
    for (const time of [
      '2026-10-11T12:00:00',
      '2026-10-11T12:00:00.12345678Z',
      '2026-02-30T12:00:00Z',
      '2026-10-11T24:00:00Z',
      '2026-10-11T12:60:00Z',
      '2026-10-11T12:00:60Z',
      '2026-10-11T12:00:00+14:01',
      '2026-10-11T12:00:00+15:00',
      '2026-10-11T12:00:00+01:60',
      '0001-01-01T00:00:00+00:01',
      '9999-12-31T23:59:59.9999999-00:01',
      '',
      false,
    ]) {
      expect(isSourceOffsetTimestamp(time)).toBe(false);
      for (const key of ['observedAt', 'sourceCreatedAt', 'sourceUpdatedAt'])
        expect(() => assertRecordContextStructure('observation', { [key]: time })).toThrow(/ISO/);
    }
  });
  it('validates without consuming unrelated baseline or raw fields', () => {
    for (const value of [null, [], 'source'])
      expect(() => assertRecordContextStructure('topic', value)).toThrow(/object/);
    const context = { location: '', context: '', sourceOriginal: { noApproval: true } };
    expect(recordContextMarkdown('observation', context)).toEqual([
      'Locatie van de waarneming: (expliciet leeg)',
      'Waarnemingscontext: (expliciet leeg)',
    ]);
    expect(context.sourceOriginal).toEqual({ noApproval: true });
  });
});
