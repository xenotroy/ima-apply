import { useEffect, useState } from 'react';
import { WorkspaceJournal, type WorkspaceJournalEntry } from '../data/workspace-journal';
import { exportWorkspace } from '../data/validation';
import {
  browserDrafts,
  DRAFT_CHANGE_EVENT,
  localDraftsMarkdown,
  LocalDraftStore,
  forgetUnstoredDraft,
  type LocalDraft,
} from '../data/local-drafts';

function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function DraftRecoveryPanel({ workspaceId }: { workspaceId: string }) {
  const [, rerender] = useState(0);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    const changed = () => rerender((value) => value + 1);
    window.addEventListener(DRAFT_CHANGE_EVENT, changed);
    window.addEventListener('storage', changed);
    return () => {
      window.removeEventListener(DRAFT_CHANGE_EVENT, changed);
      window.removeEventListener('storage', changed);
    };
  }, []);
  let drafts: LocalDraft[] = [],
    pending: WorkspaceJournalEntry[] = [],
    error = '';
  try {
    drafts = browserDrafts(workspaceId);
  } catch (cause) {
    error = String(cause);
  }
  try {
    pending = new WorkspaceJournal(localStorage).list();
  } catch (cause) {
    error += ' ' + String(cause);
  }
  return (
    <section className="panel no-print" aria-label="Formulierconcepten">
      <h2>Herstelbare formulierconcepten</h2>
      <p>
        Open hetzelfde formulier om een lokaal concept te herstellen. Deze concepten zijn nog geen
        vastgelegde dossiergegevens. Bewaar ze met Markdown; leg ze vast voordat je de werkruimte
        naar een andere pc synchroniseert.
      </p>
      {error && (
        <p role="alert">
          Concepten konden niet volledig worden gelezen: {error}. De opgeslagen gegevens blijven
          behouden.
        </p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
      <p>{drafts.length} concepten voor deze werkruimte.</p>
      {pending.length > 0 && (
        <>
          <h3>Tussentijdse werkruimten</h3>
          <p>
            Een herstelkopie met een andere opslagversie wordt niet automatisch over je huidige werk
            gezet. Exporteer de volledige versie en vergelijk deze voordat je haar importeert.
          </p>
          {pending.map((entry) => (
            <div key={entry.id}>
              <span>
                {entry.workspace.name} · revisie {entry.workspace.revision} ·{' '}
                {new Date(entry.savedAt).toLocaleString('nl-NL')}{' '}
              </span>
              <button
                className="secondary"
                onClick={() =>
                  download(
                    `ima-herstel-${entry.id}.json`,
                    exportWorkspace(entry.workspace),
                    'application/json',
                  )
                }
              >
                Herstelkopie exporteren
              </button>
            </div>
          ))}
        </>
      )}
      {drafts.length > 0 && (
        <>
          <button
            className="secondary"
            onClick={() =>
              download(
                'ima-interview-concepten.md',
                localDraftsMarkdown(drafts).join('\n'),
                'text/markdown',
              )
            }
          >
            Concepten naar Markdown
          </button>
          {drafts.map((draft) => (
            <details key={`${draft.key}/${draft.writer}`}>
              <summary>
                {draft.key.split('/').slice(1).join(' · ')} —{' '}
                {new Date(draft.savedAt).toLocaleString('nl-NL')}
              </summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(draft.value, null, 2)}</pre>
              <button
                className="secondary"
                onClick={() => {
                  try {
                    new LocalDraftStore(localStorage).remove(draft);
                    forgetUnstoredDraft(draft.key, draft.writer);
                    setActionError('');
                    window.dispatchEvent(new Event(DRAFT_CHANGE_EVENT));
                  } catch (cause) {
                    setActionError(
                      `Verwijderen is niet gelukt; het concept blijft bewaard. ${String(cause)}`,
                    );
                  }
                }}
              >
                Dit concept verwijderen
              </button>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
