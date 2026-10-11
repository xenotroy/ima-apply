import { describe, expect, it } from 'vitest';
import { createWorkspace } from './model';
import {
  assertRiskLibrary,
  assertRiskLibraryCollections,
  assertRiskLibraryUpdate,
  captureRiskLibraryReview,
  captureRiskLibraryLayout,
  createLibraryScenario,
  latestLibraryReview,
  latestLibraryLayout,
  ordinalScreening,
  projectLegacyRiskLibrary,
  rankLibraryControls,
  riskLibraryCaptureHash,
  riskLibraryHash,
  riskLibraryMarkdown,
  sealRiskLibrary,
  type RiskLibrary,
  type RiskLibraryWorkspaceState,
  type RiskLibraryScope,
  type LegacyRiskLibraryRow,
} from './risk-library';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const node = (id: string, title = id) => ({
  id,
  code: id,
  title,
  description: `${title}: fictieve testdefinitie.`,
  sortOrder: 1,
  sourceIds: [] as string[],
});
function library(): RiskLibrary {
  return sealRiskLibrary({
    id: 'library-version-1',
    libraryId: 'test-library',
    version: '1.0.0',
    title: 'Fictieve bibliotheek',
    origin: 'native',
    sourceIds: [],
    modules: [node('module')],
    hazards: [{ ...node('hazard'), moduleId: 'module' }],
    risks: [{ ...node('risk'), hazardId: 'hazard', effectRating: 3 }],
    factors: [
      {
        ...node('factor-1'),
        riskId: 'risk',
        lodDescription: 'LOD-grond één.',
        defaultLikelihoodRating: 2,
      },
      {
        ...node('factor-2'),
        riskId: 'risk',
        lodDescription: 'LOD-grond twee.',
        defaultLikelihoodRating: 3,
      },
    ],
    controls: [
      { ...node('shared-control'), type: 'technical' },
      { ...node('procedure-1'), type: 'organisational' },
      { ...node('procedure-2'), type: 'organisational' },
    ],
    links: [
      {
        id: 'link-1',
        factorId: 'factor-1',
        controlId: 'shared-control',
        reductionRating: 2,
        costLevel: 'medium',
        sortOrder: 1,
        sourceIds: [],
      },
      {
        id: 'link-2',
        factorId: 'factor-2',
        controlId: 'shared-control',
        reductionRating: 1,
        costLevel: 'high',
        sortOrder: 2,
        sourceIds: [],
      },
      {
        id: 'link-3',
        factorId: 'factor-1',
        controlId: 'procedure-1',
        reductionRating: 3,
        costLevel: 'low',
        sortOrder: 3,
        sourceIds: [],
      },
      {
        id: 'link-4',
        factorId: 'factor-1',
        controlId: 'procedure-2',
        reductionRating: 3,
        costLevel: 'low',
        sortOrder: 4,
        sourceIds: [],
      },
    ],
    questions: [
      {
        id: 'question-1',
        factorId: 'factor-1',
        prompt: 'Wat is feitelijk vastgesteld?',
        explanation: 'Controleer observatie en bewijs.',
        sortOrder: 1,
        sourceIds: [],
      },
    ],
  });
}
function workspace(): RiskLibraryWorkspaceState {
  return {
    ...createWorkspace('Fictieve testwerkruimte'),
    organisations: [{ id: 'org', name: 'Fictieve organisatie', description: '' }],
    departments: [
      { id: 'department-1', organisationId: 'org', name: 'Fictieve afdeling één', activity: '' },
      { id: 'department-2', organisationId: 'org', name: 'Fictieve afdeling twee', activity: '' },
    ],
    dossiers: [
      {
        id: 'dossier-1',
        title: 'Fictief dossier één',
        organisationId: 'org',
        departmentIds: ['department-1'],
        scope: 'Fictieve afdeling één',
        assessor: 'Testpersoon',
        status: 'draft',
        createdAt: '2026-10-11T08:00:00Z',
        questions: [],
      },
      {
        id: 'dossier-2',
        title: 'Fictief dossier twee',
        organisationId: 'org',
        departmentIds: ['department-2'],
        scope: 'Fictieve afdeling twee',
        assessor: 'Testpersoon',
        status: 'draft',
        createdAt: '2026-10-11T08:00:00Z',
        questions: [],
      },
    ],
    riskLibraries: [library()],
    riskLibraryReviews: [],
    riskLibraryLayouts: [],
  };
}
const scope1: RiskLibraryScope = {
  dossierId: 'dossier-1',
  organisationId: 'org',
  departmentId: 'department-1',
};
const scope2: RiskLibraryScope = {
  dossierId: 'dossier-2',
  organisationId: 'org',
  departmentId: 'department-2',
};
function review(lib: RiskLibrary, scope = scope1, id = 'review-1') {
  return captureRiskLibraryReview(lib, {
    id,
    kind: 'factor',
    factorId: 'factor-1',
    scope,
    origin: 'native',
    assessor: 'Fictieve beoordelaar',
    reviewedAt: '2026-10-11T09:00:00Z',
    note: 'Expliciete testgrond.',
    sourceIds: [],
    relevance: 'relevant',
    exposureRating: 3,
    likelihoodRating: 2,
  });
}

describe('immutable reusable library and scoped ordinal reviews', () => {
  it('does not label unsourced local content as an actual SQLite library', () => {
    const lib = library();
    expect(() => sealRiskLibrary({ ...copy(lib), origin: 'legacy_sqlite' })).toThrow(
      'databasehash',
    );
    expect(() =>
      sealRiskLibrary({
        ...copy(lib),
        origin: 'legacy_sqlite',
        sourceSha256: 'a'.repeat(64),
        sourceIds: ['source'],
      }),
    ).toThrow('eigen bronrij');
  });
  it('determines current review/layout by successor chain, independently of collection order', () => {
    const state = workspace(),
      lib = state.riskLibraries![0],
      first = review(lib);
    const second = captureRiskLibraryReview(lib, {
      ...first,
      id: 'review-successor',
      supersedesId: first.id,
      note: 'Nieuwe expliciete grond.',
      reviewedAt: '2026-10-11T09:02:00Z',
      exposureRating: 1,
    });
    const position = captureRiskLibraryLayout(lib, {
      id: 'position-1',
      nodeType: 'factor',
      nodeId: 'factor-1',
      x: 1.25,
      y: 3.5,
      scope: scope1,
      origin: 'native',
      assessor: 'Test',
      reviewedAt: '2026-10-11T09:00:00Z',
      note: 'Eerste positie.',
      sourceIds: [],
    });
    const nextPosition = captureRiskLibraryLayout(lib, {
      ...position,
      id: 'position-2',
      supersedesId: position.id,
      x: 12.5,
      reviewedAt: '2026-10-11T09:02:00Z',
      note: 'Volgende positie.',
    });
    const after = {
      ...state,
      riskLibraryReviews: [second, first],
      riskLibraryLayouts: [nextPosition, position],
    };
    assertRiskLibraryCollections(after);
    expect(
      latestLibraryReview(after.riskLibraryReviews, lib, scope1, 'factor', 'factor-1'),
    ).toEqual(second);
    expect(
      latestLibraryLayout(after.riskLibraryLayouts, lib, scope1, 'factor', 'factor-1'),
    ).toEqual(nextPosition);
  });
  it('rejects multiple unconnected or forked current histories in one exact scope/node', () => {
    const state = workspace(),
      lib = state.riskLibraries![0],
      first = review(lib),
      unconnected = review(lib, scope1, 'unconnected');
    expect(() =>
      assertRiskLibraryCollections({ ...state, riskLibraryReviews: [first, unconnected] }),
    ).toThrow('geschiedenissen');
    const successor = captureRiskLibraryReview(lib, {
      ...first,
      id: 'successor-1',
      supersedesId: first.id,
    });
    const fork = captureRiskLibraryReview(lib, {
      ...first,
      id: 'successor-2',
      supersedesId: first.id,
    });
    expect(() =>
      assertRiskLibraryCollections({ ...state, riskLibraryReviews: [first, successor, fork] }),
    ).toThrow('geschiedenissen');
  });
  it('preserves shared controls with independent link ratings and questions', () => {
    const lib = library();
    assertRiskLibrary(lib);
    expect(lib.links.filter((link) => link.controlId === 'shared-control')).toHaveLength(2);
    expect(lib.links[0].reductionRating).toBe(2);
    expect(lib.links[1].reductionRating).toBe(1);
    expect(lib.questions[0].explanation).toBe('Controleer observatie en bewijs.');
  });
  it('has an order-independent object hash but preserves array order and all rich content', () => {
    const lib = library();
    const reordered = Object.fromEntries(Object.entries(lib).reverse()) as unknown as RiskLibrary;
    expect(riskLibraryHash(reordered)).toBe(lib.sha256);
    const changed = copy(lib);
    changed.factors[0].lodDescription += ' Nieuwe grond.';
    expect(() => assertRiskLibrary(changed)).toThrow('hash');
    const ordered = copy(lib);
    ordered.links.reverse();
    expect(riskLibraryHash(ordered)).not.toBe(lib.sha256);
  });
  it('never mutates the draft or shared objects while freezing a version', () => {
    const lib = library();
    const draft = { ...lib, sha256: undefined };
    const sealed = sealRiskLibrary(draft);
    draft.factors[0].title = 'Later gewijzigd';
    expect(sealed.factors[0].title).toBe('factor-1');
  });
  it('allows two department scopes to disagree without overwriting either review', () => {
    const state = workspace(),
      lib = state.riskLibraries![0];
    const first = review(lib),
      second = captureRiskLibraryReview(lib, {
        id: 'review-2',
        kind: 'factor',
        factorId: 'factor-1',
        scope: scope2,
        origin: 'native',
        assessor: 'Andere fictieve beoordelaar',
        reviewedAt: '2026-10-11T09:01:00Z',
        note: 'Andere lokale situatie.',
        sourceIds: [],
        relevance: 'not_relevant',
        exposureRating: 1,
        likelihoodRating: 1,
      });
    state.riskLibraryReviews = [first, second];
    assertRiskLibraryCollections(state);
    expect(
      latestLibraryReview(state.riskLibraryReviews, lib, scope1, 'factor', 'factor-1'),
    ).toEqual(first);
    expect(
      latestLibraryReview(state.riskLibraryReviews, lib, scope2, 'factor', 'factor-1'),
    ).toEqual(second);
    expect(ordinalScreening(lib, 'factor-1', first).score).toBe(18);
    expect(ordinalScreening(lib, 'factor-1', second).score).toBe(3);
  });
  it('retains old review and layout when a new library version is added', () => {
    const state = workspace(),
      lib = state.riskLibraries![0],
      old = review(lib);
    state.riskLibraryReviews = [old];
    state.riskLibraryLayouts = [
      captureRiskLibraryLayout(lib, {
        id: 'layout',
        nodeType: 'control_link',
        nodeId: 'link-1',
        x: 1092.5,
        y: 488.25,
        scope: scope1,
        origin: 'native',
        assessor: 'Fictieve vastlegger',
        reviewedAt: '2026-10-11T09:00:00Z',
        note: 'Leesbare positie.',
        sourceIds: [],
      }),
    ];
    const next = sealRiskLibrary({
      ...copy(lib),
      id: 'library-version-2',
      version: '2.0.0',
      predecessorId: lib.id,
      factors: lib.factors.map((factor) => ({ ...factor, title: `${factor.title} herzien` })),
    });
    const after = { ...state, riskLibraries: [lib, next] };
    assertRiskLibraryUpdate(state, after);
    expect(after.riskLibraryReviews).toEqual([old]);
    expect(
      latestLibraryReview(after.riskLibraryReviews!, next, scope1, 'factor', 'factor-1'),
    ).toBeUndefined();
    expect(riskLibraryMarkdown(after).join('\n')).toContain(lib.sha256);
    expect(riskLibraryMarkdown(after).join('\n')).toContain(next.sha256);
  });
  it('rejects rewriting a saved version even if its new hash is recomputed', () => {
    const state = workspace(),
      lib = state.riskLibraries![0];
    const forged = sealRiskLibrary({ ...copy(lib), title: 'Herschreven versie' });
    expect(() => assertRiskLibraryUpdate(state, { ...state, riskLibraries: [forged] })).toThrow(
      'herschreven',
    );
    expect(() => assertRiskLibraryUpdate(state, { ...state, riskLibraries: [] })).toThrow(
      'verwijderd',
    );
  });
  it('rejects an altered library that would rewrite an earlier local review', () => {
    const state = workspace(),
      lib = state.riskLibraries![0];
    state.riskLibraryReviews = [review(lib)];
    const changed = sealRiskLibrary({
      ...copy(lib),
      factors: lib.factors.map((factor) => ({ ...factor, description: 'Andere grond.' })),
    });
    expect(() => assertRiskLibraryCollections({ ...state, riskLibraries: [changed] })).toThrow(
      'gewijzigde bibliotheekversie',
    );
  });
  it('requires genuine actor, ground and aware time for new records but retains unknown legacy author/time', () => {
    const lib = library();
    expect(() => review(lib, scope1, '')).toThrow('tekst');
    const base = {
      id: 'legacy-review',
      kind: 'factor' as const,
      factorId: 'factor-1',
      scope: scope1,
      origin: 'legacy_sqlite' as const,
      sourceIds: ['original-source-row'],
      legacyUpdatedAt: '2025-02-03 09:21:10',
      note: '',
      relevance: 'unknown' as const,
      exposureRating: 1 as const,
      likelihoodRating: 1 as const,
    };
    const legacy = captureRiskLibraryReview(lib, base);
    expect(legacy.assessor).toBeUndefined();
    expect(legacy.reviewedAt).toBeUndefined();
    expect(legacy.legacyUpdatedAt).toBe(base.legacyUpdatedAt);
    expect(() =>
      captureRiskLibraryReview(lib, {
        ...base,
        origin: 'native',
        assessor: '',
        reviewedAt: '2026-10-11T09:00:00Z',
      }),
    ).toThrow('tekst');
    expect(() =>
      captureRiskLibraryReview(lib, { ...base, assessor: 'Invented migration author' }),
    ).toThrow('niet uit migratie');
    expect(() =>
      captureRiskLibraryReview(lib, {
        ...base,
        origin: 'native',
        legacyUpdatedAt: undefined,
        assessor: 'Test',
        note: 'Test',
        reviewedAt: '2026-10-11T09:00:00',
      }),
    ).toThrow('tijdzone');
  });
  it('rejects cross-dossier and incorrect organisational scope joins', () => {
    const state = workspace(),
      lib = state.riskLibraries![0];
    const cross = review(lib, { ...scope1, departmentId: 'department-2' });
    expect(() => assertRiskLibraryCollections({ ...state, riskLibraryReviews: [cross] })).toThrow(
      'buiten het gekozen dossier',
    );
    const noOrganisation = review(lib, { dossierId: 'dossier-1', departmentId: 'department-1' });
    expect(() =>
      assertRiskLibraryCollections({ ...state, riskLibraryReviews: [noOrganisation] }),
    ).toThrow('organisatie');
  });
  it('rejects missing references, duplicate factor links and unknown fields safely', () => {
    const lib = library();
    expect(() =>
      sealRiskLibrary({ ...copy(lib), factors: [{ ...lib.factors[0], riskId: 'absent' }] }),
    ).toThrow('relatie');
    expect(() =>
      sealRiskLibrary({
        ...copy(lib),
        links: [...lib.links, { ...lib.links[0], id: 'duplicate-link' }],
      }),
    ).toThrow('dubbel');
    expect(() => assertRiskLibrary({ ...lib, undocumented: 'unknown' })).toThrow('onbekend');
    expect(() => assertRiskLibrary({ ...lib, controls: [null] })).toThrow('object');
    const state = workspace();
    expect(() =>
      assertRiskLibraryCollections({ ...state, riskLibraries: [null as unknown as RiskLibrary] }),
    ).toThrow('object');
  });
  it('rejects a duplicate/foreign/older version predecessor', () => {
    const state = workspace(),
      lib = state.riskLibraries![0];
    const older = sealRiskLibrary({
      ...copy(lib),
      id: 'old-version',
      version: '0.9.0',
      predecessorId: lib.id,
    });
    expect(() => assertRiskLibraryCollections({ ...state, riskLibraries: [lib, older] })).toThrow(
      'versie loopt niet op',
    );
    const duplicate = sealRiskLibrary({ ...copy(lib), id: 'duplicate-version' });
    expect(() =>
      assertRiskLibraryCollections({ ...state, riskLibraries: [lib, duplicate] }),
    ).toThrow('dubbele');
  });
  it('rejects review predecessor links to another scope or target', () => {
    const state = workspace(),
      lib = state.riskLibraries![0],
      before = review(lib);
    const after = { ...review(lib, scope2, 'second'), supersedesId: before.id };
    after.sha256 = riskLibraryCaptureHash(after);
    expect(() =>
      assertRiskLibraryCollections({ ...state, riskLibraryReviews: [before, after] }),
    ).toThrow('voorganger');
  });
  it('keeps original ordinal ranking weights separate from physical effect and AHS', () => {
    const lib = library();
    const ranked = rankLibraryControls(lib, 'factor-1', scope1, []);
    const technical = ranked.find((item) => item.control.id === 'shared-control')!;
    const firstProcedure = ranked.find((item) => item.control.id === 'procedure-1')!;
    const secondProcedure = ranked.find((item) => item.control.id === 'procedure-2')!;
    expect(technical.rankScore).toBe(12);
    expect(firstProcedure.rankScore).toBe(13.5);
    expect(secondProcedure.rankScore).toBe(8.1);
    expect(secondProcedure.diminishingWeight).toBe(0.6);
    expect(technical).not.toHaveProperty('ahs');
    expect(technical).not.toHaveProperty('pfd');
    expect(ordinalScreening(lib, 'factor-1').reviewed).toBe(false);
  });
  it('keeps one scoped control review from changing the shared definition or the other factor', () => {
    const state = workspace(),
      lib = state.riskLibraries![0];
    const local = captureRiskLibraryReview(lib, {
      id: 'local-control',
      kind: 'control_link',
      linkId: 'link-1',
      scope: scope1,
      origin: 'native',
      assessor: 'Test',
      reviewedAt: '2026-10-11T09:00:00Z',
      note: 'Niet aanwezig bij deze factor.',
      sourceIds: [],
      reductionRating: 3,
      costLevel: 'low',
      isInPlace: false,
    });
    state.riskLibraryReviews = [local];
    assertRiskLibraryCollections(state);
    expect(
      rankLibraryControls(lib, 'factor-1', scope1, [local]).find(
        (item) => item.link.id === 'link-1',
      )?.reductionRating,
    ).toBe(3);
    expect(
      rankLibraryControls(lib, 'factor-1', scope2, [local]).find(
        (item) => item.link.id === 'link-1',
      )?.reductionRating,
    ).toBe(2);
    expect(rankLibraryControls(lib, 'factor-2', scope1, [local])[0].reductionRating).toBe(1);
    expect(lib.links[0].reductionRating).toBe(2);
  });
  it('requires fresh explicit Kinney inputs and carries no inherited control/PFD/effectiveness credit', () => {
    const lib = library();
    const scenario = createLibraryScenario(lib, 'factor-1', {
      id: 'scenario',
      title: 'Nieuw fictief scenario',
      consequence: 'Ernstig letsel',
      probability: 0.5,
      exposure: 6,
      effect: 7,
      assessmentNotes: 'Nieuwe menselijke beoordeling, fictieve testgrond.',
      scope: scope1,
      department: 'Fictieve afdeling één',
    });
    expect(scenario.controls).toEqual([]);
    expect(scenario.lopa).toBeUndefined();
    expect(scenario.probability).toBe(0.5);
    expect(scenario.effect).toBe(7);
    expect(scenario.description).toContain(lib.sha256);
    expect(scenario.dossierId).toBe('dossier-1');
    expect(() =>
      createLibraryScenario(lib, 'factor-1', {
        id: 'scenario',
        title: 'Test',
        consequence: 'Test',
        probability: 2,
        exposure: 6,
        effect: 7,
        assessmentNotes: 'Test',
        scope: scope1,
        department: '',
      }),
    ).toThrow('Kinney-factoren');
  });
  it('round-trips exact graph/reviews/layouts and exports the unknown historical provenance', () => {
    const state = workspace(),
      lib = state.riskLibraries![0];
    state.sources = [{ id: 'original-source-row', title: 'Oorspronkelijke rij' }];
    state.riskLibraryReviews = [
      captureRiskLibraryReview(lib, {
        id: 'old',
        kind: 'factor',
        factorId: 'factor-1',
        scope: scope1,
        origin: 'legacy_sqlite',
        legacyUpdatedAt: '',
        note: 'Oude eigen toelichting.',
        sourceIds: ['original-source-row'],
        relevance: 'unknown',
        exposureRating: 1,
        likelihoodRating: 1,
      }),
    ];
    state.riskLibraryLayouts = [
      captureRiskLibraryLayout(lib, {
        id: 'old-position',
        scope: scope1,
        origin: 'legacy_sqlite',
        legacyUpdatedAt: '2025-02-03 09:21:10',
        note: '',
        sourceIds: ['original-source-row'],
        nodeType: 'control_link',
        nodeId: 'link-1',
        x: 87.125,
        y: 142.5,
      }),
    ];
    const restored = copy(state);
    assertRiskLibraryCollections(restored);
    expect(restored).toEqual(state);
    const markdown = riskLibraryMarkdown(restored).join('\n');
    expect(markdown).toContain('Onbekend in oorspronkelijke bron');
    expect(markdown).toContain('tijdzone niet afgeleid');
    expect(markdown).toContain('x=87.125');
    expect(markdown).toContain('Oude eigen toelichting.');
  });
});

describe('exact SQLite graph projection without rating conversion', () => {
  function fixture() {
    const warnings: string[] = [];
    const tables: Record<string, LegacyRiskLibraryRow[]> = {
      Modules: [{ Id: 12, Code: 'M12', Titel: 'Testmodule', SortOrder: 7 }],
      Gevaren: [
        {
          Id: 4,
          ModuleId: 12,
          Code: 'G4',
          Titel: 'Testgevaar',
          Omschrijving: 'Bronomschrijving.',
          SortOrder: 2,
        },
      ],
      Risicos: [
        { Id: 9, GevaarItemId: 4, Code: 'R9', Titel: 'Testrisico', EffectScore: 3, SortOrder: 4 },
      ],
      Risicofactoren: [
        {
          Id: 20,
          RisicoItemId: 9,
          Code: 'F20',
          Titel: 'Testfactor A',
          DefaultWaarschijnlijkheidScore: 2,
          LodBeschrijving: 'Originele LOD.',
          SortOrder: 4,
        },
        {
          Id: 21,
          RisicoItemId: 9,
          Code: 'F21',
          Titel: 'Testfactor B',
          DefaultWaarschijnlijkheidScore: 1,
          LodBeschrijving: '',
          SortOrder: 5,
        },
      ],
      Beheersmaatregelen: [
        { Id: 70, Code: 'M70', Titel: 'Gedeelde testmaatregel', Type: 0, SortOrder: 2 },
      ],
      BeheersmaatregelRisicofactoren: [
        {
          Id: 8,
          RisicofactorItemId: 20,
          BeheersmaatregelId: 70,
          ReductieScore: 3,
          KostenNiveau: 0,
          SortOrder: 1,
        },
        {
          Id: 10,
          RisicofactorItemId: 21,
          BeheersmaatregelId: 70,
          ReductieScore: 1,
          KostenNiveau: 2,
          SortOrder: 3,
        },
      ],
      BeoordelingsVragen: [
        {
          Id: 101,
          RisicofactorItemId: 20,
          Vraagtekst: 'Oorspronkelijke testvraag?',
          Toelichting: 'Exacte testtoelichting.',
          SortOrder: 6,
        },
      ],
      RisicofactorBeoordelingen: [
        {
          Id: 90,
          CompanyId: 1,
          DepartmentId: 1,
          RisicofactorItemId: 20,
          Relevantie: 1,
          BlootstellingScore: 3,
          WaarschijnlijkheidScore: 2,
          Toelichting: 'Oude testgrond.',
          UpdatedAt: '2025-01-03 13:14:15',
        },
      ],
      MaatregelBeoordelingen: [
        {
          Id: 92,
          CompanyId: 1,
          DepartmentId: 1,
          BeheersmaatregelRisicofactorId: 8,
          ReductieScore: 2,
          KostenNiveau: 1,
          IsInPlace: 1,
          Toelichting: '',
          UpdatedAt: '',
        },
      ],
      RiskMapNodeLayouts: [
        {
          Id: 88,
          CompanyId: 1,
          DepartmentId: 1,
          NodeType: 'Maatregel',
          NodeId: 8,
          X: 184.25,
          Y: 92.5,
          UpdatedAt: '2025-01-03 13:14:15',
        },
      ],
    };
    const options = {
      id: 'sqlite-library-v1',
      libraryId: 'sqlite-project-1-library',
      title: 'Fictieve SQLite-bibliotheek',
      sourceSha256: 'a'.repeat(64),
      targetIdFor: (table: string, row: LegacyRiskLibraryRow) => `sqlite-${table}-${row.Id}`,
      sourceIdFor: (table: string, row: LegacyRiskLibraryRow) => `source-${table}-${row.Id}`,
      scopeFor: (row: LegacyRiskLibraryRow) =>
        row.CompanyId === 1 && row.DepartmentId === 1 ? scope1 : undefined,
      warning: (_code: string, table: string, _row: LegacyRiskLibraryRow, message: string) =>
        warnings.push(`${table}: ${message}`),
    };
    return { tables, options, warnings };
  }
  it('preserves IDs, order, modules, shared links, exact old ratings and layout link identity', () => {
    const { tables, options, warnings } = fixture(),
      before = copy(tables),
      result = projectLegacyRiskLibrary(tables, options),
      lib = result.library!;
    expect(warnings).toEqual([]);
    expect(tables).toEqual(before);
    expect(lib.controls).toHaveLength(1);
    expect(lib.links).toHaveLength(2);
    expect(lib.links.map((item) => item.controlId)).toEqual([
      'sqlite-Beheersmaatregelen-70',
      'sqlite-Beheersmaatregelen-70',
    ]);
    expect(lib.hazards[0].moduleId).toBe('sqlite-Modules-12');
    expect(lib.modules[0].sortOrder).toBe(7);
    expect(lib.factors[0].lodDescription).toBe('Originele LOD.');
    expect(result.reviews[0].assessor).toBeUndefined();
    expect(result.reviews[0].reviewedAt).toBeUndefined();
    expect(result.reviews[0].legacyUpdatedAt).toBe('2025-01-03 13:14:15');
    expect(result.layouts[0].nodeType).toBe('control_link');
    expect(result.layouts[0].nodeId).toBe('sqlite-BeheersmaatregelRisicofactoren-8');
    expect(result.layouts[0].x).toBe(184.25);
    expect(lib.controls[0]).not.toHaveProperty('ahs');
    expect(lib.links[0]).not.toHaveProperty('probabilityReduction');
  });
  it('keeps all ambiguous original scope/node duplicates raw instead of selecting an arbitrary current record', () => {
    const { tables, options, warnings } = fixture();
    tables.RisicofactorBeoordelingen.push({
      ...tables.RisicofactorBeoordelingen[0],
      Id: 91,
      BlootstellingScore: 1,
    });
    tables.RiskMapNodeLayouts.push({ ...tables.RiskMapNodeLayouts[0], Id: 89, X: 311.25 });
    const result = projectLegacyRiskLibrary(tables, options);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].kind).toBe('control_link');
    expect(result.layouts).toEqual([]);
    expect(warnings).toHaveLength(4);
    expect(warnings.every((warning) => warning.includes('ambigu'))).toBe(true);
    expect(tables.RisicofactorBeoordelingen).toHaveLength(2);
  });
  it('keeps broken FKs, unknown enums and invalid ratings raw with warnings, never title joins/clamps', () => {
    const { tables, options, warnings } = fixture();
    tables.BeheersmaatregelRisicofactoren.push({
      Id: 11,
      RisicofactorItemId: 20,
      BeheersmaatregelId: 999,
      ReductieScore: 3,
      KostenNiveau: 0,
      SortOrder: 1,
    });
    tables.Risicofactoren.push({ ...tables.Risicofactoren[0], Id: 22, RisicoItemId: 888 });
    tables.Risicofactoren.push({
      ...tables.Risicofactoren[0],
      Id: 23,
      DefaultWaarschijnlijkheidScore: 9,
    });
    tables.Beheersmaatregelen.push({ ...tables.Beheersmaatregelen[0], Id: 71, Type: 7 });
    tables.RiskMapNodeLayouts.push({
      ...tables.RiskMapNodeLayouts[0],
      Id: 89,
      NodeType: 'Unknown',
    });
    const result = projectLegacyRiskLibrary(tables, options);
    expect(result.library!.links).toHaveLength(2);
    expect(result.library!.factors).toHaveLength(2);
    expect(result.library!.controls).toHaveLength(1);
    expect(result.layouts).toHaveLength(1);
    expect(warnings).toHaveLength(5);
    expect(tables.Risicofactoren.at(-1)!.DefaultWaarschijnlijkheidScore).toBe(9);
  });
  it('does not assign missing scopes or a migration timestamp to historical records', () => {
    const { tables, options, warnings } = fixture();
    tables.RisicofactorBeoordelingen[0].DepartmentId = 999;
    tables.MaatregelBeoordelingen[0].UpdatedAt = null;
    const result = projectLegacyRiskLibrary(tables, options);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].legacyUpdatedAt).toBe('');
    expect(result.reviews[0].reviewedAt).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });
});
