import { useState } from 'react';
import type { Scenario } from '../domain/types';
import { captureRiskAssessment, type RiskAssessment } from '../data/risk-history';
import { RISK_METHOD_VERSION } from '../domain/risk';
import { Field } from './Primitives';

export function riskAssessmentMarkdown(records: RiskAssessment[]): string[] {
  if (!records.length) return [];
  return [
    '',
    '## Vastgelegde risicobeoordelingen',
    '',
    ...records.flatMap((r) => [
      `### ${r.input.title} [${r.id}]`,
      `Scenario: ${r.scenarioId} | ${r.recordedAt} | beoordelaar ${r.assessor} | methode ${r.methodVersion}`,
      `Onderbouwing: ${r.rationale}`,
      `Scope: ${r.input.department} | dossier ${r.input.dossierId ?? 'Werkruimtebreed'}`,
      `Vastgelegd uitgangsscenario: ${r.input.description} | gevaar ${r.input.hazard} | gevolg ${r.input.consequence}`,
      `Uitgangsfactoren: W=${r.input.probability}, B=${r.input.exposure}, E=${r.input.effect}`,
      `Huidige score: ${r.result.current.value} [${r.result.current.min}, ${r.result.current.max}] | prognose ${r.result.target.value} [${r.result.target.min}, ${r.result.target.max}]`,
      ...r.input.controls.map(
        (c) =>
          `Maatregel ${c.title} [${c.id}]: ${c.status}/${c.evidence}, AHS ${c.ahs} | mechanisme ${c.rationale} | bewijs ${c.evidenceNote}`,
      ),
      ...(r.result.lopaFrequency
        ? [
            `LOPA: ${r.result.lopaFrequency.value}/jaar [${r.result.lopaFrequency.min}, ${r.result.lopaFrequency.max}] | criterium ${r.input.lopa?.targetFrequency}/jaar | ${r.result.lopaComparison} | basis ${r.input.lopa?.assumptions}`,
          ]
        : []),
      `SHA256: ${r.sha256}`,
      '',
    ]),
  ];
}
export default function RiskAssessmentPanel({
  scenario,
  records,
  onSave,
}: {
  scenario: Scenario;
  records: RiskAssessment[];
  onSave: (record: RiskAssessment) => boolean;
}) {
  const [assessor, setAssessor] = useState(''),
    [rationale, setRationale] = useState(''),
    [error, setError] = useState('');
  return (
    <section className="panel risk-assessment-history">
      <h2>Beoordelingsmomenten bewaren</h2>
      <p>
        Bewaar de volledige invoer, bronverwijzingen, werking, methode en uitkomst op een bewust
        beoordelingsmoment. Latere scenarioaanpassingen wijzigen deze vastlegging niet.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const record = captureRiskAssessment(scenario, assessor, rationale);
            if (!onSave(record))
              throw new Error('De beoordeling is niet opgeslagen. Je invoer blijft beschikbaar.');
            setRationale('');
            setError('');
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Opslaan mislukt.');
          }
        }}
      >
        <div className="form-grid">
          <Field label="Beoordelaar van dit moment">
            <input required value={assessor} onChange={(e) => setAssessor(e.target.value)} />
          </Field>
          <Field label="Onderbouwing van deze vastlegging">
            <textarea required value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </Field>
        </div>
        {error && (
          <p role="alert" className="warning-line">
            {error}
          </p>
        )}
        <button className="secondary" type="submit">
          Beoordelingsmoment vastleggen
        </button>
      </form>
      {records
        .slice()
        .reverse()
        .map((record) => (
          <details className="registry-item" key={record.id}>
            <summary>
              {new Date(record.recordedAt).toLocaleString('nl-NL')} · {record.assessor} · huidige
              score {record.result.current.value}
            </summary>
            <p>{record.rationale}</p>
            <p>
              Methode {record.methodVersion} · SHA256 {record.sha256}
            </p>
            {record.methodVersion !== RISK_METHOD_VERSION && (
              <p className="warning-line">
                Deze methodeversie wordt hier niet opnieuw berekend. De oorspronkelijke invoer en
                uitkomst blijven bewaard voor beoordeling.
              </p>
            )}
            <p>
              Huidig {record.result.current.min}–{record.result.current.max}; prognose{' '}
              {record.result.target.min}–{record.result.target.max}
            </p>
            <details>
              <summary>Volledige historische invoer en uitkomst</summary>
              <pre className="private-record">{JSON.stringify(record, null, 2)}</pre>
            </details>
          </details>
        ))}
    </section>
  );
}
