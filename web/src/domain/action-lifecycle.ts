import { sha256 } from '@noble/hashes/sha2.js';
import type { WorkspaceAction } from '../data/model';
import type { Evidence } from '../data/dossier';
import type {
  ActionCycle,
  ActionDisplayStage,
  ActionHistoryEntry,
  ActionLifecycle,
  ActionSnapshot,
  ActionStage,
} from '../data/action';
import { evidenceHash } from '../data/frozen';

export const MAX_ACTION_REVISIONS = 250;
export const actionStageLabels: Record<ActionDisplayStage, string> = {
  proposed: 'Voorgesteld',
  planned: 'Gepland',
  in_progress: 'In uitvoering',
  implemented: 'Uitgevoerd',
  verification_due: 'Controle gepland',
  effective: 'Effectief beoordeeld',
  ineffective: 'Onvoldoende effectief',
  closed: 'Afgesloten',
  reopened: 'Heropend',
  cancelled: 'Geannuleerd',
  legacy_done: 'Oud afgerond · effect niet opnieuw vastgesteld',
};
const transitions: Record<ActionDisplayStage, readonly ActionStage[]> = {
  proposed: ['planned', 'cancelled'],
  planned: ['in_progress', 'cancelled'],
  in_progress: ['implemented', 'cancelled'],
  implemented: ['verification_due', 'cancelled'],
  verification_due: ['effective', 'ineffective'],
  effective: ['closed', 'reopened'],
  ineffective: ['reopened'],
  closed: ['reopened'],
  cancelled: ['reopened'],
  reopened: ['planned', 'in_progress', 'cancelled'],
  legacy_done: ['reopened'],
};
export function actionStage(
  action: Pick<WorkspaceAction, 'status' | 'lifecycle'> | ActionSnapshot,
): ActionDisplayStage {
  return (
    action.lifecycle?.stage ??
    (action.status === 'done'
      ? 'legacy_done'
      : action.status === 'open'
        ? 'planned'
        : 'in_progress')
  );
}
export function nextActionStages(action: WorkspaceAction): readonly ActionStage[] {
  return transitions[actionStage(action)];
}
export function actionRevision(action: WorkspaceAction): number {
  return action.lifecycle?.revision ?? 0;
}
/** Explicit initial planning state, without inventing a preceding event or actor. */
export function initialActionLifecycle(stage: 'proposed' | 'planned' = 'planned'): ActionLifecycle {
  return { stage, effectiveness: 'pending', evidenceSnapshots: [], revision: 0, history: [] };
}
export function compatibilityStatus(stage: ActionStage): WorkspaceAction['status'] {
  return ['effective', 'closed', 'cancelled'].includes(stage)
    ? 'done'
    : ['proposed', 'planned', 'reopened'].includes(stage)
      ? 'open'
      : 'in_progress';
}
function digest(value: string): string {
  return Array.from(sha256(new TextEncoder().encode(value)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function canonical(value: unknown): string {
  // Object keys sorted recursively; array order remains meaningful. Undefined optional fields are omitted.
  function ordered(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(ordered);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, ordered(v)]),
      );
    return item;
  }
  return JSON.stringify(ordered(value));
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function cycle(action: WorkspaceAction | ActionSnapshot): ActionCycle | undefined {
  if (!action.lifecycle) return undefined;
  const {
    stage,
    effectiveness,
    implementedAt,
    verificationDueAt,
    verifier,
    evaluatedAt,
    evidenceSnapshots,
  } = action.lifecycle;
  return clone({
    stage,
    effectiveness,
    implementedAt,
    verificationDueAt,
    verifier,
    evaluatedAt,
    evidenceSnapshots,
  });
}
export function actionSnapshot(action: WorkspaceAction | ActionSnapshot): ActionSnapshot {
  const { lifecycle: _lifecycle, ...fields } = action;
  return clone({ ...fields, ...(action.lifecycle ? { lifecycle: cycle(action) } : {}) });
}
export function actionSnapshotHash(snapshot: ActionSnapshot): string {
  return digest(canonical(snapshot));
}
export function actionEventHash(
  event: Omit<ActionHistoryEntry, 'sha256'> | ActionHistoryEntry,
): string {
  const { sha256: _sha, ...artifact } = event as ActionHistoryEntry;
  return digest(canonical(artifact));
}
function required(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is verplicht.`);
  return value.trim();
}
function instant(value: string, label: string): number {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error(`${label}: een geldig tijdstip met tijdzone is verplicht.`);
  const day = value.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day)
    throw new Error(`${label}: ongeldige kalenderdatum.`);
  return Date.parse(value);
}
function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
function assertCycle(snapshot: ActionSnapshot): void {
  const state = snapshot.lifecycle;
  if (!state) return;
  if (compatibilityStatus(state.stage) !== snapshot.status)
    throw new Error('Actiestatus past niet bij de lifecyclefase.');
  const implementation = [
    'implemented',
    'verification_due',
    'effective',
    'ineffective',
    'closed',
  ].includes(state.stage);
  const assessment = ['effective', 'ineffective', 'closed'].includes(state.stage);
  if (implementation && !state.implementedAt)
    throw new Error('Uitvoering vereist een implementatietijdstip.');
  if (['verification_due', 'effective', 'ineffective', 'closed'].includes(state.stage)) {
    required(snapshot.notes, 'Controleplan');
    if (!state.verificationDueAt) throw new Error('Controle vereist een geplande controledatum.');
  }
  if (!['proposed', 'reopened', 'cancelled'].includes(state.stage))
    required(snapshot.owner, 'Eigenaar');
  if (state.implementedAt) instant(state.implementedAt, 'Implementatie');
  if (state.verificationDueAt) {
    instant(state.verificationDueAt, 'Controleplan');
    if (
      !state.implementedAt ||
      Date.parse(state.verificationDueAt) < Date.parse(state.implementedAt)
    )
      throw new Error('De geplande controle ligt vóór de implementatie.');
  }
  const expected =
    state.stage === 'effective' || state.stage === 'closed'
      ? 'effective'
      : state.stage === 'ineffective'
        ? 'ineffective'
        : 'pending';
  if (state.effectiveness !== expected)
    throw new Error('Effectbeoordeling past niet bij de lifecyclefase.');
  if (assessment) {
    required(state.verifier, 'Verificateur');
    required(snapshot.effectCheck, 'Resultaat van de effectcontrole');
    if (!state.evaluatedAt || snapshot.verifiedAt !== state.evaluatedAt)
      throw new Error('Effectcontrole vereist een overeenkomend beoordelingstijdstip.');
    if (instant(state.evaluatedAt, 'Effectcontrole') < Date.parse(state.implementedAt!))
      throw new Error('Effectcontrole ligt vóór de implementatie.');
    if (!state.evidenceSnapshots.length)
      throw new Error('Effectcontrole vereist traceerbaar geverifieerd bewijs.');
    const ids = state.evidenceSnapshots.map((item) => item.id);
    if (
      new Set(ids).size !== ids.length ||
      !same(ids.slice().sort(), (snapshot.evidenceIds ?? []).slice().sort())
    )
      throw new Error('Bewijssnapshot past niet bij de bewijskoppelingen.');
    for (const evidence of state.evidenceSnapshots) {
      if (
        evidence.dossierId !== snapshot.dossierId ||
        evidence.status !== 'verified' ||
        evidence.verifiedContentSha256 !== evidenceHash(evidence)
      )
        throw new Error('Effectcontrole bevat onbevestigd, gewijzigd of dossiervreemd bewijs.');
      if (
        !evidence.verifiedAt ||
        instant(evidence.verifiedAt, 'Bewijsverificatie') > Date.parse(state.evaluatedAt)
      )
        throw new Error('Bewijsverificatie ligt ná de effectcontrole.');
    }
  } else if (
    state.verifier !== undefined ||
    state.evaluatedAt !== undefined ||
    state.evidenceSnapshots.length ||
    snapshot.verifiedAt !== undefined ||
    snapshot.effectCheck !== undefined
  ) {
    throw new Error('Een onbeoordeelde cyclus mag geen actieve effectverificatie bewaren.');
  }
  if (state.stage === 'reopened' && (state.implementedAt || state.verificationDueAt))
    throw new Error('Heropening moet uitvoering en controleplan van de oude cyclus resetten.');
}

export interface ActionChange {
  expectedRevision: number;
  actor: string;
  reason: string;
  targetStage?: ActionStage;
  patch?: Partial<Pick<WorkspaceAction, 'title' | 'owner' | 'dueDate' | 'notes' | 'evidenceIds'>>;
  verificationDueAt?: string;
  verifier?: string;
  evaluation?: string;
}
/** Caller must also check expectedRevision against the latest workspace before persisting. */
export function reviseAction(
  current: WorkspaceAction,
  change: ActionChange,
  evidence: Evidence[] = [],
  at = new Date().toISOString(),
): WorkspaceAction {
  assertActionHistory(current);
  if (actionRevision(current) !== change.expectedRevision)
    throw new Error(
      'De actie is intussen gewijzigd. Open de actuele actie voordat je deze revisie bewaart.',
    );
  if (actionRevision(current) >= MAX_ACTION_REVISIONS)
    throw new Error(
      'Deze actie heeft 250 revisies. Bewaar een volledige export en begin bewust een nieuwe vervolgactie; historie wordt niet afgekapt.',
    );
  const actor = required(change.actor, 'Actor');
  const reason = required(change.reason, 'Redenering');
  const time = instant(at, 'Actierevisie');
  const history = current.lifecycle?.history ?? [];
  if (history.length && time < Date.parse(history[history.length - 1].at))
    throw new Error('Het revisietijdstip ligt vóór de vorige wijziging.');
  const from = actionStage(current);
  const target = change.targetStage;
  if (target !== undefined && !transitions[from].includes(target))
    throw new Error('Deze statusovergang is niet toegestaan.');
  if (!target && !current.lifecycle && from === 'legacy_done')
    throw new Error(
      'Heropen deze oude afgeronde actie voordat je haar inhoud wijzigt; de oude controle is niet opnieuw vastgesteld.',
    );
  const next: ActionSnapshot = actionSnapshot({ ...current, ...clone(change.patch ?? {}) });
  if (
    ['effective', 'ineffective', 'closed'].includes(from) &&
    target !== 'reopened' &&
    (next.title !== current.title ||
      next.notes !== current.notes ||
      !same(next.evidenceIds, current.evidenceIds))
  )
    throw new Error(
      'Heropen de actie voordat je de beoordeelde inhoud, het controleplan of de bewijskoppelingen wijzigt.',
    );
  if (!target && same(actionSnapshot(current), next))
    throw new Error('Er zijn geen wijzigingen om vast te leggen.');
  let state: ActionCycle = cycle(current) ?? {
    stage: from as ActionStage,
    effectiveness: 'pending',
    evidenceSnapshots: [],
  };
  if (!current.lifecycle && !target) {
    delete next.effectCheck;
    delete next.verifiedAt;
  }
  if (target) {
    state.stage = target;
    if (target === 'implemented') state.implementedAt = at;
    if (target === 'verification_due')
      state.verificationDueAt = required(change.verificationDueAt, 'Geplande controledatum');
    if (target === 'effective' || target === 'ineffective') {
      state.verifier = required(change.verifier, 'Verificateur');
      state.evaluatedAt = at;
      state.effectiveness = target;
      next.effectCheck = required(change.evaluation, 'Resultaat van de effectcontrole');
      next.verifiedAt = at;
      state.evidenceSnapshots = (next.evidenceIds ?? []).map((id) => {
        const found = evidence.find((item) => item.id === id);
        if (!found) throw new Error('Het gekozen bewijs bestaat niet meer.');
        return clone(found);
      });
    } else if (
      target === 'reopened' ||
      target === 'cancelled' ||
      !['effective', 'closed'].includes(target)
    ) {
      state.effectiveness = 'pending';
      state.evidenceSnapshots = [];
      delete state.verifier;
      delete state.evaluatedAt;
      delete next.effectCheck;
      delete next.verifiedAt;
      if (target === 'reopened') {
        delete state.implementedAt;
        delete state.verificationDueAt;
      }
    }
    next.status = compatibilityStatus(target);
  }
  next.lifecycle = state;
  assertCycle(next);
  const before = actionSnapshot(current);
  const event: ActionHistoryEntry = {
    revision: actionRevision(current) + 1,
    kind: target ? 'transition' : 'edit',
    actor,
    at,
    reason,
    before,
    after: clone(next),
    previousSha256: history.at(-1)?.sha256 ?? actionSnapshotHash(before),
    sha256: '',
  };
  event.sha256 = actionEventHash(event);
  const result: WorkspaceAction = {
    ...next,
    lifecycle: { ...state, revision: event.revision, history: [...history, event] },
  };
  assertActionHistory(result, evidence);
  return result;
}

/** Consistency/integrity of the contained export. This is not an externally signed audit trail. */
export function assertActionHistory(action: WorkspaceAction, currentEvidence?: Evidence[]): void {
  if (!action.lifecycle) return;
  const state = action.lifecycle;
  if (
    !Number.isInteger(state.revision) ||
    state.revision < 0 ||
    state.revision > MAX_ACTION_REVISIONS ||
    state.history.length !== state.revision
  )
    throw new Error('Actierevisies en historie komen niet overeen.');
  if (state.revision === 0) {
    assertCycle(actionSnapshot(action));
    if (
      !['proposed', 'planned'].includes(state.stage) ||
      state.implementedAt ||
      state.verificationDueAt
    )
      throw new Error(
        'Een registratie zonder revisies mag alleen een nieuwe voorstel-/planfase uitdrukken.',
      );
    return;
  }
  let previous: ActionHistoryEntry | undefined;
  for (const [index, event] of state.history.entries()) {
    required(event.actor, 'Historieactor');
    required(event.reason, 'Historieredenering');
    instant(event.at, 'Historietijdstip');
    assertCycle(event.before);
    assertCycle(event.after);
    if (event.revision !== index + 1 || event.sha256 !== actionEventHash(event))
      throw new Error('Actiehistorie bevat een gewijzigd of ontbrekend revisierecord.');
    if (event.before.id !== action.id || event.after.id !== action.id)
      throw new Error('Actiehistorie verwijst naar een andere actie.');
    if (
      !previous &&
      event.before.lifecycle &&
      (!['proposed', 'planned'].includes(event.before.lifecycle.stage) ||
        event.before.lifecycle.implementedAt ||
        event.before.lifecycle.verificationDueAt)
    )
      throw new Error(
        'De eerste revisie moet de aangetroffen v1-actie of een nieuwe voorstel-/planregistratie bewaren.',
      );
    if (
      event.previousSha256 !== (previous?.sha256 ?? actionSnapshotHash(event.before)) ||
      (previous && !same(previous.after, event.before))
    )
      throw new Error('De actiehistorieketen is verbroken.');
    if (previous && Date.parse(event.at) < Date.parse(previous.at))
      throw new Error('Actiehistorie heeft teruglopende tijdstippen.');
    const from = actionStage(event.before),
      to = actionStage(event.after);
    if (
      ['effective', 'ineffective', 'closed'].includes(from) &&
      to !== 'reopened' &&
      (event.before.title !== event.after.title ||
        event.before.notes !== event.after.notes ||
        !same(event.before.evidenceIds, event.after.evidenceIds))
    )
      throw new Error('Beoordeelde actie-inhoud is zonder heropening gewijzigd.');
    if (event.kind === 'transition') {
      if (!transitions[from].includes(to as ActionStage))
        throw new Error('Actiehistorie bevat een ongeldige statusovergang.');
      const beforeCycle = event.before.lifecycle;
      const afterCycle = event.after.lifecycle!;
      if (to === 'implemented' && afterCycle.implementedAt !== event.at)
        throw new Error('Implementatietijdstip past niet bij de statusstap.');
      if (['effective', 'ineffective'].includes(to) && afterCycle.evaluatedAt !== event.at)
        throw new Error('Beoordelingstijdstip past niet bij de statusstap.');
      if (
        !['implemented', 'reopened'].includes(to) &&
        afterCycle.implementedAt !== beforeCycle?.implementedAt
      )
        throw new Error('Implementatietijdstip is zonder nieuwe uitvoering gewijzigd.');
      if (
        !['verification_due', 'reopened'].includes(to) &&
        afterCycle.verificationDueAt !== beforeCycle?.verificationDueAt
      )
        throw new Error('Controleplan is buiten de planningsstap gewijzigd.');
      if (
        to === 'closed' &&
        (!same({ ...beforeCycle, stage: 'closed' }, afterCycle) ||
          event.before.effectCheck !== event.after.effectCheck ||
          event.before.verifiedAt !== event.after.verifiedAt)
      )
        throw new Error('Afsluiten mag de effectbeoordeling niet wijzigen.');
    } else {
      const firstEdit = !event.before.lifecycle && from !== 'legacy_done';
      const expectedCycle = firstEdit
        ? { stage: from, effectiveness: 'pending', evidenceSnapshots: [] }
        : event.before.lifecycle;
      if (
        event.kind !== 'edit' ||
        from !== to ||
        !same(expectedCycle, event.after.lifecycle) ||
        (firstEdit
          ? event.after.effectCheck !== undefined || event.after.verifiedAt !== undefined
          : event.before.effectCheck !== event.after.effectCheck ||
            event.before.verifiedAt !== event.after.verifiedAt)
      )
        throw new Error('Inhoudsrevisie mag de lifecycle of effectbeoordeling niet omzeilen.');
      if (same(event.before, event.after))
        throw new Error('Een inhoudsrevisie vereist een werkelijke wijziging.');
    }
    for (const key of ['id', 'scenarioId', 'dossierId', 'findingId'] as const)
      if (event.before[key] !== event.after[key])
        throw new Error('Actiehistorie mag dossier- en bronrelaties niet stil omhangen.');
    previous = event;
  }
  if (!previous || !same(actionSnapshot(action), previous.after))
    throw new Error('De huidige actie wijkt af van de laatste bewaarde revisie.');
  assertCycle(actionSnapshot(action));
  if (currentEvidence && ['effective', 'ineffective', 'closed'].includes(state.stage)) {
    for (const snapshot of state.evidenceSnapshots) {
      const found = currentEvidence.find((item) => item.id === snapshot.id);
      if (
        !found ||
        found.status !== 'verified' ||
        found.dossierId !== action.dossierId ||
        found.verifiedContentSha256 !== evidenceHash(found) ||
        evidenceHash(found) !== evidenceHash(snapshot)
      )
        throw new Error(
          'Effectbewijs is gewijzigd of ingetrokken. Heropen de actie vóór wijzigen van het actuele bewijs.',
        );
    }
  }
}
