import type { Scenario } from '../domain/types';

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
}

export type WorkspacePatch = Partial<
  Pick<
    WorkspaceState,
    'name' | 'scenarios' | 'questions' | 'answers' | 'actions' | 'incidents' | 'sources'
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
