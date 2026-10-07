import type { Question } from '../content/catalog';
import type { WorkspaceRecord } from './model';

export interface Organisation {
  id: string;
  name: string;
  description: string;
}
export interface Site {
  id: string;
  organisationId: string;
  name: string;
  address: string;
}
export interface Department {
  id: string;
  siteId: string;
  name: string;
  activity: string;
}
/** Hash covers the complete frozen question, excluding these two added fields. */
export interface FrozenQuestion extends Question {
  version: string;
  sha256: string;
}
export interface Dossier {
  id: string;
  title: string;
  organisationId?: string;
  departmentIds: string[];
  scope: string;
  assessor: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  createdAt: string;
  questions: FrozenQuestion[];
  sourceSnapshots?: WorkspaceRecord[];
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}
export interface Evidence {
  id: string;
  title: string;
  dossierId?: string;
  kind: 'document' | 'photograph' | 'interview' | 'measurement' | 'record' | 'other';
  reference: string;
  description: string;
  recordedAt: string;
  status: 'unverified' | 'verified';
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNote?: string;
  verifiedContentSha256?: string;
}
export interface Observation {
  id: string;
  title: string;
  dossierId: string;
  departmentId?: string;
  date: string;
  observer: string;
  facts: string;
  evidenceIds: string[];
}
export interface Finding {
  id: string;
  title: string;
  dossierId: string;
  questionId?: string;
  scenarioId?: string;
  description: string;
  status: 'open' | 'action_required' | 'risk_accepted' | 'resolved' | 'closed';
  observationIds: string[];
  evidenceIds: string[];
  topicIds: string[];
  legalIds: string[];
  decisionBy: string;
  decisionNote: string;
}
export interface Topic {
  id: string;
  title: string;
  category: string;
  description: string;
  aliases: string[];
}
export interface LegalRecord {
  id: string;
  title: string;
  officialUrl: string;
  citation: string;
  jurisdiction: string;
  status: 'signal' | 'published' | 'effective' | 'superseded' | 'withdrawn';
  effectiveOn: string;
  lastVerifiedOn: string;
  summary: string;
  impact: string;
  topicIds: string[];
}
export interface Investigation {
  id: string;
  title: string;
  incidentId: string;
  method: 'five_whys' | 'bow_tie';
  methodVersion: string;
  status: 'draft' | 'reviewed';
  facts: string;
  /** Answers are hypotheses until corroborated by evidence. */
  whyChain: string[];
  topEvent: string;
  threats: string[];
  preventiveBarriers: string[];
  recoveryBarriers: string[];
  consequences: string[];
  basisRiskFactors: string[];
  evidenceIds: string[];
  actionIds: string[];
  conclusion: string;
  reviewedBy: string;
  reviewNote: string;
}
export interface Exposure {
  id: string;
  /** Whole calendar months only: numerators must use the same period. */
  period: string;
  hoursWorked: number;
  /** Empty means the entire workspace. A department uses its stable ID. */
  departmentId: string;
  source: string;
}
