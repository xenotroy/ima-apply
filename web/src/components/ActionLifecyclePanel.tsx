import { useEffect, useState, type ReactNode } from 'react';
import type { WorkspaceAction } from '../data/model';
import type { Evidence } from '../data/dossier';
import type { ActionStage } from '../data/action';
import {
  actionRevision,
  actionStage,
  actionStageLabels,
  nextActionStages,
  reviseAction,
} from '../domain/action-lifecycle';
import { evidenceHash } from '../data/frozen';
import { MAX_WORKSPACE_BYTES } from '../data/validation';
import './action-lifecycle.css';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export interface ActionLifecyclePanelProps {
  action: WorkspaceAction;
  evidence: Evidence[];
  /** Parent compares expectedRevision with its latest state before applying this revision. */
  onSave: (next: WorkspaceAction, expectedRevision: number) => void | boolean;
}
export function ActionLifecyclePanel({ action, evidence, onSave }: ActionLifecyclePanelProps) {
  const [draft, setDraft] = useState(action);
  const [actor, setActor] = useState('');
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<ActionStage | ''>('');
  const [verificationDue, setVerificationDue] = useState('');
  const [verifier, setVerifier] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [dirty, setDirty] = useState(false);
  const revision = actionRevision(action);
  const draftRevision = actionRevision(draft);
  useEffect(() => {
    if (actionRevision(action) !== actionRevision(draft)) {
      if (dirty) setStale(true);
      else {
        setDraft(action);
        setTarget('');
        setError('');
      }
    }
  }, [action, draft, dirty]);
  function reset() {
    setDraft(action);
    setReason('');
    setTarget('');
    setVerificationDue('');
    setVerifier('');
    setEvaluation('');
    setDirty(false);
    setStale(false);
    setError('');
  }
  function field<K extends 'title' | 'owner' | 'dueDate' | 'notes' | 'evidenceIds'>(
    key: K,
    value: WorkspaceAction[K],
  ) {
    setDraft({ ...draft, [key]: value });
    setDirty(true);
  }
  const scopedEvidence = evidence.filter((item) => item.dossierId === action.dossierId);
  const assessed = target === 'effective' || target === 'ineffective';
  const stages = nextActionStages(draft);
  const history = action.lifecycle?.history ?? [];
  const bytes = new TextEncoder().encode(JSON.stringify(action)).byteLength;
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
      <details className="action-revision-editor">
        <summary>Actie wijzigen of volgende stap vastleggen</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            try {
              if (stale || revision !== draftRevision)
                throw new Error(
                  'Deze actie is op een ander scherm gewijzigd. Je invoer blijft staan; open de actuele revisie voordat je bewaart.',
                );
              const next = reviseAction(
                action,
                {
                  expectedRevision: draftRevision,
                  actor,
                  reason,
                  targetStage: target || undefined,
                  patch: {
                    title: draft.title,
                    owner: draft.owner,
                    dueDate: draft.dueDate,
                    notes: draft.notes,
                    evidenceIds: draft.evidenceIds,
                  },
                  verificationDueAt: verificationDue
                    ? new Date(verificationDue).toISOString()
                    : undefined,
                  verifier,
                  evaluation,
                },
                evidence,
              );
              if (onSave(next, draftRevision) === false)
                throw new Error(
                  'Deze revisie kon niet worden opgeslagen. Je invoer blijft beschikbaar.',
                );
              setDraft(next);
              setReason('');
              setTarget('');
              setVerificationDue('');
              setVerifier('');
              setEvaluation('');
              setDirty(false);
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
          <Field label="Verificatieplan / voortgang">
            <textarea value={draft.notes} onChange={(e) => field('notes', e.target.value)} />
          </Field>
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
                setDirty(true);
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
                  setDirty(true);
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
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Resultaat van de effectcontrole">
                <textarea
                  required
                  value={evaluation}
                  onChange={(e) => {
                    setEvaluation(e.target.value);
                    setDirty(true);
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
                setDirty(true);
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
                setDirty(true);
              }}
            />
          </Field>
          {(error || stale) && (
            <p className="warning-line" role="alert">
              {error || 'De actie heeft een nieuwere revisie. Je invoer is behouden.'}
            </p>
          )}
          <div className="action-buttons">
            <button className="primary" type="submit" disabled={stale}>
              Revisie vastleggen
            </button>
            <button className="secondary" type="button" onClick={reset}>
              Actuele revisie openen
            </button>
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
