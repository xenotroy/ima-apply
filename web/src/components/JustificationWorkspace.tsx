import { useEffect, useMemo, useState } from 'react';
import type { RiskAssessment } from '../data/risk-history';
import {
  captureJustification,
  JUSTIFICATION_DECISIONS,
  justificationMarkdown,
  justificationResult,
  type JustificationDraft,
  type JustificationRecord,
} from '../data/justification';
import { Field } from './Primitives';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import DraftNotice from './DraftNotice';

const number = (value: number) =>
  new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 4 }).format(value);
const initialDraft: JustificationDraft = {
  selectionKind: 'control',
  controlIds: [],
  costBasis: '',
  costFactor: 1,
  degreeOfCorrectionFactor: 1,
  kinneyCostDivisor: 1,
  decision: 'review_required',
  assessor: '',
  rationale: '',
};

export default function JustificationWorkspace({
  scenarioId,
  workspaceId,
  assessments,
  records,
  onSave,
}: {
  scenarioId: string;
  workspaceId: string;
  assessments: RiskAssessment[];
  records: JustificationRecord[];
  onSave: (record: JustificationRecord) => boolean;
}) {
  const scoped = assessments.filter((item) => item.scenarioId === scenarioId);
  const [form, setForm, draftStatus] = usePersistentDraft(
    `${workspaceId}/justification/${scenarioId}`,
    () => ({
      assessmentId: scoped.at(-1)?.id ?? '',
      draft: structuredClone(initialDraft),
    }),
  );
  const { assessmentId, draft } = form;
  const setAssessmentId = (assessmentId: string) =>
    setForm((previous) => ({ ...previous, assessmentId }));
  const setDraft = (change: (draft: JustificationDraft) => JustificationDraft) =>
    setForm((previous) => ({ ...previous, draft: change(previous.draft) }));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!assessmentId && scoped.length) setAssessmentId(scoped.at(-1)!.id);
  }, [assessmentId, scoped.length]);
  const assessment = scoped.find((item) => item.id === assessmentId);
  const plans = assessment?.input.controls.filter((control) => control.status === 'planned') ?? [];
  const preview = useMemo(() => {
    if (!assessment) return { error: 'Kies een bewaard beoordelingsmoment.' };
    try {
      return { result: justificationResult(assessment, draft) };
    } catch (caught) {
      return { error: caught instanceof Error ? caught.message : 'Berekening niet beschikbaar.' };
    }
  }, [assessment, draft]);
  const change = <K extends keyof JustificationDraft>(key: K, value: JustificationDraft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  return (
    <section className="panel justification-workspace">
      <h2>Maatregeljustificatie vastleggen</h2>
      <p>
        Vergelijk één gekozen maatregel of een expliciet pakket met de huidige situatie van een
        bewaard beoordelingsmoment. Andere plannen leveren geen voordeel aan deze keuze.
        Kostenratings, AHS en eenvoudig haalbare uitvoering veranderen de fysieke werking niet.
      </p>
      {!scoped.length ? (
        <p className="warning-line">
          Bewaar eerst een beoordelingsmoment met de geplande maatregelen. Daarna kun je hun
          marginale scorewerking, kostenbasis en een afzonderlijk besluit vastleggen.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              if (!assessment)
                throw new Error('Het gekozen beoordelingsmoment is niet beschikbaar.');
              const record = captureJustification(assessment, draft);
              if (!onSave(record))
                throw new Error(
                  'De justificatie is niet opgeslagen. Je invoer blijft beschikbaar; controleer de bronbeoordeling.',
                );
              setError('');
              draftStatus.clear();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Opslaan mislukt.');
            }
          }}
        >
          <DraftNotice status={draftStatus} />
          {assessmentId && !assessment && (
            <p role="alert">
              De bronbeoordeling van dit concept ontbreekt. Bewaar het concept via Rapportage
              voordat je een andere bron kiest.
            </p>
          )}
          <div className="form-grid">
            <Field label="Bronbeoordeling voor justificatie">
              <select
                value={assessmentId}
                onChange={(event) => {
                  setAssessmentId(event.target.value);
                  change('controlIds', []);
                  setError('');
                }}
              >
                {scoped.map((item) => (
                  <option key={item.id} value={item.id}>
                    {new Date(item.recordedAt).toLocaleString('nl-NL')} · {item.assessor} ·{' '}
                    {item.input.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Soort maatregelkeuze">
              <select
                value={draft.selectionKind}
                onChange={(event) => {
                  change(
                    'selectionKind',
                    event.target.value as JustificationDraft['selectionKind'],
                  );
                  change('controlIds', []);
                }}
              >
                <option value="control">Eén maatregel</option>
                <option value="portfolio">Expliciet maatregelenpakket</option>
              </select>
            </Field>
          </div>
          {draft.selectionKind === 'control' ? (
            <Field label="Gekozen geplande maatregel">
              <select
                required
                value={draft.controlIds[0] ?? ''}
                onChange={(event) =>
                  change('controlIds', event.target.value ? [event.target.value] : [])
                }
              >
                <option value="">Kies een maatregel uit deze bronbeoordeling</option>
                {plans.map((control) => (
                  <option key={control.id} value={control.id}>
                    {control.title}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <fieldset>
              <legend>Gekozen geplande maatregelen</legend>
              {plans.map((control) => (
                <label className="checkbox" key={control.id}>
                  <input
                    type="checkbox"
                    checked={draft.controlIds.includes(control.id)}
                    onChange={(event) =>
                      change(
                        'controlIds',
                        event.target.checked
                          ? [...draft.controlIds, control.id]
                          : draft.controlIds.filter((id) => id !== control.id),
                      )
                    }
                  />
                  {control.title}
                </label>
              ))}
            </fieldset>
          )}
          {!plans.length && (
            <p className="warning-line">
              Deze bronbeoordeling bevat geen geplande maatregelen. Bewaar een nieuw
              beoordelingsmoment nadat je het plan hebt toegevoegd.
            </p>
          )}
          <div className="form-grid">
            <Field
              label="Fine-kostenfactor CF"
              hint="Historische ordinale kostenrating; leg de lokale kalibratie hieronder vast."
            >
              <input
                required
                type="number"
                min="0.000001"
                step="any"
                value={draft.costFactor}
                onChange={(event) => change('costFactor', Number(event.target.value))}
              />
            </Field>
            <Field
              label="Fine-correctierating DC"
              hint="Een historische correctierating, geen reductiepercentage."
            >
              <input
                required
                type="number"
                min="0.000001"
                step="any"
                value={draft.degreeOfCorrectionFactor}
                onChange={(event) => change('degreeOfCorrectionFactor', Number(event.target.value))}
              />
            </Field>
            <Field
              label="Kinney-kostendeler"
              hint="Een afzonderlijke lokale schaal; kostenbedragen zijn geen directe rating."
            >
              <input
                required
                type="number"
                min="0.000001"
                step="any"
                value={draft.kinneyCostDivisor}
                onChange={(event) => change('kinneyCostDivisor', Number(event.target.value))}
              />
            </Field>
            <Field label="Besluit over deze maatregelkeuze">
              <select
                value={draft.decision}
                onChange={(event) =>
                  change('decision', event.target.value as JustificationDraft['decision'])
                }
              >
                {Object.entries(JUSTIFICATION_DECISIONS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="Kostenbasis en ratingkalibratie"
            hint="Beschrijf bijvoorbeeld investering, onderhoud, periode, valuta en de vertaling naar CF, DC en kostendeler."
          >
            <textarea
              required
              value={draft.costBasis}
              onChange={(event) => change('costBasis', event.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Beoordelaar van de justificatie">
              <input
                required
                value={draft.assessor}
                onChange={(event) => change('assessor', event.target.value)}
              />
            </Field>
            <Field label="Onderbouwing van het justificatiebesluit">
              <textarea
                required
                value={draft.rationale}
                onChange={(event) => change('rationale', event.target.value)}
              />
            </Field>
          </div>
          {preview.result ? (
            <div className="justification-preview" aria-live="polite">
              <h3>Uitsluitend de gekozen plannen</h3>
              <p>
                Huidige score {number(preview.result.current.value)} → gekozen prognose{' '}
                {number(preview.result.selectedTarget.value)}.
              </p>
              <p>
                Getekende scoreverbetering {number(preview.result.improvement.value)};
                gevoeligheidsgrenzen {number(preview.result.improvement.min)} tot{' '}
                {number(preview.result.improvement.max)}.
              </p>
              <p>
                Fine J = R / (CF × DC): {number(preview.result.fine)}. Kinney J = R × nominale
                scoreverbeteringsfractie / kostendeler:{' '}
                {preview.result.kinneyExpected === undefined
                  ? 'niet bevestigd'
                  : number(preview.result.kinneyExpected)}
                .
              </p>
              <p>
                Kinney conservatieve ondergrens:{' '}
                {preview.result.kinneyConservative === undefined
                  ? 'niet bevestigd'
                  : number(preview.result.kinneyConservative)}
                . Dit interval beschrijft modelaannames; het is geen gemeten ongevalsreductie.
              </p>
              {preview.result.status === 'unconfirmed' && (
                <p className="warning-line">
                  Maatregelwerking niet bevestigd door deze vergelijking. Het besluit kan als
                  onderzoeksbesluit worden bewaard.
                </p>
              )}
              {preview.result.warnings.map((warning, index) => (
                <p className="caption" key={index}>
                  {warning}
                </p>
              ))}
              {preview.result.localPriorities.map((item) => (
                <p className="caption" key={item.controlId}>
                  Afzonderlijke lokale uitvoeringsprioriteit voor {item.title}: {number(item.score)}
                  ; AHS ×{item.hierarchyWeight}, haalbaarheid ×{item.feasibilityMultiplier}.{' '}
                  {item.mandatory
                    ? 'Verplicht gemarkeerd: uitvoering gaat vóór optionele rangschikking.'
                    : ''}
                </p>
              ))}
            </div>
          ) : (
            <p className="caption">{preview.error}</p>
          )}
          {error && (
            <p className="warning-line" role="alert">
              {error}
            </p>
          )}
          <button className="secondary" type="submit" disabled={!preview.result}>
            Justificatiebesluit vastleggen
          </button>
          <p className="caption">
            Een nieuwe vastlegging bewaart ratings en besluit bij de bronhash. Eerdere besluiten
            blijven beschikbaar. Uitvoering en effectcontrole verlopen afzonderlijk via het plan van
            aanpak.
          </p>
        </form>
      )}
      {records
        .filter((record) => record.scenarioId === scenarioId)
        .slice()
        .reverse()
        .map((record) => (
          <details className="registry-item justification-record" key={record.id}>
            <summary>
              {new Date(record.recordedAt).toLocaleString('nl-NL')} ·{' '}
              {JUSTIFICATION_DECISIONS[record.decision]} · {record.assessor}
            </summary>
            <p>{record.rationale}</p>
            <p>Kostenbasis: {record.costBasis}</p>
            <p>
              Gekozen maatregel-ID’s: {record.controlIds.join(', ')}. Bronbeoordeling{' '}
              {record.riskAssessmentId}.
            </p>
            <p>
              Huidige score {number(record.result.current.value)} → gekozen prognose{' '}
              {number(record.result.selectedTarget.value)}; getekende verbetering{' '}
              {number(record.result.improvement.value)} [{number(record.result.improvement.min)},{' '}
              {number(record.result.improvement.max)}].
            </p>
            <p>
              Fine CF {record.costFactor}, DC {record.degreeOfCorrectionFactor}; Kinney-kostendeler{' '}
              {record.kinneyCostDivisor}.
            </p>
            <p>Beoordelings-SHA256: {record.assessmentSha256}</p>
            <p>Justificatie-SHA256: {record.sha256}</p>
            <details>
              <summary>Volledige historische justificatie</summary>
              <pre className="private-record">{justificationMarkdown([record]).join('\n')}</pre>
            </details>
          </details>
        ))}
    </section>
  );
}
