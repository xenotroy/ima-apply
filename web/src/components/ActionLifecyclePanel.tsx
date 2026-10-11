import { useState, type ReactNode } from 'react';
import type { WorkspaceAction, WorkspaceState } from '../data/model';
import type { Evidence } from '../data/dossier';
import type { ActionStage } from '../data/action';
import {
  actionRevision,
  actionCurrentValidity,
  actionSnapshot,
  actionSnapshotHash,
  actionStage,
  actionStageLabels,
  nextActionStages,
  reviseAction,
} from '../domain/action-lifecycle';
import { evidenceHash } from '../data/frozen';
import { MAX_WORKSPACE_BYTES } from '../data/validation';
import { draftBase } from '../data/local-drafts';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import { DEFAULT_EVIDENCE_FILE_SESSION } from '../data/evidence-files';
import type { EvidenceFileIntegrityContext } from '../data/evidence-file-types';
import {
  actionContextBasis,
  assertActionContext,
  editableActionContextKeys,
  type EditableActionContext,
} from '../domain/action-context';
import {
  ActionContextFields,
  assertSourcePickerCommitted,
  initialActionSourcePicker,
  validActionSourcePicker,
  type ActionSourcePickerDraft,
} from './ActionCreateForm';
import DraftNotice from './DraftNotice';
import './action-lifecycle.css';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
type EditableAction = Pick<
  WorkspaceAction,
  'title' | 'owner' | 'dueDate' | 'notes' | 'evidenceIds'
> &
  EditableActionContext;
interface RevisionDraft {
  actionId: string;
  sourceBasis: string;
  sourceRevision: number;
  fields: EditableAction;
  evidenceBasis: string;
  contextBasis?: string;
  sourcePicker?: ActionSourcePickerDraft;
  actor: string;
  reason: string;
  target: ActionStage | '';
  verificationDue: string;
  verifier: string;
  evaluation: string;
}
function actionBasis(action: WorkspaceAction): string {
  return draftBase({
    revision: actionRevision(action),
    snapshot: actionSnapshotHash(actionSnapshot(action)),
    previous: action.lifecycle?.history.at(-1)?.sha256 ?? null,
  });
}
function selectedEvidenceBasis(ids: string[] | undefined, evidence: Evidence[]): string {
  return draftBase(
    (ids ?? [])
      .slice()
      .sort()
      .map((id) => {
        const record = evidence.find((item) => item.id === id);
        return record
          ? {
              id,
              hash: evidenceHash(record),
              status: record.status,
              verifiedHash: record.verifiedContentSha256 ?? null,
              verifiedBy: record.verifiedBy ?? null,
              verifiedAt: record.verifiedAt ?? null,
              verificationNote: record.verificationNote ?? null,
            }
          : { id, missing: true };
      }),
  );
}
function initialDraft(
  action: WorkspaceAction,
  evidence: Evidence[],
  basis: string,
  workspace?: WorkspaceState,
): RevisionDraft {
  const { title, owner, dueDate, notes, evidenceIds } = action;
  return {
    actionId: action.id,
    sourceBasis: basis,
    sourceRevision: actionRevision(action),
    fields: {
      title,
      owner,
      dueDate,
      notes,
      ...(evidenceIds !== undefined ? { evidenceIds: [...evidenceIds] } : {}),
      ...Object.fromEntries(
        editableActionContextKeys
          .filter((key) => action[key] !== undefined)
          .map((key) => [key, structuredClone(action[key])]),
      ),
    },
    evidenceBasis: selectedEvidenceBasis(evidenceIds, evidence),
    ...(workspace ? { contextBasis: actionContextBasis(action, workspace) } : {}),
    sourcePicker: initialActionSourcePicker(),
    actor: '',
    reason: '',
    target: '',
    verificationDue: '',
    verifier: '',
    evaluation: '',
  };
}
function validDraft(value: RevisionDraft, action: WorkspaceAction, basis: string): boolean {
  try {
    assertActionContext(value?.fields ?? {});
  } catch {
    return false;
  }
  return (
    !!value &&
    typeof value === 'object' &&
    value.actionId === action.id &&
    value.sourceBasis === basis &&
    value.sourceRevision === actionRevision(action) &&
    !!value.fields &&
    typeof value.fields === 'object' &&
    ['title', 'owner', 'dueDate', 'notes'].every(
      (key) => typeof value.fields[key as keyof EditableAction] === 'string',
    ) &&
    (value.fields.evidenceIds === undefined ||
      (Array.isArray(value.fields.evidenceIds) &&
        value.fields.evidenceIds.every((id) => typeof id === 'string'))) &&
    ['evidenceBasis', 'actor', 'reason', 'verificationDue', 'verifier', 'evaluation'].every(
      (key) => typeof value[key as keyof RevisionDraft] === 'string',
    ) &&
    (value.target === '' || nextActionStages(action).includes(value.target)) &&
    (value.contextBasis === undefined || typeof value.contextBasis === 'string') &&
    validActionSourcePicker(value.sourcePicker)
  );
}
export interface ActionLifecyclePanelProps {
  workspaceId: string;
  action: WorkspaceAction;
  evidence: Evidence[];
  /** Full current workspace permits explicit sources/targets and current validity checks. */
  workspace?: WorkspaceState;
  fileContext?: EvidenceFileIntegrityContext;
  /** Parent compares expectedRevision with its latest state before applying this revision. */
  onSave: (next: WorkspaceAction, expectedRevision: number) => boolean;
}
export function ActionLifecyclePanel(props: ActionLifecyclePanelProps) {
  const basis = actionBasis(props.action);
  // A new revision gets a new editor; pending input of its predecessor stays in its own slot.
  return (
    <ActionRevisionEditor
      key={`${props.workspaceId}/${props.action.id}/${basis}`}
      {...props}
      basis={basis}
    />
  );
}
function ActionRevisionEditor({
  workspaceId,
  action,
  evidence,
  workspace,
  fileContext: suppliedFileContext,
  onSave,
  basis,
}: ActionLifecyclePanelProps & { basis: string }) {
  const [session, setSession, draftStatus] = usePersistentDraft<RevisionDraft>(
    `${workspaceId}/action-lifecycle/${action.id}/${basis}`,
    () => initialDraft(action, evidence, basis, workspace),
    basis,
    (value) => validDraft(value, action, basis),
  );
  const { fields: draft, actor, reason, target, verificationDue, verifier, evaluation } = session;
  const [error, setError] = useState('');
  const revision = actionRevision(action);
  const draftRevision = session.sourceRevision;
  const stale =
    session.sourceBasis !== actionBasis(action) ||
    session.evidenceBasis !== selectedEvidenceBasis(draft.evidenceIds, evidence) ||
    (!!workspace &&
      session.contextBasis !== actionContextBasis(draft, workspace) &&
      !(
        session.contextBasis === undefined &&
        editableActionContextKeys.every((key) => draft[key] === undefined)
      ));
  function input<
    K extends 'actor' | 'reason' | 'target' | 'verificationDue' | 'verifier' | 'evaluation',
  >(key: K, value: RevisionDraft[K]) {
    setSession((previous) => ({ ...previous, [key]: value }));
  }
  const setActor = (value: string) => input('actor', value);
  const setReason = (value: string) => input('reason', value);
  const setTarget = (value: ActionStage | '') => input('target', value);
  const setVerificationDue = (value: string) => input('verificationDue', value);
  const setVerifier = (value: string) => input('verifier', value);
  const setEvaluation = (value: string) => input('evaluation', value);
  function confirmCurrentEvidence() {
    setSession((previous) => ({
      ...previous,
      evidenceBasis: selectedEvidenceBasis(previous.fields.evidenceIds, evidence),
      ...(workspace ? { contextBasis: actionContextBasis(previous.fields, workspace) } : {}),
    }));
    setError('');
  }
  function fields(patch: Partial<EditableAction>) {
    setSession((previous) => {
      const next = { ...previous.fields, ...patch };
      const evidenceFresh =
        previous.evidenceBasis === selectedEvidenceBasis(previous.fields.evidenceIds, evidence);
      const contextFresh =
        !workspace ||
        previous.contextBasis === actionContextBasis(previous.fields, workspace) ||
        (previous.contextBasis === undefined &&
          editableActionContextKeys.every((key) => previous.fields[key] === undefined));
      return {
        ...previous,
        fields: next,
        ...(Object.hasOwn(patch, 'evidenceIds') && evidenceFresh
          ? { evidenceBasis: selectedEvidenceBasis(next.evidenceIds, evidence) }
          : {}),
        ...(workspace && contextFresh ? { contextBasis: actionContextBasis(next, workspace) } : {}),
      };
    });
  }
  function field<K extends keyof EditableAction>(key: K, value: EditableAction[K]) {
    fields({ [key]: value });
  }
  const scopedEvidence = evidence.filter(
    (item) => item.dossierId === undefined || item.dossierId === action.dossierId,
  );
  const assessed = target === 'effective' || target === 'ineffective';
  const stages = nextActionStages(action);
  const history = action.lifecycle?.history ?? [];
  const bytes = new TextEncoder().encode(JSON.stringify(action)).byteLength;
  const fileContext = suppliedFileContext ?? {
    workspaceId,
    proofs: DEFAULT_EVIDENCE_FILE_SESSION.proofs,
  };
  const validity = actionCurrentValidity(action, evidence, workspace?.scenarios ?? [], fileContext);
  return (
    <div className="action-lifecycle">
      <p className="action-stage" data-stage={actionStage(action)}>
        {actionStageLabels[actionStage(action)]}
      </p>
      {!action.lifecycle && (
        <p className="caption">
          Registratie zonder afzonderlijke historie. De eerste nieuwe wijziging bewaart deze
          aangetroffen inhoud; oude afgeronde acties vragen eerst heropening.
        </p>
      )}
      {action.lifecycle?.implementedAt && (
        <p className="caption">
          Uitgevoerd: {new Date(action.lifecycle.implementedAt).toLocaleString('nl-NL')}
        </p>
      )}
      {action.lifecycle?.verificationDueAt && (
        <p className="caption">
          Controle gepland: {new Date(action.lifecycle.verificationDueAt).toLocaleString('nl-NL')}
        </p>
      )}
      {action.effectCheck && (
        <div className="action-evaluation">
          <strong>Bewaard resultaat</strong>
          <p>{action.effectCheck}</p>
          <small>
            {action.lifecycle?.verifier ?? 'Verificateur niet afzonderlijk vastgelegd'} ·{' '}
            {action.verifiedAt
              ? new Date(action.verifiedAt).toLocaleString('nl-NL')
              : 'Tijdstip onbekend'}
          </small>
        </div>
      )}
      {validity.status === 'current' && (
        <p className="caption">
          De gebruikte bewijs- en doelversies zijn actueel passend. Dit verleent geen automatische
          risicocredit.
        </p>
      )}
      {validity.status === 'stale' && (
        <div className="warning-line" role="status">
          <strong>Historische beoordeling bewaard; actuele basis niet meer bevestigd.</strong>
          {validity.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
          <p>Heropen en beoordeel de actuele basis vóór een nieuwe effect- of afsluitstap.</p>
        </div>
      )}
      <DraftNotice status={draftStatus} />
      <p className="caption">
        Een revisieconcept hoort bij deze actieversie. Concepten van eerdere versies blijven via
        Rapportage exporteerbaar.
      </p>
      <details className="action-revision-editor">
        <summary>Actie wijzigen of volgende stap vastleggen</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            try {
              assertSourcePickerCommitted(session.sourcePicker);
              if (stale || revision !== draftRevision)
                throw new Error(
                  'Deze actie of het geselecteerde bewijs is gewijzigd. Je invoer blijft staan; beoordeel de actuele bronbasis voordat je bewaart.',
                );
              const next = reviseAction(
                action,
                {
                  expectedRevision: draftRevision,
                  actor,
                  reason,
                  targetStage: target || undefined,
                  patch: draft,
                  verificationDueAt: verificationDue
                    ? new Date(verificationDue).toISOString()
                    : undefined,
                  verifier,
                  evaluation,
                },
                evidence,
                new Date().toISOString(),
                workspace?.scenarios ?? [],
                fileContext,
              );
              if (onSave(next, draftRevision) === false)
                throw new Error(
                  'Deze revisie kon niet worden opgeslagen. Je invoer blijft beschikbaar.',
                );
              draftStatus.clear();
            } catch (caught) {
              setError(
                caught instanceof Error ? caught.message : 'Deze stap kon niet worden vastgelegd.',
              );
            }
          }}
        >
          <Field label="Actieomschrijving">
            <input required value={draft.title} onChange={(e) => field('title', e.target.value)} />
          </Field>
          <Field label="Eigenaar">
            <input value={draft.owner} onChange={(e) => field('owner', e.target.value)} />
          </Field>
          <Field label="Streefdatum">
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => field('dueDate', e.target.value)}
            />
          </Field>
          <Field
            label={
              draft.verificationMethod === undefined
                ? 'Verificatieplan / voortgang'
                : 'Aanvullende notities / voortgang'
            }
          >
            <textarea value={draft.notes} onChange={(e) => field('notes', e.target.value)} />
          </Field>
          {workspace && (
            <ActionContextFields
              workspace={workspace}
              value={{ ...draft, scenarioId: action.scenarioId, dossierId: action.dossierId }}
              onChange={fields}
              picker={session.sourcePicker ?? initialActionSourcePicker()}
              onPickerChange={(patch) =>
                setSession((previous) => ({
                  ...previous,
                  sourcePicker: {
                    ...initialActionSourcePicker(),
                    ...previous.sourcePicker,
                    ...patch,
                  },
                }))
              }
            />
          )}
          <fieldset className="action-evidence">
            <legend>Bewijs bij deze actie</legend>
            {scopedEvidence.map((item) => (
              <label className="checkbox-label" key={item.id}>
                <input
                  type="checkbox"
                  checked={draft.evidenceIds?.includes(item.id) ?? false}
                  onChange={(e) =>
                    field(
                      'evidenceIds',
                      e.target.checked
                        ? [...(draft.evidenceIds ?? []), item.id]
                        : (draft.evidenceIds ?? []).filter((id) => id !== item.id),
                    )
                  }
                />
                {item.title} ·{' '}
                {item.status === 'verified' && item.verifiedContentSha256 === evidenceHash(item)
                  ? 'geverifieerd'
                  : 'onbevestigd'}
              </label>
            ))}
            {!scopedEvidence.length && (
              <p className="caption">
                Leg passend bewijs vast in het dossier voordat je de effectcontrole beoordeelt.
              </p>
            )}
          </fieldset>
          <Field label="Volgende actiestap">
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value as ActionStage | '');
              }}
            >
              <option value="">Alleen inhoudsrevisie bewaren</option>
              {stages.map((stage) => (
                <option key={stage} value={stage}>
                  {actionStageLabels[stage]}
                </option>
              ))}
            </select>
          </Field>
          {target === 'verification_due' && (
            <Field label="Geplande effectcontrole">
              <input
                type="datetime-local"
                required
                value={verificationDue}
                onChange={(e) => {
                  setVerificationDue(e.target.value);
                }}
              />
            </Field>
          )}
          {assessed && (
            <>
              <Field label="Verificateur">
                <input
                  required
                  value={verifier}
                  onChange={(e) => {
                    setVerifier(e.target.value);
                  }}
                />
              </Field>
              <Field label="Resultaat van de effectcontrole">
                <textarea
                  required
                  value={evaluation}
                  onChange={(e) => {
                    setEvaluation(e.target.value);
                  }}
                  placeholder="Wat is getest of gemeten, tegen welk criterium en met welk resultaat?"
                />
              </Field>
            </>
          )}
          <Field label="Actor van deze wijziging">
            <input
              required
              value={actor}
              onChange={(e) => {
                setActor(e.target.value);
              }}
              autoComplete="name"
            />
          </Field>
          <Field
            label={target === 'reopened' ? 'Reden voor heropening' : 'Redenering bij deze revisie'}
          >
            <textarea
              required
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
          </Field>
          {(error || stale) && (
            <p className="warning-line" role="alert">
              {error ||
                'Het geselecteerde bewijs, de bron of het risicodoel is gewijzigd. Je invoer is behouden; beoordeel de nieuwe broninhoud voordat je verdergaat.'}
            </p>
          )}
          <div className="action-buttons">
            <button className="primary" type="submit" disabled={stale}>
              Revisie vastleggen
            </button>
            {stale && (
              <button className="secondary" type="button" onClick={confirmCurrentEvidence}>
                Concept bij actueel bewijs herbevestigen
              </button>
            )}
          </div>
        </form>
      </details>
      <details className="action-history">
        <summary>Wijzigingshistorie · {history.length} revisies</summary>
        {!history.length && (
          <p className="caption">
            Geen eerdere actie-revisies in deze export. Een oud afgerond label bewijst geen nieuwe
            effectbeoordeling.
          </p>
        )}
        {history
          .slice()
          .reverse()
          .map((event) => (
            <article key={event.revision}>
              <strong>
                #{event.revision} ·{' '}
                {event.kind === 'transition'
                  ? `${actionStageLabels[actionStage(event.before)]} → ${actionStageLabels[actionStage(event.after)]}`
                  : 'Inhoud gewijzigd'}
              </strong>
              <small>
                {event.actor} · {new Date(event.at).toLocaleString('nl-NL')}
              </small>
              <p>{event.reason}</p>
              <details>
                <summary>Inhoud vóór en na deze revisie</summary>
                <pre>{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre>
              </details>
            </article>
          ))}
      </details>
      <p className="caption">
        Actie inclusief historie: {(bytes / 1_000).toFixed(1)} kB. De hele werkruimte heeft maximaal{' '}
        {(MAX_WORKSPACE_BYTES / 1_000).toLocaleString('nl-NL')} kB. Werk na effectbeoordeling de
        maatregel en haar bewijs afzonderlijk bij in de risicowerkbank.
      </p>
    </div>
  );
}
