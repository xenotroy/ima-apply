import type {
  AhsLevel,
  AssessmentMode,
  Control,
  ControlPriority,
  EfficacyFactors,
  Estimate,
  Exclusion,
  FactorEstimates,
  KinneyResult,
  LopaResult,
  LopaScenario,
  RiskBand,
  RiskEvaluation,
  Scenario,
} from './types';

export type * from './types';

export const RISK_METHOD_VERSION = 'ima-risk/2.0.0';
export const AHS_LABELS: Record<AhsLevel, string> = {
  source: 'Bronmaatregel',
  collective: 'Collectieve maatregel',
  individual: 'Individuele / organisatorische maatregel',
  ppe: 'Persoonlijke bescherming',
};
/** Kinney & Wiruth, NWC TP 5865 (1976), pp. 8–9; Dutch descriptions. */
export const KINNEY_SCALES = {
  probability: [
    { value: 0.1, label: 'Nagenoeg onmogelijk' },
    { value: 0.2, label: 'Praktisch onmogelijk' },
    { value: 0.5, label: 'Denkbaar, zeer onwaarschijnlijk' },
    { value: 1, label: 'Onwaarschijnlijk, mogelijk' },
    { value: 3, label: 'Ongewoon maar mogelijk' },
    { value: 6, label: 'Goed mogelijk' },
    { value: 10, label: 'Te verwachten' },
  ],
  exposure: [
    { value: 0.5, label: 'Jaarlijks' },
    { value: 1, label: 'Enkele malen per jaar' },
    { value: 2, label: 'Maandelijks' },
    { value: 3, label: 'Wekelijks' },
    { value: 6, label: 'Dagelijks' },
    { value: 10, label: 'Voortdurend' },
  ],
  effect: [
    { value: 1, label: 'Licht letsel / eerste hulp' },
    { value: 3, label: 'Letsel met verzuim' },
    { value: 7, label: 'Ernstig letsel' },
    { value: 15, label: 'Eén dode' },
    { value: 40, label: 'Enkele doden' },
    { value: 100, label: 'Veel doden / catastrofe' },
  ],
} as const;

/** Explicit local ranking policy. These weights do NOT change physical risk. */
export const PRIORITY_POLICY = {
  version: 'ima-priority/1.0.0',
  hierarchyWeights: { source: 1.4, collective: 1.25, individual: 1.1, ppe: 1 } satisfies Record<
    AhsLevel,
    number
  >,
  feasibilityMultipliers: { easy: 1.5, moderate: 1, hard: 0.8 },
} as const;

function finite(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new RangeError(`${name}: eindig getal vereist.`);
}
function positive(value: number, name: string): void {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name}: waarde moet groter dan nul zijn.`);
}
export function range(value: number, min = value, max = value): Estimate {
  const estimate = { min, value, max };
  validateEstimate(estimate, 'Interval');
  return estimate;
}
export function validateEstimate(
  estimate: Estimate,
  name = 'Interval',
  limits?: { min?: number; max?: number },
): void {
  if (!estimate || typeof estimate !== 'object')
    throw new RangeError(`${name}: interval ontbreekt.`);
  finite(estimate.min, `${name}.min`);
  finite(estimate.value, `${name}.value`);
  finite(estimate.max, `${name}.max`);
  if (estimate.min > estimate.value || estimate.value > estimate.max)
    throw new RangeError(`${name}: min ≤ waarde ≤ max vereist.`);
  if (limits?.min !== undefined && estimate.min < limits.min)
    throw new RangeError(`${name}: ondergrens ${limits.min}.`);
  if (limits?.max !== undefined && estimate.max > limits.max)
    throw new RangeError(`${name}: bovengrens ${limits.max}.`);
}
function probability(estimate: Estimate, name: string): void {
  validateEstimate(estimate, name, { min: 0, max: 1 });
}
function product(a: Estimate, b: Estimate): Estimate {
  const value = a.value * b.value;
  if (a.value > 0 && b.value > 0 && value === 0)
    throw new RangeError('Numerieke onderloop; model kan deze niet-nulkans niet weergeven.');
  return range(value, a.min * b.min, a.max * b.max);
}
function remaining(reduction: Estimate): Estimate {
  return range(1 - reduction.value, 1 - reduction.max, 1 - reduction.min);
}
function cloneFactors(factors: FactorEstimates): FactorEstimates {
  return {
    probability: { ...factors.probability },
    exposure: { ...factors.exposure },
    effect: { ...factors.effect },
  };
}
function factorsScore(factors: FactorEstimates): Estimate {
  return product(product(factors.probability, factors.exposure), factors.effect);
}
function checkIds(items: { id: string }[], name: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id?.trim() || seen.has(item.id))
      throw new RangeError(`${name}: lege of dubbele id ${item.id}.`);
    seen.add(item.id);
  }
}
function validateControl(control: Control): void {
  probability(control.probabilityReduction, `${control.title}: W-reductie`);
  probability(control.exposureReduction, `${control.title}: B-reductie`);
  probability(control.effectReduction, `${control.title}: E-reductie`);
  positive(control.effort, `${control.title}: inspanning`);
  if (!Object.prototype.hasOwnProperty.call(AHS_LABELS, control.ahs))
    throw new RangeError('Onbekend AHS-niveau.');
  if (
    !Object.prototype.hasOwnProperty.call(
      PRIORITY_POLICY.feasibilityMultipliers,
      control.feasibility,
    )
  )
    throw new RangeError('Onbekende haalbaarheid.');
}

/**
 * Proposed score-factor reduction for a single causal mechanism, never a PFD.
 * Coverage defines the applicable fraction. Availability is conditional on
 * coverage; correct use on coverage AND availability; intrinsic efficacy on
 * all three. These conditional definitions remove the need to assume statistical
 * independence. A statement alone does not validate the underlying evidence.
 */
export function efficacyEstimate(factors: EfficacyFactors): Estimate {
  if (!factors.conditionalBasis?.trim())
    throw new RangeError(
      'Beschrijf conditionele definities en controle op dubbeltelling vóór inschaling van effectiviteit.',
    );
  probability(factors.intrinsic, 'Intrinsieke scorewerking');
  probability(factors.coverage, 'Bereik');
  probability(factors.availability, 'Conditionele beschikbaarheid');
  probability(factors.correctUse, 'Conditioneel correct gebruik');
  return product(
    product(product(factors.coverage, factors.availability), factors.correctUse),
    factors.intrinsic,
  );
}

export function riskBand(score: number): RiskBand {
  finite(score, 'Risicoscore');
  if (score < 0) throw new RangeError('Risicoscore mag niet negatief zijn.');
  // Boundaries are explicitly normalized for this implementation: [0,20), [20,70), etc.
  if (score >= 400)
    return {
      id: 'critical',
      label: 'Zeer hoog',
      color: '#f43f5e',
      action: 'Staak of beperk de activiteit en tref direct maatregelen.',
    };
  if (score >= 200)
    return { id: 'high', label: 'Hoog', color: '#fb923c', action: 'Directe verbetering nodig.' };
  if (score >= 70)
    return {
      id: 'significant',
      label: 'Aanzienlijk',
      color: '#fbbf24',
      action: 'Verbetermaatregelen nodig.',
    };
  if (score >= 20)
    return {
      id: 'attention',
      label: 'Aandacht',
      color: '#22d3ee',
      action: 'Beoordeel en bewaak de beheersing.',
    };
  return {
    id: 'low',
    label: 'Laag',
    color: '#34d399',
    action: 'Bewaak de beheersing; beoordeel verplichtingen en scenario afzonderlijk.',
  };
}

/** Dimensionless relative score. W is an ordinal likelihood score, not a probability. */
export function scoreKinney(
  probabilityFactor: number,
  exposureFactor: number,
  effectFactor: number,
): number {
  positive(probabilityFactor, 'W');
  positive(exposureFactor, 'B');
  positive(effectFactor, 'E');
  const score = probabilityFactor * exposureFactor * effectFactor;
  finite(score, 'W × B × E');
  return score;
}

function retainedFraction(control: Control, conservative = false): number {
  const key = conservative ? 'min' : 'value';
  return (
    (1 - control.probabilityReduction[key]) *
    (1 - control.exposureReduction[key]) *
    (1 - control.effectReduction[key])
  );
}

/**
 * Current: only existing, verified controls with a stated mechanism and evidence.
 * Planned: adds documented planned estimates; uncertain planned controls receive
 * a zero lower reduction bound, so a projection cannot promise their benefit.
 */
export function calculateKinney(
  scenario: Scenario,
  mode: AssessmentMode = 'current',
): KinneyResult {
  if (mode !== 'current' && mode !== 'planned')
    throw new RangeError('Onbekende beoordelingsmodus.');
  const initial = scoreKinney(scenario.probability, scenario.exposure, scenario.effect);
  checkIds(scenario.controls, 'Maatregelen');
  const excluded: Exclusion[] = [];
  const warnings: string[] = [];
  const candidates: Control[] = [];
  const exclude = (control: Control, reason: string) =>
    excluded.push({ id: control.id, title: control.title, reason });
  for (const control of scenario.controls) {
    validateControl(control);
    if (!['existing', 'planned', 'retired'].includes(control.status))
      throw new RangeError('Onbekende maatregelstatus.');
    if (!['verified', 'unverified', 'unknown'].includes(control.evidence))
      throw new RangeError('Onbekende bewijsstatus.');
    if (control.status === 'retired') {
      exclude(control, 'Buiten gebruik.');
      continue;
    }
    if (control.status === 'planned' && mode === 'current') {
      exclude(control, 'Gepland; geen huidige risicocredit.');
      continue;
    }
    if (!control.rationale?.trim() || !control.evidenceNote?.trim()) {
      exclude(control, 'Mechanisme of bewijs/onderbouwing ontbreekt.');
      continue;
    }
    if (
      control.evidence === 'unknown' ||
      (control.status === 'existing' && control.evidence !== 'verified')
    ) {
      exclude(control, 'Effectiviteit onbekend of bestaande werking onbewezen.');
      continue;
    }
    let candidate = control;
    if (control.status === 'planned' && control.evidence === 'unverified') {
      candidate = {
        ...control,
        probabilityReduction: { ...control.probabilityReduction, min: 0 },
        exposureReduction: { ...control.exposureReduction, min: 0 },
        effectReduction: { ...control.effectReduction, min: 0 },
      };
      warnings.push(
        `${control.title}: prognose op basis van een onbevestigde aanname; conservatieve reductie is nul.`,
      );
    }
    const affected = [
      candidate.probabilityReduction.value,
      candidate.exposureReduction.value,
      candidate.effectReduction.value,
    ].filter((x) => x > 0).length;
    if (affected > 1)
      warnings.push(
        `${control.title}: meerdere factoren verlaagd; onderbouw afzonderlijke mechanismen en voorkom dubbeltelling.`,
      );
    if (
      [
        candidate.probabilityReduction.max,
        candidate.exposureReduction.max,
        candidate.effectReduction.max,
      ].some((x) => x === 1)
    ) {
      warnings.push(
        `${control.title}: volledige eliminatie als scenario-aanname; controleer andere routes, vervangende gevaren en de scenarioafbakening.`,
      );
    }
    candidates.push(candidate);
  }

  // For dependent controls, keep one complete effect vector, never per-axis maxima.
  // The best documented conservative standalone effect represents the whole group.
  const groups = new Map<string, Control[]>();
  const unresolved: Control[] = [];
  for (const candidate of candidates) {
    // A declared group cannot establish independence that has not been assessed.
    if (!candidate.independent) {
      unresolved.push(candidate);
      continue;
    }
    const group = candidate.dependencyGroup?.trim();
    const key = group ? `group:${group}` : `control:${candidate.id}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(candidate);
    groups.set(key, bucket);
  }
  const resolved: Control[] = [];
  const strongestFirst = (a: Control, b: Control) =>
    retainedFraction(a, true) - retainedFraction(b, true) ||
    retainedFraction(a) - retainedFraction(b) ||
    a.id.localeCompare(b.id);
  for (const [key, controls] of groups) {
    const ordered = [...controls].sort(strongestFirst);
    resolved.push(ordered[0]);
    if (controls.length > 1) {
      warnings.push(
        `Afhankelijkheid ${key.replace('group:', '')}: één zelfstandig effect geteld; effecten niet vermenigvuldigd.`,
      );
      for (const control of ordered.slice(1))
        exclude(
          control,
          `Overlappende of afhankelijke werking; ${ordered[0].title} vertegenwoordigt deze groep.`,
        );
    }
  }
  let selected = resolved;
  if (unresolved.length > 0) {
    const ordered = [...unresolved].sort(strongestFirst);
    const standalone = ordered[0];
    for (const control of ordered.slice(1))
      exclude(
        control,
        `Onafhankelijkheid onopgelost; alleen het zelfstandig effect van ${standalone.title} kan deze onopgeloste werking vertegenwoordigen.`,
      );
    // A known-independent checkbox on other controls cannot prove that the
    // unresolved control is independent of them. Compare complete alternative
    // branches, rather than multiplying one unresolved vector into the combination.
    const conservativeResolved = resolved.reduce(
      (fraction, control) => fraction * retainedFraction(control, true),
      1,
    );
    const nominalResolved = resolved.reduce(
      (fraction, control) => fraction * retainedFraction(control),
      1,
    );
    const conservativeStandalone = retainedFraction(standalone, true);
    const nominalStandalone = retainedFraction(standalone);
    const chooseStandalone =
      resolved.length === 0 ||
      conservativeStandalone < conservativeResolved ||
      (conservativeStandalone === conservativeResolved && nominalStandalone < nominalResolved);
    if (chooseStandalone) {
      selected = [standalone];
      for (const control of resolved)
        exclude(
          control,
          `Onafhankelijkheid ten opzichte van ${standalone.title} onopgelost; zelfstandige werking gekozen in plaats van de combinatie.`,
        );
    } else {
      exclude(
        standalone,
        'Onafhankelijkheid onopgelost; niet gestapeld met de beoordeelde onafhankelijke combinatie.',
      );
    }
    warnings.push(
      'Onafhankelijkheid onopgelost: onafhankelijke combinatie en sterkste zelfstandige werking zijn alternatieve paden; deze effecten worden niet met elkaar vermenigvuldigd.',
    );
  }
  // Deterministic waterfall in source order; changing a UI list order cannot alter its outcome.
  selected.sort(
    (a, b) =>
      scenario.controls.findIndex((c) => c.id === a.id) -
      scenario.controls.findIndex((c) => c.id === b.id),
  );
  let factors: FactorEstimates = {
    probability: range(scenario.probability),
    exposure: range(scenario.exposure),
    effect: range(scenario.effect),
  };
  const steps: KinneyResult['steps'] = [];
  for (const control of selected) {
    const before = factorsScore(factors).value;
    factors = {
      probability: product(factors.probability, remaining(control.probabilityReduction)),
      exposure: product(factors.exposure, remaining(control.exposureReduction)),
      effect: product(factors.effect, remaining(control.effectReduction)),
    };
    const score = factorsScore(factors);
    steps.push({
      controlId: control.id,
      title: control.title,
      score,
      factors: cloneFactors(factors),
      reduction: before - score.value,
    });
  }
  if (mode === 'planned' && selected.some((c) => c.status === 'planned'))
    warnings.push(
      'Doelbeeld is een prognose; geplande maatregelen tellen niet als gerealiseerde beheersing.',
    );
  const score = factorsScore(factors);
  return {
    mode,
    initial,
    score,
    factors,
    steps,
    creditedControlIds: selected.map((c) => c.id),
    excluded,
    warnings,
    band: riskBand(score.value),
    conservativeBand: riskBand(score.max),
  };
}

/** IMA local prioritization, distinct from Fine's historic cost-justification formula. */
export function prioritizeControl(scenario: Scenario, control: Control): ControlPriority {
  validateControl(control);
  const current = calculateKinney(scenario, 'current');
  const plannedControl: Control = { ...control, status: 'planned' };
  const next = calculateKinney(
    {
      ...scenario,
      controls: [...scenario.controls.filter((c) => c.id !== control.id), plannedControl],
    },
    'planned',
  );
  // Evaluate a candidate by itself against current controls, without unrelated plans.
  const alone = calculateKinney(
    {
      ...scenario,
      controls: [
        ...scenario.controls.filter((c) => c.id !== control.id && c.status !== 'planned'),
        plannedControl,
      ],
    },
    'planned',
  );
  const benefit = Math.max(0, current.score.value - alone.score.value);
  const conservativeBenefit = Math.max(0, current.score.min - alone.score.max);
  const hierarchyWeight = PRIORITY_POLICY.hierarchyWeights[control.ahs];
  const feasibilityMultiplier = PRIORITY_POLICY.feasibilityMultipliers[control.feasibility];
  const score = (benefit / control.effort) * hierarchyWeight * feasibilityMultiplier;
  finite(score, 'Prioriteit');
  return {
    controlId: control.id,
    title: control.title,
    mandatory: control.legalRequired,
    benefit,
    conservativeBenefit,
    effort: control.effort,
    hierarchyWeight,
    feasibilityMultiplier,
    score,
    rationale: `Scoreverschil ${benefit.toFixed(1)} / inspanning ${control.effort} × AHS ${hierarchyWeight} × haalbaarheid ${feasibilityMultiplier}. ${next.creditedControlIds.includes(control.id) ? '' : 'Geen afzonderlijke credit in het totale doelbeeld. '}${control.legalRequired ? 'Wettelijke verplichting gaat vóór de rangschikking.' : 'Lokale prioritering; geen acceptatiebesluit.'}`,
  };
}

/** Historic Fine J: caller supplies the original cost and correction rating factors. */
export function fineJustification(
  riskScore: number,
  costFactor: number,
  degreeOfCorrectionFactor: number,
): number {
  finite(riskScore, 'Risicoscore');
  if (riskScore < 0) throw new RangeError('Risicoscore mag niet negatief zijn.');
  positive(costFactor, 'Kostenfactor');
  positive(degreeOfCorrectionFactor, 'Correctiefactor');
  const denominator = costFactor * degreeOfCorrectionFactor;
  finite(denominator, 'Kostenfactor × correctiefactor');
  const value = riskScore / denominator;
  finite(value, 'Fine-justificatie');
  return value;
}
/** Kinney/Wiruth justification: dimensionless effectiveness, explicit cost divisor. */
export function kinneyJustification(
  riskScore: number,
  effectiveness: number,
  costDivisor: number,
): number {
  finite(riskScore, 'Risicoscore');
  probability(range(effectiveness), 'Effectiviteit');
  positive(costDivisor, 'Kostendeler');
  if (riskScore < 0) throw new RangeError('Risicoscore mag niet negatief zijn.');
  const value = (riskScore * effectiveness) / costDivisor;
  finite(value, 'Kinney-justificatie');
  return value;
}

export const calculateFineJustification = fineJustification;
export const calculateKinneyJustification = kinneyJustification;

/** LOPA: scenario endpoint frequency in events/year, separate from Kinney scoring. */
export function calculateLopa(scenario: LopaScenario): LopaResult {
  validateEstimate(scenario.initiatingFrequency, 'Initiële frequentie', { min: 0 });
  positive(scenario.initiatingFrequency.value, 'Initiële frequentie');
  positive(scenario.targetFrequency, 'Frequentiecriterium');
  if (
    !scenario.initiatingEvent?.trim() ||
    !scenario.consequence?.trim() ||
    !scenario.frequencyEvidence?.trim()
  )
    throw new RangeError(
      'LOPA vereist oorzaak, gevolg en onderbouwing van de initiële frequentie.',
    );
  checkIds([...scenario.layers, ...scenario.modifiers], 'LOPA-lagen en modifiers');
  const excluded: Exclusion[] = [];
  const warnings: string[] = [];
  const creditedLayerIds: string[] = [];
  const creditedModifierIds: string[] = [];
  const steps: LopaResult['steps'] = [];
  const exclude = (item: { id: string; title: string }, reason: string) =>
    excluded.push({ id: item.id, title: item.title, reason });
  // A dependency group shared across a layer/modifier invalidates independence credit.
  const dependencyCounts = new Map<string, number>();
  for (const item of [...scenario.layers, ...scenario.modifiers]) {
    if (item.evidence !== 'verified' || ('status' in item && item.status !== 'existing')) continue;
    const group = item.dependencyGroup?.trim();
    if (group) dependencyCounts.set(group, (dependencyCounts.get(group) ?? 0) + 1);
  }
  const hasConflict = (item: { dependencyGroup?: string }) => {
    const group = item.dependencyGroup?.trim();
    return Boolean(group && (dependencyCounts.get(group) ?? 0) > 1);
  };
  let unmitigatedFrequency = { ...scenario.initiatingFrequency };
  for (const modifier of scenario.modifiers) {
    probability(modifier.probability, `${modifier.title}: modifierkans`);
    if (modifier.probability.min <= 0)
      throw new RangeError(
        `${modifier.title}: nul als kansondergrens vereist afzonderlijke scenarioanalyse.`,
      );
    if (!['enabling', 'conditional'].includes(modifier.kind))
      throw new RangeError('Onbekende LOPA-modifier.');
    if (
      modifier.evidence !== 'verified' ||
      !modifier.evidenceNote?.trim() ||
      !modifier.rationale?.trim()
    ) {
      exclude(modifier, 'Modifier onbewezen; factor 1 toegepast.');
      continue;
    }
    if (modifier.independent !== true || hasConflict(modifier)) {
      exclude(modifier, 'Modifier niet onafhankelijk of dubbel geteld; factor 1 toegepast.');
      continue;
    }
    unmitigatedFrequency = product(unmitigatedFrequency, modifier.probability);
    creditedModifierIds.push(modifier.id);
  }
  let frequency = { ...unmitigatedFrequency };
  let combinedPfd = range(1);
  for (const layer of scenario.layers) {
    probability(layer.pfd, `${layer.title}: PFD`);
    if (layer.pfd.min <= 0)
      throw new RangeError(`${layer.title}: PFD moet groter dan nul zijn; geen perfecte IPL.`);
    if (layer.status !== 'existing') {
      exclude(layer, 'Geplande of buiten gebruik zijnde laag; geen gerealiseerde IPL-credit.');
      continue;
    }
    if (
      layer.evidence !== 'verified' ||
      !layer.evidenceNote?.trim() ||
      !layer.independenceNote?.trim()
    ) {
      exclude(layer, 'Werking of onafhankelijkheid niet aantoonbaar.');
      continue;
    }
    if (
      layer.specific !== true ||
      layer.independent !== true ||
      layer.independentOfInitiator !== true ||
      layer.auditable !== true ||
      layer.effective !== true
    ) {
      exclude(
        layer,
        'IPL voldoet niet aan specificiteit, onafhankelijkheid, toetsbaarheid of effectiviteit.',
      );
      continue;
    }
    if (hasConflict(layer)) {
      exclude(
        layer,
        'Gemeenschappelijke afhankelijkheid; geen vermenigvuldiging zonder gezamenlijk faalmodel.',
      );
      continue;
    }
    frequency = product(frequency, layer.pfd);
    combinedPfd = product(combinedPfd, layer.pfd);
    creditedLayerIds.push(layer.id);
    steps.push({ layerId: layer.id, title: layer.title, frequency: { ...frequency } });
  }
  for (const [group, count] of dependencyCounts)
    if (count > 1)
      warnings.push(
        `Afhankelijkheid ${group}: gekoppelde lagen/modifiers uitgesloten; een gezamenlijk faalmodel is vereist.`,
      );
  if (excluded.length > 0)
    warnings.push('Uitgesloten lagen en modifiers leveren geen frequentiereductie.');
  warnings.push(
    'LOPA-uitkomst geldt uitsluitend voor deze oorzaak-gevolgcombinatie en het opgegeven frequentiecriterium.',
  );
  const riskReductionFactor = range(
    1 / combinedPfd.value,
    1 / combinedPfd.max,
    1 / combinedPfd.min,
  );
  const comparison =
    frequency.max <= scenario.targetFrequency
      ? 'below'
      : frequency.min > scenario.targetFrequency
        ? 'above'
        : 'uncertain';
  return {
    initiatingFrequency: { ...scenario.initiatingFrequency },
    unmitigatedFrequency,
    frequency,
    riskReductionFactor,
    creditedLayerIds,
    creditedModifierIds,
    excluded,
    warnings,
    steps,
    targetFrequency: scenario.targetFrequency,
    comparison,
  };
}

export const evaluateLopa = calculateLopa;

export function evaluateRisk(scenario: Scenario): RiskEvaluation {
  const current = calculateKinney(scenario, 'current');
  const target = calculateKinney(scenario, 'planned');
  const priorities = scenario.controls
    .filter((c) => c.status === 'planned')
    .map((c) => prioritizeControl(scenario, c));
  priorities.sort(
    (a, b) =>
      Number(b.mandatory) - Number(a.mandatory) ||
      b.score - a.score ||
      a.controlId.localeCompare(b.controlId),
  );
  return {
    initial: current.initial,
    current,
    target,
    priorities,
    ...(scenario.lopa ? { lopa: calculateLopa(scenario.lopa) } : {}),
  };
}
