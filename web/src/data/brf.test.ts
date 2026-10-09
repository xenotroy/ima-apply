import { describe, expect, it } from 'vitest';
import { createWorkspace, type WorkspaceState } from './model';
import type { Investigation } from './dossier';
import { exportWorkspace, importWorkspace } from './validation';
import {
  basisRiskFactorDefinitionHash,
  basisRiskFactorHash,
  basisRiskFactorMarkdown,
  changeBasisRiskFactorStatus,
  freezeInvestigationBasisRiskFactors,
  type BasisRiskFactorRecord,
} from './brf';

const at = (hour: number) => `2026-10-08T${String(hour).padStart(2, '0')}:00:00.000Z`;
function definition(
  id = 'brf-v1',
  factorId = 'brf-factor-1',
  version = '1.0.0',
): BasisRiskFactorRecord {
  return {
    id,
    factorId,
    taxonomy: 'fixture-project-brf',
    code: 'P-01',
    title: 'Onderhoud en inspectie',
    version,
    status: 'draft',
    description:
      'Condities waardoor degradatie niet tijdig wordt gezien of hersteld. Geen direct incidentoordeel.',
    sourceReference: 'Fictieve lokale definitieafspraak, paragraaf 2.',
    owner: 'Bert',
    createdBy: 'Ada',
    createdAt: at(8),
    changeNote: 'Eerste lokale definitie expliciet vastgelegd.',
    statusHistory: [],
  };
}
function local(record = definition()): BasisRiskFactorRecord {
  return changeBasisRiskFactorStatus(
    record,
    'local',
    'Bert',
    'Betekenis en gebruiksgrenzen lokaal afgesproken.',
    new Date(Date.parse(record.createdAt) + 3_600_000).toISOString(),
  );
}
function investigation(ids?: string[], status: Investigation['status'] = 'draft'): Investigation {
  return {
    id: 'investigation-1',
    title: 'Onderzoek afzuiging',
    incidentId: 'incident-1',
    method: 'five_whys',
    methodVersion: '1.0.0',
    status,
    facts: 'Afvangsnelheid gemeten en filtertoestand onderzocht.',
    whyChain: ['Waarom was de filterdruk opgelopen?'],
    topEvent: '',
    threats: [],
    preventiveBarriers: [],
    recoveryBarriers: [],
    consequences: [],
    basisRiskFactors: ['LEGACY-P01: vrije projectcode en eigen oorspronkelijke betekenis'],
    ...(ids ? { basisRiskFactorIds: ids } : {}),
    evidenceIds: ['evidence-1'],
    actionIds: [],
    conclusion: 'Onderhoudsplanning is een hypothese die nog aan de registraties wordt getoetst.',
    reviewedBy: status === 'reviewed' ? 'Bert' : '',
    reviewNote:
      status === 'reviewed'
        ? 'Feiten, beperkingen en hypothesekoppeling afzonderlijk beoordeeld.'
        : '',
  };
}
function workspace(
  records: BasisRiskFactorRecord[] = [],
  research = investigation(),
): WorkspaceState {
  return createWorkspace('BRF fixture', {
    basisRiskFactorRecords: records,
    investigations: [research],
    incidents: [
      {
        id: 'incident-1',
        title: 'Afzuiging onvoldoende',
        date: '2026-10-08',
        department: 'Fixture',
        type: 'near_miss',
        description: 'Fictief signaal bij onderhoud.',
        actionIds: [],
      },
    ],
    evidence: [
      {
        id: 'evidence-1',
        title: 'Bronregistratie',
        kind: 'record',
        reference: 'https://example.com/fixture-evidence',
        description: 'Fictieve bron voor het onderzoek.',
        recordedAt: at(7),
        status: 'unverified',
      },
    ],
  });
}
function roundtrip(value: WorkspaceState): WorkspaceState {
  return importWorkspace(exportWorkspace(value));
}

describe('local definition versions and source status', () => {
  it('preserves old free BRF codes and accepts v1 workspaces without the additive collection', () => {
    const value = workspace();
    delete value.basisRiskFactorRecords;
    const imported = roundtrip(value);
    expect(imported.basisRiskFactorRecords).toBeUndefined();
    expect(imported.investigations?.[0].basisRiskFactors).toEqual(investigation().basisRiskFactors);
    expect(imported.investigations?.[0].basisRiskFactorIds).toBeUndefined();
    expect(imported.investigations?.[0].basisRiskFactorSnapshots).toBeUndefined();
  });
  it('stores two exact versions with stable identity without changing an earlier research snapshot', () => {
    const before = local();
    const later = local({
      ...definition('brf-v2', before.factorId, '2.0.0'),
      supersedesId: before.id,
      title: 'Technische degradatiebewaking',
      description: 'Een nieuwe expliciete toepassingsgrens voor de tweede versie.',
      createdAt: at(10),
      changeNote: 'Voor onderhoud en inspectie de toepassingsgrens nader uitgewerkt.',
    });
    // Second version is recorded after its predecessor; its local agreement is a later actual event.
    later.statusHistory[0].at = at(11);
    const research = freezeInvestigationBasisRiskFactors(investigation([before.id], 'reviewed'), [
      before,
      later,
    ]);
    const imported = roundtrip(workspace([before, later], research));
    expect(
      imported.basisRiskFactorRecords?.map((record) => [record.factorId, record.version]),
    ).toEqual([
      [before.factorId, '1.0.0'],
      [before.factorId, '2.0.0'],
    ]);
    expect(imported.investigations?.[0].basisRiskFactorSnapshots?.[0].record).toEqual(before);
    expect(imported.investigations?.[0].basisRiskFactorSnapshots?.[0].record.title).toBe(
      'Onderhoud en inspectie',
    );
    expect(imported.investigations?.[0].basisRiskFactors).toEqual(investigation().basisRiskFactors);
  });
  it('requires actor, reason, ownership and source for local agreement, with no automatic publication', () => {
    expect(roundtrip(workspace([definition()])).basisRiskFactorRecords?.[0].status).toBe('draft');
    expect(() => changeBasisRiskFactorStatus(definition(), 'local', '', 'Reden', at(9))).toThrow(
      /actor/,
    );
    expect(() => changeBasisRiskFactorStatus(definition(), 'local', 'Bert', '', at(9))).toThrow(
      /redenering/,
    );
    expect(() =>
      changeBasisRiskFactorStatus(
        { ...definition(), owner: '' },
        'local',
        'Bert',
        'Afspraak',
        at(9),
      ),
    ).toThrow(/eigenaarschap/);
    expect(() =>
      changeBasisRiskFactorStatus(
        { ...definition(), sourceReference: '' },
        'local',
        'Bert',
        'Afspraak',
        at(9),
      ),
    ).toThrow(/bron-/);
    expect(() =>
      changeBasisRiskFactorStatus(definition(), 'local', 'Bert', 'Afspraak', at(7)),
    ).toThrow(/chronologische/);
    const retired = changeBasisRiskFactorStatus(
      local(),
      'retired',
      'Bert',
      'Vervangen door een nieuwe versie.',
      at(10),
    );
    expect(() =>
      changeBasisRiskFactorStatus(retired, 'local', 'Bert', 'Toch weer gebruiken.', at(11)),
    ).toThrow(/statusovergang/);
  });
  it('rejects duplicate identities/versions and wrong, future or cyclic predecessor relationships', () => {
    expect(() =>
      roundtrip(
        workspace([definition(), { ...definition('other-id'), title: 'Nog eenzelfde versie' }]),
      ),
    ).toThrow(/identiteit en versie/);
    expect(() => roundtrip(workspace([{ ...definition(), supersedesId: 'missing' }]))).toThrow(
      /voorganger/,
    );
    expect(() =>
      roundtrip(
        workspace([
          definition(),
          { ...definition('another', 'another-factor', '2'), supersedesId: 'brf-v1' },
        ]),
      ),
    ).toThrow(/identiteit/);
    expect(() =>
      roundtrip(
        workspace([
          definition(),
          { ...definition('another', 'brf-factor-1', '2'), taxonomy: 'another-taxonomy' },
        ]),
      ),
    ).toThrow(/taxonomie/);
    const first = { ...definition(), supersedesId: 'brf-v2' };
    const second = { ...definition('brf-v2', first.factorId, '2'), supersedesId: first.id };
    expect(() => roundtrip(workspace([first, second]))).toThrow(/cyclische/);
  });
  it('preserves explicit taxonomy hierarchy while rejecting missing parents, identity-self-links and cycles', () => {
    const parent = definition('parent-v1', 'parent-identity');
    const child = { ...definition(), parentRecordId: parent.id };
    expect(roundtrip(workspace([parent, child])).basisRiskFactorRecords?.[1].parentRecordId).toBe(
      parent.id,
    );
    expect(() => roundtrip(workspace([{ ...child, parentRecordId: 'missing' }]))).toThrow(
      /bovenliggende/,
    );
    expect(() =>
      roundtrip(
        workspace([
          definition(),
          { ...definition('brf-v2', 'brf-factor-1', '2'), parentRecordId: 'brf-v1' },
        ]),
      ),
    ).toThrow(/dezelfde identiteit/);
    expect(() => roundtrip(workspace([{ ...parent, parentRecordId: child.id }, child]))).toThrow(
      /cyclische/,
    );
  });
});

describe('exact research references and frozen review meaning', () => {
  it('allows provisional links as hypotheses but requires local definition and snapshot when reviewing', () => {
    const draft = definition();
    expect(
      roundtrip(workspace([draft], investigation([draft.id]))).investigations?.[0].status,
    ).toBe('draft');
    expect(() => roundtrip(workspace([draft], investigation([draft.id], 'reviewed')))).toThrow(
      /snapshots/,
    );
    const frozenDraft = freezeInvestigationBasisRiskFactors(investigation([draft.id], 'reviewed'), [
      draft,
    ]);
    expect(() => roundtrip(workspace([draft], frozenDraft))).toThrow(/lokaal vast/);
    const abandoned = changeBasisRiskFactorStatus(
      draft,
      'retired',
      'Ada',
      'Dit concept is niet lokaal vastgesteld.',
      at(9),
    );
    expect(() =>
      roundtrip(
        workspace(
          [abandoned],
          freezeInvestigationBasisRiskFactors(investigation([draft.id], 'reviewed'), [abandoned]),
        ),
      ),
    ).toThrow(/lokaal vast/);
  });
  it('does not rewrite the historical review when the same definition is later retired', () => {
    const record = local();
    const research = freezeInvestigationBasisRiskFactors(investigation([record.id], 'reviewed'), [
      record,
    ]);
    const retired = changeBasisRiskFactorStatus(
      record,
      'retired',
      'Bert',
      'Nieuwe versie beschikbaar.',
      at(10),
    );
    expect(basisRiskFactorDefinitionHash(record)).toBe(basisRiskFactorDefinitionHash(retired));
    expect(basisRiskFactorHash(record)).not.toBe(basisRiskFactorHash(retired));
    const imported = roundtrip(workspace([retired], research));
    expect(imported.basisRiskFactorRecords?.[0].status).toBe('retired');
    expect(imported.investigations?.[0].basisRiskFactorSnapshots?.[0].record.status).toBe('local');
    expect(imported.investigations?.[0].basisRiskFactorSnapshots?.[0].sha256).toBe(
      basisRiskFactorHash(record),
    );
  });
  it('blocks missing or duplicate references and a stale snapshot even if someone recalculates its hash', () => {
    const record = local();
    expect(() => roundtrip(workspace([record], investigation(['missing'])))).toThrow(/ontbrekende/);
    expect(() => roundtrip(workspace([record], investigation([record.id, record.id])))).toThrow(
      /dubbele/,
    );
    const frozen = freezeInvestigationBasisRiskFactors(investigation([record.id], 'reviewed'), [
      record,
    ]);
    const tampered = structuredClone(frozen);
    tampered.basisRiskFactorSnapshots![0].record.description = 'Een stil gewijzigde betekenis.';
    expect(() => roundtrip(workspace([record], tampered))).toThrow(/gewijzigd/);
    tampered.basisRiskFactorSnapshots![0].sha256 = basisRiskFactorHash(
      tampered.basisRiskFactorSnapshots![0].record,
    );
    expect(() => roundtrip(workspace([record], tampered))).toThrow(/definitieversie/);
    expect(() =>
      roundtrip(
        workspace([{ ...record, title: 'Betekenis in dezelfde versie overschreven' }], frozen),
      ),
    ).toThrow(/definitieversie/);
  });
  it('keeps legacy codes, full version meaning and historical status readable in Markdown and JSON', () => {
    const record = local();
    const research = freezeInvestigationBasisRiskFactors(investigation([record.id], 'reviewed'), [
      record,
    ]);
    const retired = changeBasisRiskFactorStatus(record, 'retired', 'Bert', 'Vervangen.', at(10));
    const value = workspace([retired], research);
    const markdown = basisRiskFactorMarkdown(value).join('\n');
    expect(markdown).toContain('Lokaal BRF-register');
    expect(markdown).toContain(record.description);
    expect(markdown).toContain(record.sourceReference);
    expect(markdown).toContain(record.factorId);
    expect(markdown).toContain('draft → local');
    expect(markdown).toContain('Gebruikte definitiestatus: Lokaal vastgesteld');
    expect(markdown).toContain(research.basisRiskFactorSnapshots![0].sha256);
    expect(roundtrip(value).investigations?.[0].basisRiskFactors[0]).toContain('LEGACY-P01');
  });
  it('rejects unknown nested fields and credentials instead of preserving them as a hidden taxonomy extension', () => {
    const unknown = { ...definition(), externalCanonicalClaim: 'unsupported' };
    expect(() => roundtrip(workspace([unknown]))).toThrow(/onbekend veld/);
    const token = { ...definition(), sourceReference: `ghp_${'A'.repeat(40)}` };
    expect(() => roundtrip(workspace([token]))).toThrow(/toegangstoken/);
  });
});
