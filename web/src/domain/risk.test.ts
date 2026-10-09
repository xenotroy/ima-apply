import { describe, expect, it } from 'vitest';
import {
  calculateFineJustification,
  calculateKinney,
  calculateKinneyJustification,
  calculateLopa,
  efficacyEstimate,
  evaluateRisk,
  fineJustification,
  kinneyJustification,
  prioritizeControl,
  range,
  riskBand,
  scoreKinney,
} from './risk';
import type { Control, LopaLayer, LopaModifier, LopaScenario, Scenario } from './types';

function control(patch: Partial<Control> = {}): Control {
  return {
    id: 'guard',
    title: 'Afscherming',
    ahs: 'collective',
    status: 'existing',
    evidence: 'verified',
    evidenceNote: 'Functionele beproeving en inspectie vastgelegd.',
    rationale: 'Afscherming voorkomt toegang tot het bewegende deel.',
    probabilityReduction: range(0.5),
    exposureReduction: range(0),
    effectReduction: range(0),
    independent: true,
    feasibility: 'moderate',
    effort: 2,
    legalRequired: false,
    ...patch,
  };
}
function scenario(controls: Control[] = []): Scenario {
  return {
    id: 'machine',
    title: 'Machinecontact',
    description: '',
    department: 'Werkplaats',
    hazard: 'Draaiende delen',
    consequence: 'Ernstig letsel',
    probability: 6,
    exposure: 6,
    effect: 15,
    controls,
  };
}
function layer(patch: Partial<LopaLayer> = {}): LopaLayer {
  return {
    id: 'trip',
    title: 'Onafhankelijke stop',
    status: 'existing',
    evidence: 'verified',
    evidenceNote: 'Proof-test en PFD-berekening',
    pfd: range(0.1),
    specific: true,
    independent: true,
    independentOfInitiator: true,
    auditable: true,
    effective: true,
    independenceNote: 'Apart systeem, aparte sensor en actuator; initiator is procesregeling.',
    ...patch,
  };
}
function lopa(layers: LopaLayer[] = [], modifiers: LopaModifier[] = []): LopaScenario {
  return {
    initiatingEvent: 'Regelkring faalt',
    initiatingFrequency: range(0.1),
    frequencyEvidence: 'Lokaal faalregister, afgestemde tijdsbasis per jaar.',
    consequence: 'Overdruk met gespecificeerd letsel',
    layers,
    modifiers,
    targetFrequency: 0.001,
    assumptions: 'Eén oorzaak en één gevolg; constante faalfrequentie.',
  };
}
function modifier(patch: Partial<LopaModifier> = {}): LopaModifier {
  return {
    id: 'occupancy',
    title: 'Aanwezigheid',
    kind: 'conditional',
    probability: range(0.2),
    evidence: 'verified',
    evidenceNote: 'Rooster en aanwezigheidsregistratie',
    independent: true,
    rationale: 'Endpoint is letsel aan aanwezige werknemer, niet alleen vrijkomen.',
    ...patch,
  };
}

describe('Kinney scenario arithmetic and evidence', () => {
  it('keeps an ordinal Kinney score separate from probability and annual frequency', () => {
    expect(scoreKinney(6, 6, 15)).toBe(540);
    expect(calculateKinney(scenario()).score).toEqual(range(540));
  });
  it('changes only the factor where the causal mechanism is stated', () => {
    const result = calculateKinney(scenario([control()]));
    expect(result.factors.probability.value).toBe(3);
    expect(result.factors.exposure.value).toBe(6);
    expect(result.factors.effect.value).toBe(15);
    expect(result.score.value).toBe(270);
  });
  it('does not give source measures a physical bonus', () => {
    const source = calculateKinney(scenario([control({ ahs: 'source' })]));
    const ppe = calculateKinney(scenario([control({ ahs: 'ppe' })]));
    expect(source.score).toEqual(ppe.score);
  });
  it('excludes planned, retired, unknown, and unverified existing measures from current risk', () => {
    const controls = [
      control({ id: 'p', status: 'planned' }),
      control({ id: 'r', status: 'retired' }),
      control({ id: 'u', evidence: 'unknown' }),
      control({ id: 'a', evidence: 'unverified' }),
    ];
    const result = calculateKinney(scenario(controls));
    expect(result.creditedControlIds).toEqual([]);
    expect(result.score.value).toBe(540);
    expect(result.excluded).toHaveLength(4);
  });
  it('requires a documented causal mechanism and evidence even for a verified declaration', () => {
    expect(calculateKinney(scenario([control({ evidenceNote: '' })])).creditedControlIds).toEqual(
      [],
    );
    expect(calculateKinney(scenario([control({ rationale: '' })])).creditedControlIds).toEqual([]);
  });
  it('shows unverified planned estimates only as a projection with zero guaranteed benefit', () => {
    const input = scenario([
      control({
        status: 'planned',
        evidence: 'unverified',
        probabilityReduction: range(0.6, 0.4, 0.8),
      }),
    ]);
    const result = calculateKinney(input, 'planned');
    expect(result.score.value).toBeCloseTo(216);
    expect(result.score.min).toBeCloseTo(108);
    expect(result.score.max).toBe(540);
    expect(calculateKinney(input).score.value).toBe(540);
    expect(input.controls[0].probabilityReduction.min).toBe(0.4);
  });
  it('propagates bounds in the correct direction for independent preventative and mitigative mechanisms', () => {
    const result = calculateKinney(
      scenario([
        control({ probabilityReduction: range(0.5, 0.4, 0.6) }),
        control({
          id: 'mitigation',
          probabilityReduction: range(0),
          effectReduction: range(0.5, 0.2, 0.8),
        }),
      ]),
    );
    expect(result.score.min).toBeCloseTo(43.2);
    expect(result.score.value).toBeCloseTo(135);
    expect(result.score.max).toBeCloseTo(259.2);
    expect(result.steps[1].factors.effect.value).toBe(7.5);
  });
  it('does not multiply overlapping effects or combine best axes from different controls', () => {
    const controls = [
      control({ dependencyGroup: 'shared operator', probabilityReduction: range(0.7) }),
      control({
        id: 'instruction',
        dependencyGroup: 'shared operator',
        probabilityReduction: range(0),
        effectReduction: range(0.6),
      }),
    ];
    const result = calculateKinney(scenario(controls));
    expect(result.score.value).toBeCloseTo(162);
    expect(result.factors.effect.value).toBe(15);
    expect(result.creditedControlIds).toEqual(['guard']);
    expect(result.excluded[0].id).toBe('instruction');
    expect(result.warnings.some((x) => x.includes('niet vermenigvuldigd'))).toBe(true);
  });
  it('collapses controls with unresolved independence into one standalone effect', () => {
    const result = calculateKinney(
      scenario([control({ independent: false }), control({ id: 'second', independent: false })]),
    );
    expect(result.score.value).toBe(270);
    expect(result.creditedControlIds).toHaveLength(1);
  });
  it('never stacks unresolved independence with a known independent mechanism', () => {
    const result = calculateKinney(
      scenario([
        control(),
        control({ id: 'unresolved', independent: false, dependencyGroup: 'apparently separate' }),
      ]),
    );
    expect(result.score.value).toBe(270);
    expect(result.creditedControlIds).toEqual(['guard']);
    expect(result.excluded.find((item) => item.id === 'unresolved')?.reason).toContain(
      'Onafhankelijkheid onopgelost',
    );
  });
  it('compares a resolved combination against one unresolved standalone vector without mixing axes', () => {
    const result = calculateKinney(
      scenario([
        control(),
        control({
          id: 'independent-mitigation',
          probabilityReduction: range(0),
          effectReduction: range(0.5),
        }),
        control({ id: 'unresolved', independent: false, probabilityReduction: range(0.8) }),
      ]),
    );
    expect(result.score.value).toBeCloseTo(108);
    expect(result.factors.effect.value).toBe(15);
    expect(result.creditedControlIds).toEqual(['unresolved']);
    expect(result.excluded.map((item) => item.id).sort()).toEqual([
      'guard',
      'independent-mitigation',
    ]);
  });
  it('chooses a better conservative branch before a stronger nominal unresolved guess', () => {
    const result = calculateKinney(
      scenario([
        control(),
        control({
          id: 'unresolved',
          independent: false,
          probabilityReduction: range(0.9, 0.1, 0.95),
        }),
      ]),
    );
    expect(result.score).toEqual(range(270));
    expect(result.creditedControlIds).toEqual(['guard']);
  });
  it('represents genuine scenario elimination explicitly and warns about other routes', () => {
    const result = calculateKinney(
      scenario([control({ ahs: 'source', probabilityReduction: range(1) })]),
    );
    expect(result.score.value).toBe(0);
    expect(result.warnings.some((x) => x.includes('eliminatie'))).toBe(true);
  });
  it('rejects inverted estimates, invalid fractions, duplicate controls, and absent baseline scores', () => {
    expect(() => range(0.4, 0.6, 0.9)).toThrow(RangeError);
    expect(() =>
      calculateKinney(scenario([control({ probabilityReduction: range(1.1) })])),
    ).toThrow(RangeError);
    expect(() => calculateKinney(scenario([control(), control()]))).toThrow(RangeError);
    expect(() => scoreKinney(0, 6, 15)).toThrow(RangeError);
    expect(() => scoreKinney(Number.NaN, 6, 15)).toThrow(RangeError);
  });
  it('normalizes class boundaries explicitly and never labels a low score legally acceptable', () => {
    expect([19.9, 20, 70, 200, 400].map((value) => riskBand(value).id)).toEqual([
      'low',
      'attention',
      'significant',
      'high',
      'critical',
    ]);
    expect(riskBand(0).action).toContain('verplichtingen');
  });
});

describe('justification and local priorities', () => {
  it('inscales proposed effectiveness with explicit conditional coverage, availability and use definitions', () => {
    const result = efficacyEstimate({
      intrinsic: range(0.8, 0.6, 0.9),
      coverage: range(0.75, 0.5, 1),
      availability: range(0.9, 0.8, 1),
      correctUse: range(0.5, 0.3, 0.7),
      conditionalBasis:
        'Beschikbaarheid binnen bereik; correct gebruik gegeven bereik en beschikbaarheid; intrinsiek uitsluitend bij juiste werking.',
    });
    expect(result.min).toBeCloseTo(0.072);
    expect(result.value).toBeCloseTo(0.27);
    expect(result.max).toBeCloseTo(0.63);
  });
  it('does not propose a product of ambiguous, unsupported effectiveness denominators', () => {
    expect(() =>
      efficacyEstimate({
        intrinsic: range(0.8),
        coverage: range(1),
        availability: range(1),
        correctUse: range(1),
        conditionalBasis: '',
      }),
    ).toThrow(RangeError);
    expect(() =>
      efficacyEstimate({
        intrinsic: range(1.1),
        coverage: range(1),
        availability: range(1),
        correctUse: range(1),
        conditionalBasis: 'Basis beschreven.',
      }),
    ).toThrow(RangeError);
  });
  it('applies hierarchy and feasibility only to the decision priority', () => {
    const ppe = control({ status: 'planned', ahs: 'ppe', feasibility: 'hard' });
    const source = control({ status: 'planned', ahs: 'source', feasibility: 'easy' });
    expect(calculateKinney(scenario([ppe]), 'planned').score).toEqual(
      calculateKinney(scenario([source]), 'planned').score,
    );
    expect(prioritizeControl(scenario([source]), source).score).toBeGreaterThan(
      prioritizeControl(scenario([ppe]), ppe).score,
    );
  });
  it('evaluates each proposed measure incrementally without crediting unrelated plans', () => {
    const a = control({ id: 'a', status: 'planned' });
    const b = control({ id: 'b', status: 'planned', probabilityReduction: range(0.9) });
    expect(prioritizeControl(scenario([a, b]), a).benefit).toBe(270);
  });
  it('gives an unresolved planned instruction no marginal stacked benefit above an existing barrier', () => {
    const training = control({
      id: 'training',
      status: 'planned',
      evidence: 'unverified',
      independent: false,
      probabilityReduction: range(0.5),
    });
    const input = scenario([control(), training]);
    expect(calculateKinney(input, 'planned').score.value).toBe(270);
    expect(prioritizeControl(input, training).benefit).toBe(0);
    expect(prioritizeControl(input, training).score).toBe(0);
  });
  it('ranks a mandatory measure before a cheap optional measure', () => {
    const cheap = control({ id: 'cheap', status: 'planned', effort: 0.1 });
    const mandatory = control({
      id: 'required',
      status: 'planned',
      effort: 100,
      legalRequired: true,
    });
    expect(evaluateRisk(scenario([cheap, mandatory])).priorities[0].controlId).toBe('required');
  });
  it('implements the two historic justification formulas distinctly without silently converting modern euros', () => {
    expect(fineJustification(300, 2, 3)).toBe(50);
    expect(kinneyJustification(300, 0.6, 2)).toBe(90);
    expect(calculateFineJustification(300, 2, 3)).toBe(50);
    expect(calculateKinneyJustification(300, 0.6, 2)).toBe(90);
    expect(() => fineJustification(300, 0, 3)).toThrow(RangeError);
    expect(() => kinneyJustification(300, 1.2, 2)).toThrow(RangeError);
  });
});

describe('LOPA frequency and IPL qualification', () => {
  it('keeps an old empty criterion basis readable but never declares its criterion confirmed', () => {
    const input = lopa([layer()]);
    const confirmed = calculateLopa(input);
    const result = calculateLopa({ ...input, assumptions: '' });
    expect(result.frequency).toEqual(confirmed.frequency);
    expect(result.comparison).toBe('unconfirmed');
    expect(result.warnings.join(' ')).toContain('geen vastgelegde aannames');
  });
  it('multiplies actual PFD estimates and initiator annual frequency only for qualified IPLs', () => {
    const result = calculateLopa(lopa([layer(), layer({ id: 'relief', pfd: range(0.01) })]));
    expect(result.frequency.value).toBeCloseTo(0.0001);
    expect(result.riskReductionFactor.value).toBe(1000);
    expect(result.comparison).toBe('below');
  });
  it('rejects credit for planned, unverified, nonspecific, dependent, unauditable, ineffective or initiator-dependent layers', () => {
    const patches: Partial<LopaLayer>[] = [
      { status: 'planned' },
      { evidence: 'unverified' },
      { specific: false },
      { independent: false },
      { auditable: false },
      { effective: false },
      { independentOfInitiator: false },
      { independenceNote: '' },
      { evidenceNote: '' },
    ];
    const result = calculateLopa(
      lopa(patches.map((patch, i) => layer({ id: String(i), ...patch }))),
    );
    expect(result.creditedLayerIds).toEqual([]);
    expect(result.frequency.value).toBe(0.1);
    expect(result.excluded).toHaveLength(patches.length);
  });
  it('does not grant extra credit for common equipment or another explicit dependency', () => {
    const result = calculateLopa(
      lopa([
        layer({ dependencyGroup: 'shared sensor' }),
        layer({ id: 'second', dependencyGroup: 'shared sensor' }),
      ]),
    );
    expect(result.creditedLayerIds).toEqual([]);
    expect(result.frequency.value).toBe(0.1);
    expect(result.warnings.some((x) => x.includes('shared sensor'))).toBe(true);
  });
  it('keeps enabling/conditional modifiers separate and prevents the same mechanism being counted as a layer', () => {
    const result = calculateLopa(
      lopa([layer({ dependencyGroup: 'presence' })], [modifier({ dependencyGroup: 'presence' })]),
    );
    expect(result.frequency.value).toBe(0.1);
    expect(result.creditedLayerIds).toEqual([]);
    expect(result.creditedModifierIds).toEqual([]);
  });
  it('uses one for unsupported modifiers rather than silently adopting an optimistic chance', () => {
    const result = calculateLopa(lopa([layer()], [modifier({ evidence: 'unverified' })]));
    expect(result.unmitigatedFrequency.value).toBe(0.1);
    expect(result.frequency.value).toBeCloseTo(0.01);
  });
  it('applies verified modifiers once, without presenting them as IPL risk-reduction credit', () => {
    const result = calculateLopa(lopa([layer()], [modifier()]));
    expect(result.unmitigatedFrequency.value).toBeCloseTo(0.02);
    expect(result.frequency.value).toBeCloseTo(0.002);
    expect(result.riskReductionFactor.value).toBe(10);
  });
  it('shows an uncertainty interval that crosses the user-specified criterion', () => {
    const input = lopa([layer({ pfd: range(0.01, 0.005, 0.02) })]);
    input.initiatingFrequency = range(0.1, 0.05, 0.2);
    const result = calculateLopa(input);
    expect(result.frequency.min).toBeCloseTo(0.00025);
    expect(result.frequency.value).toBeCloseTo(0.001);
    expect(result.frequency.max).toBeCloseTo(0.004);
    expect(result.riskReductionFactor).toEqual(range(100, 50, 200));
    expect(result.comparison).toBe('uncertain');
  });
  it('rejects modifier lower-bound underflow even when the nominal frequency is representable', () => {
    const input = lopa([], [modifier({ probability: range(0.2, 1e-200, 0.2) })]);
    input.initiatingFrequency = range(0.1, 1e-200, 0.1);
    expect(() => calculateLopa(input)).toThrow(/Numerieke onderloop bij min/);
  });
  it('rejects IPL frequency lower-bound underflow without inventing physical zero', () => {
    const input = lopa([layer({ pfd: range(0.1, 1e-200, 0.1) })]);
    input.initiatingFrequency = range(0.1, 1e-200, 0.1);
    expect(() => calculateLopa(input)).toThrow(/Numerieke onderloop bij min/);
  });
  it('rejects nominal frequency underflow for positive initiator and IPL inputs', () => {
    const input = lopa([layer({ pfd: range(1e-20) })]);
    input.initiatingFrequency = range(1e-310);
    expect(() => calculateLopa(input)).toThrow(/Numerieke onderloop bij value/);
  });
  it('retains representable subnormal frequencies as positive rather than imposing a plotting floor', () => {
    const input = lopa([layer({ pfd: range(1e-20) })]);
    input.initiatingFrequency = range(1e-300, 1e-301, 1e-299);
    const result = calculateLopa(input);
    expect(result.frequency.value).toBe(1e-300 * 1e-20);
    expect(
      Object.values(result.frequency).every((value) => value > 0 && Number.isFinite(value)),
    ).toBe(true);
    expect(result.riskReductionFactor.value).toBe(1e20);
  });
  it('preserves a genuinely entered zero initiator lower bound through modifiers and IPLs', () => {
    const input = lopa([layer({ pfd: range(0.1, 0.05, 0.2) })], [modifier()]);
    input.initiatingFrequency = range(0.1, 0, 0.2);
    const result = calculateLopa(input);
    expect(result.frequency.min).toBe(0);
    expect(result.frequency.value).toBeCloseTo(0.002);
    expect(result.frequency.max).toBeCloseTo(0.008);
  });
  it('rejects an overflowing reciprocal RRF even when frequency and nominal RRF remain finite', () => {
    const input = lopa([layer({ pfd: range(1e-200, 1e-320, 1e-200) })]);
    input.initiatingFrequency = range(1);
    expect(() => calculateLopa(input)).toThrow(/eindig getal vereist/);
  });
  it('rejects perfect PFD, unsupported initial frequency and shared identities', () => {
    expect(() => calculateLopa(lopa([layer({ pfd: range(0) })]))).toThrow(RangeError);
    expect(() => calculateLopa({ ...lopa(), frequencyEvidence: '' })).toThrow(RangeError);
    expect(() => calculateLopa(lopa([layer()], [modifier({ id: 'trip' })]))).toThrow(RangeError);
  });
});
