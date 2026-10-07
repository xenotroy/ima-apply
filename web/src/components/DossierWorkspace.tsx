import { useState } from 'react';
import { Building2, ClipboardCheck, FileCheck2, Plus, ArrowRight } from 'lucide-react';
import { sources as builtinSources, type Question } from '../content/catalog';
import { freezeQuestion, evidenceHash } from '../data/frozen';
import type {
  WorkspaceState,
  WorkspacePatch,
  Dossier,
  Evidence,
  Observation,
  Finding,
  Topic,
  LegalRecord,
  WorkspaceRecord,
} from '../data';
import { Badge, Field, Modal } from './Primitives';

const id = () => crypto.randomUUID();
const today = () => new Date().toLocaleDateString('sv-SE');
const findingLabels = {
  open: 'Open',
  action_required: 'Actie nodig',
  risk_accepted: 'Risico geaccepteerd',
  resolved: 'Opgelost',
  closed: 'Afgesloten',
};
export function MultiSelect({
  label,
  items,
  values,
  onChange,
}: {
  label: string;
  items: { id: string; title: string }[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="link-choices">
      <legend>{label}</legend>
      {items.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            checked={values.includes(item.id)}
            onChange={(e) =>
              onChange(
                e.target.checked ? [...values, item.id] : values.filter((v) => v !== item.id),
              )
            }
          />
          {item.title}
        </label>
      ))}
      {!items.length && <small>Nog geen records beschikbaar.</small>}
    </fieldset>
  );
}

export default function DossierWorkspace({
  workspace,
  questions,
  onUpdate,
  openInventory,
  openScenario,
}: {
  workspace: WorkspaceState;
  questions: Question[];
  onUpdate: (patch: WorkspacePatch) => boolean;
  openInventory: (dossierId: string) => void;
  openScenario: (scenarioId: string) => void;
}) {
  const [tab, setTab] = useState<'dossiers' | 'organisation' | 'knowledge'>('dossiers');
  const [selectedId, setSelectedId] = useState('');
  const [modal, setModal] = useState<
    | 'organisation'
    | 'site'
    | 'department'
    | 'dossier'
    | 'evidence'
    | 'observation'
    | 'finding'
    | 'topic'
    | 'legal'
    | 'review'
    | null
  >(null);
  const [editingEvidence, setEditingEvidence] = useState<Evidence | undefined>();
  const [editingFinding, setEditingFinding] = useState<Finding | undefined>();
  const dossiers = workspace.dossiers ?? [],
    organisations = workspace.organisations ?? [],
    sites = workspace.sites ?? [],
    departments = workspace.departments ?? [];
  const evidence = workspace.evidence ?? [],
    observations = workspace.observations ?? [],
    findings = workspace.findings ?? [],
    topics = workspace.topics ?? [],
    legal = workspace.legalRecords ?? [];
  const selected = dossiers.find((d) => d.id === selectedId) ?? dossiers[0];
  const add = (patch: WorkspacePatch) => {
    if (onUpdate(patch)) setModal(null);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SCOPE · BEWIJS · BESLUIT</div>
          <h1>
            Een herleidbaar dossier<span>.</span>
          </h1>
          <p>
            Bewaar organisaties, beoordelingen en hun bronversie afzonderlijk. Verbind feiten met
            bevindingen en verbeteringen.
          </p>
        </div>
        <button className="primary" onClick={() => setModal('dossier')}>
          <Plus size={16} /> RI&E-dossier
        </button>
      </div>
      <div className="segmented dossier-tabs">
        {(
          [
            ['dossiers', 'Dossiers & bewijs'],
            ['organisation', 'Organisatie'],
            ['knowledge', 'Onderwerpen & regelgeving'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'organisation' && (
        <div className="registry-grid">
          <section className="panel">
            <div className="section-row">
              <h2>
                <Building2 size={18} /> Organisaties
              </h2>
              <button className="secondary" onClick={() => setModal('organisation')}>
                <Plus size={14} /> Organisatie
              </button>
            </div>
            {organisations.map((o) => (
              <div className="registry-item" key={o.id}>
                <h3>{o.name}</h3>
                <p>{o.description}</p>
              </div>
            ))}
            {!organisations.length && <p className="muted">Leg de eerste organisatie vast.</p>}
          </section>
          <section className="panel">
            <div className="section-row">
              <h2>Locaties</h2>
              <button
                className="secondary"
                disabled={!organisations.length}
                onClick={() => setModal('site')}
              >
                <Plus size={14} /> Locatie
              </button>
            </div>
            {sites.map((s) => (
              <div className="registry-item" key={s.id}>
                <h3>{s.name}</h3>
                <p>
                  {organisations.find((o) => o.id === s.organisationId)?.name} · {s.address}
                </p>
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="section-row">
              <h2>Afdelingen</h2>
              <button
                className="secondary"
                disabled={!sites.length}
                onClick={() => setModal('department')}
              >
                <Plus size={14} /> Afdeling
              </button>
            </div>
            {departments.map((d) => (
              <div className="registry-item" key={d.id}>
                <h3>{d.name}</h3>
                <p>
                  {sites.find((s) => s.id === d.siteId)?.name} · {d.activity}
                </p>
              </div>
            ))}
          </section>
        </div>
      )}
      {tab === 'dossiers' && (
        <>
          <div className="scenario-tabs">
            {dossiers.map((d) => (
              <button
                className={selected?.id === d.id ? 'active' : ''}
                onClick={() => setSelectedId(d.id)}
                key={d.id}
              >
                <ClipboardCheck size={15} />
                {d.title}
              </button>
            ))}
          </div>
          {!selected ? (
            <section className="panel">
              <h2>Begin met een afgebakende beoordeling</h2>
              <p>
                Kies de vragen die bij de scope passen. Het dossier bewaart de volledige vraagtekst,
                criteria en bronhash.
              </p>
              <button className="primary" onClick={() => setModal('dossier')}>
                Dossier aanmaken
              </button>
            </section>
          ) : (
            <>
              <section className="panel dossier-context">
                <div className="section-row">
                  <div>
                    <Badge tone={selected.status === 'completed' ? 'green' : 'blue'}>
                      {selected.status}
                    </Badge>
                    <h2>{selected.title}</h2>
                    <p>{selected.scope}</p>
                    <p className="caption">
                      Beoordelaar: {selected.assessor} ·{' '}
                      {organisations.find((o) => o.id === selected.organisationId)?.name ??
                        'Werkruimtebreed'}{' '}
                      · {selected.questions.length} bevroren vragen
                    </p>
                  </div>
                  <div className="button-row">
                    <button className="primary" onClick={() => openInventory(selected.id)}>
                      Inventariseren <ArrowRight size={15} />
                    </button>
                    <button className="secondary" onClick={() => setModal('review')}>
                      Dossier beoordelen
                    </button>
                  </div>
                </div>
                {selected.reviewNote && (
                  <p className="info-box">
                    Beoordelingsbesluit: {selected.reviewNote} · {selected.reviewedBy}
                  </p>
                )}
              </section>
              <div className="registry-grid">
                <section className="panel">
                  <div className="section-row">
                    <h2>
                      <FileCheck2 size={18} /> Bewijsregister
                    </h2>
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditingEvidence(undefined);
                        setModal('evidence');
                      }}
                    >
                      <Plus size={14} /> Bewijs
                    </button>
                  </div>
                  {evidence
                    .filter((e) => !e.dossierId || e.dossierId === selected.id)
                    .map((e) => (
                      <div className="registry-item" key={e.id}>
                        <Badge tone={e.status === 'verified' ? 'green' : 'amber'}>
                          {e.status === 'verified' ? 'Geverifieerd' : 'Nog te verifiëren'}
                        </Badge>
                        <h3>{e.title}</h3>
                        <p>{e.description}</p>
                        <p className="caption">
                          {e.kind} · {e.reference || 'Geen bestandsverwijzing'}
                        </p>
                        {e.verificationNote && (
                          <p className="caption">
                            {e.verifiedBy}: {e.verificationNote}
                          </p>
                        )}
                        <button
                          className="text-link"
                          onClick={() => {
                            setEditingEvidence(e);
                            setModal('evidence');
                          }}
                        >
                          Bewijs beoordelen / wijzigen
                        </button>
                      </div>
                    ))}
                </section>
                <section className="panel">
                  <div className="section-row">
                    <h2>Waarnemingen</h2>
                    <button className="secondary" onClick={() => setModal('observation')}>
                      <Plus size={14} /> Waarneming
                    </button>
                  </div>
                  {observations
                    .filter((o) => o.dossierId === selected.id)
                    .map((o) => (
                      <div className="registry-item" key={o.id}>
                        <h3>{o.title}</h3>
                        <p>{o.facts}</p>
                        <p className="caption">
                          {o.date} · {o.observer} · {o.evidenceIds.length} bewijsverwijzingen
                        </p>
                      </div>
                    ))}
                </section>
              </div>
              <section className="panel">
                <div className="section-row">
                  <h2>Bevindingen en vervolg</h2>
                  <button
                    className="secondary"
                    onClick={() => {
                      setEditingFinding(undefined);
                      setModal('finding');
                    }}
                  >
                    <Plus size={14} /> Bevinding
                  </button>
                </div>
                {findings
                  .filter((f) => f.dossierId === selected.id)
                  .map((f) => (
                    <div className="registry-item finding-item" key={f.id}>
                      <div>
                        <Badge tone={['resolved', 'closed'].includes(f.status) ? 'green' : 'amber'}>
                          {findingLabels[f.status]}
                        </Badge>
                        <h3>{f.title}</h3>
                        <p>{f.description}</p>
                        <p className="caption">
                          {f.evidenceIds.length} bewijsstukken · {f.observationIds.length}{' '}
                          waarnemingen ·{' '}
                          {workspace.actions.filter((a) => a.findingId === f.id).length} acties
                        </p>
                        {f.decisionNote && (
                          <p>
                            Besluit: {f.decisionNote} · {f.decisionBy}
                          </p>
                        )}
                      </div>
                      <div className="button-row">
                        <button
                          className="secondary"
                          onClick={() => {
                            setEditingFinding(f);
                            setModal('finding');
                          }}
                        >
                          Bevinding beoordelen
                        </button>
                        {f.scenarioId && (
                          <button className="secondary" onClick={() => openScenario(f.scenarioId!)}>
                            Risicoscenario
                          </button>
                        )}
                        <button
                          className="secondary"
                          onClick={() =>
                            onUpdate({
                              actions: [
                                ...workspace.actions,
                                {
                                  id: id(),
                                  title: `Verbeter: ${f.title}`,
                                  dossierId: f.dossierId,
                                  findingId: f.id,
                                  scenarioId: f.scenarioId,
                                  evidenceIds: f.evidenceIds,
                                  owner: '',
                                  dueDate: '',
                                  status: 'open',
                                  notes: `Aanleiding: ${f.description}. Leg uitvoering en effectcontrole apart vast.`,
                                },
                              ],
                            })
                          }
                        >
                          Verbeteractie koppelen
                        </button>
                      </div>
                    </div>
                  ))}
              </section>
            </>
          )}
        </>
      )}
      {tab === 'knowledge' && (
        <div className="registry-grid">
          <section className="panel">
            <div className="section-row">
              <h2>Onderwerpen</h2>
              <button className="secondary" onClick={() => setModal('topic')}>
                <Plus size={14} /> Onderwerp
              </button>
            </div>
            {topics.map((t) => (
              <div className="registry-item" key={t.id}>
                <h3>{t.title}</h3>
                <p>{t.description}</p>
                <p className="caption">
                  {t.category} · {t.aliases.join(', ')}
                </p>
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="section-row">
              <h2>Regelgevingsregister</h2>
              <button className="secondary" onClick={() => setModal('legal')}>
                <Plus size={14} /> Regelgevingssignaal
              </button>
            </div>
            <p className="caption">
              Leg de officiële bron, controledatum en het toepassingsbesluit vast. De geregistreerde
              status volgt je beoordeling.
            </p>
            {legal.map((l) => (
              <div className="registry-item" key={l.id}>
                <Badge tone="blue">{l.status}</Badge>
                <h3>
                  <a href={l.officialUrl} target="_blank" rel="noreferrer">
                    {l.title}
                  </a>
                </h3>
                <p>{l.summary}</p>
                <p>{l.impact}</p>
                <p className="caption">
                  {l.citation} · {l.jurisdiction} · gecontroleerd {l.lastVerifiedOn}
                </p>
              </div>
            ))}
          </section>
        </div>
      )}
      {modal && (
        <Modal
          title={
            {
              organisation: 'Organisatie toevoegen',
              site: 'Locatie toevoegen',
              department: 'Afdeling toevoegen',
              dossier: 'RI&E-dossier aanmaken',
              evidence: 'Bewijs vastleggen en beoordelen',
              observation: 'Waarneming vastleggen',
              finding: 'Bevinding vastleggen en beoordelen',
              topic: 'Onderwerp toevoegen',
              legal: 'Regelgevingssignaal vastleggen',
              review: 'Dossier beoordelen',
            }[modal]
          }
          onClose={() => setModal(null)}
          wide={['dossier', 'finding'].includes(modal)}
        >
          {['organisation', 'site', 'department'].includes(modal) && (
            <ScopeForm
              kind={modal as 'organisation' | 'site' | 'department'}
              workspace={workspace}
              onSave={add}
            />
          )}
          {modal === 'dossier' && (
            <DossierForm
              workspace={workspace}
              questions={questions}
              onSave={(d) => {
                add({ dossiers: [...dossiers, d] });
                setSelectedId(d.id);
                setTab('dossiers');
              }}
            />
          )}
          {modal === 'evidence' && selected && (
            <EvidenceForm
              initial={editingEvidence}
              dossierId={selected.id}
              onSave={(e) => add({ evidence: [...evidence.filter((x) => x.id !== e.id), e] })}
            />
          )}
          {modal === 'observation' && selected && (
            <ObservationForm
              dossier={selected}
              workspace={workspace}
              onSave={(o) => add({ observations: [...observations, o] })}
            />
          )}
          {modal === 'finding' && selected && (
            <FindingForm
              initial={editingFinding}
              dossier={selected}
              workspace={workspace}
              onSave={(f) => add({ findings: [...findings.filter((x) => x.id !== f.id), f] })}
            />
          )}
          {modal === 'topic' && <TopicForm onSave={(t) => add({ topics: [...topics, t] })} />}
          {modal === 'legal' && (
            <LegalForm topics={topics} onSave={(l) => add({ legalRecords: [...legal, l] })} />
          )}
          {modal === 'review' && selected && (
            <DossierReview
              dossier={selected}
              onSave={(d) => add({ dossiers: dossiers.map((x) => (x.id === d.id ? d : x)) })}
            />
          )}
        </Modal>
      )}
    </>
  );
}

function ScopeForm({
  kind,
  workspace,
  onSave,
}: {
  kind: 'organisation' | 'site' | 'department';
  workspace: WorkspaceState;
  onSave: (p: WorkspacePatch) => void;
}) {
  const [name, setName] = useState(''),
    [description, setDescription] = useState('');
  const options = kind === 'site' ? (workspace.organisations ?? []) : (workspace.sites ?? []);
  const [parent, setParent] = useState(options[0]?.id ?? '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === 'organisation')
          onSave({
            organisations: [...(workspace.organisations ?? []), { id: id(), name, description }],
          });
        if (kind === 'site')
          onSave({
            sites: [
              ...(workspace.sites ?? []),
              { id: id(), name, address: description, organisationId: parent },
            ],
          });
        if (kind === 'department')
          onSave({
            departments: [
              ...(workspace.departments ?? []),
              { id: id(), name, activity: description, siteId: parent },
            ],
          });
      }}
    >
      <Field label="Naam">
        <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {kind !== 'organisation' && (
        <Field label={kind === 'site' ? 'Organisatie' : 'Locatie'}>
          <select required value={parent} onChange={(e) => setParent(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field
        label={
          kind === 'site'
            ? 'Adres / locatieomschrijving'
            : kind === 'department'
              ? 'Activiteiten'
              : 'Omschrijving'
        }
      >
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <button className="primary">Opslaan</button>
    </form>
  );
}
function DossierForm({
  workspace,
  questions,
  onSave,
}: {
  workspace: WorkspaceState;
  questions: Question[];
  onSave: (d: Dossier) => void;
}) {
  const [title, setTitle] = useState(''),
    [scope, setScope] = useState(''),
    [assessor, setAssessor] = useState(''),
    [organisationId, setOrganisation] = useState(''),
    [departmentIds, setDepartments] = useState<string[]>([]),
    [theme, setTheme] = useState('all'),
    [selection, setSelection] = useState<string[]>([]);
  const available = questions.filter((q) => theme === 'all' || q.themeId === theme);
  const allowedDepartments = (workspace.departments ?? []).filter(
    (d) =>
      !organisationId ||
      (workspace.sites ?? []).find((s) => s.id === d.siteId)?.organisationId === organisationId,
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const selected = questions.filter((q) => selection.includes(q.id));
        const usedIds = new Set(selected.flatMap((q) => q.sourceIds));
        const sourceSnapshots = JSON.parse(
          JSON.stringify(
            [...builtinSources, ...workspace.sources].filter((s) => usedIds.has(s.id)),
          ),
        ) as WorkspaceRecord[];
        const frozen = selected.map((q) => {
          const imported = workspace.questions.some((entry) => entry.id === q.id);
          const versions = sourceSnapshots
            .filter((s) => q.sourceIds.includes(s.id))
            .flatMap((s) => {
              const metadata = s.sourceMetadata;
              return metadata &&
                typeof metadata === 'object' &&
                !Array.isArray(metadata) &&
                typeof metadata.version === 'string'
                ? [metadata.version]
                : [];
            });
          return freezeQuestion(
            q,
            imported
              ? [...new Set(versions)].join(' + ') || 'bronversie-niet-vastgelegd'
              : 'IMA-catalogus-2.0.0',
          );
        });
        onSave({
          id: id(),
          title,
          scope,
          assessor,
          ...(organisationId ? { organisationId } : {}),
          departmentIds,
          status: 'active',
          createdAt: new Date().toISOString(),
          questions: frozen,
          sourceSnapshots,
        });
      }}
    >
      <Field label="Dossiertitel">
        <input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Afgebakende scope">
        <textarea
          required
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="Welke werkzaamheden, personen, locaties en uitsluitingen?"
        />
      </Field>
      <div className="form-grid">
        <Field label="Beoordelaar">
          <input required value={assessor} onChange={(e) => setAssessor(e.target.value)} />
        </Field>
        <Field label="Organisatie">
          <select
            value={organisationId}
            onChange={(e) => {
              setOrganisation(e.target.value);
              setDepartments([]);
            }}
          >
            <option value="">Werkruimtebreed</option>
            {workspace.organisations?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <MultiSelect
        label="Afdelingen binnen scope"
        items={allowedDepartments.map((d) => ({ id: d.id, title: d.name }))}
        values={departmentIds}
        onChange={setDepartments}
      />
      <Field label="Vragenselectie per thema">
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="all">Alle thema’s</option>
          {[...new Set(questions.map((q) => q.themeId))].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <div className="button-row">
        <button
          type="button"
          className="secondary"
          onClick={() => setSelection([...new Set([...selection, ...available.map((q) => q.id)])])}
        >
          Selecteer getoonde vragen
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setSelection(selection.filter((s) => !available.some((q) => q.id === s)))}
        >
          Deselecteer getoonde vragen
        </button>
      </div>
      <MultiSelect
        label={`Bevries ${selection.length} vragen in dit dossier`}
        items={available.map((q) => ({ id: q.id, title: q.prompt }))}
        values={selection}
        onChange={setSelection}
      />
      <p className="caption">
        Vraagtekst, criteria, bronverwijzingen en SHA-256 worden samen opgeslagen. Latere
        wijzigingen aan de catalogus veranderen dit dossier niet.
      </p>
      <button className="primary" disabled={!selection.length}>
        Dossier aanmaken
      </button>
    </form>
  );
}
function EvidenceForm({
  initial,
  dossierId,
  onSave,
}: {
  initial?: Evidence;
  dossierId: string;
  onSave: (e: Evidence) => void;
}) {
  const [record, set] = useState<Evidence>(
    initial ?? {
      id: id(),
      title: '',
      dossierId,
      kind: 'document',
      reference: '',
      description: '',
      recordedAt: new Date().toISOString(),
      status: 'unverified',
      verifiedBy: '',
      verificationNote: '',
    },
  );
  const changeContent = (patch: Partial<Evidence>) =>
    set({
      ...record,
      ...patch,
      status: 'unverified',
      verifiedBy: '',
      verificationNote: '',
      verifiedAt: undefined,
      verifiedContentSha256: undefined,
    });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...record,
          ...(record.status === 'verified'
            ? { verifiedAt: new Date().toISOString(), verifiedContentSha256: evidenceHash(record) }
            : { verifiedAt: undefined, verifiedContentSha256: undefined }),
        });
      }}
    >
      <Field label="Bewijstitel">
        <input
          required
          autoFocus
          value={record.title}
          onChange={(e) => changeContent({ title: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Bewijssoort">
          <select
            value={record.kind}
            onChange={(e) => changeContent({ kind: e.target.value as Evidence['kind'] })}
          >
            {(
              ['document', 'photograph', 'interview', 'measurement', 'record', 'other'] as const
            ).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Verificatiestatus">
          <select
            value={record.status}
            onChange={(e) => set({ ...record, status: e.target.value as Evidence['status'] })}
          >
            <option value="unverified">Nog te verifiëren</option>
            <option value="verified">Geverifieerd</option>
          </select>
        </Field>
      </div>
      <Field
        label="Verwijzing naar bestand of bron"
        hint="Bewaar bestanden in een geschikte private opslag. Deze werkruimte bewaart de verwijzing en bevindingen."
      >
        <input
          value={record.reference}
          onChange={(e) => changeContent({ reference: e.target.value })}
        />
      </Field>
      <Field label="Inhoud en toepassingsbereik">
        <textarea
          required
          value={record.description}
          onChange={(e) => changeContent({ description: e.target.value })}
        />
      </Field>
      <Field label="Verificateur">
        <input
          required={record.status === 'verified'}
          value={record.verifiedBy ?? ''}
          onChange={(e) => set({ ...record, verifiedBy: e.target.value })}
        />
      </Field>
      <Field label="Verificatiebevinding">
        <textarea
          required={record.status === 'verified'}
          value={record.verificationNote ?? ''}
          onChange={(e) => set({ ...record, verificationNote: e.target.value })}
        />
      </Field>
      <button className="primary">Bewijs opslaan</button>
    </form>
  );
}
function ObservationForm({
  dossier,
  workspace,
  onSave,
}: {
  dossier: Dossier;
  workspace: WorkspaceState;
  onSave: (o: Observation) => void;
}) {
  const [record, set] = useState<Observation>({
    id: id(),
    title: '',
    dossierId: dossier.id,
    date: today(),
    observer: '',
    facts: '',
    evidenceIds: [],
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(record);
      }}
    >
      <Field label="Waarnemingstitel">
        <input
          required
          value={record.title}
          onChange={(e) => set({ ...record, title: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Waarnemingsdatum">
          <input
            required
            type="date"
            value={record.date}
            onChange={(e) => set({ ...record, date: e.target.value })}
          />
        </Field>
        <Field label="Waarnemer">
          <input
            required
            value={record.observer}
            onChange={(e) => set({ ...record, observer: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Afdeling">
        <select
          value={record.departmentId ?? ''}
          onChange={(e) => set({ ...record, departmentId: e.target.value || undefined })}
        >
          <option value="">Dossierbreed</option>
          {workspace.departments
            ?.filter(
              (d) =>
                (!dossier.departmentIds.length || dossier.departmentIds.includes(d.id)) &&
                (!dossier.organisationId ||
                  workspace.sites?.find((s) => s.id === d.siteId)?.organisationId ===
                    dossier.organisationId),
            )
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Waargenomen feiten">
        <textarea
          required
          value={record.facts}
          onChange={(e) => set({ ...record, facts: e.target.value })}
        />
      </Field>
      <MultiSelect
        label="Ondersteunend bewijs"
        items={workspace.evidence?.filter((e) => !e.dossierId || e.dossierId === dossier.id) ?? []}
        values={record.evidenceIds}
        onChange={(v) => set({ ...record, evidenceIds: v })}
      />
      <button className="primary">Waarneming opslaan</button>
    </form>
  );
}
function FindingForm({
  initial,
  dossier,
  workspace,
  onSave,
}: {
  initial?: Finding;
  dossier: Dossier;
  workspace: WorkspaceState;
  onSave: (f: Finding) => void;
}) {
  const [record, set] = useState<Finding>(
    initial ?? {
      id: id(),
      title: '',
      dossierId: dossier.id,
      description: '',
      status: 'open',
      observationIds: [],
      evidenceIds: [],
      topicIds: [],
      legalIds: [],
      decisionBy: '',
      decisionNote: '',
    },
  );
  const decision = ['risk_accepted', 'resolved', 'closed'].includes(record.status);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(record);
      }}
    >
      <Field label="Bevindingstitel">
        <input
          required
          value={record.title}
          onChange={(e) => set({ ...record, title: e.target.value })}
        />
      </Field>
      <Field label="Bevinding en criterium">
        <textarea
          required
          value={record.description}
          onChange={(e) => set({ ...record, description: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Dossiervraag">
          <select
            value={record.questionId ?? ''}
            onChange={(e) => set({ ...record, questionId: e.target.value || undefined })}
          >
            <option value="">Losse bevinding</option>
            {dossier.questions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.prompt}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Risicoscenario">
          <select
            value={record.scenarioId ?? ''}
            onChange={(e) => set({ ...record, scenarioId: e.target.value || undefined })}
          >
            <option value="">Nog te beoordelen</option>
            {workspace.scenarios
              .filter((s) => !s.dossierId || s.dossierId === dossier.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <MultiSelect
        label="Bewijs bij bevinding"
        items={workspace.evidence?.filter((e) => !e.dossierId || e.dossierId === dossier.id) ?? []}
        values={record.evidenceIds}
        onChange={(v) => set({ ...record, evidenceIds: v })}
      />
      <MultiSelect
        label="Waarnemingen bij bevinding"
        items={workspace.observations?.filter((o) => o.dossierId === dossier.id) ?? []}
        values={record.observationIds}
        onChange={(v) => set({ ...record, observationIds: v })}
      />
      <MultiSelect
        label="Onderwerpen bij bevinding"
        items={workspace.topics ?? []}
        values={record.topicIds}
        onChange={(v) => set({ ...record, topicIds: v })}
      />
      <MultiSelect
        label="Regelgeving bij bevinding"
        items={workspace.legalRecords ?? []}
        values={record.legalIds}
        onChange={(v) => set({ ...record, legalIds: v })}
      />
      <Field label="Bevindingstatus">
        <select
          value={record.status}
          onChange={(e) => set({ ...record, status: e.target.value as Finding['status'] })}
        >
          {Object.entries(findingLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Besluitnemer">
        <input
          required={decision}
          value={record.decisionBy}
          onChange={(e) => set({ ...record, decisionBy: e.target.value })}
        />
      </Field>
      <Field label="Besluit en onderbouwing">
        <textarea
          required={decision}
          value={record.decisionNote}
          onChange={(e) => set({ ...record, decisionNote: e.target.value })}
        />
      </Field>
      {['resolved', 'closed'].includes(record.status) && (
        <p className="info-box">
          Afsluiten vraagt gekoppeld, geverifieerd bewijs. Een besluit wijzigt de risicoscore niet
          automatisch.
        </p>
      )}
      <button className="primary">Bevinding opslaan</button>
    </form>
  );
}
function TopicForm({ onSave }: { onSave: (t: Topic) => void }) {
  const [title, setTitle] = useState(''),
    [category, setCategory] = useState(''),
    [description, setDescription] = useState(''),
    [aliases, setAliases] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: id(),
          title,
          category,
          description,
          aliases: aliases
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
        });
      }}
    >
      <Field label="Onderwerptitel">
        <input required value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Categorie">
        <input value={category} onChange={(e) => setCategory(e.target.value)} />
      </Field>
      <Field label="Betekenis en afbakening">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Synoniemen, gescheiden door komma">
        <input value={aliases} onChange={(e) => setAliases(e.target.value)} />
      </Field>
      <button className="primary">Onderwerp opslaan</button>
    </form>
  );
}
function LegalForm({ topics, onSave }: { topics: Topic[]; onSave: (l: LegalRecord) => void }) {
  const [record, set] = useState<LegalRecord>({
    id: id(),
    title: '',
    officialUrl: '',
    citation: '',
    jurisdiction: 'NL',
    status: 'signal',
    effectiveOn: '',
    lastVerifiedOn: today(),
    summary: '',
    impact: '',
    topicIds: [],
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(record);
      }}
    >
      <Field label="Signaaltitel">
        <input
          required
          value={record.title}
          onChange={(e) => set({ ...record, title: e.target.value })}
        />
      </Field>
      <Field label="Officiële bron-URL">
        <input
          required
          type="url"
          value={record.officialUrl}
          onChange={(e) => set({ ...record, officialUrl: e.target.value })}
        />
      </Field>
      <Field label="Artikel / publicatieverwijzing">
        <input
          value={record.citation}
          onChange={(e) => set({ ...record, citation: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Jurisdictie">
          <input
            required
            value={record.jurisdiction}
            onChange={(e) => set({ ...record, jurisdiction: e.target.value })}
          />
        </Field>
        <Field label="Bronstatus">
          <select
            value={record.status}
            onChange={(e) => set({ ...record, status: e.target.value as LegalRecord['status'] })}
          >
            {['signal', 'published', 'effective', 'superseded', 'withdrawn'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ingangsdatum">
          <input
            type="date"
            value={record.effectiveOn}
            onChange={(e) => set({ ...record, effectiveOn: e.target.value })}
          />
        </Field>
        <Field label="Laatste broncontrole">
          <input
            required
            type="date"
            value={record.lastVerifiedOn}
            onChange={(e) => set({ ...record, lastVerifiedOn: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Wat is gepubliceerd of gesignaleerd?">
        <textarea
          required
          value={record.summary}
          onChange={(e) => set({ ...record, summary: e.target.value })}
        />
      </Field>
      <Field label="Toepassing op deze werkruimte">
        <textarea
          value={record.impact}
          onChange={(e) => set({ ...record, impact: e.target.value })}
        />
      </Field>
      <MultiSelect
        label="Betrokken onderwerpen"
        items={topics}
        values={record.topicIds}
        onChange={(v) => set({ ...record, topicIds: v })}
      />
      <button className="primary">Signaal opslaan</button>
    </form>
  );
}
function DossierReview({ dossier, onSave }: { dossier: Dossier; onSave: (d: Dossier) => void }) {
  const [status, setStatus] = useState(dossier.status),
    [reviewedBy, setReviewer] = useState(dossier.reviewedBy ?? ''),
    [reviewNote, setNote] = useState(dossier.reviewNote ?? '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...dossier,
          status,
          reviewedBy,
          reviewNote,
          reviewedAt: new Date().toISOString(),
        });
      }}
    >
      <Field label="Dossierstatus">
        <select value={status} onChange={(e) => setStatus(e.target.value as Dossier['status'])}>
          <option value="draft">Concept</option>
          <option value="active">In uitvoering</option>
          <option value="completed">Beoordeeld en afgerond</option>
          <option value="archived">Gearchiveerd</option>
        </select>
      </Field>
      <Field label="Beoordelend verantwoordelijke">
        <input
          required={status === 'completed'}
          value={reviewedBy}
          onChange={(e) => setReviewer(e.target.value)}
        />
      </Field>
      <Field label="Beoordelingsbesluit en open punten">
        <textarea
          required={status === 'completed'}
          value={reviewNote}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <p className="caption">
        Een afgerond dossier is een vastgelegd beoordelingsbesluit. Het sluit open risico’s of
        acties niet automatisch.
      </p>
      <button className="primary">Beoordeling vastleggen</button>
    </form>
  );
}
