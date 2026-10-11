import type { DraftStatus } from '../hooks/usePersistentDraft';
export default function DraftNotice({ status }: { status: DraftStatus }) {
  return (
    <>
      <p role={status.error ? 'alert' : 'status'} className={status.error ? 'error' : 'muted'}>
        {status.error ||
          (status.savedAt
            ? `${status.recovered ? 'Concept hersteld. ' : ''}Concept lokaal bewaard om ${new Date(status.savedAt).toLocaleTimeString('nl-NL')}.`
            : 'Tekstwijzigingen worden als lokaal concept bewaard. Vastleggen voegt ze toe aan je werkruimte.')}
      </p>
      {status.candidates.length > 1 && (
        <label className="field">
          <span>Kies een lokaal concept om te herstellen</span>
          <select
            aria-label="Kies een lokaal concept om te herstellen"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) status.restore(event.target.value);
            }}
          >
            <option value="">Selecteer bewust een versie</option>
            {status.candidates.map((draft) => (
              <option key={draft.writer} value={draft.writer}>
                {new Date(draft.savedAt).toLocaleString('nl-NL')} ·{' '}
                {JSON.stringify(draft.value).slice(0, 120)} · {draft.writer.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
