import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createWorkspace,
  type Investigation,
  type WorkspaceIncident,
  type BasisRiskFactorRecord,
} from '../data/model';
import IncidentContextFields from '../components/IncidentContextFields';
import {
  assertIncidentContextRelations,
  assertIncidentContextStructure,
  assertIsoOffsetLexeme,
  incidentContextMarkdown,
  incidentKinds,
  isIsoOffsetLexeme,
} from './incident-context';

const old = (): WorkspaceIncident => ({
  id: 'incident-1',
  title: 'Gebeurtenis Ω',
  date: '2026-10-11',
  department: 'Werkplaats',
  type: 'observation',
  description: 'Waargenomen feiten',
  actionIds: [],
});
function investigation(id: string, incidentId = 'incident-1'): Investigation {
  return {
    id,
    incidentId,
    title: `Onderzoek ${id}`,
    method: 'five_whys',
    methodVersion: '1',
    status: 'draft',
    facts: '',
    whyChain: [],
    topEvent: '',
    threats: [],
    preventiveBarriers: [],
    recoveryBarriers: [],
    consequences: [],
    basisRiskFactors: [],
    evidenceIds: [],
    actionIds: [],
    conclusion: '',
    reviewedBy: '',
    reviewNote: '',
  };
}
function brf(id: string, version: string): BasisRiskFactorRecord {
  return {
    id,
    version,
    factorId: 'factor-identity',
    taxonomy: 'Lokaal',
    code: 'BRF01',
    title: 'Definitie Ω',
    status: 'draft',
    description: '',
    sourceReference: '',
    owner: '',
    createdBy: 'Vastlegger',
    createdAt: '2026-10-01T10:00:00Z',
    changeNote: '',
    statusHistory: [],
  };
}
const workspace = () =>
  createWorkspace('Incidentcontext', {
    incidents: [old()],
    topics: [
      { id: 'topic-1', title: 'Arbeidsmiddelen', category: '', description: '', aliases: [] },
    ],
    evidence: [
      {
        id: 'evidence-1',
        title: 'Foto',
        kind: 'photograph',
        reference: '',
        description: '',
        recordedAt: '2026-10-11T10:00:00Z',
        status: 'unverified',
      },
    ],
    basisRiskFactorRecords: [brf('definition-v1', '1'), brf('definition-v2', '2')],
    investigations: [
      investigation('investigation-1'),
      investigation('investigation-2'),
      investigation('foreign', 'other-incident'),
    ],
  });

describe('source-faithful additive incident context', () => {
  it('leaves old records and absent collections unchanged, with no invented kind/status/KPI', () => {
    const incident = old(),
      before = structuredClone(incident);
    assertIncidentContextStructure(incident);
    assertIncidentContextRelations(incident, createWorkspace('Oud'));
    expect(incident).toEqual(before);
    expect(incidentContextMarkdown(incident)).toEqual([]);
    expect(Object.hasOwn(incident, 'kind')).toBe(false);
    expect(Object.hasOwn(incident, 'recordable')).toBe(false);
  });
  it.each(incidentKinds)(
    'preserves distinct original kind %s without changing the old UI type or flags',
    (kind) => {
      const incident = { ...old(), kind, recordable: false, lostTime: false, lostTimeDays: 0 };
      const before = structuredClone(incident);
      assertIncidentContextStructure(incident);
      expect(incident).toEqual(before);
      expect(incidentContextMarkdown(incident).join('\n')).toContain(`[${kind}]`);
      expect(incident.type).toBe('observation');
    },
  );
  it('retains seven fractional digits and original offset; calendar date is local rather than UTC', () => {
    const lexeme = '2026-10-11T00:00:00.1234567+14:00';
    const incident = {
      ...old(),
      occurredAt: lexeme,
      reportedAt: '2026-10-11T01:00:00.0000000-02:00',
      sourceCreatedAt: '0001-01-01T00:00:00Z',
      sourceUpdatedAt: '9999-12-31T23:59:59.9999999+14:00',
    };
    const before = structuredClone(incident);
    assertIncidentContextStructure(incident);
    expect(incident).toEqual(before);
    expect(incidentContextMarkdown(incident).join('\n')).toContain(lexeme);
    expect(() => assertIncidentContextStructure({ ...incident, date: '2026-10-10' })).toThrow(
      /kalenderdag/,
    );
    for (const fraction of ['', '.1', '.12', '.123', '.1234', '.12345', '.123456', '.1234567'])
      expect(isIsoOffsetLexeme(`2000-02-29T23:59:59${fraction}+00:00`)).toBe(true);
  });
  it.each([
    '2026-02-29T10:00:00Z',
    '1900-02-29T10:00:00Z',
    '2026-04-31T10:00:00Z',
    '0000-01-01T10:00:00Z',
    '2026-00-01T10:00:00Z',
    '2026-13-01T10:00:00Z',
    '2026-10-11T24:00:00Z',
    '2026-10-11T10:60:00Z',
    '2026-10-11T10:00:60Z',
    '2026-10-11T10:00:00+14:01',
    '2026-10-11T10:00:00-15:00',
    '2026-10-11T10:00:00+01:60',
    '2026-10-11T10:00:00.12345678Z',
    '2026-10-11T10:00:00',
    '2026-10-11T10:00Z',
    ' 2026-10-11T10:00:00Z',
    '2026-10-11T10:00:00Z\n',
    '0001-01-01T00:00:00.0000000+00:01',
    '9999-12-31T23:59:59.9999999-00:01',
  ])('rejects invalid timestamp %s without normalization', (lexeme) => {
    expect(isIsoOffsetLexeme(lexeme)).toBe(false);
    expect(() => assertIsoOffsetLexeme(lexeme)).toThrow(/ISO/);
    expect(() => assertIncidentContextStructure({ ...old(), occurredAt: lexeme })).toThrow(/ISO/);
  });
  it('accepts the exact .NET UTC boundaries and rejects one tick beyond them without rounding', () => {
    for (const value of [
      '0001-01-01T00:00:00.0000000Z',
      '0001-01-01T14:00:00.0000000+14:00',
      '9999-12-31T23:59:59.9999999Z',
      '9999-12-31T09:59:59.9999999-14:00',
    ])
      expect(isIsoOffsetLexeme(value)).toBe(true);
    expect(isIsoOffsetLexeme('0001-01-01T13:59:59.9999999+14:00')).toBe(false);
    expect(isIsoOffsetLexeme('9999-12-31T10:00:00.0000000-14:00')).toBe(false);
  });
  it('rejects malformed optional context while preserving explicit empty text/lists distinctly from absence', () => {
    for (const value of [null, [], 2])
      expect(() => assertIncidentContextStructure(value)).toThrow(/object/);
    for (const fields of [
      { kind: 'incident' },
      { tags: ['tag', 'tag'] },
      { topicIds: [''] },
      { evidenceIds: 'evidence-1' },
      { scopeId: 3 },
      { location: 'x'.repeat(100_001) },
    ])
      expect(() => assertIncidentContextStructure({ ...old(), ...fields })).toThrow();
    const explicit = {
      ...old(),
      organisation: '',
      scopeId: 'scope-original:Ω',
      tags: [],
      investigationIds: [],
    };
    assertIncidentContextStructure(explicit);
    expect(incidentContextMarkdown(explicit).join('\n')).toContain('Tags: Geen vastgelegd');
    expect(incidentContextMarkdown(explicit).join('\n')).toContain('scope-original:Ω');
  });
  it('resolves exact topics/evidence/definition versions and rejects codes or factor identities', () => {
    const ws = workspace();
    const incident = {
      ...old(),
      topicIds: ['topic-1'],
      evidenceIds: ['evidence-1'],
      basisRiskFactorIds: ['definition-v2'],
    };
    assertIncidentContextRelations(incident, ws);
    for (const basisRiskFactorIds of [['factor-identity'], ['BRF01'], ['missing']])
      expect(() => assertIncidentContextRelations({ ...incident, basisRiskFactorIds }, ws)).toThrow(
        /BRF/,
      );
    expect(() =>
      assertIncidentContextRelations({ ...incident, topicIds: ['evidence-1'] }, ws),
    ).toThrow(/Onderwerp/);
    expect(() =>
      assertIncidentContextRelations({ ...incident, evidenceIds: ['topic-1'] }, ws),
    ).toThrow(/Bewijs/);
    ws.basisRiskFactorRecords!.push(brf('definition-v2', '3'));
    expect(() => assertIncidentContextRelations(incident, ws)).toThrow(/niet uniek/);
  });
  it('checks each explicit investigation inverse but permits unlisted inverse links and absent old arrays', () => {
    const ws = workspace();
    expect(() => assertIncidentContextRelations(old(), ws)).not.toThrow();
    expect(() =>
      assertIncidentContextRelations({ ...old(), investigationIds: [] }, ws),
    ).not.toThrow();
    expect(() =>
      assertIncidentContextRelations({ ...old(), investigationIds: ['investigation-1'] }, ws),
    ).not.toThrow();
    expect(() =>
      assertIncidentContextRelations({ ...old(), investigationIds: ['foreign'] }, ws),
    ).toThrow(/ander incident/);
    expect(() =>
      assertIncidentContextRelations({ ...old(), investigationIds: ['missing'] }, ws),
    ).toThrow(/ontbreekt/);
  });
  it('renders seven choices plus the unknown placeholder and exact version IDs without setting absent fields', () => {
    const incident = old(),
      before = structuredClone(incident),
      calls: unknown[] = [];
    const html = renderToStaticMarkup(
      createElement(IncidentContextFields, {
        value: incident,
        workspace: workspace(),
        onChange: (patch) => calls.push(patch),
      }),
    );
    expect(calls).toEqual([]);
    expect(incident).toEqual(before);
    for (const kind of incidentKinds) expect(html).toContain(`value="${kind}"`);
    expect(html).toContain('Niet afzonderlijk vastgelegd');
    expect(html).toContain('[definition-v1]');
    expect(html).toContain('[definition-v2]');
    expect(html).not.toContain('Onderzoek foreign');
  });
});
