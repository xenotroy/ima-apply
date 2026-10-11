import { describe, expect, it } from 'vitest';
import { createWorkspace, type WorkspaceState } from '../data/model';
import type { Scenario } from './types';
import { range } from './risk';
import { captureRiskTargetReference } from '../data/risk-evidence';
import {
  actionContextBasis,
  actionContextMarkdown,
  actionContextWarnings,
  assertActionContext,
  assertActionContextRelations,
  createAction,
  type ActionCreateDraft,
  type ActionSourceRef,
  type EditableActionContext,
} from './action-context';

function scenario(): Scenario {
  return {
    id: 'scenario-1',
    title: 'Machinecontact',
    description: 'Lokale beknelling',
    department: 'Werkplaats',
    hazard: 'Bewegende delen',
    consequence: 'Ernstig letsel',
    probability: 6,
    exposure: 6,
    effect: 15,
    controls: [
      {
        id: 'control-1',
        title: 'Afscherming',
        ahs: 'collective',
        status: 'planned',
        evidence: 'unverified',
        evidenceNote: '',
        rationale: 'Voorkomt toegang',
        probabilityReduction: range(0.5),
        exposureReduction: range(0),
        effectReduction: range(0),
        independent: true,
        feasibility: 'easy',
        effort: 2,
        legalRequired: false,
      },
    ],
  };
}
function workspace(): WorkspaceState {
  return createWorkspace('Actiecontext', {
    sources: [{ id: 'source-1', title: 'Werkelijk geselecteerde bron', publication: 'private' }],
    scenarios: [scenario()],
    topics: [
      {
        id: 'topic-1',
        title: 'Machines',
        category: 'Arbeidsmiddelen',
        description: '',
        aliases: [],
      },
    ],
  });
}
function draft(): ActionCreateDraft {
  return {
    id: 'action-1',
    title: 'Afscherming plaatsen',
    owner: 'Uitvoerder',
    dueDate: '',
    notes: 'Aanvullende context',
    stage: 'planned',
    sourceRefs: [{ kind: 'workspace', collection: 'sources', id: 'source-1' }],
    intendedResult: 'Toegang tot knelzone voorkomen',
    implementation: 'Ontwerp en montage voorbereiden',
    verificationMethod: 'Functioneel beproeven tegen ontwerpcriterium',
    ahsLevel: 'technical_collective',
    higherLevelsConsidered: ['elimination_or_source', 'substitution'],
    deviationRationale: 'Bronaanpak eerst onderzocht',
    priority: 'high',
    topicIds: ['topic-1'],
  };
}

describe('source-faithful additive action context', () => {
  it('creates only an explicit proposal or plan with source, desired result and planned owner; no historical author or effect claim', () => {
    const ws = workspace();
    const action = createAction(draft(), ws);
    expect(action).toMatchObject({
      intendedResult: draft().intendedResult,
      implementation: draft().implementation,
      verificationMethod: draft().verificationMethod,
      notes: draft().notes,
      lifecycle: {
        stage: 'planned',
        revision: 0,
        history: [],
        effectiveness: 'pending',
        evidenceSnapshots: [],
      },
    });
    expect(action.verifiedAt).toBeUndefined();
    expect(action.effectCheck).toBeUndefined();
    expect(() => createAction({ ...draft(), intendedResult: '' }, ws)).toThrow(/Beoogd resultaat/);
    expect(() => createAction({ ...draft(), sourceRefs: [] }, ws)).toThrow(/minimaal één bron/);
    expect(() => createAction({ ...draft(), owner: '' }, ws)).toThrow(/Eigenaar/);
    expect(createAction({ ...draft(), owner: '', stage: 'proposed' }, ws).lifecycle?.stage).toBe(
      'proposed',
    );
    expect(() => createAction({ ...draft(), stage: 'implemented' as 'planned' }, ws)).toThrow(
      /Nieuwe actiefase/,
    );
    ws.actions.push(action);
    expect(() => createAction(draft(), ws)).toThrow(/bestaat al/);
  });
  it('keeps all seven original AHS choices separate; unknown and lower-choice rationale gaps remain visible warnings', () => {
    const ws = workspace();
    for (const ahsLevel of [
      'unknown',
      'not_applicable',
      'elimination_or_source',
      'substitution',
      'technical_collective',
      'organisational',
      'individual_or_ppe',
    ] as const)
      expect(createAction({ ...draft(), ahsLevel }, ws).ahsLevel).toBe(ahsLevel);
    expect(() => assertActionContext({ ahsLevel: 'collective' as 'technical_collective' })).toThrow(
      /AHS/,
    );
    expect(actionContextWarnings({ ahsLevel: 'unknown' }).join(' ')).toContain('niet vastgesteld');
    expect(actionContextWarnings({ ahsLevel: 'organisational' }).join(' ')).toContain(
      'Lagere AHS-keuze',
    );
    expect(
      actionContextWarnings({
        ahsLevel: 'organisational',
        deviationRationale: 'Expliciete reden',
      }).join(' '),
    ).not.toContain('Lagere AHS-keuze');
    expect(
      actionContextWarnings({
        ahsLevel: 'individual_or_ppe',
        higherLevelsConsidered: ['substitution'],
      }).join(' '),
    ).not.toContain('Lagere AHS-keuze');
  });
  it('resolves only the stated collection and preserves actual unresolved IDs instead of guessing a matching title', () => {
    const ws = workspace();
    expect(() =>
      createAction(
        {
          ...draft(),
          sourceRefs: [{ kind: 'workspace', collection: 'incidents', id: 'source-1' }],
        },
        ws,
      ),
    ).toThrow(/bron ontbreekt/);
    const ref = {
      kind: 'unresolved' as const,
      originalId: 'actual-original:missing',
      rawSourceId: 'source-1',
    };
    const action = createAction({ ...draft(), sourceRefs: [ref] }, ws);
    expect(action.sourceRefs).toEqual([ref]);
    expect(actionContextWarnings(action).join(' ')).toContain('nog niet opgelost');
    expect(() =>
      createAction({ ...draft(), sourceRefs: [{ ...ref, rawSourceId: 'missing' }] }, ws),
    ).toThrow(/bron ontbreekt/);
  });
  it('rejects duplicate/unknown reference shapes, invalid priorities and missing topics', () => {
    const ws = workspace(),
      source = draft().sourceRefs![0];
    expect(() => assertActionContext({ sourceRefs: [source, source] })).toThrow(
      /Dubbele actiebron/,
    );
    expect(() =>
      assertActionContext({
        sourceRefs: [{ ...source, approval: true } as unknown as ActionSourceRef],
      }),
    ).toThrow(/structuur/);
    expect(() => assertActionContext({ priority: 'urgent' as 'critical' })).toThrow(/Prioriteit/);
    expect(() => createAction({ ...draft(), topicIds: ['missing'] }, ws)).toThrow(
      /onderwerp bestaat niet/,
    );
  });
  it('does not add absent context fields when validating old records and distinguishes explicit empty fields', () => {
    const old = { title: 'Oude actie', notes: 'Oud controleplan' };
    const before = structuredClone(old);
    assertActionContext(old as unknown as EditableActionContext);
    expect(old).toEqual(before);
    expect(Object.hasOwn(old, 'verificationMethod')).toBe(false);
    expect(() => assertActionContext({ verificationMethod: '' })).not.toThrow();
    expect(() =>
      assertActionContext({ higherLevelsConsidered: ['substitution', 'substitution'] }),
    ).toThrow(/uniek/);
  });
  it('pins selected actual sources and targets for draft recovery, detects their changes, and ignores unrelated records', () => {
    const ws = workspace();
    const target = captureRiskTargetReference(ws.scenarios[0], 'control', 'control-1');
    const content = { ...draft(), riskTargets: [target] };
    const initial = actionContextBasis(content, ws);
    ws.sources.push({ id: 'unrelated', title: 'Anders' });
    expect(actionContextBasis(content, ws)).toBe(initial);
    ws.sources[0].title = 'Bron gewijzigd';
    expect(actionContextBasis(content, ws)).not.toBe(initial);
    ws.sources[0].title = 'Werkelijk geselecteerde bron';
    expect(actionContextBasis(content, ws)).toBe(initial);
    ws.scenarios[0].hazard = 'Ander gevaar';
    expect(actionContextBasis(content, ws)).not.toBe(initial);
    expect(content.riskTargets[0]).toEqual(target);
  });
  it('requires explicit target identity and matching scope while preserving a changed target reference for review', () => {
    const ws = workspace();
    const target = captureRiskTargetReference(ws.scenarios[0], 'control', 'control-1');
    const content = { ...draft(), riskTargets: [target] };
    expect(() => assertActionContextRelations(content, ws)).not.toThrow();
    expect(() => assertActionContextRelations({ ...content, scenarioId: 'another' }, ws)).toThrow(
      /actiescenario/,
    );
    expect(() => assertActionContextRelations({ ...content, dossierId: 'foreign' }, ws)).toThrow(
      /dossierscope/,
    );
    ws.scenarios[0].controls[0].title = 'Gewijzigde maatregel';
    expect(() => assertActionContextRelations(content, ws)).not.toThrow();
    expect(() => createAction(content, ws)).toThrow(/actuele risicodoelversie/);
    ws.scenarios[0].controls = [];
    expect(() => assertActionContextRelations(content, ws)).not.toThrow();
    expect(() => createAction(content, ws)).toThrow(/actuele risicodoelversie/);
    const changed = structuredClone(content);
    changed.riskTargets[0].targetId = 'other';
    expect(() => assertActionContext(changed)).toThrow(/identiteit/);
  });
  it('exports exact source IDs, separate content fields and target versions while leaving absent old values unknown', () => {
    const ws = workspace();
    const target = captureRiskTargetReference(ws.scenarios[0], 'control', 'control-1');
    const action = createAction(
      {
        ...draft(),
        riskTargets: [target],
        sourceRefs: [
          ...draft().sourceRefs!,
          { kind: 'unresolved', originalId: 'actual:unresolved', rawSourceId: 'source-1' },
        ],
      },
      ws,
    );
    const current = actionContextMarkdown(action, ws).join('\n');
    for (const value of [
      'technical_collective',
      'elimination_or_source',
      'substitution',
      'high',
      'source-1',
      'actual:unresolved',
      'topic-1',
      action.intendedResult!,
      action.implementation!,
      action.verificationMethod!,
      target.targetSha256,
    ])
      expect(current).toContain(value);
    expect(current).toContain('huidige doelversie current');
    ws.scenarios[0].controls[0].status = 'retired';
    expect(actionContextMarkdown(action, ws).join('\n')).toContain('huidige doelversie changed');
    expect(actionContextMarkdown(action).join('\n')).toContain(target.targetSha256);
    expect(actionContextMarkdown({}).join('\n')).toContain('Niet afzonderlijk vastgelegd');
    expect(actionContextMarkdown({ verificationMethod: '' }).join('\n')).not.toContain(
      'compatibiliteitsbasis',
    );
  });
});
