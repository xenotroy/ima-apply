import type { WorkspaceRecord } from '../data/model';
import { migrationWarningCounts, readMigrationReviews } from '../data/migration-review';

const labels: Record<string, string> = {
  assumed_utc: 'Tijdzones: expliciet als UTC geïnterpreteerd',
  sqlite_question_not_historically_frozen:
    'Historische vraagversie ontbreekt; vraag bij export bevroren',
  legacy_rating_not_kinney: 'Oude ratings vereisen nieuwe risicobeoordeling',
  legacy_control_raw_only: 'Oude maatregelratings volledig raw; werking niet afgeleid',
};
const warningLabel = (code: string) => (Object.hasOwn(labels, code) ? labels[code] : code);

export default function MigrationReviewPanel({ sources }: { sources: WorkspaceRecord[] }) {
  const reviews = readMigrationReviews(sources);
  if (!reviews.length) return null;
  return (
    <section className="panel" aria-label="Migratiereview">
      <h2>Migratieconcept: menselijke controle vereist</h2>
      <p>
        Controleer de migratieregels, aantallen en elke waarschuwing tegen de oorspronkelijke
        gegevens. Deze export stelt geen inhoudelijke beoordeling, historische vraagversie of
        effectiviteit vast.
      </p>
      {reviews.map((review) => (
        <article key={review.sourceId}>
          <p className="caption">Reviewbron: {review.sourceId}</p>
          {!review.report ? (
            <p className="error" role="alert">
              {review.error}
            </p>
          ) : (
            <>
              <p>
                Nieuwe migratieprojectie:{' '}
                <time dateTime={review.report.migratedAt}>{review.report.migratedAt}</time>. Dit is
                geen oorspronkelijk beoordelingstijdstip.
              </p>
              <p>
                <strong>{review.report.warnings.length} waarschuwingen</strong> ·{' '}
                {review.report.counts.sources} bronrecords, inclusief deze reviewbron.
              </p>
              <p className="caption">
                {review.report.target}. De inhoudshash bevestigt consistentie binnen de export; dit
                is geen menselijke goedkeuring.
              </p>
              <ul>
                {Object.entries(labels).map(([code, label]) => (
                  <li key={code}>
                    {label}:{' '}
                    <strong>
                      {review.report.warnings.filter((warning) => warning.code === code).length}
                    </strong>
                  </li>
                ))}
              </ul>
              <details>
                <summary>
                  Alle waarschuwingstypen en aantallen (
                  {migrationWarningCounts(review.report).length})
                </summary>
                <ul>
                  {migrationWarningCounts(review.report).map(({ code, count }) => (
                    <li key={code}>
                      <code>{code}</code>: {count}
                    </li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Elke waarschuwing lezen ({review.report.warnings.length})</summary>
                <ol>
                  {review.report.warnings.map((warning, index) => (
                    <li key={`${warning.code}-${warning.sourceId}-${index}`}>
                      <p>
                        <strong>{warningLabel(warning.code)}</strong> · <code>{warning.code}</code>
                      </p>
                      <p>{warning.message}</p>
                      <p className="caption">
                        Bron-ID: <code>{warning.sourceId}</code>
                      </p>
                    </li>
                  ))}
                </ol>
              </details>
              <details>
                <summary>Migratieregels en alle recordaantallen</summary>
                <ul>
                  {review.report.rules.map((rule, index) => (
                    <li key={index}>{rule}</li>
                  ))}
                </ul>
                <dl>
                  {Object.entries(review.report.counts).map(([collection, count]) => (
                    <div key={collection}>
                      <dt>{collection}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
