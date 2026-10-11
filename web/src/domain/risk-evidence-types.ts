import type { Evidence } from '../data/dossier';
import type { EvidenceFileCheck, EvidenceFileIntegrityContext } from '../data/evidence-file-types';
import type { Control, Estimate, LopaLayer, LopaModifier } from './types';

/** Content-addressed, actually used source state; no inferred historical revision. */
export interface EvidenceBinding {
  evidenceId: string;
  metadataSha256: string;
  versionSha256: string;
  snapshot: Evidence;
}

export interface RiskEvidenceReview {
  schema: 'ima.risk-evidence-review/v1';
  reviewedBy: string;
  reviewedAt: string;
  rationale: string;
  subjectBasisSha256: string;
  bindings: EvidenceBinding[];
}

export type RiskTargetKind = 'control' | 'lopa-layer' | 'lopa-modifier';
export type RiskTarget = Control | LopaLayer | LopaModifier;
export type RiskEvidenceContext = EvidenceFileIntegrityContext & { dossierId?: string };

/** Local applicability and endpoint context, separate from the reviewed target. */
export interface RiskSubjectContext {
  scenarioId: string;
  dossierId?: string;
  departmentId?: string;
  department: string;
  description: string;
  hazard: string;
  consequence: string;
  probability: number;
  exposure: number;
  effect: number;
  lopa?: {
    initiatingEvent: string;
    initiatingFrequency: Estimate;
    frequencyEvidence: string;
    consequence: string;
    targetFrequency: number;
    assumptions: string;
  };
}

/** A specific target version used by an action, never a title-based relationship. */
export interface RiskTargetReference {
  scenarioId: string;
  kind: RiskTargetKind;
  targetId: string;
  targetSha256: string;
  snapshot: {
    context: RiskSubjectContext;
    target: RiskTarget;
  };
}

/** Only selected source records are frozen, including explicit absence at assessment. */
export interface FrozenRiskEvidenceBasis {
  schema: 'ima.risk-evidence-basis/v1';
  currentRecords: Evidence[];
  missingIds: string[];
  /** Historical observations only. Never restore them as live session readiness. */
  fileChecks: {
    evidenceId: string;
    fileBindingSha256: string;
    check: EvidenceFileCheck;
  }[];
}
