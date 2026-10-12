import { useState } from 'react';
import { EvidenceAttachmentPanel } from './EvidenceAttachmentPanel';
import { useRiskEvidence } from './RiskEvidenceContext';
import { evidenceFileBindingHash, evidenceFileIntegrityReady } from '../data/evidence-files';
import type { ActionCreateSeed } from '../domain/action-context';
import QuestionDefinitionWorkspace from './QuestionDefinitionWorkspace';
import RiskLibraryWorkspace from './RiskLibraryWorkspace';
import PiRouterWorkspace from './PiRouterWorkspace';
import { createDossierFromModulePlan, type ModulePlan } from '../data/module-plan';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import { draftBase } from '../data/local-drafts';
import DraftNotice from './DraftNotice';
import { captureQuestionPackages } from '../data/question-definition';
import { piRouterQuestionBindings } from '../data/pi-router';
import { Building2, ClipboardCheck, FileCheck2, Plus, ArrowRight } from 'lucide-react';
import {
  sources as builtinSources,
  PUBLIC_CONTENT_VERSION,
  type Question,
} from '../content/catalog';
import { freezeQuestion, evidenceHash } from '../data/frozen';
import { departmentOrganisationId, departmentLabel } from '../data/dossier';
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
import ProjectContextWorkspace from './ProjectContextWorkspace';
import ModulePlanWorkspace from './ModulePlanWorkspace';

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
  onCreateAction,
  openInventory,
  openScenario,
  initialTab = 'dossiers',
}: {
  workspace: WorkspaceState;
  questions: Question[];
  onUpdate: (patch: WorkspacePatch) => boolean;
  onCreateAction: (seed: ActionCreateSeed) => void;
  openInventory: (dossierId: string) => void;
  openScenario: (scenarioId: string) => void;
  initialTab?: 'dossiers' | 'organisation';
}) {
  const { context } = useRiskEvidence();
  const [tab, setTab] = useState<
    'dossiers' | 'organisation' | 'knowledge' | 'context' | 'modules' | 'managed' | 'library' | 'pi'
  >(initialTab);
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
    const accepted = onUpdate(patch);
    if (accepted) setModal(null);
    return accepted;
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
            ['context', 'Projectcontext & rondgangen'],
            ['modules', 'Modules & scope'],
            ['managed', 'Beheerde vragen'],
            ['library', 'Risicobibliotheek'],
            ['pi', 'PI-bibliotheek & router'],
            ['knowledge', 'Onderwerpen & regelgeving'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'pi' && (
        <PiRouterWorkspace
          workspace={workspace}
          onUpdate={onUpdate}
          onUseQuestionSet={(record) => {
            const bindings = piRouterQuestionBindings(record);
            const groups = new Map<string, typeof bindings>();
            for (const binding of bindings) {
              const group = groups.get(binding.process) ?? [];
              if (!group.some((item) => item.questionId === binding.questionId))
                group.push(binding);
              groups.set(binding.process, group);
            }
            const original = dossiers.find((dossier) => dossier.id === record.inputs.dossierId);
            const plan: ModulePlan = {
              id: id(),
              title: `Onderzoeksset: ${record.title}`,
              scope: original?.departmentIds.length === 1 ? 'department' : 'project',
              ...((original?.organisationId ?? record.inputs.organisationId)
                ? { organisationId: original?.organisationId ?? record.inputs.organisationId }
                : {}),
              ...(original?.projectContextId
                ? { projectContextId: original.projectContextId }
                : {}),
              ...(original?.departmentIds.length === 1
                ? { departmentId: original.departmentIds[0] }
                : {}),
              modules: [...groups].map(([process, questions], index) => ({
                id: `${record.id}:process:${index}`,
                origin: 'imported_theme',
                code: process,
                title: process,
                questionIds: questions.map((question) => question.questionId),
                enabled: true,
                scopeNotes:
                  'Routervoorstel met exacte bronvraagkoppelingen. Mappingstatus, procesblokdekking, lokale aanwezigheid en werking vereisen menselijke controle. Dit is geen uitgevoerde wijziging in RI&E Porter.',
                sortOrder: index,
                sourceIds: [...new Set(questions.map((question) => question.sourceId))],
              })),
              revision: 1,
              sourceIds: record.sourceIds,
            };
            const dossier = createDossierFromModulePlan(plan, questions, workspace, {
              id: id(),
              title: `Onderzoeksdossier: ${record.title}`,
              scope: record.inputs.scopeTitle,
              assessor: record.inputs.assessor,
              createdAt: new Date().toISOString(),
            });
            if (original) dossier.departmentIds = [...original.departmentIds];
            if (
              add({
                modulePlans: [...(workspace.modulePlans ?? []), plan],
                dossiers: [...dossiers, dossier],
              })
            ) {
              setSelectedId(dossier.id);
              setTab('dossiers');
            }
          }}
        />
      )}
      {tab === 'managed' && (
        <QuestionDefinitionWorkspace workspace={workspace} onUpdate={onUpdate} />
      )}
      {tab === 'library' && (
        <RiskLibraryWorkspace
          workspace={workspace}
          onUpdate={onUpdate}
          onScenario={(scenario) => onUpdate({ scenarios: [...workspace.scenarios, scenario] })}
        />
      )}
      {tab === 'modules' && (
        <ModulePlanWorkspace
          workspace={workspace}
          questions={questions}
          onUpdate={onUpdate}
          onOpenInventory={openInventory}
        />
      )}
      {tab === 'context' && (
        <ProjectContextWorkspace
          workspace={workspace}
          onUpdate={onUpdate}
          selectedDossier={selected}
        />
      )}
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
                disabled={!organisations.length}
                onClick={() => setModal('department')}
              >
                <Plus size={14} /> Afdeling
              </button>
            </div>
            {departments.map((d) => (
              <div className="registry-item" key={d.id}>
                <h3>{d.name}</h3>
                <p>
                  {departmentLabel(d, sites, organisations)} · {d.activity}
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
                        {e.file && (
                          <p
                            className={
                              evidenceFileIntegrityReady(e, context) ? 'caption' : 'warning-line'
                            }
                          >
                            {evidenceFileIntegrityReady(e, context)
                              ? 'Bestandsbytes gecontroleerd in deze sessie.'
                              : 'Bestandsbytes opnieuw controleren in deze sessie.'}
                          </p>
                        )}
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
                            onCreateAction({
                              title: `Verbeter: ${f.title}`,
                              dossierId: f.dossierId,
                              findingId: f.id,
                              scenarioId: f.scenarioId,
                              evidenceIds: f.evidenceIds,
                              sourceRefs: [{ kind: 'workspace', collection: 'findings', id: f.id }],
                              notes: `Aanleiding: ${f.description}. Leg uitvoering en effectcontrole apart vast.`,
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
              key={`${workspace.id}/scope/${modal}`}
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
                const accepted = add({ dossiers: [...dossiers, d] });
                if (accepted) {
                  setSelectedId(d.id);
                  setTab('dossiers');
                }
                return accepted;
              }}
            />
          )}
          {modal === 'evidence' && selected && (
            <EvidenceForm
              workspaceId={workspace.id}
              existingIds={evidence.map((record) => record.id)}
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
          {modal === 'topic' && (
            <TopicForm
              key={`${workspace.id}/topic/new`}
              workspace={workspace}
              onSave={(t) => add({ topics: [...topics, t] })}
            />
          )}
          {modal === 'legal' && (
            <LegalForm
              key={`${workspace.id}/legal/new`}
              workspace={workspace}
              topics={topics}
              onSave={(l) => add({ legalRecords: [...legal, l] })}
            />
          )}
          {modal === 'review' && selected && (
            <DossierReview
              key={`${workspace.id}/${selected.id}`}
              workspaceId={workspace.id}
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
  onSave: (p: WorkspacePatch) => boolean;
}) {
  const options: {
    value: string;
    title: string;
    sourceBasis: string;
    siteId?: string;
    organisationId?: string;
  }[] =
    kind === 'department'
      ? [
          ...(workspace.sites ?? []).map((site) => ({
            value: `site:${site.id}`,
            title: `Locatie ${site.name} · ${workspace.organisations?.find((record) => record.id === site.organisationId)?.name ?? ''}`,
            sourceBasis: draftBase(site),
            siteId: site.id,
          })),
          ...(workspace.organisations ?? []).map((organisation) => ({
            value: `organisation:${organisation.id}`,
            title: `${organisation.name} · locatie niet vastgelegd`,
            sourceBasis: draftBase(organisation),
            organisationId: organisation.id,
          })),
        ]
      : (workspace.organisations ?? []).map((organisation) => ({
          value: organisation.id,
          title: organisation.name,
          sourceBasis: draftBase(organisation),
          organisationId: organisation.id,
        }));
  const collection =
    kind === 'organisation'
      ? workspace.organisations
      : kind === 'site'
        ? workspace.sites
        : workspace.departments;
  const [draft, setDraft, draftStatus] = usePersistentDraft(
    `${workspace.id}/scope/${kind}/new`,
    () => ({
      id: id(),
      name: '',
      description: '',
      parent: options[0]?.value ?? '',
      parentBasis: options[0]?.sourceBasis ?? '',
    }),
    'new/v1',
    (candidate) =>
      !(collection ?? []).some((record) => record.id === candidate.id) &&
      (kind === 'organisation' ||
        options.some(
          (option) =>
            option.value === candidate.parent && option.sourceBasis === candidate.parentBasis,
        )),
  );
  const { name, description, parent } = draft;
  const setName = (name: string) => setDraft((previous) => ({ ...previous, name }));
  const setDescription = (description: string) =>
    setDraft((previous) => ({ ...previous, description }));
  const setParent = (parent: string) =>
    setDraft((previous) => ({
      ...previous,
      parent,
      parentBasis: options.find((option) => option.value === parent)?.sourceBasis ?? '',
    }));
  const [error, setError] = useState('');
  const selectedParent = options.find((option) => option.value === parent);
  const sourceChanged =
    kind !== 'organisation' &&
    (!selectedParent || selectedParent.sourceBasis !== draft.parentBasis);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if ((collection ?? []).some((record) => record.id === draft.id)) {
          setError(
            'Dit concept is inmiddels vastgelegd. De tekst blijft behouden; open het formulier opnieuw voor een nieuw record.',
          );
          return;
        }
        if (sourceChanged) {
          setError(
            'De gekozen organisatie of locatie is gewijzigd. Controleer het concept en bevestig de actuele keuze opnieuw.',
          );
          return;
        }
        const patch: WorkspacePatch =
          kind === 'organisation'
            ? {
                organisations: [
                  ...(workspace.organisations ?? []),
                  { id: draft.id, name, description },
                ],
              }
            : kind === 'site'
              ? {
                  sites: [
                    ...(workspace.sites ?? []),
                    {
                      id: draft.id,
                      name,
                      address: description,
                      organisationId: selectedParent!.organisationId!,
                    },
                  ],
                }
              : {
                  departments: [
                    ...(workspace.departments ?? []),
                    {
                      id: draft.id,
                      name,
                      activity: description,
                      ...(selectedParent!.siteId
                        ? { siteId: selectedParent!.siteId }
                        : { organisationId: selectedParent!.organisationId! }),
                    },
                  ],
                };
        if (onSave(patch)) draftStatus.clear();
        else setError('Vastleggen geweigerd. Het volledige scopeconcept blijft behouden.');
      }}
    >
      <DraftNotice status={draftStatus} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {sourceChanged && (
        <p role="alert">
          De brongegevens van de gekozen organisatie of locatie zijn gewijzigd. Het concept wordt
          niet automatisch opnieuw gekoppeld.
          {selectedParent && (
            <button type="button" className="secondary" onClick={() => setParent(parent)}>
              Huidige organisatie- of locatiekeuze bevestigen
            </button>
          )}
        </p>
      )}
      <Field label="Naam">
        <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {kind !== 'organisation' && (
        <Field label={kind === 'site' ? 'Organisatie' : 'Locatie of organisatie'}>
          <select required value={parent} onChange={(e) => setParent(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.title}
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
      <button className="primary" disabled={sourceChanged}>
        Opslaan
      </button>
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
  onSave: (d: Dossier) => boolean;
}) {
  const [draft, setDraft, draftStatus] = usePersistentDraft(
    `${workspace.id}/dossier/new`,
    {
      title: '',
      scope: '',
      assessor: '',
      organisationId: '',
      projectContextId: '',
      departmentIds: [] as string[],
      theme: 'all',
      selection: [] as string[],
    },
    `new/v1:${draftBase((workspace.dossiers ?? []).map((record) => record.id))}`,
  );
  const {
    title,
    scope,
    assessor,
    organisationId,
    projectContextId,
    departmentIds,
    theme,
    selection,
  } = draft;
  const setTitle = (title: string) => setDraft((value) => ({ ...value, title }));
  const setScope = (scope: string) => setDraft((value) => ({ ...value, scope }));
  const setAssessor = (assessor: string) => setDraft((value) => ({ ...value, assessor }));
  const setOrganisation = (organisationId: string) =>
    setDraft((value) => ({ ...value, organisationId }));
  const setProjectContext = (projectContextId: string) =>
    setDraft((value) => ({ ...value, projectContextId }));
  const setDepartments = (departmentIds: string[]) =>
    setDraft((value) => ({ ...value, departmentIds }));
  const setTheme = (theme: string) => setDraft((value) => ({ ...value, theme }));
  const setSelection = (selection: string[]) => setDraft((value) => ({ ...value, selection }));
  const [formError, setFormError] = useState('');
  const eligible = questions.filter((q) => !q.definition || q.definition.status === 'active');
  const available = eligible.filter((q) => theme === 'all' || q.themeId === theme);
  const allowedDepartments = (workspace.departments ?? []).filter(
    (d) => !organisationId || departmentOrganisationId(d, workspace.sites ?? []) === organisationId,
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const selected = eligible.filter((q) => selection.includes(q.id));
          const contentPackageSnapshots = captureQuestionPackages(
            selected.map((q) => q.id),
            workspace,
          );
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
              q.definition?.version ??
                (imported
                  ? [...new Set(versions)].join(' + ') || 'bronversie-niet-vastgelegd'
                  : `IMA-catalogus-${PUBLIC_CONTENT_VERSION}`),
            );
          });
          const accepted = onSave({
            id: id(),
            title,
            scope,
            assessor,
            ...(organisationId ? { organisationId } : {}),
            ...(projectContextId ? { projectContextId } : {}),
            departmentIds,
            status: 'active',
            createdAt: new Date().toISOString(),
            questions: frozen,
            sourceSnapshots,
            ...(contentPackageSnapshots.length ? { contentPackageSnapshots } : {}),
          });
          if (accepted) draftStatus.clear();
        } catch (error) {
          setFormError(String(error));
        }
      }}
    >
      <DraftNotice status={draftStatus} />
      {formError && <p role="alert">{formError}</p>}
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
              setProjectContext('');
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
      <Field label="Projectcontext">
        <select
          value={projectContextId}
          onChange={(event) => setProjectContext(event.target.value)}
        >
          <option value="">Niet gekoppeld</option>
          {(workspace.projectContexts ?? [])
            .filter(
              (context) =>
                !context.organisationIds.length ||
                (!!organisationId && context.organisationIds.includes(organisationId)),
            )
            .map((context) => (
              <option key={context.id} value={context.id}>
                {context.title}
              </option>
            ))}
        </select>
      </Field>
      <MultiSelect
        label="Afdelingen binnen scope"
        items={allowedDepartments.map((d) => ({
          id: d.id,
          title: departmentLabel(d, workspace.sites ?? [], workspace.organisations ?? []),
        }))}
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
  workspaceId,
  existingIds,
  dossierId,
  onSave,
}: {
  initial?: Evidence;
  workspaceId: string;
  existingIds: string[];
  dossierId: string;
  onSave: (e: Evidence) => boolean;
}) {
  const { context, fileSession, cloud, onSessionChange } = useRiskEvidence();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [record, set, draftStatus] = usePersistentDraft<Evidence>(
    `${workspaceId}/evidence/${dossierId}/${initial?.id ?? 'new'}`,
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
    initial ? draftBase(initial) : 'new/v1',
    (candidate) => Boolean(initial) || !existingIds.includes(candidate.id),
  );
  const changeContent = (patch: Partial<Evidence>) =>
    set((previous) => ({
      ...previous,
      ...patch,
      status: 'unverified',
      verifiedAt: undefined,
      verifiedContentSha256: undefined,
      verifiedFileBindingSha256: undefined,
    }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          if (busy) throw new Error('Wacht totdat de lopende bestandcontrole is afgerond.');
          const filePin = record.file ? evidenceFileBindingHash(record) : undefined;
          const sameHumanReview =
            record.status === 'verified' &&
            initial?.status === 'verified' &&
            initial.verifiedContentSha256 === evidenceHash(record) &&
            initial.verifiedBy === record.verifiedBy &&
            initial.verificationNote === record.verificationNote &&
            initial.verifiedFileBindingSha256 === filePin;
          if (
            record.status === 'verified' &&
            !sameHumanReview &&
            record.file &&
            !evidenceFileIntegrityReady(record, context)
          )
            throw new Error(
              'Controleer het bewijsbestand in deze sessie voordat je het inhoudelijk bevestigt.',
            );
          const accepted = onSave({
            ...record,
            ...(record.status === 'verified'
              ? {
                  verifiedAt: sameHumanReview ? initial!.verifiedAt : new Date().toISOString(),
                  verifiedContentSha256: evidenceHash(record),
                  verifiedFileBindingSha256: filePin,
                }
              : {
                  verifiedAt: undefined,
                  verifiedContentSha256: undefined,
                  verifiedFileBindingSha256: undefined,
                }),
          });
          if (accepted) {
            draftStatus.clear();
            setError('');
          } else setError('Bewijs niet opgeslagen. Het concept blijft beschikbaar.');
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }}
    >
      <DraftNotice status={draftStatus} />
      <Field label="Bewijstitel">
        <input
          required
          autoFocus
          value={record.title}
          onChange={(e) => changeContent({ title: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Toepassingsbereik van bewijs">
          <select
            value={record.dossierId ?? ''}
            onChange={(event) => changeContent({ dossierId: event.target.value || undefined })}
          >
            <option value={dossierId}>Dit dossier</option>
            <option value="">Werkruimtebreed; toepasselijkheid per maatregel beoordelen</option>
          </select>
        </Field>
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
        hint="Leg de originele verwijzing vast. Een gekoppeld bestand krijgt een afzonderlijke hash en controle."
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
      <EvidenceAttachmentPanel
        workspaceId={workspaceId}
        evidence={record}
        session={fileSession}
        cloud={cloud}
        onSessionChange={onSessionChange}
        onBusyChange={setBusy}
        onChange={(patch, options) =>
          options?.contentChanged
            ? changeContent(patch)
            : set((previous) => ({ ...previous, ...patch }))
        }
      />
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
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        Bewijs opslaan
      </button>
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
  onSave: (o: Observation) => boolean;
}) {
  const [record, set, draftStatus] = usePersistentDraft<Observation>(
    `${workspace.id}/observation/${dossier.id}/new`,
    {
      id: id(),
      title: '',
      dossierId: dossier.id,
      date: today(),
      observer: '',
      facts: '',
      evidenceIds: [],
    },
    'new/v1',
    (candidate) => !(workspace.observations ?? []).some((existing) => existing.id === candidate.id),
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (onSave(record)) draftStatus.clear();
      }}
    >
      <DraftNotice status={draftStatus} />
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
          onChange={(e) =>
            set({ ...record, departmentId: e.target.value || undefined, walkthroughId: undefined })
          }
        >
          <option value="">Dossierbreed</option>
          {workspace.departments
            ?.filter(
              (d) =>
                (!dossier.departmentIds.length || dossier.departmentIds.includes(d.id)) &&
                (!dossier.organisationId ||
                  departmentOrganisationId(d, workspace.sites ?? []) === dossier.organisationId),
            )
            .map((d) => (
              <option key={d.id} value={d.id}>
                {departmentLabel(d, workspace.sites ?? [], workspace.organisations ?? [])}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Afkomstig uit rondgangverslag">
        <select
          value={record.walkthroughId ?? ''}
          onChange={(event) => set({ ...record, walkthroughId: event.target.value || undefined })}
        >
          <option value="">Geen gekoppeld verslag</option>
          {(workspace.walkthroughs ?? [])
            .filter(
              (report) =>
                (!report.dossierId || report.dossierId === dossier.id) &&
                (!dossier.organisationId || report.organisationId === dossier.organisationId) &&
                (!report.departmentId || report.departmentId === record.departmentId),
            )
            .map((report) => (
              <option key={report.id} value={report.id}>
                {report.title}
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
  onSave: (f: Finding) => boolean;
}) {
  const [record, set, draftStatus] = usePersistentDraft<Finding>(
    `${workspace.id}/finding/${dossier.id}/${initial?.id ?? 'new'}`,
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
    initial ? draftBase(initial) : 'new/v1',
    (candidate) =>
      Boolean(initial) ||
      !(workspace.findings ?? []).some((existing) => existing.id === candidate.id),
  );
  const decision = ['risk_accepted', 'resolved', 'closed'].includes(record.status);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (onSave(record)) draftStatus.clear();
      }}
    >
      <DraftNotice status={draftStatus} />
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
function TopicForm({
  workspace,
  onSave,
}: {
  workspace: WorkspaceState;
  onSave: (t: Topic) => boolean;
}) {
  const [draft, setDraft, draftStatus] = usePersistentDraft(
    `${workspace.id}/topic/new`,
    () => ({
      id: id(),
      title: '',
      category: '',
      description: '',
      aliases: '',
    }),
    'new/v1',
    (candidate) => !(workspace.topics ?? []).some((record) => record.id === candidate.id),
  );
  const { title, category, description, aliases } = draft;
  const setTitle = (title: string) => setDraft((previous) => ({ ...previous, title }));
  const setCategory = (category: string) => setDraft((previous) => ({ ...previous, category }));
  const setDescription = (description: string) =>
    setDraft((previous) => ({ ...previous, description }));
  const setAliases = (aliases: string) => setDraft((previous) => ({ ...previous, aliases }));
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if ((workspace.topics ?? []).some((record) => record.id === draft.id)) {
          setError(
            'Dit onderwerpconcept is inmiddels vastgelegd. De tekst blijft behouden; open het formulier opnieuw voor een nieuw onderwerp.',
          );
          return;
        }
        const accepted = onSave({
          id: draft.id,
          title,
          category,
          description,
          aliases: aliases
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
        });
        if (accepted) draftStatus.clear();
        else setError('Vastleggen geweigerd. Het volledige onderwerpconcept blijft behouden.');
      }}
    >
      <DraftNotice status={draftStatus} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
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
function LegalForm({
  workspace,
  topics,
  onSave,
}: {
  workspace: WorkspaceState;
  topics: Topic[];
  onSave: (l: LegalRecord) => boolean;
}) {
  const [record, set, draftStatus] = usePersistentDraft<LegalRecord>(
    `${workspace.id}/legal/new`,
    () => ({
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
    }),
    'new/v1',
    (candidate) =>
      !(workspace.legalRecords ?? []).some((existing) => existing.id === candidate.id) &&
      candidate.topicIds.every((topicId) => topics.some((topic) => topic.id === topicId)),
  );
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if ((workspace.legalRecords ?? []).some((existing) => existing.id === record.id)) {
          setError(
            'Dit regelgevingsconcept is inmiddels vastgelegd. De tekst blijft behouden; open het formulier opnieuw voor een nieuw signaal.',
          );
          return;
        }
        if (record.topicIds.some((topicId) => !topics.some((topic) => topic.id === topicId))) {
          setError(
            'Een gekozen onderwerp bestaat niet meer. Controleer het concept en pas de onderwerpkeuze aan.',
          );
          return;
        }
        if (onSave(record)) draftStatus.clear();
        else setError('Vastleggen geweigerd. Het volledige regelgevingsconcept blijft behouden.');
      }}
    >
      <DraftNotice status={draftStatus} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
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
function DossierReview({
  workspaceId,
  dossier,
  onSave,
}: {
  workspaceId: string;
  dossier: Dossier;
  onSave: (d: Dossier) => boolean;
}) {
  const [original] = useState(() => structuredClone(dossier));
  const originalBasis = draftBase(original);
  const [draft, setDraft, draftStatus] = usePersistentDraft(
    `${workspaceId}/dossier-review/${encodeURIComponent(dossier.id)}`,
    () => ({
      dossierId: original.id,
      sourceBasis: originalBasis,
      status: original.status,
      reviewedBy: original.reviewedBy ?? '',
      reviewNote: original.reviewNote ?? '',
    }),
    originalBasis,
    (candidate) => candidate.dossierId === dossier.id && candidate.sourceBasis === originalBasis,
  );
  const { status, reviewedBy, reviewNote } = draft;
  const setStatus = (status: Dossier['status']) =>
    setDraft((previous) => ({ ...previous, status }));
  const setReviewer = (reviewedBy: string) => setDraft((previous) => ({ ...previous, reviewedBy }));
  const setNote = (reviewNote: string) => setDraft((previous) => ({ ...previous, reviewNote }));
  const [error, setError] = useState('');
  const sourceChanged = draftBase(dossier) !== draft.sourceBasis || draft.dossierId !== dossier.id;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (sourceChanged) {
          setError(
            'Het dossier is gewijzigd sinds dit beoordelingsconcept. De invoer blijft behouden; sluit het formulier en open de actuele dossierbasis.',
          );
          return;
        }
        const accepted = onSave({
          ...original,
          status,
          reviewedBy,
          reviewNote,
          reviewedAt: new Date().toISOString(),
        });
        if (accepted) draftStatus.clear();
        else setError('Vastleggen geweigerd. Het volledige beoordelingsconcept blijft behouden.');
      }}
    >
      <DraftNotice status={draftStatus} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {sourceChanged && (
        <p role="alert">
          De dossierbasis is intussen gewijzigd. Dit beoordelingsconcept wordt niet automatisch aan
          de nieuwe dossierinhoud gebonden.
        </p>
      )}
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
      <button className="primary" disabled={sourceChanged}>
        Beoordeling vastleggen
      </button>
    </form>
  );
}
