import { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { questions as builtinQuestions, type Question } from '../content/catalog';
import type { Evidence, WorkspaceAnswer, WorkspacePatch, WorkspaceState } from '../data';
import { questionHash } from '../data/frozen';
import { draftBase } from '../data/local-drafts';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import DraftNotice from './DraftNotice';
import { Field } from './Primitives';
import { MultiSelect } from './DossierWorkspace';
import ResponseRelationsPanel from './ResponseRelationsPanel';

interface AnswerDraft {
  workspaceId: string;
  questionId: string;
  dossierId: string | null;
  responseId: string;
  questionSha256: string;
  choice: WorkspaceAnswer['choice'];
  evidence: string;
  note: string;
  evidenceIds?: string[];
  sourceBasis: string;
  acceptedBasis?: string;
}
const labels: Record<WorkspaceAnswer['choice'], string> = {
  yes: 'Ja',
  partial: 'Deels',
  no: 'Nee',
  unknown: 'Onbekend',
  na: 'N.v.t.',
};
/** Only editable answer inputs define this basis. Relation edits preserve their live author and links. */
function answerBasis(answer?: WorkspaceAnswer): string {
  return draftBase(
    answer
      ? {
          id: answer.id,
          questionId: answer.questionId,
          dossierId: answer.dossierId ?? null,
          choice: answer.choice,
          evidence: answer.evidence,
          note: answer.note,
          evidenceIds: answer.evidenceIds ?? null,
        }
      : null,
  );
}
function validDraft(value: AnswerDraft): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.responseId === 'string' &&
    !!value.responseId.trim() &&
    typeof value.questionSha256 === 'string' &&
    typeof value.sourceBasis === 'string' &&
    (value.acceptedBasis === undefined || typeof value.acceptedBasis === 'string') &&
    Object.hasOwn(labels, value.choice) &&
    typeof value.evidence === 'string' &&
    typeof value.note === 'string' &&
    (value.evidenceIds === undefined ||
      (Array.isArray(value.evidenceIds) && value.evidenceIds.every((id) => typeof id === 'string')))
  );
}

export default function QuestionAnswerCard({
  workspace,
  question,
  answer,
  dossierId,
  respondedBy,
  locked,
  index,
  themeLabel,
  evidence,
  updateAnswer,
  onUpdate,
  addScenario,
}: {
  workspace: WorkspaceState;
  question: Question;
  answer?: WorkspaceAnswer;
  dossierId?: string;
  respondedBy: string;
  locked: boolean;
  index: number;
  themeLabel: string;
  evidence: Evidence[];
  updateAnswer: (answer: WorkspaceAnswer) => boolean;
  onUpdate: (patch: WorkspacePatch) => boolean;
  addScenario: (question: Question) => void;
}) {
  const questionSha256 = questionHash(question);
  const currentBasis = answerBasis(answer);
  const canRestore = (value: AnswerDraft) =>
    validDraft(value) &&
    value.workspaceId === workspace.id &&
    value.questionId === question.id &&
    value.dossierId === (dossierId ?? null) &&
    value.questionSha256 === questionSha256 &&
    (!answer || value.responseId === answer.id) &&
    [value.sourceBasis, value.acceptedBasis].includes(currentBasis);
  // Accepted keystrokes change parent answers. Their source hash must not remount this bundle.
  const [storageBasis] = useState(() =>
    draftBase({ questionSha256, dossierId: dossierId ?? null }),
  );
  const [draft, setDraft, draftStatus] = usePersistentDraft<AnswerDraft>(
    `${workspace.id}/question-answer/${dossierId ? `dossier/${encodeURIComponent(dossierId)}` : 'unscoped'}/${encodeURIComponent(question.id)}`,
    () => ({
      workspaceId: workspace.id,
      questionId: question.id,
      dossierId: dossierId ?? null,
      responseId: answer?.id ?? crypto.randomUUID(),
      questionSha256,
      choice: answer?.choice ?? 'unknown',
      evidence: answer?.evidence ?? '',
      note: answer?.note ?? '',
      ...(answer?.evidenceIds !== undefined ? { evidenceIds: answer.evidenceIds } : {}),
      sourceBasis: currentBasis,
    }),
    storageBasis,
    canRestore,
  );
  const [error, setError] = useState('');
  const sourceChanged = !canRestore(draft);
  const disabled = locked || !respondedBy.trim() || sourceChanged;
  const commit = (
    patch: Partial<Pick<AnswerDraft, 'choice' | 'evidence' | 'note' | 'evidenceIds'>>,
  ) => {
    if (disabled) return;
    const next = { ...draft, ...patch, sourceBasis: currentBasis, acceptedBasis: undefined };
    // The exact input is durable as a concept before workspace validation can reject it.
    setDraft(next);
    const response: WorkspaceAnswer = {
      ...answer,
      id: answer?.id ?? next.responseId,
      questionId: question.id,
      dossierId,
      respondedBy: respondedBy.trim(),
      choice: next.choice,
      evidence: next.evidence,
      note: next.note,
      ...(next.evidenceIds !== undefined ? { evidenceIds: next.evidenceIds } : {}),
      ...(dossierId ? { questionSha256 } : {}),
      answeredAt: new Date().toISOString(),
      questionSnapshot: question.prompt,
      sourceIds: question.sourceIds,
      contentVersion:
        question.definition?.version ??
        ('version' in question && typeof question.version === 'string'
          ? question.version
          : builtinQuestions.some((builtin) => builtin.id === question.id)
            ? 'IMA-catalogus-2.0.0'
            : 'bronversie-niet-vastgelegd'),
    };
    try {
      if (!updateAnswer(response))
        throw new Error(
          'Vastleggen geweigerd. Het volledige antwoordconcept blijft behouden. Verkort of corrigeer de invoer en probeer opnieuw.',
        );
      setDraft({ ...next, acceptedBasis: answerBasis(response) });
      draftStatus.clear(); // Cleared only after the exact queued main-workspace save succeeds.
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const pending =
    draft.choice !== (answer?.choice ?? 'unknown') ||
    draft.evidence !== (answer?.evidence ?? '') ||
    draft.note !== (answer?.note ?? '') ||
    JSON.stringify(draft.evidenceIds) !== JSON.stringify(answer?.evidenceIds);
  return (
    <section className="panel question-card">
      <div className="question-title">
        <span className="question-number">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <small>{themeLabel}</small>
          <h3>{question.prompt}</h3>
        </div>
        {answer && <CheckCircle2 size={17} className="green-text" />}
      </div>
      <DraftNotice status={draftStatus} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {pending && (
        <p className="warning-line">
          Dit antwoordconcept is nog niet vastgelegd. Het opgeslagen antwoord blijft beschikbaar.
          Vul bewust de respondent in voordat je de invoer corrigeert of vastlegt.
        </p>
      )}
      {sourceChanged && (
        <p role="alert">
          Het opgeslagen antwoord of de vraagbasis is gewijzigd. Het concept blijft behouden.
          Controleer beide versies voordat je verdergaat.
          <button
            type="button"
            className="secondary"
            disabled={locked || !respondedBy.trim()}
            onClick={() =>
              setDraft({
                ...draft,
                responseId: answer?.id ?? draft.responseId,
                questionSha256,
                sourceBasis: currentBasis,
                acceptedBasis: undefined,
              })
            }
          >
            Concept bij actueel antwoord herbevestigen
          </button>
        </p>
      )}
      <div className="answer-options">
        {Object.entries(labels).map(([choice, label]) => (
          <button
            key={choice}
            className={draft.choice === choice ? `chosen ${choice}` : ''}
            disabled={disabled}
            onClick={() => commit({ choice: choice as WorkspaceAnswer['choice'] })}
          >
            {label}
          </button>
        ))}
      </div>
      <details>
        <summary>Toetsingsrichting &amp; bewijs</summary>
        <p>{question.assessmentGuidance}</p>
        <ul>
          {question.evidenceHints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
        <p className="caption">Bronroutes: {question.sourceIds.join(', ')}</p>
        {question.legalReferences && (
          <p>Normen / verwijzingen uit de private bron: {question.legalReferences}</p>
        )}
      </details>
      <div className="form-grid">
        <Field label="Bewijs / waarneming">
          <textarea
            rows={2}
            disabled={disabled}
            value={draft.evidence}
            onChange={(event) => commit({ evidence: event.target.value })}
            placeholder="Bron, observatie, interview of meting…"
          />
        </Field>
        <Field label="Toelichting / vervolg">
          <textarea
            rows={2}
            disabled={disabled}
            value={draft.note}
            onChange={(event) => commit({ note: event.target.value })}
          />
        </Field>
      </div>
      {dossierId && !locked && (
        <MultiSelect
          label="Gekoppelde bewijsrecords"
          items={evidence.filter((record) => record.dossierId === dossierId)}
          values={draft.evidenceIds ?? []}
          onChange={(ids) => commit({ evidenceIds: ids })}
        />
      )}
      {answer && (
        <ResponseRelationsPanel
          workspace={workspace}
          answer={answer}
          dossierId={dossierId}
          questionId={question.id}
          respondedBy={respondedBy}
          onUpdate={onUpdate}
          disabled={locked || pending || sourceChanged}
        />
      )}
      {draft.choice === 'yes' && !draft.evidence && !draft.evidenceIds?.length && (
        <p className="warning-line">Antwoord ‘Ja’ is nog niet onderbouwd met bewijs.</p>
      )}
      <button className="text-link" onClick={() => addScenario(question)}>
        Werk een risicoscenario uit <ArrowRight size={14} />
      </button>
    </section>
  );
}
