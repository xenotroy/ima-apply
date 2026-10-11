import { useState } from 'react';
import type { Scenario } from '../domain/types';
import type { RiskEvidenceReview, RiskTarget, RiskTargetKind } from '../domain/risk-evidence-types';
import { captureRiskEvidenceReview } from '../data/risk-evidence';
import { evidenceFileIntegrityReady } from '../data/evidence-files';
import { useRiskEvidence } from './RiskEvidenceContext';
import { Field } from './Primitives';

/** Stored with the parent's complete form concept, never separately committed. */
export interface RiskReviewDraft {
  evidenceIds: string[];
  reviewedBy: string;
  rationale: string;
}
export default function RiskEvidenceReviewFields({
  scenario,
  target,
  kind,
  draft,
  onDraftChange,
  onReview,
  disabled = false,
}: {
  scenario: Scenario;
  target: RiskTarget;
  kind: RiskTargetKind;
  draft?: RiskReviewDraft;
  disabled?: boolean;
  onDraftChange: (draft: RiskReviewDraft) => void;
  onReview: (review: RiskEvidenceReview) => void;
}) {
  const { evidence, context } = useRiskEvidence();
  const [error, setError] = useState('');
  const value = draft ?? {
    evidenceIds: target.evidenceReview?.bindings.map((b) => b.evidenceId) ?? [],
    reviewedBy: '',
    rationale: '',
  };
  const available = evidence.filter(
    (record) => !record.dossierId || record.dossierId === scenario.dossierId,
  );
  const set = (patch: Partial<RiskReviewDraft>) => onDraftChange({ ...value, ...patch });
  return (
    <fieldset className="panel risk-evidence-review">
      <legend>Bewijsversies voor deze werking</legend>
      <p className="caption">
        Bevestig welke beoordeelde bewijsversies de lokale aannames onderbouwen. Gewijzigd bewijs,
        PFD, reductie of scenarioafbakening vraagt een nieuwe bevestiging.
      </p>
      {target.evidenceReview && (
        <p className="caption">
          Vorige bevestiging: {target.evidenceReview.reviewedBy} ·{' '}
          {target.evidenceReview.reviewedAt} · {target.evidenceReview.subjectBasisSha256}
        </p>
      )}
      <div className="check-grid">
        {available.map((record) => (
          <label key={record.id}>
            <input
              type="checkbox"
              checked={value.evidenceIds.includes(record.id)}
              onChange={(event) =>
                set({
                  evidenceIds: event.target.checked
                    ? [...value.evidenceIds, record.id]
                    : value.evidenceIds.filter((id) => id !== record.id),
                })
              }
            />
            {record.title} ·{' '}
            {record.status === 'verified' ? 'inhoudelijk beoordeeld' : 'nog te beoordelen'}
          </label>
        ))}
      </div>
      {!available.length && <p>Leg eerst passend bewijs vast bij Organisatie & dossiers.</p>}
      <div className="form-grid">
        <Field label="Beoordelaar van de maatregelwerking">
          <input
            value={value.reviewedBy}
            onChange={(event) => set({ reviewedBy: event.target.value })}
          />
        </Field>
        <Field label="Onderbouwing bij deze bewijsversies">
          <textarea
            value={value.rationale}
            onChange={(event) => set({ rationale: event.target.value })}
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="secondary"
        disabled={disabled}
        onClick={() => {
          try {
            const selected = value.evidenceIds.map((id) => {
              const record = available.find((candidate) => candidate.id === id);
              if (!record)
                throw new Error('Een gekozen bewijs bestaat niet meer binnen deze scope.');
              if (record.file && !evidenceFileIntegrityReady(record, context))
                throw new Error(
                  'Controleer het gekozen bewijsbestand in deze sessie voordat je de werking bevestigt.',
                );
              return record;
            });
            onReview(
              captureRiskEvidenceReview(
                scenario,
                kind,
                { ...target, evidence: 'verified' },
                selected,
                value.reviewedBy,
                value.rationale,
              ),
            );
            setError('');
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        }}
      >
        Bewijsversies bij deze werking bevestigen
      </button>
    </fieldset>
  );
}
