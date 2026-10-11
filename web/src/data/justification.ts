import { sha256 } from '@noble/hashes/sha2.js';
import {
  calculateFineJustification,
  calculateKinney,
  calculateKinneyJustification,
  PRIORITY_POLICY,
  prioritizeControl,
  validateEstimate,
} from '../domain/risk';
import type { ControlPriority, Estimate, Exclusion } from '../domain/types';
import { assertRiskAssessment, isSupportedRiskMethod, type RiskAssessment } from './risk-history';
import {
  EVIDENCE_RISK_METHOD_VERSION,
  applyRiskEvidenceIssues,
  resolveFrozenRiskEvidence,
} from './risk-evidence';

export const JUSTIFICATION_METHOD_VERSION = 'ima-justification/1.0.0';
export const JUSTIFICATION_DECISIONS = {
  implement: 'Uitvoeren',
  defer: 'Uitstellen',
  reject: 'Niet uitvoeren',
  review_required: 'Nader onderzoeken',
} as const;

export interface JustificationDraft {
  selectionKind: 'control' | 'portfolio';
  controlIds: string[];
  /** Local calibration: currency, cost scope, period and chosen ordinal ratings. */
  costBasis: string;
  costFactor: number;
  degreeOfCorrectionFactor: number;
  kinneyCostDivisor: number;
  decision: keyof typeof JUSTIFICATION_DECISIONS;
  assessor: string;
  rationale: string;
}
export interface JustificationResult {
  /** Calculated means reproducible model comparison, never verified field effectiveness. */
  status: 'calculated' | 'unconfirmed';
  current: Estimate;
  selectedTarget: Estimate;
  /** Signed differences: negative bounds are retained and never reset to zero. */
  improvement: Estimate;
  /** Dimensionless nominal score difference, not an accident-probability reduction. */
  nominalScoreFraction?: number;
  fine: number;
  kinneyExpected?: number;
  /** Only exists if the whole conservative difference is nonnegative. */
  kinneyConservative?: number;
  currentCreditedControlIds: string[];
  selectedCreditedControlIds: string[];
  selectedExcluded: Exclusion[];
  warnings: string[];
  /** Each standalone local priority, separately from portfolio physical comparison. */
  localPriorities: ControlPriority[];
}
export interface JustificationRecord extends JustificationDraft {
  id: string;
  riskAssessmentId: string;
  assessmentSha256: string;
  scenarioId: string;
  recordedAt: string;
  methodVersion: string;
  priorityPolicyVersion: string;
  justificationMethodVersion: string;
  result: JustificationResult;
  sha256: string;
}

function canonical(value: unknown): string {
  function order(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(order);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, order(v)]),
      );
    return item;
  }
  return JSON.stringify(order(value));
}
export function justificationHash(
  record: Omit<JustificationRecord, 'sha256'> | JustificationRecord,
): string {
  const { sha256: _hash, ...artifact } = record as JustificationRecord;
  return Array.from(sha256(new TextEncoder().encode(canonical(artifact))))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
function positive(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new Error(`${label}: een eindige waarde groter dan nul is vereist.`);
}
function requiredText(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Leg ${label} vast.`);
}
function assertDraft(draft: JustificationDraft): void {
  if (!['control', 'portfolio'].includes(draft.selectionKind))
    throw new Error('Kies één maatregel of een expliciet maatregelenpakket.');
  if (
    !Array.isArray(draft.controlIds) ||
    !draft.controlIds.length ||
    draft.controlIds.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(draft.controlIds).size !== draft.controlIds.length ||
    (draft.selectionKind === 'control' && draft.controlIds.length !== 1)
  )
    throw new Error(
      'Kies unieke maatregel-ID’s; een enkelvoudige keuze bevat precies één maatregel.',
    );
  requiredText(draft.costBasis, 'de kostenbasis en kalibratie van de ratings');
  requiredText(draft.assessor, 'de beoordelaar');
  requiredText(draft.rationale, 'de onderbouwing van het besluit');
  if (!Object.hasOwn(JUSTIFICATION_DECISIONS, draft.decision))
    throw new Error('Kies een expliciet besluit.');
  positive(draft.costFactor, 'Fine-kostenfactor CF');
  positive(draft.degreeOfCorrectionFactor, 'Fine-correctierating DC');
  positive(draft.kinneyCostDivisor, 'Kinney-kostendeler');
}

/** Compare only selected plans with the frozen current situation. */
export function justificationResult(
  assessment: RiskAssessment,
  draft: JustificationDraft,
): JustificationResult {
  assertRiskAssessment(assessment);
  if (!isSupportedRiskMethod(assessment.methodVersion))
    throw new Error(
      'Onbekende risicomethode: deze beoordeling kan geen bevestigde justificatie leveren.',
    );
  assertDraft(draft);
  const selected = new Set(draft.controlIds);
  const frozen =
    assessment.methodVersion === EVIDENCE_RISK_METHOD_VERSION
      ? resolveFrozenRiskEvidence(assessment.input, assessment.evidenceBasis!)
      : { scenario: assessment.input, issues: [] };
  const scenario = frozen.scenario;
  for (const id of selected) {
    const control = scenario.controls.find((item) => item.id === id);
    if (!control || control.status !== 'planned')
      throw new Error(
        'Elke gekozen maatregel moet als gepland in deze bevroren beoordeling bestaan.',
      );
  }
  const current = calculateKinney(scenario, 'current');
  const target = calculateKinney(
    {
      ...scenario,
      controls: scenario.controls.filter(
        (control) => control.status !== 'planned' || selected.has(control.id),
      ),
    },
    'planned',
  );
  if (frozen.issues.length) {
    applyRiskEvidenceIssues(
      current,
      frozen.issues.filter((issue) => issue.kind === 'control'),
    );
    applyRiskEvidenceIssues(
      target,
      frozen.issues.filter(
        (issue) =>
          issue.kind === 'control' &&
          (selected.has(issue.targetId) ||
            scenario.controls.find((control) => control.id === issue.targetId)?.status !==
              'planned'),
      ),
    );
  }
  const improvement = {
    min: current.score.min - target.score.max,
    value: current.score.value - target.score.value,
    max: current.score.max - target.score.min,
  };
  validateEstimate(improvement, 'Getekend marginaal scoreverschil');
  const warnings = Array.from(new Set([...current.warnings, ...target.warnings]));
  const selectedExcluded = target.excluded.filter((item) => selected.has(item.id));
  const lostExistingCredit = current.creditedControlIds.some(
    (id) => !target.creditedControlIds.includes(id),
  );
  const reversal = improvement.value < 0;
  const hasZeroBaseline = current.score.value === 0;
  const status =
    selectedExcluded.length || lostExistingCredit || reversal || hasZeroBaseline
      ? 'unconfirmed'
      : 'calculated';
  if (lostExistingCredit)
    warnings.push(
      'De geselecteerde plannen veranderen het representatieve afhankelijkheidspad; bestaande credit verdwijnt. Dit verschil bevestigt geen extra maatregelwerking.',
    );
  if (reversal)
    warnings.push(
      'De nominale doelscore is hoger dan de huidige score. Het negatieve verschil blijft zichtbaar; er wordt geen reductiepercentage verzonnen.',
    );
  if (selectedExcluded.length)
    warnings.push(
      'Niet alle geselecteerde maatregelen krijgen afzonderlijke modelcredit; beoordeel het pakket en de uitsluitingen.',
    );
  if (hasZeroBaseline)
    warnings.push(
      'De huidige score is nul; een relatieve scoreverbetering kan niet worden gedeeld door deze uitgangswaarde.',
    );
  if (improvement.min < 0)
    warnings.push(
      'De afzonderlijk variërende gevoeligheidsgrenzen sluiten een ongunstiger score niet uit. De ondergrens is geen gegarandeerde opbrengst en geen statistisch betrouwbaarheidsinterval.',
    );
  const nominalScoreFraction =
    current.score.value > 0 ? improvement.value / current.score.value : undefined;
  const canCalculateKinney =
    status === 'calculated' &&
    nominalScoreFraction !== undefined &&
    nominalScoreFraction >= 0 &&
    nominalScoreFraction <= 1;
  const kinneyExpected = canCalculateKinney
    ? calculateKinneyJustification(
        current.score.value,
        nominalScoreFraction,
        draft.kinneyCostDivisor,
      )
    : undefined;
  // This conservative envelope uses separately varying bounds; no assumed paired correlation.
  const kinneyConservative =
    canCalculateKinney && improvement.min >= 0
      ? improvement.min / draft.kinneyCostDivisor
      : undefined;
  if (kinneyConservative !== undefined && !Number.isFinite(kinneyConservative))
    throw new Error('De conservatieve justificatie is numeriek niet weer te geven.');
  return {
    status,
    current: { ...current.score },
    selectedTarget: { ...target.score },
    improvement,
    ...(nominalScoreFraction !== undefined ? { nominalScoreFraction } : {}),
    fine: calculateFineJustification(
      current.score.value,
      draft.costFactor,
      draft.degreeOfCorrectionFactor,
    ),
    ...(kinneyExpected !== undefined ? { kinneyExpected } : {}),
    ...(kinneyConservative !== undefined ? { kinneyConservative } : {}),
    currentCreditedControlIds: [...current.creditedControlIds],
    selectedCreditedControlIds: [...target.creditedControlIds],
    selectedExcluded,
    warnings,
    localPriorities: scenario.controls
      .filter((control) => selected.has(control.id))
      .map((control) => prioritizeControl(scenario, control)),
  };
}

export function captureJustification(
  assessment: RiskAssessment,
  draft: JustificationDraft,
): JustificationRecord {
  const copy = structuredClone(draft);
  copy.costBasis = copy.costBasis.trim();
  copy.assessor = copy.assessor.trim();
  copy.rationale = copy.rationale.trim();
  const artifact: Omit<JustificationRecord, 'sha256'> = {
    ...copy,
    id: crypto.randomUUID(),
    riskAssessmentId: assessment.id,
    assessmentSha256: assessment.sha256,
    scenarioId: assessment.scenarioId,
    recordedAt: new Date().toISOString(),
    methodVersion: assessment.methodVersion,
    priorityPolicyVersion: PRIORITY_POLICY.version,
    justificationMethodVersion: JUSTIFICATION_METHOD_VERSION,
    result: justificationResult(assessment, copy),
  };
  const record = { ...artifact, sha256: justificationHash(artifact) };
  assertJustification(record, assessment);
  return record;
}

export function assertJustification(record: JustificationRecord, assessment: RiskAssessment): void {
  assertRiskAssessment(assessment);
  requiredText(record.id, 'een justificatie-ID');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(record.recordedAt) ||
    !Number.isFinite(Date.parse(record.recordedAt))
  )
    throw new Error('De justificatie vereist een geldige UTC-vastleggingstijd.');
  if (Date.parse(record.recordedAt) < Date.parse(assessment.recordedAt))
    throw new Error('De justificatie kan niet vóór haar bronbeoordeling zijn vastgelegd.');
  if (
    record.riskAssessmentId !== assessment.id ||
    record.assessmentSha256 !== assessment.sha256 ||
    record.scenarioId !== assessment.scenarioId ||
    record.methodVersion !== assessment.methodVersion
  )
    throw new Error('De justificatie verwijst niet naar precies deze bevroren risicobeoordeling.');
  if (
    record.justificationMethodVersion !== JUSTIFICATION_METHOD_VERSION ||
    record.priorityPolicyVersion !== PRIORITY_POLICY.version ||
    !isSupportedRiskMethod(record.methodVersion)
  )
    throw new Error(
      'Onbekende justificatie-, beleids- of risicomethode: geen bevestigde herberekening mogelijk.',
    );
  assertDraft(record);
  if (!/^[a-f0-9]{64}$/.test(record.sha256) || record.sha256 !== justificationHash(record))
    throw new Error('De justificatie wijkt af van haar bronhash.');
  if (canonical(record.result) !== canonical(justificationResult(assessment, record)))
    throw new Error(
      'De justificatie-uitkomst past niet bij de geselecteerde maatregelen, ratings en bevroren invoer.',
    );
}

export function justificationMarkdown(records: JustificationRecord[]): string[] {
  if (!records.length) return [];
  return [
    '',
    '## Vastgelegde maatregeljustificaties',
    '',
    ...records.flatMap((record) => [
      `### ${JUSTIFICATION_DECISIONS[record.decision]} [${record.id}]`,
      `Scenario ${record.scenarioId} | beoordelingsmoment ${record.riskAssessmentId} | beoordelings-SHA256 ${record.assessmentSha256}`,
      `${record.recordedAt} | beoordelaar ${record.assessor} | selectie ${record.selectionKind}: ${record.controlIds.join(', ')}`,
      `Kostenbasis / ratingkalibratie: ${record.costBasis}`,
      `Ratings: Fine CF=${record.costFactor}, DC=${record.degreeOfCorrectionFactor}; Kinney-kostendeler=${record.kinneyCostDivisor}`,
      `Onderbouwing / besluit: ${record.rationale}`,
      `Methode ${record.methodVersion} | justificatie ${record.justificationMethodVersion} | lokale prioriteit ${record.priorityPolicyVersion}`,
      `Huidige score ${record.result.current.value} [${record.result.current.min}, ${record.result.current.max}] | uitsluitend gekozen plannen ${record.result.selectedTarget.value} [${record.result.selectedTarget.min}, ${record.result.selectedTarget.max}]`,
      `Getekende scoreverbetering ${record.result.improvement.value} [${record.result.improvement.min}, ${record.result.improvement.max}] | berekeningsstatus ${record.result.status}`,
      `Fine-ratingformule J=${record.result.fine}; geen extra fysieke reductie door de gekozen rating.`,
      `Kinney J verwachting=${record.result.kinneyExpected ?? 'niet bevestigd'}; conservatieve ondergrens=${record.result.kinneyConservative ?? 'niet bevestigd'}`,
      ...record.result.localPriorities.map(
        (item) =>
          `Afzonderlijke lokale prioriteit ${item.title} [${item.controlId}]: ${item.score}; AHS ×${item.hierarchyWeight}, haalbaarheid ×${item.feasibilityMultiplier}, inspanning ${item.effort}; verplicht gemarkeerd ${item.mandatory ? 'ja' : 'nee'}.`,
      ),
      ...record.result.selectedExcluded.map(
        (item) => `Geen geselecteerde credit ${item.title} [${item.id}]: ${item.reason}`,
      ),
      ...record.result.warnings.map((warning) => `Let op: ${warning}`),
      `Justificatie-SHA256: ${record.sha256}`,
      '',
    ]),
  ];
}
