/** Interval assumptions. These are bounds, not confidence intervals. */
export interface Estimate {
  min: number;
  value: number;
  max: number;
}

/** Ephemeral effectiveness rubric; values are conditional local score assumptions. */
export interface EfficacyFactors {
  intrinsic: Estimate;
  coverage: Estimate;
  availability: Estimate;
  correctUse: Estimate;
  /** Documents conditional denominators and checks for overlap/double counting. */
  conditionalBasis: string;
}

export type AhsLevel = 'source' | 'collective' | 'individual' | 'ppe';
export type ControlStatus = 'existing' | 'planned' | 'retired';
export type EvidenceStatus = 'verified' | 'unverified' | 'unknown';
export type Feasibility = 'easy' | 'moderate' | 'hard';
export type AssessmentMode = 'current' | 'planned';

/** Reductions concern Kinney score factors, never measured failure probabilities. */
export interface Control {
  id: string;
  title: string;
  ahs: AhsLevel;
  status: ControlStatus;
  evidence: EvidenceStatus;
  evidenceNote: string;
  rationale: string;
  probabilityReduction: Estimate;
  exposureReduction: Estimate;
  effectReduction: Estimate;
  /** False means dependence has not been resolved. Such controls cannot be stacked. */
  independent: boolean;
  dependencyGroup?: string;
  feasibility: Feasibility;
  /** Relative effort on an explicit local scale; strictly positive. */
  effort: number;
  legalRequired: boolean;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  department: string;
  hazard: string;
  consequence: string;
  probability: number;
  exposure: number;
  effect: number;
  controls: Control[];
  lopa?: LopaScenario;
  sourceIds?: string[];
  assessmentNotes?: string;
}

export interface LopaLayer {
  id: string;
  title: string;
  status: ControlStatus;
  evidence: EvidenceStatus;
  evidenceNote: string;
  /** Probability of failure on demand: > 0 and <= 1. */
  pfd: Estimate;
  specific: boolean;
  independent: boolean;
  independentOfInitiator: boolean;
  auditable: boolean;
  effective: boolean;
  independenceNote: string;
  dependencyGroup?: string;
}

export interface LopaModifier {
  id: string;
  title: string;
  kind: 'enabling' | 'conditional';
  probability: Estimate;
  evidence: EvidenceStatus;
  evidenceNote: string;
  /** Avoids counting occupancy, ignition, etc. twice or as both modifier and IPL. */
  independent: boolean;
  rationale: string;
  dependencyGroup?: string;
}

/** Exactly one initiating event and one specified consequence endpoint. */
export interface LopaScenario {
  initiatingEvent: string;
  initiatingFrequency: Estimate;
  frequencyEvidence: string;
  consequence: string;
  layers: LopaLayer[];
  modifiers: LopaModifier[];
  /** Locally adopted criterion in events/year; no universal acceptance limit. */
  targetFrequency: number;
  assumptions: string;
}

export interface RiskBand {
  id: 'low' | 'attention' | 'significant' | 'high' | 'critical';
  label: string;
  color: string;
  action: string;
}
export interface FactorEstimates {
  probability: Estimate;
  exposure: Estimate;
  effect: Estimate;
}
export interface Exclusion {
  id: string;
  title: string;
  reason: string;
}
export interface RiskStep {
  controlId: string;
  title: string;
  score: Estimate;
  factors: FactorEstimates;
  /** Nominal score difference, not a predicted percentage reduction in injuries. */
  reduction: number;
}
export interface KinneyResult {
  mode: AssessmentMode;
  initial: number;
  score: Estimate;
  factors: FactorEstimates;
  steps: RiskStep[];
  creditedControlIds: string[];
  excluded: Exclusion[];
  warnings: string[];
  band: RiskBand;
  /** Band at the conservative (highest score) bound. */
  conservativeBand: RiskBand;
}
export interface ControlPriority {
  controlId: string;
  title: string;
  mandatory: boolean;
  benefit: number;
  conservativeBenefit: number;
  effort: number;
  hierarchyWeight: number;
  feasibilityMultiplier: number;
  score: number;
  rationale: string;
}
export interface LopaStep {
  layerId: string;
  title: string;
  frequency: Estimate;
}
export interface LopaResult {
  initiatingFrequency: Estimate;
  unmitigatedFrequency: Estimate;
  frequency: Estimate;
  riskReductionFactor: Estimate;
  creditedLayerIds: string[];
  creditedModifierIds: string[];
  excluded: Exclusion[];
  warnings: string[];
  steps: LopaStep[];
  targetFrequency: number;
  comparison: 'below' | 'above' | 'uncertain';
}
export interface RiskEvaluation {
  initial: number;
  current: KinneyResult;
  target: KinneyResult;
  priorities: ControlPriority[];
  lopa?: LopaResult;
}
