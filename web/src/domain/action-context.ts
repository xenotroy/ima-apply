import type { WorkspaceAction, WorkspaceState } from '../data/model';
import { draftBase } from '../data/local-drafts';
import {
  assertRiskTargetReference,
  captureRiskTargetReference,
  evidenceCurrentStatus,
  riskTargetCurrentStatus,
} from '../data/risk-evidence';
import type { EvidenceFileIntegrityContext } from '../data/evidence-file-types';

/** The actual seven choices in the original ima.action/v1 and ima.action/v2. */
export const actionAhsLevels = [
  'unknown',
  'not_applicable',
  'elimination_or_source',
  'substitution',
  'technical_collective',
  'organisational',
  'individual_or_ppe',
] as const;
export type ActionAhsLevel = (typeof actionAhsLevels)[number];
export const actionAhsLabels: Record<ActionAhsLevel, string> = {
  unknown: 'Nog niet vastgesteld',
  not_applicable: 'Niet van toepassing',
  elimination_or_source: 'Eliminatie / bronaanpak',
  substitution: 'Substitutie',
  technical_collective: 'Technisch / collectief',
  organisational: 'Organisatorisch',
  individual_or_ppe: 'Individueel / PBM',
};
export const actionPriorities = ['low', 'medium', 'high', 'critical'] as const;
export type ActionPriority = (typeof actionPriorities)[number];
export const actionPriorityLabels: Record<ActionPriority, string> = {
  low: 'Laag',
  medium: 'Gemiddeld',
  high: 'Hoog',
  critical: 'Kritiek',
};
export const actionSourceCollections = [
  'sources',
  'questions',
  'answers',
  'actions',
  'incidents',
  'organisations',
  'sites',
  'departments',
  'dossiers',
  'evidence',
  'observations',
  'findings',
  'topics',
  'legalRecords',
  'investigations',
  'exposure',
  'contentRecords',
  'projectContexts',
  'walkthroughs',
  'basisRiskFactorRecords',
  'riskAssessments',
  'justifications',
  'modulePlans',
  'riskLibraries',
  'riskLibraryReviews',
  'riskLibraryLayouts',
  'scenarios',
] as const;
export type ActionSourceCollection = (typeof actionSourceCollections)[number];
export type ActionSourceRef =
  | { kind: 'workspace'; collection: ActionSourceCollection; id: string }
  | { kind: 'unresolved'; originalId: string; rawSourceId?: string };
export const editableActionContextKeys = [
  'ahsLevel',
  'higherLevelsConsidered',
  'deviationRationale',
  'priority',
  'sourceRefs',
  'topicIds',
  'intendedResult',
  'implementation',
  'verificationMethod',
  'riskTargets',
] as const;
export type EditableActionContext = Pick<
  WorkspaceAction,
  (typeof editableActionContextKeys)[number]
>;
export type ActionCreateSeed = Partial<
  Pick<
    WorkspaceAction,
    | 'title'
    | 'owner'
    | 'dueDate'
    | 'notes'
    | 'scenarioId'
    | 'dossierId'
    | 'findingId'
    | 'evidenceIds'
    | (typeof editableActionContextKeys)[number]
  >
> & { stage?: 'proposed' | 'planned' };
export interface ActionCreateDraft extends ActionCreateSeed {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  notes: string;
  stage: 'proposed' | 'planned';
}

function text(
  value: unknown,
  label: string,
  required = false,
  max = 100_000,
): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new Error(
      `${label}: ${required ? 'niet-lege' : 'geldige'} tekst vereist (maximaal ${max} tekens).`,
    );
}
function strings(value: unknown, label: string): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 160) ||
    new Set(value).size !== value.length
  )
    throw new Error(`${label}: unieke bestaande ID’s vereist.`);
}
function choices(value: unknown, allowed: readonly string[], label: string): void {
  if (typeof value !== 'string' || !allowed.includes(value))
    throw new Error(`${label}: onbekende keuze.`);
}
function exactKeys(
  value: unknown,
  keys: string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error(`${label}: ongeldige structuur.`);
}
export function sourceRefKey(ref: ActionSourceRef): string {
  return ref.kind === 'workspace'
    ? JSON.stringify([ref.kind, ref.collection, ref.id])
    : JSON.stringify([ref.kind, ref.originalId, ref.rawSourceId ?? null]);
}
/** Structural validation only: historical references need not resolve against today's records. */
export function assertActionContext(action: EditableActionContext): void {
  if (action.ahsLevel !== undefined) choices(action.ahsLevel, actionAhsLevels, 'AHS');
  if (action.priority !== undefined) choices(action.priority, actionPriorities, 'Prioriteit');
  if (action.higherLevelsConsidered !== undefined) {
    if (
      !Array.isArray(action.higherLevelsConsidered) ||
      new Set(action.higherLevelsConsidered).size !== action.higherLevelsConsidered.length
    )
      throw new Error('Hogere overwogen AHS-niveaus moeten uniek zijn.');
    action.higherLevelsConsidered.forEach((value) =>
      choices(value, actionAhsLevels, 'Overwogen AHS-niveau'),
    );
  }
  for (const key of [
    'deviationRationale',
    'intendedResult',
    'implementation',
    'verificationMethod',
  ] as const)
    if (action[key] !== undefined) text(action[key], key);
  if (action.topicIds !== undefined) strings(action.topicIds, 'Onderwerpen');
  if (action.sourceRefs !== undefined) {
    if (!Array.isArray(action.sourceRefs)) throw new Error('Actiebronnen moeten een lijst zijn.');
    for (const ref of action.sourceRefs) {
      if (ref?.kind === 'workspace') {
        exactKeys(ref, ['kind', 'collection', 'id'], 'Interne actiebron');
        choices(ref.collection, actionSourceCollections, 'Broncollectie');
        text(ref.id, 'Bron-ID', true, 160);
      } else if (ref?.kind === 'unresolved') {
        exactKeys(ref, ['kind', 'originalId', 'rawSourceId'], 'Onopgeloste actiebron');
        text(ref.originalId, 'Oorspronkelijke bron-ID', true, 1_000);
        if (ref.rawSourceId !== undefined) text(ref.rawSourceId, 'Raw bron-ID', true, 160);
      } else
        throw new Error('Actiebron vereist een echte interne of expliciet onopgeloste verwijzing.');
    }
    if (new Set(action.sourceRefs.map(sourceRefKey)).size !== action.sourceRefs.length)
      throw new Error('Dubbele actiebron.');
  }
  if (action.riskTargets !== undefined) {
    if (!Array.isArray(action.riskTargets)) throw new Error('Risicodoelen moeten een lijst zijn.');
    action.riskTargets.forEach(assertRiskTargetReference);
    const keys = action.riskTargets.map((ref) =>
      JSON.stringify([ref.scenarioId, ref.kind, ref.targetId]),
    );
    if (new Set(keys).size !== keys.length) throw new Error('Dubbel risicodoel.');
  }
}
export function actionSourceRecords(
  workspace: WorkspaceState,
  collection: ActionSourceCollection,
): { id: string; title?: string }[] {
  return (workspace[collection] ?? []) as { id: string; title?: string }[];
}
export function actionSourceLabel(ref: ActionSourceRef, workspace: WorkspaceState): string {
  if (ref.kind === 'unresolved') return `Onopgeloste oorspronkelijke bron: ${ref.originalId}`;
  const record = actionSourceRecords(workspace, ref.collection).find((item) => item.id === ref.id);
  return `${record?.title || ref.id} · ${ref.collection} [${ref.id}]${record ? '' : ' · ontbreekt'}`;
}
/** Current relationship validity is separate from frozen historical snapshots. */
export function assertActionContextRelations(
  action: EditableActionContext & { scenarioId?: string; dossierId?: string },
  workspace: WorkspaceState,
): void {
  assertActionContext(action);
  for (const ref of action.sourceRefs ?? []) {
    const matches =
      ref.kind === 'workspace'
        ? actionSourceRecords(workspace, ref.collection).filter((record) => record.id === ref.id)
        : ref.rawSourceId
          ? workspace.sources.filter((record) => record.id === ref.rawSourceId)
          : null;
    if (matches && matches.length !== 1)
      throw new Error('Actiebron ontbreekt of is niet uniek in de gekozen collectie.');
  }
  for (const id of action.topicIds ?? [])
    if (workspace.topics?.filter((topic) => topic.id === id).length !== 1)
      throw new Error('Actieonderwerp bestaat niet of is niet uniek.');
  for (const ref of action.riskTargets ?? []) {
    if (ref.snapshot.context.dossierId !== action.dossierId)
      throw new Error('Risicodoel en actie behoren niet tot dezelfde dossierscope.');
    if (action.scenarioId !== undefined && ref.scenarioId !== action.scenarioId)
      throw new Error('Risicodoel valt buiten het gekozen actiescenario.');
  }
}
export function actionContextWarnings(action: EditableActionContext): string[] {
  const issues: string[] = [];
  if (action.ahsLevel === undefined || action.ahsLevel === 'unknown')
    issues.push('AHS-niveau nog niet vastgesteld.');
  if (
    ['organisational', 'individual_or_ppe'].includes(action.ahsLevel ?? '') &&
    !action.higherLevelsConsidered?.length &&
    !action.deviationRationale?.trim()
  )
    issues.push('Lagere AHS-keuze mist overwogen hogere niveaus of een afwijkingsreden.');
  if (!action.sourceRefs?.length) issues.push('Geen afzonderlijke actiebron vastgelegd.');
  if (action.sourceRefs?.some((ref) => ref.kind === 'unresolved'))
    issues.push('Een oorspronkelijke actiebron is nog niet opgelost.');
  return issues;
}
/** Source/target fingerprints belong to the recoverable editor, not invented history. */
export function actionContextBasis(
  action: EditableActionContext,
  workspace: WorkspaceState,
): string {
  return draftBase({
    sources: (action.sourceRefs ?? []).map((ref) => ({
      ref,
      record:
        ref.kind === 'workspace'
          ? (actionSourceRecords(workspace, ref.collection).find(
              (record) => record.id === ref.id,
            ) ?? null)
          : ref.rawSourceId
            ? (workspace.sources.find((record) => record.id === ref.rawSourceId) ?? null)
            : null,
    })),
    topics: (action.topicIds ?? []).map(
      (id) => workspace.topics?.find((topic) => topic.id === id) ?? { id, missing: true },
    ),
    targets: (action.riskTargets ?? []).map((ref) => {
      const scenario = workspace.scenarios.find((item) => item.id === ref.scenarioId);
      try {
        return scenario
          ? captureRiskTargetReference(scenario, ref.kind, ref.targetId).targetSha256
          : 'missing';
      } catch {
        return 'missing';
      }
    }),
  });
}
export function createAction(draft: ActionCreateDraft, workspace: WorkspaceState): WorkspaceAction {
  text(draft.id, 'Actie-ID', true, 160);
  if (workspace.actions.some((action) => action.id === draft.id))
    throw new Error('Deze actie bestaat al.');
  text(draft.title, 'Actietitel', true, 1_000);
  text(draft.intendedResult, 'Beoogd resultaat', true);
  choices(draft.stage, ['proposed', 'planned'], 'Nieuwe actiefase');
  text(draft.owner, 'Eigenaar', draft.stage === 'planned', 1_000);
  if (!draft.sourceRefs?.length) throw new Error('Een nieuwe actie vereist minimaal één bron.');
  const { stage, ...fields } = draft;
  const action: WorkspaceAction = {
    ...fields,
    title: draft.title.trim(),
    owner: draft.owner.trim(),
    status: 'open',
    lifecycle: { stage, effectiveness: 'pending', evidenceSnapshots: [], revision: 0, history: [] },
  };
  assertActionContextRelations(action, workspace);
  for (const ref of action.riskTargets ?? [])
    if (riskTargetCurrentStatus(ref, workspace.scenarios) !== 'current')
      throw new Error('Een nieuwe actie vereist een expliciet gekozen actuele risicodoelversie.');
  return action;
}

export function actionContextMarkdown(
  action: EditableActionContext & { scenarioId?: string; dossierId?: string },
  workspace?: WorkspaceState,
  fileContext?: EvidenceFileIntegrityContext,
): string[] {
  const lines = [
    `AHS-keuze: ${action.ahsLevel === undefined ? 'Niet afzonderlijk vastgelegd' : actionAhsLabels[action.ahsLevel]}${action.ahsLevel ? ` [${action.ahsLevel}]` : ''}`,
    `Hoger overwogen: ${action.higherLevelsConsidered === undefined ? 'Niet afzonderlijk vastgelegd' : action.higherLevelsConsidered.map((level) => `${actionAhsLabels[level]} [${level}]`).join(', ') || 'Geen vastgelegd'}`,
    `AHS-motivering: ${action.deviationRationale ?? 'Niet afzonderlijk vastgelegd'}`,
    `Actieprioriteit: ${action.priority === undefined ? 'Niet afzonderlijk vastgelegd' : `${actionPriorityLabels[action.priority]} [${action.priority}]`}`,
    `Onderwerp-ID’s: ${action.topicIds?.join(', ') || 'Niet afzonderlijk vastgelegd'}`,
    `Beoogd resultaat: ${action.intendedResult ?? 'Niet afzonderlijk vastgelegd'}`,
    `Uitvoering: ${action.implementation ?? 'Niet afzonderlijk vastgelegd'}`,
    `Verificatiemethode: ${action.verificationMethod === undefined ? 'Oud notitieveld blijft de compatibiliteitsbasis' : action.verificationMethod}`,
  ];
  for (const ref of action.sourceRefs ?? [])
    lines.push(
      ref.kind === 'workspace'
        ? `Actiebron: ${ref.collection} [${ref.id}]${workspace ? ` | ${actionSourceLabel(ref, workspace)}` : ''}`
        : `Onopgeloste oorspronkelijke actiebron: ${ref.originalId}${ref.rawSourceId ? ` | raw bron [${ref.rawSourceId}]` : ''}`,
    );
  if (!action.sourceRefs?.length) lines.push('Actiebronnen: niet afzonderlijk vastgelegd.');
  for (const ref of action.riskTargets ?? []) {
    lines.push(
      `Risicodoel: ${ref.snapshot.target.title} | scenario [${ref.scenarioId}] | ${ref.kind} [${ref.targetId}] | SHA256 ${ref.targetSha256}${workspace ? ` | huidige doelversie ${riskTargetCurrentStatus(ref, workspace.scenarios)}` : ''}`,
    );
    if (workspace)
      for (const binding of ref.snapshot.target.evidenceReview?.bindings ?? []) {
        const validity = evidenceCurrentStatus(
          binding.snapshot,
          workspace.evidence ?? [],
          fileContext ? { ...fileContext, dossierId: action.dossierId } : undefined,
        );
        lines.push(
          `Actuele bewijsbasis van doel: [${binding.evidenceId}] | versie ${binding.versionSha256} | ${validity.status}: ${validity.reason}`,
        );
      }
  }
  lines.push(...actionContextWarnings(action).map((message) => `Actiecontext-review: ${message}`));
  return lines;
}
