import type { Scenario } from '../domain/types';
import type { RiskAssessment } from './risk-history';
import type { ActionLifecycle } from './action';
import type { ProjectContext, Walkthrough } from './project-context';
export * from './project-context';
import type { BasisRiskFactorRecord } from './brf';
export * from './action';
export * from './brf';
import type {
  Organisation,
  Site,
  Department,
  Dossier,
  Evidence,
  Observation,
  Finding,
  Topic,
  LegalRecord,
  Investigation,
  Exposure,
} from './dossier';
export * from './dossier';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export interface WorkspaceRecord {
  id: string;
  [key: string]: JsonValue;
}

export interface WorkspaceAnswer {
  id: string;
  questionId: string;
  choice: 'yes' | 'partial' | 'no' | 'unknown' | 'na';
  evidence: string;
  note: string;
  answeredAt: string;
  questionSnapshot?: string;
  sourceIds?: string[];
  contentVersion?: string;
  dossierId?: string;
  questionSha256?: string;
  evidenceIds?: string[];
}

export interface WorkspaceAction {
  id: string;
  title: string;
  scenarioId?: string;
  owner: string;
  dueDate: string;
  status: 'open' | 'in_progress' | 'done';
  notes: string;
  effectCheck?: string;
  verifiedAt?: string;
  dossierId?: string;
  findingId?: string;
  evidenceIds?: string[];
  /** Absent in early v1 exports; do not infer effectiveness or historical events. */
  lifecycle?: ActionLifecycle;
}

export interface WorkspaceIncident {
  id: string;
  title: string;
  date: string;
  department: string;
  type: 'incident' | 'near_miss' | 'observation';
  description: string;
  scenarioId?: string;
  actionIds: string[];
  departmentId?: string;
  actualSeverity?:
    | 'none'
    | 'first_aid'
    | 'medical_treatment'
    | 'lost_time'
    | 'major'
    | 'permanent_injury'
    | 'fatality';
  potentialSeverity?:
    | 'none'
    | 'first_aid'
    | 'medical_treatment'
    | 'lost_time'
    | 'major'
    | 'permanent_injury'
    | 'fatality';
  recordable?: boolean;
  lostTime?: boolean;
  lostTimeDays?: number;
  reportedBy?: string;
  activity?: string;
  immediateControls?: string;
  openQuestions?: string;
}

export interface WorkspaceState {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deviceId: string;
  scenarios: Scenario[];
  questions: WorkspaceRecord[];
  answers: WorkspaceAnswer[];
  actions: WorkspaceAction[];
  incidents: WorkspaceIncident[];
  sources: WorkspaceRecord[];
  // Additive v1 collections. Missing collections in early exports mean empty.
  organisations?: Organisation[];
  sites?: Site[];
  departments?: Department[];
  dossiers?: Dossier[];
  evidence?: Evidence[];
  observations?: Observation[];
  findings?: Finding[];
  topics?: Topic[];
  legalRecords?: LegalRecord[];
  investigations?: Investigation[];
  exposure?: Exposure[];
  contentRecords?: WorkspaceRecord[];
  projectContexts?: ProjectContext[];
  walkthroughs?: Walkthrough[];
  basisRiskFactorRecords?: BasisRiskFactorRecord[];
  riskAssessments?: RiskAssessment[];
}

export type WorkspacePatch = Partial<
  Pick<
    WorkspaceState,
    | 'name'
    | 'scenarios'
    | 'questions'
    | 'answers'
    | 'actions'
    | 'incidents'
    | 'sources'
    | 'organisations'
    | 'sites'
    | 'departments'
    | 'dossiers'
    | 'evidence'
    | 'observations'
    | 'findings'
    | 'topics'
    | 'legalRecords'
    | 'investigations'
    | 'exposure'
    | 'contentRecords'
    | 'projectContexts'
    | 'walkthroughs'
    | 'basisRiskFactorRecords'
    | 'riskAssessments'
  >
>;

export function newId(): string {
  return crypto.randomUUID();
}

// This identifies the current browser session, without persisting any credentials.
let sessionDeviceId: string | undefined;
export function getDeviceId(): string {
  sessionDeviceId ??= newId();
  return sessionDeviceId;
}

export function createWorkspace(name: string, initial: WorkspacePatch = {}): WorkspaceState {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    deviceId: getDeviceId(),
    scenarios: [],
    questions: [],
    answers: [],
    actions: [],
    incidents: [],
    sources: [],
    organisations: [],
    sites: [],
    departments: [],
    dossiers: [],
    evidence: [],
    observations: [],
    findings: [],
    topics: [],
    legalRecords: [],
    investigations: [],
    exposure: [],
    contentRecords: [],
    riskAssessments: [],
    projectContexts: [],
    walkthroughs: [],
    basisRiskFactorRecords: [],
    ...initial,
  };
}

export function reviseWorkspace(workspace: WorkspaceState, patch: WorkspacePatch): WorkspaceState {
  return {
    ...workspace,
    ...patch,
    updatedAt: new Date().toISOString(),
    revision: workspace.revision + 1,
    deviceId: getDeviceId(),
  };
}
