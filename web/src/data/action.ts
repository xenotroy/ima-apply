import type { Evidence } from './dossier';
import type { WorkspaceAction } from './model';

export type ActionStage =
  | 'proposed'
  | 'planned'
  | 'in_progress'
  | 'implemented'
  | 'verification_due'
  | 'effective'
  | 'ineffective'
  | 'closed'
  | 'reopened'
  | 'cancelled';
export type ActionDisplayStage = ActionStage | 'legacy_done';

/** The current cycle. A reopening starts a new cycle; past cycles remain in history. */
export interface ActionCycle {
  stage: ActionStage;
  effectiveness: 'pending' | 'effective' | 'ineffective';
  implementedAt?: string;
  verificationDueAt?: string;
  verifier?: string;
  evaluatedAt?: string;
  evidenceSnapshots: Evidence[];
}
export type ActionSnapshot = Omit<WorkspaceAction, 'lifecycle'> & { lifecycle?: ActionCycle };
export interface ActionHistoryEntry {
  revision: number;
  kind: 'edit' | 'transition';
  actor: string;
  at: string;
  reason: string;
  before: ActionSnapshot;
  after: ActionSnapshot;
  previousSha256: string;
  sha256: string;
}
export interface ActionLifecycle extends ActionCycle {
  revision: number;
  history: ActionHistoryEntry[];
}
