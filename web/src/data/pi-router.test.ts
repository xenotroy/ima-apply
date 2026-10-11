import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { createWorkspace, type WorkspaceRecord } from './model';
import {
  assertPiRouterBindings,
  assertPiRouterCollections,
  assertPiRouterInputs,
  assertPiRouterRecord,
  capturePiRouterRecord,
  emptyPiRouterInputs,
  piBindingsFromWorkspace,
  piRouterMarkdown,
  piRouterResult,
  resolvePiRoute,
  PI_ROUTER_RULES,
  createPiProjectWorkspace,
  assertPiRiskLibrary,
  piRouterHasDossierAnchor,
  type PiRouterBindings,
  type PiRouterInputs,
} from './pi-router';

const source = { id: 'bank-source', title: 'Private example bank' };
const binding: PiRouterBindings = {
  id: 'bank',
  schema: 'ima.pi-router-bindings/v1',
  sourceIds: [source.id],
  sourceSha256: '1'.repeat(64),
  bankDate: '2026-09-07',
  status: 'proposal',
  questions: [
    {
      questionId: 'occurrence-2',
      key: 'key-2',
      code: 'SAME-CODE',
      aspect: 'A',
      process: 'P',
      sourceId: source.id,
      page: 3,
      topicIds: ['routes', 'aggression'],
      mappingStatus: 'candidate',
    },
    {
      questionId: 'occurrence-1',
      key: 'key-1',
      code: 'SAME-CODE',
      aspect: 'B',
      process: 'P',
      sourceId: source.id,
      page: 2,
      topicIds: ['aggression'],
      mappingStatus: 'checked',
    },
    {
      questionId: 'occurrence-3',
      key: 'key-3',
      code: 'OTHER',
      aspect: 'C',
      process: 'P',
      sourceId: source.id,
      page: 4,
      topicIds: ['prevention'],
      mappingStatus: 'candidate',
    },
  ],
};
const scoped = (): PiRouterInputs => ({
  ...emptyPiRouterInputs('Afdeling / dag en nacht'),
  assessor: 'Onderzoeker',
});
const workspace = () =>
  createWorkspace('Test', {
    sources: [source],
    contentRecords: [structuredClone(binding) as unknown as WorkspaceRecord],
  });
const route = (input: PiRouterInputs, id: string) =>
  resolvePiRoute(input).topics.find((t) => t.rule.id === id)!;

describe('PI router distinguishes applicability, priority and verified facts', () => {
  it('keeps five independent legal duties without risk or incident selection', () => {
    const result = resolvePiRoute(scoped());
    expect(result.obligations).toHaveLength(5);
    expect(result.topics.filter((t) => t.applicability === 'required')).toHaveLength(5);
    expect(result.unknownTopicIds).toContain('aggression');
    expect(result.topics.every((t) => t.claimStatus === 'not_verified')).toBe(true);
    expect('riskScore' in result).toBe(false);
  });
  it('never treats an unselected or explicitly absent feature as sufficient exclusion', () => {
    const input = scoped();
    input.features.height = 'absent';
    input.features.maintenance = 'absent';
    expect(route(input, 'height').applicability).toBe('needs_verification');
    expect(route(scoped(), 'height').missing.join(' ')).toContain('Onbekende profielkenmerken');
  });
  it('uses a profile trigger without asserting a measured local risk', () => {
    const input = scoped();
    input.features.medication = 'present';
    expect(route(input, 'medication').applicability).toBe('selected');
    expect(route(input, 'medication').priority).toBe('normal');
    expect(route(input, 'medication').claimStatus).toBe('not_verified');
  });
  it('keeps resident cooking scenario separate from occupational food preparation', () => {
    const input = scoped();
    input.features.resident_cooking = 'present';
    input.features.food_work = 'absent';
    expect(route(input, 'food').applicability).toBe('selected');
    expect(route(input, 'food').rule.questions.join(' ')).toContain('alleen toezicht');
    expect(route(input, 'food').reasons.join(' ')).not.toContain('Beroepsmatig voedsel');
  });
  it('explicit local increase raises research priority without inventing a score', () => {
    const input = scoped();
    input.risks.aggression = 'increased';
    const result = route(input, 'aggression');
    expect(result.priority).toBe('elevated');
    expect(result.reasons.join(' ')).toContain('volgens invoer');
    expect('riskReduction' in result).toBe(false);
  });
  it('serious incident activates urgent research even with all profile triggers absent', () => {
    const input = scoped();
    input.features = {
      prisoner_contact: 'absent',
      visitors: 'absent',
      intervention: 'absent',
      search: 'absent',
      transport_prisoners: 'absent',
    };
    input.signals = [
      {
        id: 'incident',
        topicIds: ['aggression'],
        kind: 'incident',
        severity: 'serious',
        sourceIds: [],
        note: 'Unverified reported event',
      },
    ];
    const result = resolvePiRoute(input);
    expect(result.topics.find((t) => t.rule.id === 'aggression')?.priority).toBe('urgent');
    expect(result.contradictions.some((c) => c.topicId === 'aggression')).toBe(true);
  });
  it('no reported incidents does not remove any topic', () => {
    const input = scoped();
    input.noSignalsDeclared = true;
    expect(resolvePiRoute(input).topics).toHaveLength(PI_ROUTER_RULES.length);
    expect(route(input, 'aggression').applicability).toBe('needs_verification');
  });
  it('finds contradiction between no-signals declaration and an actual entry', () => {
    const input = scoped();
    input.noSignalsDeclared = true;
    input.signals = [
      {
        id: 's',
        topicIds: ['routes'],
        kind: 'near_miss',
        severity: 'unspecified',
        sourceIds: [],
        note: '',
      },
    ];
    expect(resolvePiRoute(input).contradictions.some((c) => c.topicId === '')).toBe(true);
  });
  it('keeps central effectiveness claim unverified and detects a conflicting signal', () => {
    const input = scoped();
    input.documentClaims = [
      {
        topicId: 'alone-work',
        sourceId: source.id,
        claim: 'effective',
        note: 'Central document says alarm works',
      },
    ];
    input.signals = [
      {
        id: 's',
        topicIds: ['alone-work'],
        kind: 'complaint',
        severity: 'unspecified',
        sourceIds: [],
        note: 'Reported local reception gap',
      },
    ];
    const result = resolvePiRoute(input);
    expect(result.contradictions.some((c) => c.reason.includes('werkende beheersing'))).toBe(true);
    expect(route(input, 'alone-work').claimStatus).toBe('not_verified');
  });
  it('requires complete scoped evidence for a conditional exclusion', () => {
    const input = scoped();
    input.features = { height: 'absent', maintenance: 'absent' };
    input.exclusions = [
      {
        topicId: 'height',
        scopeTitle: input.scopeTitle,
        reason: 'Tasks inspected across shifts',
        evidenceIds: ['evidence'],
        assessor: 'Investigator',
        reviewedAt: '2026-10-11T10:00:00Z',
      },
    ];
    expect(route(input, 'height').applicability).toBe('excluded');
    input.exclusions[0].scopeTitle = 'Different department';
    expect(route(input, 'height').applicability).toBe('needs_verification');
    input.exclusions[0].scopeTitle = input.scopeTitle;
    input.exclusions[0].evidenceIds = [];
    expect(route(input, 'height').applicability).toBe('needs_verification');
  });
  it('blocks exclusion of legal duties, common checks and positively triggered topics', () => {
    for (const id of ['rie-cycle', 'staffing', 'height']) {
      const input = scoped();
      input.features = { height: 'present', maintenance: 'absent' };
      input.exclusions = [
        {
          topicId: id,
          scopeTitle: input.scopeTitle,
          reason: 'No',
          evidenceIds: ['e'],
          assessor: 'A',
          reviewedAt: '2026-10-11T10:00:00Z',
        },
      ];
      expect(route(input, id).applicability).not.toBe('excluded');
      expect(resolvePiRoute(input).contradictions.some((c) => c.topicId === id)).toBe(true);
    }
  });
  it('distinguishes internal requirements and good practice from legal duties', () => {
    const input = scoped();
    input.selectedObligations = ['internal-requirements', 'reconstruction'];
    expect(route(input, 'internal-requirements').rule.obligationKind).toBe('internal');
    expect(route(input, 'reconstruction').rule.obligationKind).toBe('good_practice');
    expect(route(input, 'reconstruction').applicability).toBe('selected');
  });
});

describe('private bindings and immutable research records', () => {
  it('retains equal visible question codes as distinct source occurrences', () => {
    const input = scoped();
    input.risks.aggression = 'possible';
    input.features.indoor = 'present';
    const result = resolvePiRoute(input, [binding]);
    expect(result.questionIds.filter((id) => id.startsWith('occurrence-'))).toHaveLength(3);
    expect(
      result.topics.find((t) => t.rule.id === 'aggression')?.questions.map((q) => q.code),
    ).toEqual(['SAME-CODE', 'SAME-CODE']);
  });
  it('deduplicates a question across topic routes but refuses competing banks for the same ID', () => {
    const input = scoped();
    input.risks.aggression = 'possible';
    input.features.indoor = 'present';
    expect(
      resolvePiRoute(input, [binding]).questionIds.filter((id) => id === 'occurrence-2'),
    ).toHaveLength(1);
    expect(() => resolvePiRoute(input, [binding, { ...binding, id: 'competing' }])).toThrow(
      'meerdere',
    );
  });
  it('freezes result, source occurrence mapping and input after later edits', () => {
    const ws = workspace();
    const input = scoped();
    input.risks.aggression = 'possible';
    const record = capturePiRouterRecord(ws, input, {
      id: 'research',
      now: '2026-10-11T10:00:00Z',
    });
    input.risks.aggression = 'increased';
    input.notes = 'Later';
    expect(record.inputs.risks.aggression).toBe('possible');
    expect(record.inputs.notes).toBe('');
    (ws.contentRecords![0] as unknown as PiRouterBindings).questions[0].code =
      'Changed source bank';
    (ws.contentRecords![0] as unknown as PiRouterBindings).questions = [];
    expect(() => assertPiRouterRecord(record)).not.toThrow();
    expect(record.result.questionIds).toContain('occurrence-1');
  });
  it('validates multi-topic canonical binding order when reconstructing a record', () => {
    const ws = workspace();
    const input = scoped();
    input.features.indoor = 'present';
    input.risks.aggression = 'possible';
    const record = capturePiRouterRecord(ws, input, {
      id: 'research',
      now: '2026-10-11T10:00:00Z',
    });
    assertPiRouterRecord(record);
    expect(
      piRouterResult(record)
        .topics.find((t) => t.rule.id === 'aggression')
        ?.questions.map((q) => q.questionId),
    ).toEqual(['occurrence-1', 'occurrence-2']);
  });
  it('rejects tampering, including a recomputed hash over a fabricated risk result', () => {
    const record = capturePiRouterRecord(workspace(), scoped(), {
      id: 'research',
      now: '2026-10-11T10:00:00Z',
    });
    const changed = structuredClone(record);
    changed.inputs.notes = 'Tampered';
    expect(() => assertPiRouterRecord(changed)).toThrow('hash');
    const forged = structuredClone(record);
    forged.result.topics[0].priority = 'urgent';
    const { sha256: _, ...artifact } = forged;
    forged.sha256 = Array.from(sha256(new TextEncoder().encode(JSON.stringify(artifact))))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(() => assertPiRouterRecord(forged)).toThrow('resultaat');
  });
  it('requires investigator/scope, registered source claims and evidence in the actual dossier', () => {
    expect(() => capturePiRouterRecord(workspace(), emptyPiRouterInputs())).toThrow('Scope');
    const input = scoped();
    input.documentClaims = [
      { topicId: 'routes', sourceId: 'missing', claim: 'effective', note: '' },
    ];
    expect(() => capturePiRouterRecord(workspace(), input)).toThrow('bron ontbreekt');
    input.documentClaims = [];
    input.exclusions = [
      {
        topicId: 'height',
        scopeTitle: input.scopeTitle,
        reason: '',
        evidenceIds: ['missing'],
        assessor: 'A',
        reviewedAt: '2026-10-11T10:00:00Z',
      },
    ];
    expect(() => capturePiRouterRecord(workspace(), input)).toThrow('Uitsluitbewijs');
  });
  it('exports exact codes, provenance, uncertainty, causes and all scoped exclusion notes', () => {
    const ws = workspace();
    const input = scoped();
    input.risks.aggression = 'possible';
    input.notes = 'Missing night shift';
    const record = capturePiRouterRecord(ws, input, {
      id: 'research',
      now: '2026-10-11T10:00:00Z',
    });
    ws.contentRecords!.push(record as unknown as WorkspaceRecord);
    const markdown = piRouterMarkdown(ws).join('\n');
    expect(markdown).toContain('Missing night shift');
    expect(markdown).toContain('SAME-CODE');
    expect(markdown).toContain('key-1');
    expect(markdown).toContain('key-2');
    expect(markdown).toContain('geen risicoscore');
    expect(markdown).toContain(record.sha256);
    expect(markdown).toContain('Lokale aanwezigheid');
  });
  it('ignores unrelated historical content records without discarding them', () => {
    const ws = createWorkspace('Old', {
      sources: [],
      contentRecords: [{ id: 'old', schema: 'old-other', text: 'retained' }],
    });
    assertPiRouterCollections(ws);
    expect(piBindingsFromWorkspace(ws)).toEqual([]);
    expect(piRouterMarkdown(ws)).toEqual([]);
    expect(ws.contentRecords).toHaveLength(1);
  });
  it('rejects malformed profile, unknown rule IDs and duplicate exceptions', () => {
    const input = scoped();
    (input.features as Record<string, string>).fabricated = 'present';
    expect(() => assertPiRouterInputs(input)).toThrow('Profiel');
    delete (input.features as Record<string, string>).fabricated;
    input.risks.unknown = 'possible';
    expect(() => assertPiRouterInputs(input)).toThrow('Onbekend');
    delete input.risks.unknown;
    const e = {
      topicId: 'height',
      scopeTitle: input.scopeTitle,
      reason: '',
      evidenceIds: [],
      assessor: '',
      reviewedAt: '',
    };
    input.exclusions = [e, e];
    expect(() => assertPiRouterInputs(input)).toThrow('Dubbele');
  });
  it('rejects a source binding with an unknown topic or duplicate occurrence', () => {
    const invalid = structuredClone(binding);
    invalid.questions[0].topicIds = ['invented'];
    expect(() => assertPiRouterBindings(invalid)).toThrow('Onbekend');
    invalid.questions[0].topicIds = ['routes'];
    invalid.questions.push(invalid.questions[0]);
    expect(() => assertPiRouterBindings(invalid)).toThrow('Dubbele');
  });
});

describe('PI source selection and interviewing project scopes', () => {
  it('filters central and local source questions without repeating central policy per unit', () => {
    const bank = structuredClone(binding);
    bank.questions[0].researchLevel = 'central';
    bank.questions[1].researchLevel = 'local';
    bank.questions[2].researchLevel = 'department';
    const input = scoped();
    input.features.prisoner_contact = 'present';
    expect(resolvePiRoute(input, [bank]).questionIds).toEqual(['occurrence-1']);
    input.researchLevel = 'central';
    expect(resolvePiRoute(input, [bank]).questionIds).toEqual(['occurrence-2']);
    input.researchLevel = 'department';
    expect(resolvePiRoute(input, [bank]).questionIds).toEqual(['occurrence-3']);
  });
  it('requires explicit special task presence and a relevant signal for deepening', () => {
    const bank = structuredClone(binding);
    bank.questions = [bank.questions[0]];
    bank.questions[0].requiredFeatureIds = ['sports'];
    bank.questions[0].requiredSignalTopicIds = ['aggression'];
    const input = scoped();
    input.features.prisoner_contact = 'present';
    expect(resolvePiRoute(input, [bank]).questionIds).toEqual([]);
    input.features.sports = 'present';
    expect(resolvePiRoute(input, [bank]).questionIds).toEqual([]);
    input.signals = [
      {
        id: 's',
        topicIds: ['aggression'],
        kind: 'complaint',
        severity: 'unspecified',
        sourceIds: [],
        note: 'Recorded research signal',
      },
    ];
    expect(resolvePiRoute(input, [bank]).questionIds).toEqual(['occurrence-2']);
    input.signals = [];
    input.risks.aggression = 'increased';
    expect(resolvePiRoute(input, [bank]).questionIds).toEqual(['occurrence-2']);
  });
  it('requires a registered organisation and rejects conflict with dossier scope', () => {
    const ws = workspace();
    const input = scoped();
    input.organisationId = 'missing';
    expect(() => capturePiRouterRecord(ws, input)).toThrow('Routerorganisatie ontbreekt');
    ws.organisations = [
      { id: 'org-a', name: 'A', description: '' },
      { id: 'org-b', name: 'B', description: '' },
    ];
    input.organisationId = 'org-a';
    expect(piRouterHasDossierAnchor(ws, input)).toBe(true);
    ws.dossiers = [
      {
        id: 'd',
        title: 'D',
        organisationId: 'org-b',
        departmentIds: [],
        scope: 'S',
        assessor: 'R',
        createdAt: '2026-10-11T10:00:00Z',
        status: 'active',
        questions: [],
        sourceSnapshots: [],
      },
    ];
    input.dossierId = 'd';
    expect(() => capturePiRouterRecord(ws, input)).toThrow('botst');
  });
  it('exports every selected source occurrence to a separate project without changing old interviews', () => {
    const ws = workspace();
    ws.organisations = [{ id: 'org', name: 'Example organisation', description: 'Test fixture' }];
    ws.questions = binding.questions.map((q) => ({
      id: q.questionId,
      title: q.code,
      prompt: 'Independently authored fixture question?',
      themeId: 'agressie',
      route: 'kern',
      evidenceHints: [],
      assessmentGuidance: '',
      sourceIds: [source.id],
      suggestedHierarchy: [],
      roles: [],
    }));
    const input = scoped();
    input.organisationId = 'org';
    input.features.prisoner_contact = 'present';
    const record = capturePiRouterRecord(ws, input, {
      id: 'original-record',
      now: '2026-10-11T10:00:00Z',
    });
    const before = JSON.stringify(ws);
    const project = createPiProjectWorkspace(ws, record, {
      now: '2026-10-11T10:00:00Z',
      workspaceId: 'project',
      routerId: 'project-router',
      planId: 'project-plan',
      dossierId: 'project-dossier',
    });
    expect(JSON.stringify(ws)).toBe(before);
    expect(project.id).not.toBe(ws.id);
    expect(project.questions.map((q) => q.id).sort()).toEqual(
      [...record.result.questionIds].sort(),
    );
    expect(project.dossiers![0].questions.map((q) => q.id).sort()).toEqual(
      [...record.result.questionIds].sort(),
    );
    expect(project.answers).toEqual([]);
    expect(
      project.contentRecords!.find((r) => r.schema === 'ima.pi-project-scope/v1')
        ?.parentRouterSha256,
    ).toBe(record.sha256);
    expect(piBindingsFromWorkspace(project)[0].coverage).toBe('scoped_selection');
    expect(piBindingsFromWorkspace(project)[0].sourceSha256).toBe(binding.sourceSha256);
    expect(() => assertPiRouterCollections(project)).not.toThrow();
  });
  it('rejects claiming local verification in a source library and distinguishes missing evidence from an attributed claim', () => {
    const library = {
      id: 'lib',
      schema: 'ima.pi-risk-library/v1',
      status: 'draft_sourcegrounded',
      date: '2026-10-11T10:00:00Z',
      sourceIds: [source.id],
      scope: 'Test basis',
      boundaries: ['Worker exposure only'],
      rows: [
        {
          id: 'row',
          riskId: 'aggression',
          sourceStatus: 'general_knowledge',
          documentedControls: ['No specific local measure established.'],
          claimSourceIds: [] as string[],
          verificationStatus: 'not_locally_verified',
          localLayer: {
            presence: 'unknown',
            exposure: 'unknown',
            deviations: 'unknown',
            controlPresence: 'unknown',
            controlUse: 'unknown',
            controlEffect: 'unknown',
          },
          questionBindingRecordId: binding.id,
          missingInformation: ['Local task and effectiveness'],
        },
      ],
    };
    expect(() => assertPiRiskLibrary(library)).not.toThrow();
    const ws = workspace();
    ws.contentRecords!.push(library as unknown as WorkspaceRecord);
    expect(piRouterMarkdown(ws).join('\n')).toContain('Niet aangetoond');
    library.rows[0].claimSourceIds = [source.id];
    expect(() => assertPiRiskLibrary(library)).toThrow('claimstatus');
    library.rows[0].sourceStatus = 'general_knowledge_and_attributed_document_claim';
    library.rows[0].localLayer.controlEffect = 'confirmed';
    expect(() => assertPiRiskLibrary(library)).toThrow('lokale bevestiging');
  });
});
