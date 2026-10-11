import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { BarChart3, Check, ClipboardList, Layers, Plus, Save, Search } from 'lucide-react';
import { departmentLabel, type Exposure, type Investigation } from '../data/dossier';
import type { WorkspacePatch, WorkspaceState } from '../data/model';
import { newId } from '../data/model';
import { calculateSafetyAnalytics } from '../data/analytics';
import { basisRiskFactorStatusLabels, freezeInvestigationBasisRiskFactors } from '../data/brf';
import BasisRiskFactorRegister from './BasisRiskFactorRegister';
import { draftBase } from '../data/local-drafts';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import DraftNotice from './DraftNotice';

interface Props {
  workspace: WorkspaceState;
  onUpdate: (patch: WorkspacePatch) => boolean;
}

type ExposureDraft = Omit<Exposure, 'hoursWorked'> & { hours: string };
type Page = 'investigations' | 'brf' | 'exposure' | 'analytics';
const number = (value: number | null) =>
  value === null ? 'Niet berekenbaar' : value.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
const cleanLines = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);
const toggleId = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function previousMonth(): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

function Lines({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint ?? 'Eén punt per regel.'}>
      <textarea
        rows={4}
        value={value.join('\n')}
        onChange={(event) => onChange(event.target.value.split('\n'))}
      />
    </Field>
  );
}

function newInvestigation(workspace: WorkspaceState): Investigation | null {
  const incident = workspace.incidents[0];
  if (!incident) return null;
  return {
    id: newId(),
    title: `Onderzoek — ${incident.title}`,
    incidentId: incident.id,
    method: 'five_whys',
    methodVersion: '1.0.0',
    status: 'draft',
    facts: incident.description,
    whyChain: ['', '', '', '', ''],
    topEvent: '',
    threats: [],
    preventiveBarriers: [],
    recoveryBarriers: [],
    consequences: [],
    basisRiskFactors: [],
    evidenceIds: [],
    actionIds: [],
    conclusion: '',
    reviewedBy: '',
    reviewNote: '',
  };
}

export default function LearningWorkspace({ workspace, onUpdate }: Props) {
  const [page, setPage] = useState<Page>('investigations');
  const [editing, setEditing] = useState<Investigation | 'new' | null>(null);
  const [editingExposure, setEditingExposure] = useState<Exposure | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [from, setFrom] = useState(previousMonth);
  const [through, setThrough] = useState(previousMonth);
  const [departmentId, setDepartmentId] = useState('');
  const [asOf, setAsOf] = useState(localToday);
  const investigations = workspace.investigations ?? [];
  const exposure = workspace.exposure ?? [];
  const departments = workspace.departments ?? [];
  const labelDepartment = (id: string) => {
    const department = departments.find((record) => record.id === id);
    return department
      ? departmentLabel(department, workspace.sites ?? [], workspace.organisations ?? [])
      : 'Onbekende afdeling';
  };
  const analysis = useMemo(() => {
    try {
      return {
        result: calculateSafetyAnalytics(workspace, { from, through, departmentId, asOf }),
        error: '',
      };
    } catch (reason) {
      return {
        result: null,
        error: reason instanceof Error ? reason.message : 'Controleer periode en scope.',
      };
    }
  }, [workspace, from, through, departmentId, asOf]);
  const clearMessages = () => {
    setMessage('');
    setError('');
  };
  const beginInvestigation = () => {
    clearMessages();
    setEditing('new');
  };
  const beginExposure = () => {
    clearMessages();
    setEditingExposure('new');
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ONDERZOEKEN · VERBINDEN · VOLGEN</div>
          <h1>
            Van gebeurtenis naar inzicht<span>.</span>
          </h1>
          <p>Bewaar onderzoeken en controleer trends met een passende periode en noemer.</p>
        </div>
      </div>
      <div className="button-row" role="group" aria-label="Incidentleren en analytics">
        {(
          [
            ['investigations', 'Onderzoeken', Search],
            ['brf', 'BRF-register', Layers],
            ['exposure', 'Gewerkte uren', ClipboardList],
            ['analytics', 'Trends & frequenties', BarChart3],
          ] as const
        ).map(([key, title, Icon]) => (
          <button
            key={key}
            className={page === key ? 'primary' : 'secondary'}
            aria-pressed={page === key}
            onClick={() => {
              setPage(key);
              clearMessages();
            }}
          >
            <Icon size={16} /> {title}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="rose-text">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="green-text">
          {message}
        </p>
      )}
      {page === 'brf' && <BasisRiskFactorRegister workspace={workspace} onUpdate={onUpdate} />}

      {page === 'investigations' && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Onderzoeksregister</h2>
              <button
                className="primary"
                disabled={!workspace.incidents.length}
                onClick={beginInvestigation}
              >
                <Plus size={16} /> Onderzoek beginnen
              </button>
            </div>
            {!workspace.incidents.length && (
              <p>Registreer eerst een incident of signaal om een onderzoek te koppelen.</p>
            )}
            {workspace.incidents.length > 0 && !investigations.length && (
              <p>Er zijn nog geen opgeslagen onderzoeken.</p>
            )}
            <div className="button-row">
              {investigations.map((record) => (
                <button
                  key={record.id}
                  className={
                    editing !== 'new' && editing?.id === record.id ? 'primary' : 'secondary'
                  }
                  onClick={() => {
                    setEditing(structuredClone(record));
                    clearMessages();
                  }}
                >
                  {record.title} · {record.status === 'reviewed' ? 'Beoordeeld' : 'Concept'}
                </button>
              ))}
            </div>
          </section>
          {editing && (
            <InvestigationEditor
              key={editing === 'new' ? 'new' : editing.id}
              workspace={workspace}
              original={editing === 'new' ? undefined : editing}
              onUpdate={onUpdate}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                setMessage('Onderzoek opgeslagen.');
              }}
            />
          )}
        </>
      )}

      {page === 'exposure' && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Urenbronnen</h2>
              <button className="primary" onClick={beginExposure}>
                <Plus size={16} /> Maanduren vastleggen
              </button>
            </div>
            <p>
              Leg per hele kalendermaand de werkelijk gewerkte uren en bron vast. Kies de hele
              werkruimte of één stabiele afdeling.
            </p>
            <p className="caption">
              Een werkruimtebron omvat de gehele scope. Afdelingsuren worden niet bij die bron
              opgeteld en vormen ook geen automatisch werkruimtetotaal.
            </p>
            {!exposure.length && (
              <p>Er zijn nog geen urenbronnen. Incidentfrequenties blijven dan onbekend.</p>
            )}
            {exposure.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Maand</th>
                      <th>Scope</th>
                      <th>Uren</th>
                      <th>Bron</th>
                      <th>Bewerken</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...exposure]
                      .sort(
                        (a, b) =>
                          b.period.localeCompare(a.period) ||
                          a.departmentId.localeCompare(b.departmentId),
                      )
                      .map((record) => (
                        <tr key={record.id}>
                          <td>{record.period}</td>
                          <td>
                            {record.departmentId
                              ? labelDepartment(record.departmentId)
                              : 'Hele werkruimte'}
                          </td>
                          <td>{number(record.hoursWorked)}</td>
                          <td>{record.source}</td>
                          <td>
                            <button
                              className="secondary"
                              onClick={() => {
                                setEditingExposure(structuredClone(record));
                                clearMessages();
                              }}
                            >
                              Bewerken
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {editingExposure && (
            <ExposureEditor
              key={editingExposure === 'new' ? 'new' : editingExposure.id}
              workspace={workspace}
              original={editingExposure === 'new' ? undefined : editingExposure}
              onUpdate={onUpdate}
              onClose={() => setEditingExposure(null)}
              onSaved={() => {
                setEditingExposure(null);
                setMessage('Urenbron opgeslagen.');
              }}
            />
          )}
        </>
      )}

      {page === 'analytics' && (
        <>
          <section className="panel">
            <h2>Periode en scope</h2>
            <div className="form-grid">
              <Field label="Van maand">
                <input
                  type="month"
                  required
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </Field>
              <Field label="Tot en met maand">
                <input
                  type="month"
                  required
                  value={through}
                  onChange={(event) => setThrough(event.target.value)}
                />
              </Field>
              <Field label="Scope">
                <select
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                >
                  <option value="">Hele werkruimte</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {labelDepartment(department.id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Peildatum">
                <input
                  type="date"
                  required
                  max={localToday()}
                  value={asOf}
                  onChange={(event) => setAsOf(event.target.value)}
                />
              </Field>
            </div>
            <p className="caption">
              Frequentie = aantal geclassificeerde incidenten / matching gewerkte uren × 1.000.000.
              Een lopende maand, onvolledige classificatie of ontbrekende uren wordt niet als nul
              gepresenteerd.
            </p>
          </section>
          {analysis.error && <p role="alert">{analysis.error}</p>}
          {analysis.result && (
            <>
              <section className="panel">
                <h2>Geselecteerde periode</h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: 20,
                  }}
                >
                  <div>
                    <span className="muted">Incidenten</span>
                    <h3>{analysis.result.incidents}</h3>
                  </div>
                  <div>
                    <span className="muted">Bijna-ongevallen</span>
                    <h3>{analysis.result.nearMisses}</h3>
                  </div>
                  <div>
                    <span className="muted">Waarnemingen</span>
                    <h3>{analysis.result.observations}</h3>
                  </div>
                  <div>
                    <span className="muted">Matching uren</span>
                    <h3>{number(analysis.result.hoursWorked)}</h3>
                    {!analysis.result.denominatorComplete && (
                      <small>
                        {number(analysis.result.reportedHours)} uur geregistreerd; dekking
                        onvolledig
                      </small>
                    )}
                  </div>
                  <div>
                    <span className="muted">Recordable / miljoen uur</span>
                    <h3>{number(analysis.result.recordableFrequencyRate)}</h3>
                  </div>
                  <div>
                    <span className="muted">Lost time / miljoen uur</span>
                    <h3>{number(analysis.result.lostTimeFrequencyRate)}</h3>
                  </div>
                </div>
                <p>
                  Bekende recordable incidenten: {analysis.result.recordableIncidents}; bekende
                  lost-time-incidenten: {analysis.result.lostTimeIncidents}; verzuimdagen:{' '}
                  {analysis.result.lostTimeDays === null
                    ? 'Onbekend'
                    : number(analysis.result.lostTimeDays)}
                  .
                </p>
                {(analysis.result.missingRecordableClassification > 0 ||
                  analysis.result.missingLostTimeClassification > 0) && (
                  <p>
                    Classificatie ontbreekt voor {analysis.result.missingRecordableClassification}{' '}
                    recordable-beoordeling(en) en {analysis.result.missingLostTimeClassification}{' '}
                    lost-time-beoordeling(en). Vul deze bij de incidentregistratie aan.
                  </p>
                )}
                {analysis.result.nonMatchingExposureRecords > 0 && (
                  <p className="caption">
                    {analysis.result.nonMatchingExposureRecords} urenrecord(s) uit andere scopes
                    zijn buiten deze noemer gehouden.
                  </p>
                )}
              </section>
              <section className="panel">
                <h2>Maandtrend</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Maand</th>
                        <th>Incidenten</th>
                        <th>Bijna-ongevallen</th>
                        <th>Uren</th>
                        <th>Recordable / mln uur</th>
                        <th>Lost time / mln uur</th>
                        <th>Datadekking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.result.months.map((month) => (
                        <tr key={month.period}>
                          <td>{month.period}</td>
                          <td>{month.incidents}</td>
                          <td>{month.nearMisses}</td>
                          <td>{number(month.hoursWorked)}</td>
                          <td>{number(month.recordableFrequencyRate)}</td>
                          <td>{number(month.lostTimeFrequencyRate)}</td>
                          <td>
                            {month.issues.length
                              ? month.issues.map((issue) => issue.message).join(' ')
                              : 'Periode, scope, uren en classificatie compleet'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="caption">
                  Aantallen zijn geregistreerde signalen. Een berekenbare frequentie bewijst geen
                  volledigheid van de meldcultuur of betere beheersing.
                </p>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

interface InvestigationSession {
  record: Investigation;
  loadedSource: string | null;
}
function InvestigationEditor({
  workspace,
  original,
  onUpdate,
  onClose,
  onSaved,
}: Props & {
  original?: Investigation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [session, setSession, draftStatus] = usePersistentDraft<InvestigationSession>(
    `${workspace.id}/investigation/${original?.id ?? 'new'}`,
    () => ({
      record: original ? structuredClone(original) : newInvestigation(workspace)!,
      loadedSource: original ? JSON.stringify(original) : null,
    }),
    original ? draftBase(original) : 'new/v1',
    (candidate) =>
      Boolean(original) ||
      !(workspace.investigations ?? []).some((record) => record.id === candidate.record.id),
  );
  const draft = session.record;
  const loadedSource = session.loadedSource;
  const investigations = workspace.investigations ?? [];
  const basisRiskFactorRecords = workspace.basisRiskFactorRecords ?? [];
  const [error, setError] = useState('');
  const clearMessages = () => setError('');
  const patchDraft = (patch: Partial<Investigation>, contentChange = true) => {
    setSession((current) => ({
      ...current,
      record: {
        ...current.record,
        ...(contentChange && current.record.status === 'reviewed'
          ? { status: 'draft' as const, reviewedBy: '', reviewNote: '' }
          : {}),
        ...(contentChange ? { basisRiskFactorSnapshots: undefined } : {}),
        ...patch,
      },
    }));
    clearMessages();
  };
  const saveInvestigation = (event: FormEvent) => {
    event.preventDefault();
    clearMessages();
    if (!draft) return;
    const current = investigations.find((record) => record.id === draft.id);
    if ((current ? JSON.stringify(current) : null) !== loadedSource) {
      setError(
        'Dit onderzoek is intussen gewijzigd. Open de opgeslagen versie opnieuw voordat je verder werkt.',
      );
      return;
    }
    const saved: Investigation = {
      ...draft,
      title: draft.title.trim(),
      facts: draft.facts.trim(),
      whyChain: cleanLines(draft.whyChain),
      topEvent: draft.topEvent.trim(),
      threats: cleanLines(draft.threats),
      preventiveBarriers: cleanLines(draft.preventiveBarriers),
      recoveryBarriers: cleanLines(draft.recoveryBarriers),
      consequences: cleanLines(draft.consequences),
      basisRiskFactors: cleanLines(draft.basisRiskFactors),
      conclusion: draft.conclusion.trim(),
      reviewedBy: draft.reviewedBy.trim(),
      reviewNote: draft.reviewNote.trim(),
    };
    if (
      saved.status === 'reviewed' &&
      (!saved.facts ||
        !saved.conclusion ||
        !saved.reviewedBy ||
        !saved.reviewNote ||
        !saved.evidenceIds.length ||
        (saved.method === 'five_whys' && !saved.whyChain.length) ||
        (saved.method === 'bow_tie' &&
          (!saved.topEvent || !saved.threats.length || !saved.consequences.length)))
    ) {
      setError(
        'Een beoordeeld onderzoek vraagt feiten, de uitgewerkte methode, gekoppeld bewijs, een conclusie, een beoordelaar en een reviewtoelichting.',
      );
      return;
    }
    try {
      if (saved.status === 'reviewed') {
        if (!(current?.status === 'reviewed' && saved.basisRiskFactorSnapshots)) {
          saved.basisRiskFactorSnapshots = freezeInvestigationBasisRiskFactors(
            saved,
            basisRiskFactorRecords,
          ).basisRiskFactorSnapshots;
        }
      } else delete saved.basisRiskFactorSnapshots;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'De BRF-versies konden niet worden bevroren.',
      );
      return;
    }
    const updated = current
      ? investigations.map((record) => (record.id === saved.id ? saved : record))
      : [...investigations, saved];
    if (!onUpdate({ investigations: updated })) {
      setError(
        'Opslaan is niet gelukt. Controleer de melding over dossiergegevens of opslag. Je concept blijft hier beschikbaar.',
      );
      return;
    }
    draftStatus.clear();
    onSaved();
  };

  return (
    <form className="panel" onSubmit={saveInvestigation}>
      <DraftNotice status={draftStatus} />
      {error && (
        <p role="alert" className="rose-text">
          {error}
        </p>
      )}
      <div className="panel-heading">
        <h2>{draft.method === 'five_whys' ? '5× Waarom' : 'BowTie'} — onderzoek</h2>
        <span className="muted">
          {draft.status === 'reviewed' ? 'Beoordeeld' : 'Concept'} · methodeversie{' '}
          {draft.methodVersion}
        </span>
      </div>
      <p className="caption">
        Je volledige invoer wordt lokaal als concept bewaard. Vastleggen maakt er een dossierrecord
        van. Een inhoudelijke wijziging vraagt een nieuwe review.
      </p>
      <div className="form-grid">
        <Field label="Titel">
          <input
            required
            value={draft.title}
            onChange={(event) => patchDraft({ title: event.target.value })}
          />
        </Field>
        <Field label="Gebeurtenis">
          <select
            required
            value={draft.incidentId}
            onChange={(event) => patchDraft({ incidentId: event.target.value })}
          >
            {workspace.incidents.map((incident) => (
              <option key={incident.id} value={incident.id}>
                {incident.date} · {incident.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Onderzoeksmethode">
          <select
            value={draft.method}
            onChange={(event) =>
              patchDraft({ method: event.target.value as Investigation['method'] })
            }
          >
            <option value="five_whys">5× Waarom</option>
            <option value="bow_tie">BowTie</option>
          </select>
        </Field>
      </div>
      <Field
        label="Feiten en afbakening"
        hint="Benoem wat werkelijk is waargenomen, door wie en binnen welke activiteit."
      >
        <textarea
          rows={4}
          value={draft.facts}
          onChange={(event) => patchDraft({ facts: event.target.value })}
        />
      </Field>
      {draft.method === 'five_whys' ? (
        <div className="analysis-template">
          <p>
            Onderbouw elke stap. Een waaromketen is een verklaringshypothese totdat het bewijs de
            verbinding ondersteunt.
          </p>
          {Array.from({ length: Math.max(5, draft.whyChain.length) }, (_, index) => (
            <Field key={index} label={`Waarom ${index + 1}`}>
              <textarea
                value={draft.whyChain[index] ?? ''}
                onChange={(event) => {
                  const chain = [...draft.whyChain];
                  while (chain.length <= index) chain.push('');
                  chain[index] = event.target.value;
                  patchDraft({ whyChain: chain });
                }}
              />
            </Field>
          ))}
        </div>
      ) : (
        <>
          <Field label="Top event — verlies van beheersing">
            <input
              value={draft.topEvent}
              onChange={(event) => patchDraft({ topEvent: event.target.value })}
            />
          </Field>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            <div>
              <Lines
                label="Dreigingen / oorzaken"
                value={draft.threats}
                onChange={(threats) => patchDraft({ threats })}
              />
              <Lines
                label="Preventieve barrières"
                value={draft.preventiveBarriers}
                onChange={(preventiveBarriers) => patchDraft({ preventiveBarriers })}
              />
            </div>
            <div>
              <Lines
                label="Gevolgen"
                value={draft.consequences}
                onChange={(consequences) => patchDraft({ consequences })}
              />
              <Lines
                label="Mitigerende / herstelbarrières"
                value={draft.recoveryBarriers}
                onChange={(recoveryBarriers) => patchDraft({ recoveryBarriers })}
              />
            </div>
          </div>
          <p className="caption">
            Beschrijf per barrière de werking, faalwijze en het passende bewijs. Het aantal
            barrières levert geen zelfstandig reductiepercentage op.
          </p>
        </>
      )}
      <Lines
        label="Onderliggende systeemcondities / basisrisicofactoren"
        value={draft.basisRiskFactors}
        onChange={(basisRiskFactors) => patchDraft({ basisRiskFactors })}
        hint="Gebruik eigen projectcodes met hun betekenis, één per regel. Motiveer de koppeling; deze codes zijn geen vastgestelde Tripod-taxonomie."
      />
      <fieldset>
        <legend>Beheerde BRF-definitieversies</legend>
        <p className="caption">
          Kies expliciet de gebruikte versie uit het lokale register en motiveer de verbinding in de
          conclusie. Een koppeling is geen oorzaakbewijs. Bij review wordt de volledige gebruikte
          definitie bevroren.
        </p>
        {!basisRiskFactorRecords.length && (
          <p className="muted">
            Leg eigen definities vast in het BRF-register. Bestaande vrije codes blijven hierboven
            bewaard.
          </p>
        )}
        {basisRiskFactorRecords.map((record) => (
          <label className="check-row" key={record.id}>
            <input
              type="checkbox"
              checked={draft.basisRiskFactorIds?.includes(record.id) ?? false}
              onChange={() =>
                patchDraft({
                  basisRiskFactorIds: toggleId(draft.basisRiskFactorIds ?? [], record.id),
                })
              }
            />
            <span>
              {record.code} · {record.title} @{record.version} ·{' '}
              {basisRiskFactorStatusLabels[record.status]}
            </span>
          </label>
        ))}
        {draft.basisRiskFactorSnapshots?.length ? (
          <details>
            <summary>Gebruikte definitieversies bij review</summary>
            {draft.basisRiskFactorSnapshots.map((snapshot) => (
              <p key={snapshot.record.id}>
                {snapshot.record.code} @{snapshot.record.version}: {snapshot.record.description}
                <br />
                Bron: {snapshot.record.sourceReference} · SHA256 {snapshot.sha256}
              </p>
            ))}
          </details>
        ) : null}
      </fieldset>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
        }}
      >
        <fieldset>
          <legend>Gekoppeld bewijs</legend>
          {!workspace.evidence?.length && (
            <p className="muted">
              Voeg bewijs toe in het dossier voordat je het onderzoek beoordeelt.
            </p>
          )}
          {(workspace.evidence ?? []).map((evidence) => (
            <label className="check-row" key={evidence.id}>
              <input
                type="checkbox"
                checked={draft.evidenceIds.includes(evidence.id)}
                onChange={() =>
                  patchDraft({ evidenceIds: toggleId(draft.evidenceIds, evidence.id) })
                }
              />
              <span>
                {evidence.title} ·{' '}
                {evidence.status === 'verified' ? 'Geverifieerd' : 'Niet geverifieerd'}
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Verbeteracties</legend>
          {!workspace.actions.length && (
            <p className="muted">Maak zo nodig een actie in het plan van aanpak.</p>
          )}
          {workspace.actions.map((action) => (
            <label className="check-row" key={action.id}>
              <input
                type="checkbox"
                checked={draft.actionIds.includes(action.id)}
                onChange={() => patchDraft({ actionIds: toggleId(draft.actionIds, action.id) })}
              />
              <span>
                {action.title} · {action.owner || 'Eigenaar ontbreekt'}
              </span>
            </label>
          ))}
        </fieldset>
      </div>
      <Field label="Conclusie, bewijs en beperkingen">
        <textarea
          rows={4}
          value={draft.conclusion}
          onChange={(event) => patchDraft({ conclusion: event.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Status">
          <select
            value={draft.status}
            onChange={(event) =>
              patchDraft({ status: event.target.value as Investigation['status'] }, false)
            }
          >
            <option value="draft">Concept</option>
            <option value="reviewed">Beoordeeld</option>
          </select>
        </Field>
        <Field label="Beoordelaar">
          <input
            value={draft.reviewedBy}
            onChange={(event) => patchDraft({ reviewedBy: event.target.value }, false)}
          />
        </Field>
      </div>
      <Field label="Reviewtoelichting">
        <textarea
          value={draft.reviewNote}
          onChange={(event) => patchDraft({ reviewNote: event.target.value }, false)}
        />
      </Field>
      <p className="caption">
        Een beoordeeld onderzoek vraagt feiten, een uitgewerkte methode, gekoppeld bewijs, een
        conclusie en een benoemde review. Risicoreductie wordt afzonderlijk in de risicowerkbank
        beoordeeld.
      </p>
      <div className="button-row">
        <button type="submit" className="primary">
          <Save size={16} /> Onderzoek opslaan
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Concept sluiten
        </button>
      </div>
    </form>
  );
}

interface ExposureSession {
  record: ExposureDraft;
  loadedExposure: string | null;
}
function ExposureEditor({
  workspace,
  original,
  onUpdate,
  onClose,
  onSaved,
}: Props & {
  original?: Exposure;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [session, setSession, draftStatus] = usePersistentDraft<ExposureSession>(
    `${workspace.id}/exposure/${original?.id ?? 'new'}`,
    () => ({
      record: original
        ? { ...structuredClone(original), hours: String(original.hoursWorked) }
        : { id: newId(), period: previousMonth(), departmentId: '', hours: '', source: '' },
      loadedExposure: original ? JSON.stringify(original) : null,
    }),
    original ? draftBase(original) : 'new/v1',
    (candidate) =>
      Boolean(original) ||
      !(workspace.exposure ?? []).some((record) => record.id === candidate.record.id),
  );
  const exposureDraft = session.record;
  const loadedExposure = session.loadedExposure;
  const setExposureDraft = (record: ExposureDraft) =>
    setSession((current) => ({ ...current, record }));
  const exposure = workspace.exposure ?? [];
  const departments = workspace.departments ?? [];
  const labelDepartment = (id: string) => {
    const department = departments.find((record) => record.id === id);
    return department
      ? departmentLabel(department, workspace.sites ?? [], workspace.organisations ?? [])
      : 'Onbekende afdeling';
  };
  const [error, setError] = useState('');
  const clearMessages = () => setError('');
  const saveExposure = (event: FormEvent) => {
    event.preventDefault();
    clearMessages();
    if (!exposureDraft) return;
    const current = exposure.find((record) => record.id === exposureDraft.id);
    if ((current ? JSON.stringify(current) : null) !== loadedExposure) {
      setError('Deze urenbron is intussen gewijzigd. Open het opgeslagen record opnieuw.');
      return;
    }
    const hours = Number(exposureDraft.hours);
    if (
      !exposureDraft.hours.trim() ||
      !Number.isFinite(hours) ||
      hours < 0 ||
      !exposureDraft.source.trim()
    ) {
      setError('Vul een expliciet aantal gewerkte uren en de bron voor deze hele maand in.');
      return;
    }
    if (
      exposure.some(
        (record) =>
          record.id !== exposureDraft.id &&
          record.period === exposureDraft.period &&
          record.departmentId === exposureDraft.departmentId,
      )
    ) {
      setError('Voor deze maand en scope staat al een urenbron. Bewerk dat bestaande record.');
      return;
    }
    const saved: Exposure = {
      id: exposureDraft.id,
      period: exposureDraft.period,
      departmentId: exposureDraft.departmentId,
      hoursWorked: hours,
      source: exposureDraft.source.trim(),
    };
    if (
      !onUpdate({
        exposure: current
          ? exposure.map((record) => (record.id === saved.id ? saved : record))
          : [...exposure, saved],
      })
    ) {
      setError('Opslaan is niet gelukt. Controleer de melding over brongegevens of opslag.');
      return;
    }
    draftStatus.clear();
    onSaved();
  };
  return (
    <form className="panel" onSubmit={saveExposure}>
      <DraftNotice status={draftStatus} />
      {error && (
        <p role="alert" className="rose-text">
          {error}
        </p>
      )}
      <h2>Gewerkte uren vastleggen</h2>
      <div className="form-grid">
        <Field label="Hele kalendermaand">
          <input
            required
            type="month"
            value={exposureDraft.period}
            onChange={(event) => setExposureDraft({ ...exposureDraft, period: event.target.value })}
          />
        </Field>
        <Field label="Scope">
          <select
            value={exposureDraft.departmentId}
            onChange={(event) =>
              setExposureDraft({ ...exposureDraft, departmentId: event.target.value })
            }
          >
            <option value="">Hele werkruimte</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {labelDepartment(department.id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Werkelijk gewerkte uren">
          <input
            required
            type="number"
            min="0"
            max="1000000000"
            step="any"
            value={exposureDraft.hours}
            onChange={(event) => setExposureDraft({ ...exposureDraft, hours: event.target.value })}
          />
        </Field>
      </div>
      <Field
        label="Bron en afbakening"
        hint="Bijvoorbeeld: urenadministratie, alle medewerkers en relevante contractors, met de betreffende selectie."
      >
        <textarea
          required
          value={exposureDraft.source}
          onChange={(event) => setExposureDraft({ ...exposureDraft, source: event.target.value })}
        />
      </Field>
      <div className="button-row">
        <button type="submit" className="primary">
          <Check size={16} /> Uren opslaan
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Concept sluiten
        </button>
      </div>
    </form>
  );
}
