import { useState } from 'react';
import type { WorkspaceAction, WorkspaceState } from '../data/model';
import { newId } from '../data/model';
import { draftBase } from '../data/local-drafts';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import { captureRiskTargetReference, riskTargetCurrentStatus } from '../data/risk-evidence';
import {
  actionAhsLabels,
  actionAhsLevels,
  actionPriorities,
  actionPriorityLabels,
  actionSourceCollections,
  actionSourceLabel,
  actionSourceRecords,
  sourceRefKey,
  actionContextBasis,
  actionContextWarnings,
  assertActionContext,
  createAction,
  type ActionCreateDraft,
  type ActionCreateSeed,
  type EditableActionContext,
  type ActionSourceCollection,
  type ActionSourceRef,
} from '../domain/action-context';
import DraftNotice from './DraftNotice';

export interface ActionSourcePickerDraft {
  sourceCollection: ActionSourceCollection;
  sourceFilter: string;
  sourceId: string;
  unresolvedId: string;
}
export function initialActionSourcePicker(): ActionSourcePickerDraft {
  return { sourceCollection: 'sources', sourceFilter: '', sourceId: '', unresolvedId: '' };
}
export function validActionSourcePicker(value: ActionSourcePickerDraft | undefined): boolean {
  return (
    value === undefined ||
    (!!value &&
      actionSourceCollections.includes(value.sourceCollection) &&
      ['sourceFilter', 'sourceId', 'unresolvedId'].every(
        (key) => typeof value[key as keyof ActionSourcePickerDraft] === 'string',
      ))
  );
}
export function assertSourcePickerCommitted(picker: ActionSourcePickerDraft | undefined): void {
  if (picker?.sourceId || picker?.unresolvedId.trim())
    throw new Error(
      'De ingevulde bron is nog niet aan deze actie toegevoegd. Leg die bron eerst vast; je invoer is behouden.',
    );
}
export interface ActionContextFieldsProps {
  workspace: WorkspaceState;
  value: EditableActionContext & { scenarioId?: string; dossierId?: string };
  onChange: (patch: Partial<EditableActionContext>) => void;
  picker: ActionSourcePickerDraft;
  onPickerChange: (patch: Partial<ActionSourcePickerDraft>) => void;
}
/** Changes only explicitly edited fields; rendering absent legacy fields does not fill them. */
export function ActionContextFields({
  workspace,
  value,
  onChange,
  picker,
  onPickerChange,
}: ActionContextFieldsProps) {
  const { sourceCollection, sourceFilter, sourceId, unresolvedId } = picker;
  const records = actionSourceRecords(workspace, sourceCollection)
    .filter((record) =>
      `${record.id} ${typeof record.title === 'string' ? record.title : ''}`
        .toLowerCase()
        .includes(sourceFilter.toLowerCase()),
    )
    .slice(0, 100);
  function addSource(ref: ActionSourceRef) {
    if (!(value.sourceRefs ?? []).some((item) => sourceRefKey(item) === sourceRefKey(ref)))
      onChange({ sourceRefs: [...(value.sourceRefs ?? []), ref] });
  }
  return (
    <>
      <div className="form-grid">
        <label className="field">
          <span>AHS-keuze van de actie</span>
          <select
            value={value.ahsLevel ?? ''}
            onChange={(event) =>
              onChange({ ahsLevel: event.target.value as EditableActionContext['ahsLevel'] })
            }
          >
            {value.ahsLevel === undefined && <option value="">Niet afzonderlijk vastgelegd</option>}
            {actionAhsLevels.map((level) => (
              <option key={level} value={level}>
                {actionAhsLabels[level]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Actieprioriteit</span>
          <select
            value={value.priority ?? ''}
            onChange={(event) =>
              onChange({ priority: event.target.value as EditableActionContext['priority'] })
            }
          >
            {value.priority === undefined && <option value="">Niet afzonderlijk vastgelegd</option>}
            {actionPriorities.map((priority) => (
              <option key={priority} value={priority}>
                {actionPriorityLabels[priority]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Overwogen hogere AHS-niveaus</legend>
        {actionAhsLevels
          .filter((level) => !['unknown', 'not_applicable'].includes(level))
          .map((level) => (
            <label key={level} className="checkbox-label">
              <input
                type="checkbox"
                checked={value.higherLevelsConsidered?.includes(level) ?? false}
                onChange={(event) =>
                  onChange({
                    higherLevelsConsidered: event.target.checked
                      ? [...(value.higherLevelsConsidered ?? []), level]
                      : (value.higherLevelsConsidered ?? []).filter((item) => item !== level),
                  })
                }
              />
              {actionAhsLabels[level]}
            </label>
          ))}
      </fieldset>
      <label className="field">
        <span>Afwijkingsreden / motivering van de AHS-keuze</span>
        <textarea
          value={value.deviationRationale ?? ''}
          onChange={(event) => onChange({ deviationRationale: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Beoogd resultaat</span>
        <textarea
          value={value.intendedResult ?? ''}
          onChange={(event) => onChange({ intendedResult: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Uitvoering</span>
        <textarea
          value={value.implementation ?? ''}
          onChange={(event) => onChange({ implementation: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Afzonderlijke verificatiemethode</span>
        <textarea
          value={value.verificationMethod ?? ''}
          onChange={(event) => onChange({ verificationMethod: event.target.value })}
        />
      </label>
      <p className="caption">
        Een oude actie gebruikt haar bestaande notities alleen als geen afzonderlijke
        verificatiemethode is vastgelegd. AHS en prioriteit verlenen geen risicoreductie.
      </p>
      <fieldset>
        <legend>Herleidbare aanleiding / bronnen</legend>
        {(value.sourceRefs ?? []).map((ref) => (
          <div className="source-row" key={sourceRefKey(ref)}>
            <span>{actionSourceLabel(ref, workspace)}</span>
            <button
              className="secondary"
              type="button"
              onClick={() =>
                onChange({
                  sourceRefs: value.sourceRefs!.filter(
                    (item) => sourceRefKey(item) !== sourceRefKey(ref),
                  ),
                })
              }
            >
              Bron verwijderen
            </button>
          </div>
        ))}
        <label className="field">
          <span>Broncollectie</span>
          <select
            value={sourceCollection}
            onChange={(event) => {
              onPickerChange({
                sourceCollection: event.target.value as ActionSourceCollection,
                sourceId: '',
              });
            }}
          >
            {actionSourceCollections.map((collection) => (
              <option key={collection} value={collection}>
                {collection}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Bron zoeken</span>
          <input
            value={sourceFilter}
            onChange={(event) => onPickerChange({ sourceFilter: event.target.value, sourceId: '' })}
          />
        </label>
        <label className="field">
          <span>Bestaande bron</span>
          <select
            value={sourceId}
            onChange={(event) => onPickerChange({ sourceId: event.target.value })}
          >
            <option value="">Kies een werkelijk bestaand record</option>
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {typeof record.title === 'string' ? record.title : record.id} [{record.id}]
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          type="button"
          disabled={!records.some((record) => record.id === sourceId)}
          onClick={() => {
            addSource({ kind: 'workspace', collection: sourceCollection, id: sourceId });
            onPickerChange({ sourceId: '' });
          }}
        >
          Gekozen bron toevoegen
        </button>
        <label className="field">
          <span>Onopgeloste oorspronkelijke bron-ID</span>
          <input
            value={unresolvedId}
            onChange={(event) => onPickerChange({ unresolvedId: event.target.value })}
          />
        </label>
        <button
          className="secondary"
          type="button"
          disabled={!unresolvedId.trim()}
          onClick={() => {
            addSource({ kind: 'unresolved', originalId: unresolvedId.trim() });
            onPickerChange({ unresolvedId: '' });
          }}
        >
          Onopgeloste bron vastleggen
        </button>
        <p className="caption">
          Een aanleiding is geen effectbewijs. Een onopgeloste ID blijft expliciet onbevestigd.
        </p>
      </fieldset>
      <fieldset>
        <legend>Onderwerpen bij deze actie</legend>
        {(workspace.topics ?? []).map((topic) => (
          <label className="checkbox-label" key={topic.id}>
            <input
              type="checkbox"
              checked={value.topicIds?.includes(topic.id) ?? false}
              onChange={(event) =>
                onChange({
                  topicIds: event.target.checked
                    ? [...(value.topicIds ?? []), topic.id]
                    : (value.topicIds ?? []).filter((id) => id !== topic.id),
                })
              }
            />
            {topic.title}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Expliciete risicomaatregelen / LOPA-doelen</legend>
        {(value.riskTargets ?? []).map((ref) => (
          <div key={`${ref.scenarioId}/${ref.kind}/${ref.targetId}`}>
            <p>
              {ref.snapshot.target.title} · {ref.kind} [{ref.targetId}] ·{' '}
              {riskTargetCurrentStatus(ref, workspace.scenarios)} · versie{' '}
              {ref.targetSha256.slice(0, 12)}
            </p>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onChange({ riskTargets: value.riskTargets!.filter((item) => item !== ref) })
              }
            >
              Doel verwijderen
            </button>
            {riskTargetCurrentStatus(ref, workspace.scenarios) === 'changed' && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const scenario = workspace.scenarios.find((item) => item.id === ref.scenarioId);
                  if (!scenario) return;
                  const updated = captureRiskTargetReference(scenario, ref.kind, ref.targetId);
                  onChange({
                    riskTargets: value.riskTargets!.map((item) => (item === ref ? updated : item)),
                  });
                }}
              >
                Actuele doelversie kiezen
              </button>
            )}
          </div>
        ))}
        {workspace.scenarios
          .filter(
            (scenario) =>
              scenario.dossierId === value.dossierId &&
              (!value.scenarioId || scenario.id === value.scenarioId),
          )
          .map((scenario) => (
            <details key={scenario.id}>
              <summary>{scenario.title}</summary>
              {[
                ...scenario.controls.map((target) => ({ kind: 'control' as const, target })),
                ...(scenario.lopa?.layers ?? []).map((target) => ({
                  kind: 'lopa-layer' as const,
                  target,
                })),
                ...(scenario.lopa?.modifiers ?? []).map((target) => ({
                  kind: 'lopa-modifier' as const,
                  target,
                })),
              ].map(({ kind, target }) => {
                const chosen =
                  value.riskTargets?.some(
                    (ref) =>
                      ref.scenarioId === scenario.id &&
                      ref.kind === kind &&
                      ref.targetId === target.id,
                  ) ?? false;
                return (
                  <label key={`${kind}/${target.id}`} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={chosen}
                      onChange={(event) =>
                        onChange({
                          riskTargets: event.target.checked
                            ? [
                                ...(value.riskTargets ?? []),
                                captureRiskTargetReference(scenario, kind, target.id),
                              ]
                            : (value.riskTargets ?? []).filter(
                                (ref) =>
                                  ref.scenarioId !== scenario.id ||
                                  ref.kind !== kind ||
                                  ref.targetId !== target.id,
                              ),
                        })
                      }
                    />
                    {target.title} · {kind}
                  </label>
                );
              })}
            </details>
          ))}
        <p className="caption">
          Je kiest de echte doel-ID en versie. Een actie-uitkomst wijzigt dit doel of zijn
          risicocredit niet automatisch.
        </p>
      </fieldset>
      {actionContextWarnings(value).map((message) => (
        <p className="caption" key={message}>
          {message}
        </p>
      ))}
    </>
  );
}

export interface ActionCreateFormProps {
  workspace: WorkspaceState;
  onCreate: (action: WorkspaceAction) => boolean;
  onCancel?: () => void;
  draftKey?: string;
  initial?: ActionCreateSeed;
}
interface CreateSession {
  draft: ActionCreateDraft;
  contextBasis: string;
  sourcePicker?: ActionSourcePickerDraft;
}
export function ActionCreateForm({
  workspace,
  onCreate,
  onCancel,
  draftKey,
  initial = {},
}: ActionCreateFormProps) {
  const [session, setSession, draftStatus] = usePersistentDraft<CreateSession>(
    draftKey ?? `${workspace.id}/action-create/new`,
    () => {
      const draft: ActionCreateDraft = {
        id: newId(),
        title: '',
        owner: '',
        dueDate: '',
        notes: '',
        stage: 'planned',
        ahsLevel: 'unknown',
        priority: 'medium',
        ...initial,
      };
      return {
        draft,
        contextBasis: actionContextBasis(draft, workspace),
        sourcePicker: initialActionSourcePicker(),
      };
    },
    draftBase(initial),
    (value) => {
      if (
        !value ||
        typeof value.contextBasis !== 'string' ||
        !value.draft ||
        typeof value.draft.id !== 'string' ||
        workspace.actions.some((action) => action.id === value.draft.id)
      )
        return false;
      try {
        assertActionContext(value.draft);
        return (
          ['title', 'owner', 'dueDate', 'notes'].every(
            (key) => typeof value.draft[key as keyof ActionCreateDraft] === 'string',
          ) &&
          ['proposed', 'planned'].includes(value.draft.stage) &&
          validActionSourcePicker(value.sourcePicker)
        );
      } catch {
        return false;
      }
    },
  );
  const [error, setError] = useState('');
  const draft = session.draft;
  const stale = session.contextBasis !== actionContextBasis(draft, workspace);
  function change(patch: Partial<ActionCreateDraft>) {
    setSession((previous) => {
      const next = { ...previous.draft, ...patch };
      return {
        ...previous,
        draft: next,
        contextBasis:
          previous.contextBasis === actionContextBasis(previous.draft, workspace)
            ? actionContextBasis(next, workspace)
            : previous.contextBasis,
      };
    });
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        try {
          if (stale)
            throw new Error(
              'De gekozen bron- of doelbasis is gewijzigd. Je concept blijft staan; beoordeel de actuele basis.',
            );
          assertSourcePickerCommitted(session.sourcePicker);
          const action = createAction(draft, workspace);
          if (!onCreate(action))
            throw new Error('De actie kon niet worden opgeslagen. Je concept blijft beschikbaar.');
          draftStatus.clear();
        } catch (caught) {
          setError(
            caught instanceof Error ? caught.message : 'De actie kon niet worden vastgelegd.',
          );
        }
      }}
    >
      <DraftNotice status={draftStatus} />
      <label className="field">
        <span>Actie</span>
        <input
          autoFocus
          required
          value={draft.title}
          onChange={(event) => change({ title: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Aanmaakfase</span>
        <select
          value={draft.stage}
          onChange={(event) => change({ stage: event.target.value as ActionCreateDraft['stage'] })}
        >
          <option value="proposed">Voorgesteld</option>
          <option value="planned">Gepland</option>
        </select>
      </label>
      <label className="field">
        <span>Gerelateerd scenario</span>
        <select
          value={draft.scenarioId ?? ''}
          onChange={(event) => {
            const scenario = workspace.scenarios.find((item) => item.id === event.target.value);
            change({
              scenarioId: scenario?.id,
              dossierId: scenario?.dossierId ?? initial.dossierId,
            });
          }}
        >
          <option value="">Algemene verbetering</option>
          {workspace.scenarios
            .filter((scenario) => !initial.dossierId || scenario.dossierId === initial.dossierId)
            .map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.title}
              </option>
            ))}
        </select>
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Eigenaar</span>
          <input
            required={draft.stage === 'planned'}
            value={draft.owner}
            onChange={(event) => change({ owner: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Streefdatum</span>
          <input
            type="date"
            value={draft.dueDate}
            onChange={(event) => change({ dueDate: event.target.value })}
          />
        </label>
      </div>
      <ActionContextFields
        workspace={workspace}
        value={draft}
        onChange={change}
        picker={session.sourcePicker ?? initialActionSourcePicker()}
        onPickerChange={(patch) =>
          setSession((previous) => ({
            ...previous,
            sourcePicker: { ...initialActionSourcePicker(), ...previous.sourcePicker, ...patch },
          }))
        }
      />
      <label className="field">
        <span>Aanvullende notities</span>
        <textarea value={draft.notes} onChange={(event) => change({ notes: event.target.value })} />
      </label>
      {(error || stale) && (
        <p className="warning-line" role="alert">
          {error || 'De bron- of doelbasis is gewijzigd; je invoer is behouden.'}
        </p>
      )}
      <div className="action-buttons">
        <button className="primary" type="submit" disabled={stale}>
          Actie vastleggen
        </button>
        {stale && (
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setSession((previous) => ({
                ...previous,
                contextBasis: actionContextBasis(previous.draft, workspace),
              }));
              setError('');
            }}
          >
            Concept bij actuele bronbasis herbevestigen
          </button>
        )}
        {onCancel && (
          <button className="secondary" type="button" onClick={onCancel}>
            Sluiten
          </button>
        )}
      </div>
    </form>
  );
}
