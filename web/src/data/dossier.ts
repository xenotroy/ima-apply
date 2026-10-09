import type { Question } from '../content/catalog';
import type { WorkspaceRecord } from './model';
import type { BasisRiskFactorSnapshot } from './brf';

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
  /** Exactly one parent: a known site, or a known organisation when location is unknown. */
  siteId?: string;
  organisationId?: string;
  name: string;
  activity: string;
}

/** Direct organisation membership does not imply an invented site or address. */
export function departmentOrganisationId(
  department: Department | undefined,
  sites: readonly Site[],
): string | undefined {
  if (!department) return undefined;
  return (
    department.organisationId ?? sites.find((site) => site.id === department.siteId)?.organisationId
  );
}

export function departmentLabel(
  department: Department,
  sites: readonly Site[],
  organisations: readonly Organisation[],
): string {
  const organisationId = departmentOrganisationId(department, sites);
  const organisation = organisations.find((record) => record.id === organisationId);
  const site = sites.find((record) => record.id === department.siteId);
  return [department.name, organisation?.name, site?.name ?? 'Locatie niet vastgelegd']
    .filter(Boolean)
    .join(' · ');
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
  projectContextId?: string;
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
  walkthroughId?: string;
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
  /** Explicit local definition-version links; old free codes remain in basisRiskFactors. */
  basisRiskFactorIds?: string[];
  basisRiskFactorSnapshots?: BasisRiskFactorSnapshot[];
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
