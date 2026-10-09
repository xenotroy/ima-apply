import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  FileText,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Target,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import {
  calculateKinney,
  evaluateRisk,
  calculateLopa,
  efficacyEstimate,
  calculateFineJustification,
  calculateKinneyJustification,
  AHS_LABELS,
  KINNEY_SCALES,
} from './domain/risk';
import type { Control, Estimate, Scenario, LopaLayer } from './domain/types';
import {
  contentPacks,
  themes,
  questions as builtinQuestions,
  sources as builtinSources,
} from './content/catalog';
import type { Question } from './content/catalog';
import {
  createWorkspace,
  reviseWorkspace,
  loadLocalWorkspace,
  saveLocalWorkspace,
  importWorkspace,
  exportWorkspace,
  GitHubWorkspaceClient,
  departmentOrganisationId,
} from './data';
import type {
  WorkspaceState,
  WorkspacePatch,
  WorkspaceAction,
  WorkspaceIncident,
  WorkspaceAnswer,
  WorkspaceRecord,
  Dossier,
  Evidence,
  Department,
  Site,
} from './data';
import { demoWorkspace, newControl, newScenario } from './demo';
import Hologram from './components/Hologram';
import MigrationReviewPanel from './components/MigrationReviewPanel';
import { Badge, Field, Modal } from './components/Primitives';
import DossierWorkspace, { MultiSelect } from './components/DossierWorkspace';
import { questionHash } from './data/frozen';
import DossierReport, { dossierMarkdown } from './components/DossierReport';
import LearningWorkspace from './components/LearningWorkspace';
import { ActionLifecyclePanel } from './components/ActionLifecyclePanel';
import RiskAssessmentPanel, { riskAssessmentMarkdown } from './components/RiskAssessmentPanel';
import {
  actionRevision,
  actionSnapshot,
  actionSnapshotHash,
  actionStage,
  actionStageLabels,
} from './domain/action-lifecycle';
import { Waterfall, LopaChart } from './components/RiskCharts';

type Page =
  | 'overview'
  | 'dossiers'
  | 'risk'
  | 'questions'
  | 'actions'
  | 'incidents'
  | 'learning'
  | 'sources'
  | 'report'
  | 'settings';
const pages: { id: Page; label: string; icon: typeof Shield }[] = [
  { id: 'overview', label: 'Overzicht', icon: LayoutDashboard },
  { id: 'dossiers', label: 'Organisatie & dossiers', icon: FileText },
  { id: 'risk', label: 'Risicowerkbank', icon: Activity },
  { id: 'questions', label: 'Inventarisatie', icon: ClipboardCheck },
  { id: 'actions', label: 'Plan van aanpak', icon: ListChecks },
  { id: 'incidents', label: 'Incidenten & leren', icon: GitBranch },
  { id: 'learning', label: 'Onderzoek & cijfers', icon: Search },
  { id: 'sources', label: 'Kennis & bronnen', icon: BookOpen },
  { id: 'report', label: 'Rapportage', icon: FileText },
];
const num = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
const pct = (n: number) => `${num(n * 100)}%`;
const exp = (n: number) => (n === 0 ? '0' : n.toExponential(2));
const id = () => crypto.randomUUID();
function download(name: string, content: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readInitial() {
  try {
    const snapshot = loadLocalWorkspace();
    return {
      workspace: snapshot?.workspace ?? demoWorkspace(),
      version: snapshot?.version ?? null,
      error: '',
    };
  } catch (error) {
    return {
      workspace: createWorkspace('Herstelwerkruimte'),
      version: null,
      error: `Lokale gegevens kunnen niet worden gelezen. De opgeslagen versie is behouden. ${String(error)}`,
    };
  }
}
const answerLabels: Record<WorkspaceAnswer['choice'], string> = {
  yes: 'Ja',
  partial: 'Deels',
  no: 'Nee',
  unknown: 'Onbekend',
  na: 'N.v.t.',
};

export default function App() {
  const [initial] = useState(readInitial);
  const [workspace, setWorkspace] = useState(initial.workspace);
  const workspaceRef = useRef(workspace);
  const versionRef = useRef(initial.version);
  const queueRef = useRef(Promise.resolve());
  const [page, setPage] = useState<Page>('overview');
  const [inventoryDossierId, setInventoryDossierId] = useState('');
  useEffect(() => setInventoryDossierId(''), [workspace.id]);
  const [selectedId, setSelectedId] = useState(workspace.scenarios[0]?.id ?? '');
  const [notice, setNotice] = useState(initial.error);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(Boolean(initial.error));
  const saveFailedRef = useRef(Boolean(initial.error));
  const [modal, setModal] = useState<
    'scenario' | 'control' | 'action' | 'incident' | 'rename' | 'import' | 'new' | null
  >(null);
  const [editingControl, setEditingControl] = useState<Control | null>(null);
  const [editingIncident, setEditingIncident] = useState<WorkspaceIncident | undefined>();
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState('xenotroy/ima-apply-workspaces');
  const [cloudPath, setCloudPath] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('ima-sync-metadata') || 'null')?.path ||
        'workspaces/default.json'
      );
    } catch {
      return 'workspaces/default.json';
    }
  });
  const [cloudBusy, setCloudBusy] = useState(false);
  const [remotePreview, setRemotePreview] = useState<{
    workspace: WorkspaceState;
    sha: string;
    repo: string;
    path: string;
  } | null>(null);
  const [sync, setSync] = useState<{
    repo: string;
    path?: string;
    sha: string | null;
    revision: number;
    workspaceId: string;
  } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('ima-sync-metadata') || 'null');
    } catch {
      return null;
    }
  });
  const selected = workspace.scenarios.find((s) => s.id === selectedId) ?? workspace.scenarios[0];
  const persist = (next: WorkspaceState) => {
    try {
      next = importWorkspace(exportWorkspace(next));
    } catch (error) {
      setNotice(
        `Wijziging geweigerd: ${error instanceof Error ? error.message : String(error)} De vorige werkruimte blijft behouden.`,
      );
      return false;
    }
    setWorkspace(next);
    workspaceRef.current = next;
    setSaving(true);
    queueRef.current = queueRef.current
      .then(async () => {
        try {
          const saved = await saveLocalWorkspace(next, versionRef.current);
          versionRef.current = saved.version;
          saveFailedRef.current = false;
          setSaveFailed(false);
        } catch (error) {
          saveFailedRef.current = true;
          setSaveFailed(true);
          setNotice(
            `Niet lokaal opgeslagen: ${error instanceof Error ? error.message : String(error)} Exporteer je werkruimte om je wijzigingen te bewaren.`,
          );
        }
      })
      .finally(() => setSaving(false));
    return true;
  };
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      if (!initial.version && !initial.error) persist(initial.workspace);
    }
  }, []);
  const update = (patch: WorkspacePatch) => persist(reviseWorkspace(workspaceRef.current, patch));
  const changeScenario = (scenario: Scenario) =>
    update({
      scenarios: workspaceRef.current.scenarios.map((s) => (s.id === scenario.id ? scenario : s)),
    });
  const navigate = (next: Page) => {
    setPage(next);
    setGlobalSearch('');
  };
  const changeControl = (control: Control) => {
    if (selected)
      changeScenario({
        ...selected,
        controls: selected.controls.map((c) => (c.id === control.id ? control : c)),
      });
  };
  const activeRisks = workspace.scenarios.filter((s) => calculateKinney(s).score.max >= 200).length;
  const allQuestions = [
    ...builtinQuestions,
    ...(workspace.questions.filter(
      (q) => typeof q.prompt === 'string' && typeof q.themeId === 'string',
    ) as unknown as Question[]),
  ];
  const answered = new Set(workspace.answers.filter((a) => !a.dossierId).map((a) => a.questionId))
    .size;
  const completion = allQuestions.length ? Math.round((answered / allQuestions.length) * 100) : 0;
  const findResults = globalSearch.trim()
    ? workspace.scenarios.filter((s) =>
        [s.title, s.department, s.hazard, s.description]
          .join(' ')
          .toLowerCase()
          .includes(globalSearch.toLowerCase()),
      )
    : [];
  const startScenario = () => {
    setEditingScenario(newScenario());
    setModal('scenario');
  };
  const editScenario = () => {
    if (selected) {
      setEditingScenario(selected);
      setModal('scenario');
    }
  };
  const startControl = () => {
    setEditingControl(newControl());
    setModal('control');
  };
  const saveScenario = (s: Scenario) => {
    const exists = workspace.scenarios.some((x) => x.id === s.id);
    const accepted = update({
      scenarios: exists
        ? workspace.scenarios.map((x) => (x.id === s.id ? s : x))
        : [...workspace.scenarios, s],
    });
    if (!accepted) return;
    setSelectedId(s.id);
    setPage('risk');
    setModal(null);
  };
  const saveControl = (c: Control) => {
    if (!selected) return;
    changeScenario({
      ...selected,
      controls: selected.controls.some((x) => x.id === c.id)
        ? selected.controls.map((x) => (x.id === c.id ? c : x))
        : [...selected.controls, c],
    });
    setModal(null);
  };
  const syncMetadata = (
    sha: string | null,
    w: WorkspaceState,
    target = { repo, path: cloudPath },
  ) => {
    const m = { ...target, sha, revision: w.revision, workspaceId: w.id };
    setSync(m);
    localStorage.setItem('ima-sync-metadata', JSON.stringify(m));
  };
  const cloudClient = () => {
    const [owner, name, ...rest] = repo.trim().split('/');
    if (!token.trim())
      throw new Error(
        'Vul een GitHub-token in. Het token wordt alleen in het geheugen van dit tabblad bewaard.',
      );
    if (!owner || !name || rest.length) throw new Error('Gebruik eigenaar/repository.');
    return new GitHubWorkspaceClient({ owner, repo: name, token: token.trim(), path: cloudPath });
  };
  const pull = async () => {
    setCloudBusy(true);
    try {
      const result = await cloudClient().read();
      if (result.workspace && result.sha)
        setRemotePreview({ workspace: result.workspace, sha: result.sha, repo, path: cloudPath });
      else {
        syncMetadata(null, workspace);
        setNotice(
          'De private repository bevat nog geen werkruimte. Je kunt deze werkruimte nu publiceren naar die repository.',
        );
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setCloudBusy(false);
    }
  };
  const push = async () => {
    setCloudBusy(true);
    try {
      await queueRef.current;
      if (saveFailedRef.current)
        throw new Error('Los de lokale opslagfout op of exporteer eerst je werkruimte.');
      const same =
        sync?.repo === repo &&
        (sync.path ?? 'workspaces/default.json') === cloudPath &&
        sync.workspaceId === workspace.id;
      const result = await cloudClient().write(workspace, same ? sync.sha : null);
      syncMetadata(result.sha, workspace);
      setNotice(
        'Werkruimte veilig opgeslagen in je private GitHub-repository. Je kunt deze op een andere pc ophalen.',
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setCloudBusy(false);
    }
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Bestand groter dan 5 MB.');
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.schema === 'ima.content/v1') {
        const qs = parsed.questions;
        if (
          !Array.isArray(qs) ||
          !qs.every(
            (q: Question) =>
              typeof q.id === 'string' &&
              typeof q.prompt === 'string' &&
              typeof q.themeId === 'string' &&
              Array.isArray(q.sourceIds) &&
              Array.isArray(q.evidenceHints),
          )
        )
          throw new Error('Ongeldig contentpakket.');
        const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
        const ids = new Set([...builtinQuestions, ...workspace.questions].map((q) => q.id));
        const sourceIds = new Set(workspace.sources.map((q) => q.id));
        const recordIds = new Set(workspace.contentRecords?.map((record) => record.id));
        const records = (Array.isArray(parsed.records) ? parsed.records : []).map(
          (record: WorkspaceRecord, index: number) => ({
            ...record,
            id:
              typeof record.id === 'string'
                ? record.id
                : `${String(record.sourceId)}:record:${index}`,
          }),
        );
        const accepted = update({
          questions: [...workspace.questions, ...qs.filter((q: Question) => !ids.has(q.id))],
          sources: [
            ...workspace.sources,
            ...sources.filter(
              (s: WorkspaceRecord) => typeof s.id === 'string' && !sourceIds.has(s.id),
            ),
          ],
          contentRecords: [
            ...(workspace.contentRecords ?? []),
            ...records.filter((record: WorkspaceRecord) => !recordIds.has(record.id)),
          ],
        });
        if (!accepted) return;
        setNotice(
          `Contentpakket ingelezen: ${qs.length} aangeboden vragen. Bestaande IDs blijven behouden.`,
        );
      } else {
        const next = importWorkspace(text);
        setImportPreview(next);
      }
    } catch (e) {
      setNotice(`Import gestopt: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const [importPreview, setImportPreview] = useState<WorkspaceState | null>(null);
  const isDemo = workspace.name === 'Demonstratiewerkruimte';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('overview');
          }}
        >
          <div className="brand-mark">
            <Shield size={22} />
          </div>
          <span>
            IMA<span className="brand-apply">apply</span>
            <small>INTEGRAAL VEILIGHEIDSMANAGEMENT</small>
          </span>
        </a>
        <button className="workspace-switch" onClick={() => setModal('rename')}>
          <div className="workspace-icon">{workspace.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{workspace.name}</strong>
            <small>{isDemo ? 'Fictieve voorbeeldgegevens' : 'Eigen werkruimte'}</small>
          </div>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">WERKRUIMTE</div>
        <nav>
          {pages.map((p) => (
            <button
              key={p.id}
              aria-label={p.label}
              title={p.label}
              className={page === p.id ? 'active' : ''}
              onClick={() => navigate(p.id)}
            >
              <p.icon size={18} />
              <span>{p.label}</span>
              {p.id === 'actions' && (
                <small>{workspace.actions.filter(actionNeedsFollowup).length}</small>
              )}
              {p.id === 'risk' && activeRisks > 0 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-health">
            <span className={`live-dot ${saveFailed ? 'danger' : ''}`} />
            <span>
              {saveFailed
                ? 'Lokale opslag vraagt aandacht'
                : saving
                  ? 'Wijzigingen opslaan…'
                  : 'Werkruimte lokaal bewaard'}
            </span>
            <small>Revisie {workspace.revision}</small>
          </div>
          <button
            className={`settings-nav ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={18} /> Werkruimte & synchronisatie
          </button>
          <a
            className="version-link"
            href="https://github.com/xenotroy/ima-apply"
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={14} /> IMA Apply 2.1 <ArrowUpRight size={13} />
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Werkruimte <ChevronRight size={13} />
            <span>{pages.find((p) => p.id === page)?.label ?? 'Instellingen'}</span>
          </div>
          <div className="topbar-actions">
            <div className="search-wrap">
              <Search size={16} />
              <input
                aria-label="Zoek risicoscenario's"
                placeholder="Zoek een risicoscenario…"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
              {globalSearch && (
                <div className="search-results">
                  {findResults.length ? (
                    findResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedId(s.id);
                          navigate('risk');
                        }}
                      >
                        {s.title}
                        <small>{s.department}</small>
                      </button>
                    ))
                  ) : (
                    <p>Geen scenario gevonden.</p>
                  )}
                </div>
              )}
            </div>
            <button className="cloud-status" onClick={() => navigate('settings')}>
              <Cloud size={16} />
              {sync &&
              sync.sha !== null &&
              sync.revision === workspace.revision &&
              sync.workspaceId === workspace.id
                ? 'Gesynchroniseerd'
                : 'Lokaal'}
              <span className="avatar">KT</span>
            </button>
          </div>
        </header>
        <main>
          {notice && (
            <div className="notice" role="status">
              <TriangleAlert size={18} />
              <span>{notice}</span>
              <button onClick={() => setNotice('')} aria-label="Melding sluiten">
                <X size={16} />
              </button>
            </div>
          )}
          {page === 'overview' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">VAN INZICHT NAAR BEHEERSING</div>
                  <h1>
                    Grip op wat ertoe doet<span>.</span>
                  </h1>
                  <p>Risico’s begrijpen. Maatregelen onderbouwen. Effect zichtbaar maken.</p>
                </div>
                <button className="primary" onClick={startScenario}>
                  <Plus size={17} /> Nieuw risicoscenario
                </button>
              </div>
              {isDemo && (
                <div className="demo-note">
                  <Sparkles size={15} />
                  <span>Je bekijkt een demonstratie met fictieve gegevens.</span>
                  <button onClick={() => setModal('new')}>
                    Begin een eigen werkruimte <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <MigrationReviewPanel sources={workspace.sources} />
              <div className="stats-grid">
                <Stat
                  title="Risicoscenario’s"
                  value={String(workspace.scenarios.length)}
                  icon={Activity}
                  description={`${activeRisks} met conservatieve score ≥ 200`}
                  tone="rose"
                />
                <Stat
                  title="Beheersmaatregelen"
                  value={String(workspace.scenarios.reduce((n, s) => n + s.controls.length, 0))}
                  icon={Shield}
                  description={`${workspace.scenarios.flatMap((s) => s.controls).filter((c) => c.status === 'existing' && c.evidence === 'verified').length} aanwezig en onderbouwd`}
                  tone="green"
                />
                <Stat
                  title="Inventarisatie"
                  value={`${completion}%`}
                  icon={ClipboardCheck}
                  description={`${answered} van ${allQuestions.length} vragen beantwoord`}
                  tone="blue"
                />
                <Stat
                  title="Verbeteracties"
                  value={String(workspace.actions.filter(actionNeedsFollowup).length)}
                  icon={Target}
                  description={`${workspace.actions.filter((a) => a.status === 'in_progress').length} in uitvoering`}
                  tone="amber"
                />
              </div>
              {selected ? (
                <div className="overview-grid">
                  <section className="panel risk-hero">
                    <div className="panel-heading">
                      <div>
                        <div className="eyebrow">RISICO IN BEWEGING</div>
                        <h2>Wat verandert een maatregel?</h2>
                      </div>
                      <Badge>FINE–KINNEY</Badge>
                    </div>
                    <div className="scenario-select">
                      <div>
                        <span className="muted">Geselecteerd scenario</span>
                        <select
                          aria-label="Scenario overzicht"
                          value={selected.id}
                          onChange={(e) => setSelectedId(e.target.value)}
                        >
                          {workspace.scenarios.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="icon-button"
                        onClick={() => navigate('risk')}
                        aria-label="Open risicowerkbank"
                      >
                        <ArrowUpRight size={20} />
                      </button>
                    </div>
                    <Hologram scenario={selected} />
                    <ScoreSummary scenario={selected} />
                    <button className="text-link" onClick={() => navigate('risk')}>
                      Verken dit scenario in de risicowerkbank <ArrowRight size={15} />
                    </button>
                  </section>
                  <div className="overview-side">
                    <Priorities
                      scenario={selected}
                      compact
                      onEdit={(c) => {
                        setEditingControl(c);
                        setPage('risk');
                        setModal('control');
                      }}
                    />
                    <section className="panel method-note">
                      <div className="method-icon">
                        <Shield size={22} />
                      </div>
                      <h3>De beste maatregel begint bij de bron.</h3>
                      <p>
                        AHS-voorkeur en uitvoerbaarheid versterken de prioriteit. Het berekende
                        risico volgt uitsluitend de onderbouwde werking.
                      </p>
                      <button className="text-link" onClick={() => navigate('sources')}>
                        Bekijk de methodiek <ArrowRight size={15} />
                      </button>
                    </section>
                  </div>
                </div>
              ) : (
                <Empty
                  onAdd={startScenario}
                  title="Maak je eerste risicoscenario"
                  text="Leg gevaar, blootstelling, gevolg en beheersing vast om de risicoruimte te verkennen."
                />
              )}
              <section className="panel risk-table">
                <div className="panel-heading">
                  <div>
                    <h2>Risico’s in je werkruimte</h2>
                    <p>Van initieel risico naar aantoonbare beheersing.</p>
                  </div>
                  <button className="secondary" onClick={() => navigate('risk')}>
                    Alle scenario’s <ArrowRight size={15} />
                  </button>
                </div>
                <ScenarioTable
                  scenarios={workspace.scenarios}
                  onSelect={(s) => {
                    setSelectedId(s.id);
                    navigate('risk');
                  }}
                />
              </section>
            </>
          )}
          {page === 'risk' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">BEREKENEN · ONDERBOUWEN · VERGELIJKEN</div>
                  <h1>
                    Risicowerkbank<span>.</span>
                  </h1>
                  <p>
                    Verken het scenario, de werking van barrières en de ruimte voor verbetering.
                  </p>
                </div>
                <button className="primary" onClick={startScenario}>
                  <Plus size={17} /> Scenario toevoegen
                </button>
              </div>
              <div className="scenario-tabs">
                {workspace.scenarios.map((s) => (
                  <button
                    key={s.id}
                    className={s.id === selected?.id ? 'selected' : ''}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <span className="live-dot" />
                    {s.title}
                  </button>
                ))}
              </div>
              {selected ? (
                <>
                  <RiskWorkbench
                    scenario={selected}
                    changeScenario={changeScenario}
                    editScenario={editScenario}
                    addControl={startControl}
                    editControl={(c) => {
                      setEditingControl(c);
                      setModal('control');
                    }}
                  />
                  <RiskAssessmentPanel
                    key={selected.id}
                    scenario={selected}
                    records={(workspace.riskAssessments ?? []).filter(
                      (r) => r.scenarioId === selected.id,
                    )}
                    onSave={(record) =>
                      update({
                        riskAssessments: [...(workspaceRef.current.riskAssessments ?? []), record],
                      })
                    }
                  />
                </>
              ) : (
                <Empty
                  onAdd={startScenario}
                  title="Nog geen scenario’s"
                  text="Begin met één concreet gevaar en één gevolg."
                />
              )}
            </>
          )}
          {page === 'dossiers' && (
            <DossierWorkspace
              workspace={workspace}
              questions={allQuestions}
              onUpdate={update}
              openInventory={(dossierId) => {
                setInventoryDossierId(dossierId);
                navigate('questions');
              }}
              openScenario={(scenarioId) => {
                setSelectedId(scenarioId);
                navigate('risk');
              }}
            />
          )}
          {page === 'questions' && (
            <Questionnaire
              questions={
                workspace.dossiers?.find((d) => d.id === inventoryDossierId)?.questions ??
                allQuestions
              }
              dossierId={inventoryDossierId || undefined}
              dossiers={workspace.dossiers ?? []}
              onDossierChange={setInventoryDossierId}
              evidence={workspace.evidence ?? []}
              answers={workspace.answers.filter(
                (a) => a.dossierId === (inventoryDossierId || undefined),
              )}
              updateAnswer={(answer) =>
                update({
                  answers: [
                    ...workspace.answers.filter(
                      (a) => a.questionId !== answer.questionId || a.dossierId !== answer.dossierId,
                    ),
                    answer,
                  ],
                })
              }
              addScenario={(q) => {
                setEditingScenario({
                  ...newScenario(),
                  title: q.prompt,
                  dossierId: inventoryDossierId || undefined,
                  description: `Aanleiding: inventarisatievraag ${q.id}`,
                  sourceIds: q.sourceIds,
                });
                setModal('scenario');
              }}
            />
          )}
          {page === 'actions' && (
            <Actions
              actions={workspace.actions}
              scenarios={workspace.scenarios}
              evidence={workspace.evidence ?? []}
              updateAction={(a, expectedRevision) => {
                const current = workspaceRef.current.actions.find((x) => x.id === a.id);
                const expectedPrevious =
                  current?.lifecycle?.history.at(-1)?.sha256 ??
                  (current ? actionSnapshotHash(actionSnapshot(current)) : '');
                if (
                  !current ||
                  actionRevision(current) !== expectedRevision ||
                  a.lifecycle?.history.at(-1)?.previousSha256 !== expectedPrevious
                ) {
                  setNotice(
                    'Deze actie heeft een nieuwere revisie. Je wijziging is niet overschreven; open de actuele revisie.',
                  );
                  return false;
                }
                return update({
                  actions: workspaceRef.current.actions.map((x) => (x.id === a.id ? a : x)),
                });
              }}
              onAdd={() => setModal('action')}
            />
          )}
          {page === 'incidents' && (
            <Incidents
              incidents={workspace.incidents}
              actions={workspace.actions}
              scenarios={workspace.scenarios}
              add={() => {
                setEditingIncident(undefined);
                setModal('incident');
              }}
              onEdit={(i) => {
                setEditingIncident(i);
                setModal('incident');
              }}
              createAction={(i) => {
                const actionId = id();
                update({
                  incidents: workspace.incidents.map((x) =>
                    x.id === i.id ? { ...x, actionIds: [...x.actionIds, actionId] } : x,
                  ),
                  actions: [
                    ...workspace.actions,
                    {
                      id: actionId,
                      title: `Onderzoek en verbeter: ${i.title}`,
                      scenarioId: i.scenarioId,
                      dossierId: workspace.scenarios.find((s) => s.id === i.scenarioId)?.dossierId,
                      owner: '',
                      dueDate: '',
                      status: 'open',
                      notes: `Naar aanleiding van incident ${i.id}. ${i.description}`,
                    },
                  ],
                });
                navigate('actions');
              }}
            />
          )}
          {page === 'learning' && <LearningWorkspace workspace={workspace} onUpdate={update} />}
          {page === 'sources' && (
            <Sources
              workspace={workspace}
              onImport={() => {
                fileRef.current!.accept = '.json';
                fileRef.current!.click();
              }}
            />
          )}
          {page === 'report' && <Report workspace={workspace} questions={allQuestions} />}
          {page === 'settings' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">ÉÉN ACCOUNT · MEERDERE APPARATEN</div>
                  <h1>
                    Je werkruimte, overal<span>.</span>
                  </h1>
                  <p>
                    Bewaar lokaal en synchroniseer je dossier via een private GitHub-repository.
                  </p>
                </div>
              </div>
              <div className="settings-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>GitHub-synchronisatie</h2>
                    <GitBranch size={20} />
                  </div>
                  <p className="muted">
                    Op iedere pc dezelfde app en hetzelfde GitHub-account. Haal de nieuwste
                    werkruimte op voordat je verder werkt.
                  </p>
                  <Field label="Private repository">
                    <input
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      placeholder="eigenaar/repository"
                    />
                  </Field>
                  <Field
                    label="Werkruimtebestand in de repository"
                    hint="Gebruik op iedere pc hetzelfde bestand. Bewaar afzonderlijke projecten bijvoorbeeld als workspaces/projectnaam.json."
                  >
                    <input
                      value={cloudPath}
                      onChange={(e) => setCloudPath(e.target.value)}
                      placeholder="workspaces/default.json"
                    />
                  </Field>
                  <Field
                    label="Fine-grained GitHub-token"
                    hint="Alleen deze private repository · Contents: read and write. Het token blijft uitsluitend in het geheugen tot je dit tabblad sluit."
                  >
                    <input
                      type="password"
                      autoComplete="off"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="github_pat_…"
                    />
                  </Field>
                  <div className="button-row">
                    <button className="secondary" onClick={pull} disabled={cloudBusy}>
                      {cloudBusy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ArrowDownToLine size={16} />
                      )}{' '}
                      Cloudversie bekijken
                    </button>
                    <button className="primary" onClick={push} disabled={cloudBusy}>
                      <Upload size={16} /> Opslaan in GitHub
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => setToken('')}
                      aria-label="Token uit geheugen wissen"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="info-box">
                    Conflicten worden geblokkeerd. Een nieuwere cloudversie wordt nooit stil
                    overschreven. De app verifieert dat de repository private is voordat gegevens
                    worden verstuurd.
                  </div>
                  <a
                    className="text-link"
                    href="https://github.com/settings/personal-access-tokens/new"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Maak een beperkt token aan <ArrowUpRight size={14} />
                  </a>
                  {sync && (
                    <p className="caption">
                      Laatste synchronisatie: revisie {sync.revision} · {sync.repo}
                    </p>
                  )}
                </section>
                <div>
                  <section className="panel">
                    <h2>Overdragen & herstellen</h2>
                    <p className="muted">
                      Een volledige JSON-export bevat je scenario’s, vragen, antwoorden, acties en
                      bronverwijzingen.
                    </p>
                    <div className="stack-buttons">
                      <button
                        className="secondary"
                        onClick={() => download('ima-werkruimte.json', exportWorkspace(workspace))}
                      >
                        <ArrowDownToLine size={16} /> Werkruimte exporteren
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          fileRef.current!.accept = '.json';
                          fileRef.current!.click();
                        }}
                      >
                        <Upload size={16} /> Werkruimte of content importeren
                      </button>
                      <button className="secondary" onClick={() => setModal('new')}>
                        <Plus size={16} /> Lege werkruimte beginnen
                      </button>
                    </div>
                  </section>
                  <section className="panel settings-meta">
                    <h3>Opslagstatus</h3>
                    <p>
                      Werkruimte-ID <code>{workspace.id}</code>
                    </p>
                    <p>
                      Revisie <strong>{workspace.revision}</strong>
                    </p>
                    <p>
                      Bijgewerkt{' '}
                      <strong>{new Date(workspace.updatedAt).toLocaleString('nl-NL')}</strong>
                    </p>
                    <p>
                      {saveFailed
                        ? 'Wijzigingen nog niet lokaal opgeslagen. Exporteer eerst.'
                        : 'Automatische lokale opslag actief.'}
                    </p>
                  </section>
                </div>
              </div>
            </>
          )}
          <footer className="main-footer">
            <span>
              IMA Apply <span className="footer-dot">·</span> Van inzicht naar aantoonbare
              beheersing
            </span>
            <span>
              Methodiek v2.0 <span className="footer-dot">·</span>{' '}
              {isDemo ? 'Demonstratie' : 'Eigen dossier'}
            </span>
          </footer>
        </main>
      </div>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }}
      />
      {modal === 'scenario' && editingScenario && (
        <ScenarioEditor
          scenario={editingScenario}
          dossiers={workspace.dossiers ?? []}
          departments={workspace.departments ?? []}
          sites={workspace.sites ?? []}
          onClose={() => setModal(null)}
          onSave={saveScenario}
        />
      )}
      {modal === 'control' && editingControl && (
        <ControlEditor
          control={editingControl}
          onClose={() => setModal(null)}
          onSave={saveControl}
        />
      )}
      {modal === 'action' && (
        <ActionEditor
          scenarios={workspace.scenarios}
          onClose={() => setModal(null)}
          onSave={(a) => {
            update({ actions: [...workspace.actions, a] });
            setModal(null);
          }}
        />
      )}
      {modal === 'incident' && (
        <IncidentEditor
          initial={editingIncident}
          departments={workspace.departments ?? []}
          scenarios={workspace.scenarios}
          onClose={() => setModal(null)}
          onSave={(i) => {
            if (update({ incidents: [...workspace.incidents.filter((x) => x.id !== i.id), i] }))
              setModal(null);
          }}
        />
      )}
      {modal === 'rename' && (
        <NameEditor
          initial={workspace.name}
          onClose={() => setModal(null)}
          onSave={(name) => {
            update({ name });
            setModal(null);
          }}
        />
      )}
      {modal === 'new' && (
        <Modal title="Begin een eigen werkruimte" onClose={() => setModal(null)}>
          <p>
            Exporteer je huidige werkruimte voordat je een nieuwe opent. Elke werkruimte bevat een
            zelfstandig dossier.
          </p>
          <button
            className="secondary"
            onClick={() => download('ima-werkruimte.json', exportWorkspace(workspace))}
          >
            Huidige werkruimte exporteren
          </button>
          <NameEditorContent
            initial="Mijn veiligheidswerkruimte"
            onSave={(name) => {
              persist(createWorkspace(name));
              setSelectedId('');
              setSync(null);
              localStorage.removeItem('ima-sync-metadata');
              setModal(null);
              navigate('overview');
            }}
          />
        </Modal>
      )}
      {remotePreview && (
        <Modal title="Cloudversie beoordelen" onClose={() => setRemotePreview(null)}>
          <p>
            <strong>{remotePreview.workspace.name}</strong> · revisie{' '}
            {remotePreview.workspace.revision}
          </p>
          <p>
            {remotePreview.workspace.scenarios.length} scenario’s ·{' '}
            {remotePreview.workspace.answers.length} antwoorden ·{' '}
            {remotePreview.workspace.actions.length} acties
          </p>
          <p className="muted">
            Je lokale werkruimte: {workspace.name}, revisie {workspace.revision}. Download je lokale
            versie als je die wilt bewaren voordat je de cloudversie opent.
          </p>
          <div className="button-row">
            <button
              className="secondary"
              onClick={() => download('ima-lokaal-backup.json', exportWorkspace(workspace))}
            >
              Lokale versie exporteren
            </button>
            <button
              className="primary"
              onClick={() => {
                persist(remotePreview.workspace);
                syncMetadata(remotePreview.sha, remotePreview.workspace, {
                  repo: remotePreview.repo,
                  path: remotePreview.path,
                });
                setRepo(remotePreview.repo);
                setCloudPath(remotePreview.path);
                setSelectedId(remotePreview.workspace.scenarios[0]?.id ?? '');
                setRemotePreview(null);
                setNotice('Cloudversie geopend. Wijzigingen worden nu weer lokaal bewaard.');
              }}
            >
              Gebruik cloudversie
            </button>
          </div>
        </Modal>
      )}
      {importPreview && (
        <Modal title="Werkruimte importeren" onClose={() => setImportPreview(null)}>
          <p>
            {importPreview.name} · {importPreview.scenarios.length} scenario’s ·{' '}
            {importPreview.answers.length} antwoorden · {importPreview.dossiers?.length ?? 0}{' '}
            dossiers · {importPreview.evidence?.length ?? 0} bewijsrecords ·{' '}
            {importPreview.findings?.length ?? 0} bevindingen
          </p>
          <p>
            Deze import vervangt de geopende werkruimte. Exporteer eerst als je die wilt bewaren.
          </p>
          <div className="button-row">
            <button
              className="secondary"
              onClick={() => download('ima-backup.json', exportWorkspace(workspace))}
            >
              Huidige exporteren
            </button>
            <button
              className="primary"
              onClick={() => {
                persist(importPreview);
                setSelectedId(importPreview.scenarios[0]?.id ?? '');
                setSync(null);
                localStorage.removeItem('ima-sync-metadata');
                setImportPreview(null);
              }}
            >
              Import openen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof Shield;
  tone: string;
}) {
  return (
    <section className="stat">
      <div className="stat-top">
        <span>{title}</span>
        <div className={`stat-icon ${tone}`}>
          <Icon size={17} />
        </div>
      </div>
      <strong>{value}</strong>
      <small>{description}</small>
    </section>
  );
}
function Empty({ title, text, onAdd }: { title: string; text: string; onAdd: () => void }) {
  return (
    <section className="panel empty">
      <Shield size={32} />
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="primary" onClick={onAdd}>
        <Plus size={16} /> Toevoegen
      </button>
    </section>
  );
}
function ScoreSummary({ scenario }: { scenario: Scenario }) {
  const r = evaluateRisk(scenario);
  const delta = r.initial ? 1 - r.target.score.value / r.initial : 0;
  return (
    <div className="score-summary">
      <div>
        <small>INITIEEL</small>
        <strong className="rose-text">{num(r.initial)}</strong>
        <span>
          W {num(scenario.probability)} × B {num(scenario.exposure)} × E {num(scenario.effect)}
        </span>
      </div>
      <ChevronRight size={18} />
      <div>
        <small>HUIDIG</small>
        <strong className="amber-text">{num(r.current.score.value)}</strong>
        <span>
          {num(r.current.score.min)} – {num(r.current.score.max)}
        </span>
      </div>
      <ChevronRight size={18} />
      <div>
        <small>PROGNOSE</small>
        <strong className="green-text">{num(r.target.score.value)}</strong>
        <span>
          {num(r.target.score.min)} – {num(r.target.score.max)}
        </span>
      </div>
      <div className="reduction-tile">
        <ArrowDownToLine size={16} />
        <strong>{pct(delta)}</strong>
        <small>scoresreductie t.o.v. initieel</small>
      </div>
    </div>
  );
}
function ScenarioTable({
  scenarios,
  onSelect,
}: {
  scenarios: Scenario[];
  onSelect: (s: Scenario) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Risicoscenario</th>
            <th>Afdeling</th>
            <th>Initieel</th>
            <th>Huidig</th>
            <th>Prognose</th>
            <th>Conservatieve klasse</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s) => {
            const r = evaluateRisk(s);
            return (
              <tr key={s.id} onClick={() => onSelect(s)}>
                <td>
                  <button className="table-link" onClick={() => onSelect(s)}>
                    {s.title}
                  </button>
                  <small>{s.hazard}</small>
                </td>
                <td>{s.department || '—'}</td>
                <td className="rose-text mono">{num(r.initial)}</td>
                <td className="amber-text mono">{num(r.current.score.value)}</td>
                <td className="green-text mono">{num(r.target.score.value)}</td>
                <td>
                  <Badge
                    tone={
                      r.current.score.max >= 200
                        ? 'rose'
                        : r.current.score.max >= 70
                          ? 'amber'
                          : 'green'
                    }
                  >
                    {r.current.conservativeBand.label}
                  </Badge>
                </td>
                <td>
                  <ArrowUpRight size={16} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!scenarios.length && <p className="muted">Nog geen scenario’s vastgelegd.</p>}
    </div>
  );
}
function Priorities({
  scenario,
  compact = false,
  onEdit,
}: {
  scenario: Scenario;
  compact?: boolean;
  onEdit: (c: Control) => void;
}) {
  const r = evaluateRisk(scenario);
  const priorities = r.priorities.filter(
    (p) => scenario.controls.find((c) => c.id === p.controlId)?.status === 'planned',
  );
  return (
    <section className={`panel priorities ${compact ? 'compact' : ''}`}>
      <div className="panel-heading">
        <div>
          <div className="eyebrow">SLIM VERBETEREN</div>
          <h2>Maatregelen met impact</h2>
        </div>
        <Sparkles size={19} />
      </div>
      <p className="muted">
        AHS-voorkeur × uitvoerbaarheid × marginale scoresreductie / inspanning
      </p>
      {priorities.length ? (
        priorities.slice(0, compact ? 3 : undefined).map((p, i) => {
          const c = scenario.controls.find((c) => c.id === p.controlId)!;
          return (
            <button className="priority-item" key={c.id} onClick={() => onEdit(c)}>
              <span className="rank">{i + 1}</span>
              <div>
                <strong>{c.title}</strong>
                <small>
                  {AHS_LABELS[c.ahs]} ·{' '}
                  {c.feasibility === 'easy'
                    ? 'Eenvoudig uitvoerbaar'
                    : c.feasibility === 'hard'
                      ? 'Complex'
                      : 'Haalbaar'}
                </small>
                <div className="priority-tags">
                  {p.mandatory && <Badge tone="rose">Verplicht</Badge>}
                  {p.feasibilityMultiplier > 1 && (
                    <Badge>Haalbaarheid ×{num(p.feasibilityMultiplier)}</Badge>
                  )}
                </div>
              </div>
              <span className="priority-score">
                {num(p.score)}
                <small>prioriteit</small>
              </span>
            </button>
          );
        })
      ) : (
        <p className="muted">Voeg geplande maatregelen met een onderbouwing toe.</p>
      )}
      <p className="caption">
        Lokale beslisondersteuning. Verplichte maatregelen blijven vooraan; deze score bepaalt geen
        juridische aanvaardbaarheid.
      </p>
    </section>
  );
}

function RiskWorkbench({
  scenario,
  changeScenario,
  editScenario,
  addControl,
  editControl,
}: {
  scenario: Scenario;
  changeScenario: (s: Scenario) => void;
  editScenario: () => void;
  addControl: () => void;
  editControl: (c: Control) => void;
}) {
  const [model, setModel] = useState<'kinney' | 'lopa'>('kinney');
  const r = evaluateRisk(scenario);
  return (
    <>
      <div className="model-toolbar">
        <div className="segmented">
          <button className={model === 'kinney' ? 'active' : ''} onClick={() => setModel('kinney')}>
            Fine–Kinney / Wiruth
          </button>
          <button className={model === 'lopa' ? 'active' : ''} onClick={() => setModel('lopa')}>
            LOPA
          </button>
        </div>
        <button className="secondary" onClick={editScenario}>
          <SlidersHorizontal size={16} /> Scenario bewerken
        </button>
      </div>
      <section className="panel scenario-context">
        <div>
          <Badge tone="blue">{scenario.department || 'Scope vastleggen'}</Badge>
          <h2>{scenario.title}</h2>
          <p>{scenario.description || 'Beschrijf hoe het gevaar tot schade kan leiden.'}</p>
        </div>
        <div className="context-facts">
          <span>
            <small>GEVAAR</small>
            {scenario.hazard || 'Nog niet vastgelegd'}
          </span>
          <span>
            <small>GEVOLG</small>
            {scenario.consequence || 'Nog niet vastgelegd'}
          </span>
        </div>
      </section>
      {model === 'kinney' ? (
        <>
          <div className="workbench-grid">
            <section className="panel">
              <div className="panel-heading">
                <h2>Risicoruimte</h2>
                <Badge tone="blue">Semikwantitatief</Badge>
              </div>
              <Hologram scenario={scenario} />
              <ScoreSummary scenario={scenario} />
            </section>
            <section className="panel factor-panel">
              <div className="eyebrow">INITIËLE BEOORDELING</div>
              <h2>Drie factoren, één scenario</h2>
              <p className="muted">
                Beoordeel vóór credit voor maatregelen. Gebruik geen huidige score als initieel
                risico als dezelfde barrières daarna opnieuw meetellen.
              </p>
              {(['probability', 'exposure', 'effect'] as const).map((key, i) => (
                <Field key={key} label={['Waarschijnlijkheid W', 'Blootstelling B', 'Effect E'][i]}>
                  <select
                    aria-label={['Waarschijnlijkheid W', 'Blootstelling B', 'Effect E'][i]}
                    value={scenario[key]}
                    onChange={(e) => changeScenario({ ...scenario, [key]: Number(e.target.value) })}
                  >
                    {KINNEY_SCALES[key].map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.value} · {v.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <div className="formula">
                <span>R = W × B × E</span>
                <strong>{num(r.initial)}</strong>
              </div>
              <div className="info-box">
                Scores zijn rangschikkingsgetallen. Een daling van 80% in de score is geen
                aangetoonde daling van 80% in de ongevalskans.
              </div>
            </section>
          </div>
          <section className="panel">
            <Waterfall current={r.current} target={r.target} />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Barrières & beheersmaatregelen</h2>
                <p>Werking, bewijs en afhankelijkheid per maatregel.</p>
              </div>
              <button className="primary" onClick={addControl}>
                <Plus size={16} /> Maatregel toevoegen
              </button>
            </div>
            <div className="controls-list">
              {scenario.controls.map((c) => {
                const excluded = r.target.excluded.find((x) => x.id === c.id);
                return (
                  <button className="control-row" key={c.id} onClick={() => editControl(c)}>
                    <div className={`ahs-symbol ahs-${c.ahs}`}>
                      <Shield size={19} />
                    </div>
                    <div className="control-title">
                      <strong>{c.title}</strong>
                      <small>
                        {AHS_LABELS[c.ahs]} ·{' '}
                        {c.dependencyGroup
                          ? `Groep: ${c.dependencyGroup}`
                          : c.independent
                            ? 'Onafhankelijk verklaard'
                            : 'Afhankelijkheid open'}
                      </small>
                      {excluded && (
                        <span className="exclusion">Geen credit: {excluded.reason}</span>
                      )}
                    </div>
                    <div className="control-effect">
                      <span>W −{pct(c.probabilityReduction.value)}</span>
                      <span>B −{pct(c.exposureReduction.value)}</span>
                      <span>E −{pct(c.effectReduction.value)}</span>
                    </div>
                    <Badge
                      tone={
                        c.status === 'existing'
                          ? 'blue'
                          : c.status === 'retired'
                            ? 'muted'
                            : 'amber'
                      }
                    >
                      {c.status === 'existing'
                        ? 'Bestaand'
                        : c.status === 'retired'
                          ? 'Vervallen'
                          : 'Gepland'}
                    </Badge>
                    <span
                      className={`evidence-status ${c.evidence === 'verified' ? 'green-text' : 'muted'}`}
                    >
                      <CheckCircle2 size={14} />
                      {c.evidence === 'verified'
                        ? 'Onderbouwd'
                        : c.evidence === 'unknown'
                          ? 'Onbekend'
                          : 'Nog te toetsen'}
                    </span>
                    <ChevronRight size={16} />
                  </button>
                );
              })}
              {!scenario.controls.length && (
                <p className="muted">
                  Voeg een maatregel toe en leg uit hoe deze inwerkt op het scenario.
                </p>
              )}
            </div>
          </section>
          <Justification scenario={scenario} />
          <div className="bottom-grid">
            <Priorities scenario={scenario} onEdit={editControl} />
            <section className="panel">
              <h2>Beoordeling & onzekerheid</h2>
              <p className="muted">
                Conservatief huidig restrisico:{' '}
                <strong style={{ color: r.current.conservativeBand.color }}>
                  {num(r.current.score.max)} · {r.current.conservativeBand.label}
                </strong>
              </p>
              <p>{r.current.conservativeBand.action}</p>
              <Field label="Onderbouwing van de beoordeling">
                <textarea
                  rows={4}
                  value={scenario.assessmentNotes ?? ''}
                  onChange={(e) => changeScenario({ ...scenario, assessmentNotes: e.target.value })}
                  placeholder="Bronnen, aannames en beoordelaarskeuzes…"
                />
              </Field>
              {[...new Set([...r.current.warnings, ...r.target.warnings])].map((w, i) => (
                <p className="warning-line" key={i}>
                  <TriangleAlert size={15} />
                  {w}
                </p>
              ))}
              {r.current.excluded.map((x) => (
                <p className="caption" key={x.id}>
                  {x.title}: {x.reason}
                </p>
              ))}
            </section>
          </div>
        </>
      ) : (
        <LopaWorkbench scenario={scenario} onChange={changeScenario} />
      )}
    </>
  );
}
function LopaWorkbench({
  scenario,
  onChange,
}: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
}) {
  const [lopa, setDraft] = useState(scenario.lopa);
  const [setup, setSetup] = useState(false);
  const [draftError, setDraftError] = useState('');
  useEffect(() => {
    setDraft(scenario.lopa);
    setDraftError('');
    setSetup(false);
  }, [scenario.id, scenario.lopa]);
  if (!lopa)
    return (
      <section className="panel empty">
        <GitBranch size={30} />
        <h2>Beoordeel één initiator en één gevolg</h2>
        <p>
          LOPA rekent met gebeurtenisfrequentie per jaar en PFD’s van aantoonbaar onafhankelijke
          beschermlagen. De Fine–Kinney-score wordt niet omgerekend.
        </p>
        <button className="primary" onClick={() => setSetup(true)}>
          LOPA opzetten
        </button>
        {setup && (
          <LopaSetup
            scenario={scenario}
            onClose={() => setSetup(false)}
            onSave={(l) => {
              onChange({ ...scenario, lopa: l });
              setSetup(false);
            }}
          />
        )}
      </section>
    );
  let result;
  try {
    result = calculateLopa(lopa);
  } catch (error) {
    draftError || setDraftError(error instanceof Error ? error.message : String(error));
    result = scenario.lopa ? calculateLopa(scenario.lopa) : null;
  }
  if (!result) return <p>Vul de LOPA-invoer volledig in.</p>;
  const set = (patch: Partial<typeof lopa>) => {
    setDraft({ ...lopa, ...patch });
    setDraftError('');
  };
  const saveDraft = () => {
    try {
      if (!lopa.assumptions.trim())
        throw new Error(
          'Leg de aannames en het criteriumbesluit vast voordat je deze LOPA opslaat.',
        );
      calculateLopa(lopa);
      onChange({ ...scenario, lopa });
      setDraftError('');
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error));
    }
  };
  const setLayer = (layer: LopaLayer) =>
    set({ layers: lopa.layers.map((x) => (x.id === layer.id ? layer : x)) });
  return (
    <>
      <div className="lopa-draft-bar">
        <span>
          {draftError
            ? `Onvolledig concept: ${draftError} De grafiek toont de laatst opgeslagen beoordeling.`
            : 'LOPA-wijzigingen zijn een concept totdat je ze opslaat.'}
        </span>
        <button className="primary" onClick={saveDraft}>
          <Check size={15} /> LOPA opslaan
        </button>
      </div>
      <div className="workbench-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Beschermlagen en gebeurtenisfrequentie</h2>
            <Badge tone="blue">LOPA · /jaar</Badge>
          </div>
          <LopaChart result={result} />
          <div className="lopa-summary">
            <div>
              <small>INITIATOR /JAAR</small>
              <strong>{exp(result.initiatingFrequency.value)}</strong>
            </div>
            <div>
              <small>RESTRISICO /JAAR</small>
              <strong className="green-text">{exp(result.frequency.value)}</strong>
              <small>
                {exp(result.frequency.min)} – {exp(result.frequency.max)}
              </small>
            </div>
            <div>
              <small>PROJECTCRITERIUM</small>
              <strong className="amber-text">{exp(result.targetFrequency)}</strong>
              <Badge
                tone={
                  result.comparison === 'unconfirmed'
                    ? 'amber'
                    : result.comparison === 'below'
                      ? 'green'
                      : 'rose'
                }
              >
                {result.comparison === 'unconfirmed'
                  ? 'Criteriumbasis niet vastgelegd'
                  : result.comparison === 'below'
                    ? 'Gehele band onder criterium'
                    : result.comparison === 'above'
                      ? 'Gehele band boven criterium'
                      : 'Band kruist criterium'}
              </Badge>
            </div>
          </div>
          {result.warnings.map((w, i) => (
            <p className="warning-line" key={i}>
              <TriangleAlert size={15} />
              {w}
            </p>
          ))}
        </section>
        <section className="panel">
          <h2>Scenario & criteria</h2>
          <Field label="Initiërende gebeurtenis">
            <input
              value={lopa.initiatingEvent}
              onChange={(e) => set({ initiatingEvent: e.target.value })}
            />
          </Field>
          <EstimateInput
            label="Initiatorfrequentie per jaar"
            estimate={lopa.initiatingFrequency}
            onChange={(v) => set({ initiatingFrequency: v })}
            max={1e6}
          />
          <Field label="Bron en onderbouwing frequentie">
            <textarea
              value={lopa.frequencyEvidence}
              onChange={(e) => set({ frequencyEvidence: e.target.value })}
            />
          </Field>
          <Field label="Gevolg-eindpunt">
            <input
              value={lopa.consequence}
              onChange={(e) => set({ consequence: e.target.value })}
            />
          </Field>
          <Field
            label="Lokaal vastgesteld criterium (/jaar)"
            hint="Geen universele acceptatiegrens. Leg herkomst en besluit vast."
          >
            <input
              type="number"
              min="0.000000000001"
              step="any"
              value={lopa.targetFrequency}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) set({ targetFrequency: v });
              }}
            />
          </Field>
          <Field label="Aannames en criteriumbesluit">
            <textarea
              value={lopa.assumptions}
              onChange={(e) => set({ assumptions: e.target.value })}
            />
          </Field>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Independent Protection Layers</h2>
            <p>Alle kwalificatievoorwaarden moeten aantoonbaar zijn ingevuld.</p>
          </div>
          <button
            className="primary"
            onClick={() =>
              set({
                layers: [
                  ...lopa.layers,
                  {
                    id: id(),
                    title: 'Nieuwe beschermlaag',
                    status: 'planned',
                    evidence: 'unverified',
                    evidenceNote: '',
                    pfd: { min: 0.1, value: 0.1, max: 0.1 },
                    specific: false,
                    independent: false,
                    independentOfInitiator: false,
                    auditable: false,
                    effective: false,
                    independenceNote: '',
                  },
                ],
              })
            }
          >
            <Plus size={16} /> Beschermlaag
          </button>
        </div>
        {lopa.layers.map((layer) => (
          <div className="lopa-layer" key={layer.id}>
            <div className="form-grid">
              <Field label="Beschermlaag">
                <input
                  value={layer.title}
                  onChange={(e) => setLayer({ ...layer, title: e.target.value })}
                />
              </Field>
              <Field label="Status">
                <select
                  value={layer.status}
                  onChange={(e) =>
                    setLayer({ ...layer, status: e.target.value as LopaLayer['status'] })
                  }
                >
                  <option value="existing">Bestaand</option>
                  <option value="planned">Gepland</option>
                  <option value="retired">Vervallen</option>
                </select>
              </Field>
              <Field label="Bewijsstatus">
                <select
                  value={layer.evidence}
                  onChange={(e) =>
                    setLayer({ ...layer, evidence: e.target.value as LopaLayer['evidence'] })
                  }
                >
                  <option value="verified">Geverifieerd</option>
                  <option value="unverified">Nog te toetsen</option>
                  <option value="unknown">Onbekend</option>
                </select>
              </Field>
              <Field label="Afhankelijkheidsgroep">
                <input
                  value={layer.dependencyGroup ?? ''}
                  onChange={(e) =>
                    setLayer({ ...layer, dependencyGroup: e.target.value || undefined })
                  }
                />
              </Field>
            </div>
            <EstimateInput
              label="PFD (faalkans op aanvraag)"
              estimate={layer.pfd}
              onChange={(v) => setLayer({ ...layer, pfd: v })}
              max={1}
              min={0.000000000001}
            />
            <div className="check-grid">
              {(
                [
                  'specific',
                  'independent',
                  'independentOfInitiator',
                  'auditable',
                  'effective',
                ] as const
              ).map((key, i) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={layer[key]}
                    onChange={(e) => setLayer({ ...layer, [key]: e.target.checked })}
                  />
                  {
                    [
                      'Specifiek voor dit scenario',
                      'Onafhankelijk van andere lagen',
                      'Onafhankelijk van initiator',
                      'Toetsbaar / auditbaar',
                      'Effectief voor dit eindpunt',
                    ][i]
                  }
                </label>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Bewijs (incl. PFD-basis)">
                <textarea
                  value={layer.evidenceNote}
                  onChange={(e) => setLayer({ ...layer, evidenceNote: e.target.value })}
                />
              </Field>
              <Field label="Onafhankelijkheid onderbouwen">
                <textarea
                  value={layer.independenceNote}
                  onChange={(e) => setLayer({ ...layer, independenceNote: e.target.value })}
                />
              </Field>
            </div>
            {result.excluded
              .filter((x) => x.id === layer.id)
              .map((x) => (
                <p className="warning-line" key={x.id}>
                  <TriangleAlert size={15} />
                  {x.reason}
                </p>
              ))}
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Enabling & conditional modifiers</h2>
            <p>
              Bezetting, ontsteking of andere voorwaarden tellen uitsluitend mee met bewijs en
              zonder overlap met een IPL.
            </p>
          </div>
          <button
            className="secondary"
            onClick={() =>
              set({
                modifiers: [
                  ...lopa.modifiers,
                  {
                    id: id(),
                    title: 'Nieuwe voorwaarde',
                    kind: 'enabling',
                    probability: { min: 1, value: 1, max: 1 },
                    evidence: 'unverified',
                    evidenceNote: '',
                    independent: false,
                    rationale: '',
                  },
                ],
              })
            }
          >
            <Plus size={16} /> Voorwaarde
          </button>
        </div>
        {lopa.modifiers.map((m) => (
          <div className="lopa-layer" key={m.id}>
            <div className="form-grid">
              <Field label="Voorwaarde">
                <input
                  value={m.title}
                  onChange={(e) =>
                    set({
                      modifiers: lopa.modifiers.map((x) =>
                        x.id === m.id ? { ...m, title: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Soort">
                <select
                  value={m.kind}
                  onChange={(e) =>
                    set({
                      modifiers: lopa.modifiers.map((x) =>
                        x.id === m.id ? { ...m, kind: e.target.value as typeof m.kind } : x,
                      ),
                    })
                  }
                >
                  <option value="enabling">Enabling condition</option>
                  <option value="conditional">Conditional modifier</option>
                </select>
              </Field>
            </div>
            <EstimateInput
              label="Voorwaardelijke kans"
              estimate={m.probability}
              max={1}
              min={0.000000000001}
              onChange={(v) =>
                set({
                  modifiers: lopa.modifiers.map((x) =>
                    x.id === m.id ? { ...m, probability: v } : x,
                  ),
                })
              }
            />
            <div className="form-grid">
              <Field label="Onderbouwing / overlap">
                <textarea
                  value={m.rationale}
                  onChange={(e) =>
                    set({
                      modifiers: lopa.modifiers.map((x) =>
                        x.id === m.id ? { ...m, rationale: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Bewijs">
                <textarea
                  value={m.evidenceNote}
                  onChange={(e) =>
                    set({
                      modifiers: lopa.modifiers.map((x) =>
                        x.id === m.id ? { ...m, evidenceNote: e.target.value } : x,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Bewijsstatus">
                <select
                  value={m.evidence}
                  onChange={(e) =>
                    set({
                      modifiers: lopa.modifiers.map((x) =>
                        x.id === m.id ? { ...m, evidence: e.target.value as typeof m.evidence } : x,
                      ),
                    })
                  }
                >
                  <option value="verified">Geverifieerd</option>
                  <option value="unverified">Nog te toetsen</option>
                  <option value="unknown">Onbekend</option>
                </select>
              </Field>
              <Field label="Afhankelijkheidsgroep">
                <input
                  value={m.dependencyGroup ?? ''}
                  onChange={(e) =>
                    set({
                      modifiers: lopa.modifiers.map((x) =>
                        x.id === m.id ? { ...m, dependencyGroup: e.target.value || undefined } : x,
                      ),
                    })
                  }
                />
              </Field>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={m.independent}
                onChange={(e) =>
                  set({
                    modifiers: lopa.modifiers.map((x) =>
                      x.id === m.id ? { ...m, independent: e.target.checked } : x,
                    ),
                  })
                }
              />{' '}
              Geen dubbeltelling of afhankelijkheid vastgesteld
            </label>
            {result.excluded
              .filter((x) => x.id === m.id)
              .map((x) => (
                <p className="warning-line" key={x.id}>
                  {x.reason}
                </p>
              ))}
          </div>
        ))}
      </section>
    </>
  );
}

function EstimateInput({
  label,
  estimate,
  onChange,
  max = 1,
  min = 0,
  percent = false,
}: {
  label: string;
  estimate: Estimate;
  onChange: (v: Estimate) => void;
  max?: number;
  min?: number;
  percent?: boolean;
}) {
  const multiplier = percent ? 100 : 1;
  const [draft, setDraft] = useState({
    min: String(estimate.min * multiplier),
    value: String(estimate.value * multiplier),
    max: String(estimate.max * multiplier),
  });
  useEffect(
    () =>
      setDraft({
        min: String(estimate.min * multiplier),
        value: String(estimate.value * multiplier),
        max: String(estimate.max * multiplier),
      }),
    [estimate.min, estimate.value, estimate.max, multiplier],
  );
  const change = (key: keyof Estimate, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    const n = {
      min: Number(next.min) / multiplier,
      value: Number(next.value) / multiplier,
      max: Number(next.max) / multiplier,
    };
    if (
      Object.values(next).every((v) => v !== '') &&
      [n.min, n.value, n.max].every(Number.isFinite) &&
      n.min >= min &&
      n.max <= max &&
      n.min <= n.value &&
      n.value <= n.max
    )
      onChange(n);
  };
  const valid =
    Object.values(draft).every((v) => v !== '' && Number.isFinite(Number(v))) &&
    Number(draft.min) <= Number(draft.value) &&
    Number(draft.value) <= Number(draft.max) &&
    Number(draft.min) >= min * multiplier &&
    Number(draft.max) <= max * multiplier;
  return (
    <div className="estimate-field">
      <span>
        {label}
        {percent ? ' (%)' : ''}
      </span>
      <div>
        {(['min', 'value', 'max'] as const).map((k, i) => (
          <label key={k}>
            <small>{['Ondergrens', 'Verwachting', 'Bovengrens'][i]}</small>
            <input
              type="number"
              aria-label={`${label} ${['ondergrens', 'verwachting', 'bovengrens'][i]}`}
              min={min * multiplier}
              max={max * multiplier}
              step="any"
              value={draft[k]}
              onChange={(e) => change(k, e.target.value)}
            />
          </label>
        ))}
      </div>
      {!valid && (
        <small className="rose-text">
          Gebruik ondergrens ≤ verwachting ≤ bovengrens binnen {min * multiplier}–{max * multiplier}
          . Ongeldige invoer wordt niet toegepast.
        </small>
      )}
    </div>
  );
}
function ScenarioEditor({
  scenario,
  dossiers,
  departments,
  sites,
  onClose,
  onSave,
}: {
  scenario: Scenario;
  dossiers: Dossier[];
  departments: Department[];
  sites: Site[];
  onClose: () => void;
  onSave: (s: Scenario) => void;
}) {
  const [s, set] = useState(scenario);
  return (
    <Modal title="Risicoscenario" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(s);
        }}
      >
        <Field label="Titel">
          <input
            required
            maxLength={300}
            autoFocus
            value={s.title}
            onChange={(e) => set({ ...s, title: e.target.value })}
          />
        </Field>
        <Field label="Gerelateerd RI&E-dossier">
          <select
            value={s.dossierId ?? ''}
            onChange={(e) =>
              set({ ...s, dossierId: e.target.value || undefined, departmentId: undefined })
            }
          >
            <option value="">Los scenario</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </Field>
        {departments.length > 0 && (
          <Field label="Vastgelegde afdeling">
            <select
              value={s.departmentId ?? ''}
              onChange={(e) =>
                set({
                  ...s,
                  departmentId: e.target.value || undefined,
                  department:
                    departments.find((d) => d.id === e.target.value)?.name ?? s.department,
                })
              }
            >
              <option value="">Vrije locatieomschrijving</option>
              {departments
                .filter((d) => {
                  const dossier = dossiers.find((x) => x.id === s.dossierId);
                  return (
                    !dossier ||
                    ((!dossier.departmentIds.length || dossier.departmentIds.includes(d.id)) &&
                      (!dossier.organisationId ||
                        departmentOrganisationId(d, sites) === dossier.organisationId))
                  );
                })
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="Afdeling / locatie">
          <input value={s.department} onChange={(e) => set({ ...s, department: e.target.value })} />
        </Field>
        <div className="form-grid">
          <Field label="Gevaar">
            <input
              required
              value={s.hazard}
              onChange={(e) => set({ ...s, hazard: e.target.value })}
              placeholder="De bron met potentieel voor schade"
            />
          </Field>
          <Field label="Concreet gevolg">
            <input
              required
              value={s.consequence}
              onChange={(e) => set({ ...s, consequence: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Scenario">
          <textarea
            required
            rows={4}
            value={s.description}
            onChange={(e) => set({ ...s, description: e.target.value })}
            placeholder="Wie wordt waar, wanneer en hoe blootgesteld? Wat leidt tot het gevolg?"
          />
        </Field>
        <p className="info-box">
          Het uitgangsscenario bevat nog geen credit voor de maatregelen die je afzonderlijk
          toevoegt. Daarna leg je W, B en E vast in de werkbank.
        </p>
        <div className="button-row">
          <button type="button" className="secondary" onClick={onClose}>
            Annuleren
          </button>
          <button className="primary" type="submit">
            <Check size={16} /> Scenario opslaan
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ControlEditor({
  control,
  onClose,
  onSave,
}: {
  control: Control;
  onClose: () => void;
  onSave: (c: Control) => void;
}) {
  const [c, set] = useState(control);
  const [conditionalBasis, setConditionalBasis] = useState('');
  const [conditionsConfirmed, setConditionsConfirmed] = useState(false);
  const [potential, setPotential] = useState(80),
    [coverage, setCoverage] = useState(100),
    [availability, setAvailability] = useState(95),
    [use, setUse] = useState(90);
  const suggestion = (potential / 100) * (coverage / 100) * (availability / 100) * (use / 100);
  const applySuggestion = (
    key: 'probabilityReduction' | 'exposureReduction' | 'effectReduction',
  ) => {
    if (!conditionsConfirmed || !conditionalBasis.trim()) return;
    const estimate = (v: number) => ({ min: v / 100, value: v / 100, max: v / 100 });
    const result = efficacyEstimate({
      intrinsic: estimate(potential),
      coverage: estimate(coverage),
      availability: estimate(availability),
      correctUse: estimate(use),
      conditionalBasis,
    });
    set({
      ...c,
      [key]: { ...result, min: 0 },
      rationale:
        `${c.rationale}\nInschalingshulp voor ${key}: potentieel ${potential}%, bereik ${coverage}%, conditionele beschikbaarheid ${availability}%, conditioneel gebruik ${use}%. Noemers/overlap: ${conditionalBasis}`.trim(),
    });
  };
  return (
    <Modal title="Werking van de beheersmaatregel" onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(c);
        }}
      >
        <Field label="Maatregel">
          <input
            autoFocus
            required
            value={c.title}
            onChange={(e) => set({ ...c, title: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="Arbeidshygiënische strategie">
            <select
              value={c.ahs}
              onChange={(e) => set({ ...c, ahs: e.target.value as Control['ahs'] })}
            >
              {Object.entries(AHS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={c.status}
              onChange={(e) => set({ ...c, status: e.target.value as Control['status'] })}
            >
              <option value="planned">Gepland</option>
              <option value="existing">Bestaand</option>
              <option value="retired">Vervallen</option>
            </select>
          </Field>
          <Field label="Bewijsstatus">
            <select
              value={c.evidence}
              onChange={(e) => set({ ...c, evidence: e.target.value as Control['evidence'] })}
            >
              <option value="unverified">Nog te toetsen</option>
              <option value="unknown">Onbekend</option>
              <option value="verified">Geverifieerd</option>
            </select>
          </Field>
          <Field label="Bewijs / verificatie">
            <input
              value={c.evidenceNote}
              onChange={(e) => set({ ...c, evidenceNote: e.target.value })}
              placeholder="Bron, meetresultaat of functionele test"
            />
          </Field>
        </div>
        <Field label="Waarom werkt dit in dit scenario?">
          <textarea
            required
            value={c.rationale}
            onChange={(e) => set({ ...c, rationale: e.target.value })}
            placeholder="Beschrijf het werkingsmechanisme en de grenzen."
          />
        </Field>
        <div className="form-section-title">
          <h3>Reductie per scorefactor</h3>
          <Badge tone="blue">Expertinschatting</Badge>
        </div>
        <p className="caption">
          0% betekent geen effect op deze factor. 100% vraagt aantoonbare eliminatie van het
          scenario. De intervallen zijn aannames; geen ongevalskansen.
        </p>
        <EstimateInput
          label="Waarschijnlijkheid W"
          estimate={c.probabilityReduction}
          percent
          onChange={(v) => set({ ...c, probabilityReduction: v })}
        />
        <EstimateInput
          label="Blootstelling B"
          estimate={c.exposureReduction}
          percent
          onChange={(v) => set({ ...c, exposureReduction: v })}
        />
        <EstimateInput
          label="Effect E"
          estimate={c.effectReduction}
          percent
          onChange={(v) => set({ ...c, effectReduction: v })}
        />
        <details className="efficacy-helper">
          <summary>
            <SlidersHorizontal size={15} /> Inschalingshulp: van ontwerp naar praktijk
          </summary>
          <p className="caption">
            Lokale inschatting: potentieel × bereik × voorwaardelijke beschikbaarheid ×
            voorwaardelijk correct gebruik. Definieer elke factor op het deel dat de vorige factor
            doorlaat; voer hetzelfde verlies niet tweemaal in. Deze hulp levert één voorstel voor
            één scorefactor.
          </p>
          <div className="form-grid">
            {[
              { label: 'Maximale werking (%)', v: potential, set: setPotential },
              { label: 'Bereik van scenario (%)', v: coverage, set: setCoverage },
              { label: 'Beschikbaar indien nodig (%)', v: availability, set: setAvailability },
              { label: 'Correct gebruik indien beschikbaar (%)', v: use, set: setUse },
            ].map((f) => (
              <Field key={f.label} label={f.label}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={f.v}
                  onChange={(e) => f.set(Math.max(0, Math.min(100, Number(e.target.value))))}
                />
              </Field>
            ))}
          </div>
          <Field label="Conditionele definities en controle op overlap">
            <textarea
              value={conditionalBasis}
              onChange={(e) => setConditionalBasis(e.target.value)}
              placeholder="Beschrijf de noemers en welke verliezen al in de prestatiegegevens zitten."
            />
          </Field>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={conditionsConfirmed}
              onChange={(e) => setConditionsConfirmed(e.target.checked)}
            />{' '}
            Noemers en dubbeltelling gecontroleerd
          </label>
          <p>
            Voorstel: <strong className="green-text">{pct(suggestion)}</strong>. Onderbouw eerst de
            inputs en stel je eigen bandbreedte in.
          </p>
          <div className="button-row">
            {(['probabilityReduction', 'exposureReduction', 'effectReduction'] as const).map(
              (key, i) => (
                <button
                  type="button"
                  key={key}
                  className="secondary"
                  disabled={!conditionsConfirmed || !conditionalBasis.trim()}
                  onClick={() => applySuggestion(key)}
                >
                  Toepassen op {['W', 'B', 'E'][i]}
                </button>
              ),
            )}
          </div>
        </details>
        <div className="form-grid">
          <Field
            label="Afhankelijkheidsgroep"
            hint="Maatregelen met dezelfde afhankelijkheid worden niet vermenigvuldigd."
          >
            <input
              value={c.dependencyGroup ?? ''}
              onChange={(e) => set({ ...c, dependencyGroup: e.target.value || undefined })}
              placeholder="Bijvoorbeeld dezelfde sensor / toegang"
            />
          </Field>
          <Field label="Uitvoerbaarheid">
            <select
              value={c.feasibility}
              onChange={(e) => set({ ...c, feasibility: e.target.value as Control['feasibility'] })}
            >
              <option value="easy">Eenvoudig · multiplier 1,5</option>
              <option value="moderate">Normaal · multiplier 1,0</option>
              <option value="hard">Complex · multiplier 0,8</option>
            </select>
          </Field>
          <Field
            label="Relatieve inspanning (1–10)"
            hint="Lokale vergelijkingsschaal voor inzet en kosten."
          >
            <input
              type="number"
              min="1"
              max="10"
              required
              value={c.effort}
              onChange={(e) =>
                set({ ...c, effort: Math.max(1, Math.min(10, Number(e.target.value))) })
              }
            />
          </Field>
        </div>
        <div className="check-grid">
          <label>
            <input
              type="checkbox"
              checked={c.independent}
              onChange={(e) => set({ ...c, independent: e.target.checked })}
            />{' '}
            Onafhankelijkheid beoordeeld en onderbouwd
          </label>
          <label>
            <input
              type="checkbox"
              checked={c.legalRequired}
              onChange={(e) => set({ ...c, legalRequired: e.target.checked })}
            />{' '}
            Verplichte maatregel / normafwijking
          </label>
        </div>
        <div className="info-box">
          AHS-bonus en haalbaarheidsmultiplier veranderen uitsluitend de prioriteit. Geplande
          maatregelen veranderen het huidige restrisico niet. Bij onbewezen plannen neemt de
          conservatieve prognose 0% reductie aan.
        </div>
        <div className="button-row">
          <button className="secondary" type="button" onClick={onClose}>
            Annuleren
          </button>
          <button className="primary" type="submit">
            <Check size={16} /> Maatregel opslaan
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Questionnaire({
  questions,
  answers,
  updateAnswer,
  addScenario,
  dossierId,
  dossiers,
  onDossierChange,
  evidence,
}: {
  dossierId?: string;
  dossiers: Dossier[];
  onDossierChange: (id: string) => void;
  evidence: Evidence[];
  questions: Question[];
  answers: WorkspaceAnswer[];
  updateAnswer: (a: WorkspaceAnswer) => void;
  addScenario: (q: Question) => void;
}) {
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState(''),
    [pack, setPack] = useState('all');
  const locked = ['completed', 'archived'].includes(
    dossiers.find((d) => d.id === dossierId)?.status ?? '',
  );
  const themed = new Map(themes.map((t) => [t.id, t]));
  const availableThemes = [...new Set(questions.map((q) => q.themeId))];
  const packThemes = pack === 'all' ? null : contentPacks.find((p) => p.id === pack)?.themeIds;
  const shown = questions.filter(
    (q) =>
      (filter === 'all' || q.themeId === filter) &&
      (!packThemes || packThemes.includes(q.themeId)) &&
      `${q.prompt} ${q.assessmentGuidance}`.toLowerCase().includes(search.toLowerCase()),
  );
  const update = (q: Question, patch: Partial<WorkspaceAnswer>) => {
    const existing = answers.find((a) => a.questionId === q.id);
    updateAnswer({
      ...existing,
      id: existing?.id ?? id(),
      questionId: q.id,
      dossierId,
      ...(dossierId ? { questionSha256: questionHash(q) } : {}),
      choice: existing?.choice ?? 'unknown',
      evidence: existing?.evidence ?? '',
      note: existing?.note ?? '',
      answeredAt: new Date().toISOString(),
      questionSnapshot: q.prompt,
      sourceIds: q.sourceIds,
      contentVersion:
        'version' in q && typeof q.version === 'string' ? q.version : 'IMA-catalogus-2.0.0',
      ...patch,
    });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WAARNEMEN · VERIFIËREN · VASTLEGGEN</div>
          <h1>
            Gerichte inventarisatie<span>.</span>
          </h1>
          <p>Een antwoord wordt pas bruikbaar met context, bewijs en een passende vervolgactie.</p>
        </div>
        <Badge tone="blue">
          {answers.length} / {questions.length} antwoorden
        </Badge>
      </div>
      <section className="panel inventory-scope">
        <Field label="Beoordelingsdossier">
          <select value={dossierId ?? ''} onChange={(e) => onDossierChange(e.target.value)}>
            <option value="">Algemene inventarisatie</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </Field>
        {locked && (
          <p className="info-box">
            Dit dossier is afgerond of gearchiveerd. Heropen het via de dossierbeoordeling voordat
            je antwoorden wijzigt.
          </p>
        )}
      </section>
      <div className="question-layout">
        <aside className="panel theme-list">
          <Field label="Contentpakket">
            <select
              value={pack}
              onChange={(e) => {
                setPack(e.target.value);
                setFilter('all');
              }}
            >
              <option value="all">Alle pakketten</option>
              {contentPacks.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            Alle thema’s <small>{questions.length}</small>
          </button>
          {availableThemes
            .filter((t) => !packThemes || packThemes.includes(t))
            .map((t) => (
              <button key={t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>
                {themed.get(t)?.title ?? t}
                <small>{questions.filter((q) => q.themeId === t).length}</small>
              </button>
            ))}
        </aside>
        <div className="question-cards">
          <div className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek binnen de vragen…"
              aria-label="Vragen zoeken"
            />
          </div>
          <p className="caption">
            {shown.length} vragen · Publieke vragen zijn eigen formuleringen. Geïmporteerde private
            vragen blijven onderdeel van je eigen dossier.
          </p>
          {shown.map((q, i) => {
            const a = answers.find((a) => a.questionId === q.id);
            return (
              <section className="panel question-card" key={q.id}>
                <div className="question-title">
                  <span className="question-number">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <small>{themed.get(q.themeId)?.title ?? q.themeId}</small>
                    <h3>{q.prompt}</h3>
                  </div>
                  {a && <CheckCircle2 size={17} className="green-text" />}
                </div>
                <div className="answer-options">
                  {Object.entries(answerLabels).map(([choice, label]) => (
                    <button
                      key={choice}
                      className={a?.choice === choice ? `chosen ${choice}` : ''}
                      disabled={locked}
                      onClick={() => update(q, { choice: choice as WorkspaceAnswer['choice'] })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <details>
                  <summary>Toetsingsrichting & bewijs</summary>
                  <p>{q.assessmentGuidance}</p>
                  <ul>
                    {q.evidenceHints.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                  <p className="caption">Bronroutes: {q.sourceIds.join(', ')}</p>
                  {q.legalReferences && (
                    <p>Normen / verwijzingen uit de private bron: {q.legalReferences}</p>
                  )}
                </details>
                <div className="form-grid">
                  <Field label="Bewijs / waarneming">
                    <textarea
                      rows={2}
                      disabled={locked}
                      value={a?.evidence ?? ''}
                      onChange={(e) => update(q, { evidence: e.target.value })}
                      placeholder="Bron, observatie, interview of meting…"
                    />
                  </Field>
                  <Field label="Toelichting / vervolg">
                    <textarea
                      rows={2}
                      disabled={locked}
                      value={a?.note ?? ''}
                      onChange={(e) => update(q, { note: e.target.value })}
                    />
                  </Field>
                </div>
                {dossierId && !locked && (
                  <MultiSelect
                    label="Gekoppelde bewijsrecords"
                    items={evidence.filter((e) => !e.dossierId || e.dossierId === dossierId)}
                    values={a?.evidenceIds ?? []}
                    onChange={(v) => update(q, { evidenceIds: v })}
                  />
                )}
                {a?.choice === 'yes' && !a.evidence && !a.evidenceIds?.length && (
                  <p className="warning-line">Antwoord ‘Ja’ is nog niet onderbouwd met bewijs.</p>
                )}
                <button className="text-link" onClick={() => addScenario(q)}>
                  Werk een risicoscenario uit <ArrowRight size={14} />
                </button>
              </section>
            );
          })}
          {!shown.length && <p className="muted">Geen vragen bij deze selectie.</p>}
        </div>
      </div>
    </>
  );
}
function Actions({
  actions,
  scenarios,
  evidence,
  updateAction,
  onAdd,
}: {
  actions: WorkspaceAction[];
  scenarios: Scenario[];
  evidence: Evidence[];
  updateAction: (a: WorkspaceAction, expectedRevision: number) => boolean;
  onAdd: () => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PLAN · DO · CHECK · ACT</div>
          <h1>
            Van risico naar resultaat<span>.</span>
          </h1>
          <p>Geef elke verbetering een eigenaar, een moment en een toets op werking.</p>
        </div>
        <button className="primary" onClick={onAdd}>
          <Plus size={16} /> Verbeteractie
        </button>
      </div>
      <div className="kanban">
        {(['open', 'in_progress', 'done'] as const).map((status, i) => (
          <section className="kanban-column" key={status}>
            <div className="section-row">
              <h2>{['Te doen', 'Uitvoering / controle', 'Afgesloten / beoordeeld'][i]}</h2>
              <Badge tone={['amber', 'blue', 'green'][i]}>
                {actions.filter((a) => a.status === status).length}
              </Badge>
            </div>
            {actions
              .filter((a) => a.status === status)
              .map((a) => (
                <div className="panel action-card" key={a.id}>
                  <small>
                    {scenarios.find((s) => s.id === a.scenarioId)?.title ?? 'Algemene verbetering'}
                  </small>
                  <h3>{a.title}</h3>
                  <ActionLifecyclePanel action={a} evidence={evidence} onSave={updateAction} />
                </div>
              ))}
            {!actions.some((a) => a.status === status) && (
              <p className="kanban-empty">Geen acties in deze fase.</p>
            )}
          </section>
        ))}
      </div>
      <p className="caption">
        Een afgeronde actie verleent niet automatisch risicoreductie. Werk na verificatie de
        maatregel en het bewijs in de risicowerkbank bij.
      </p>
    </>
  );
}
function actionNeedsFollowup(action: WorkspaceAction): boolean {
  return !['closed', 'cancelled', 'legacy_done'].includes(actionStage(action));
}
function ActionEditor({
  scenarios,
  onSave,
  onClose,
}: {
  scenarios: Scenario[];
  onSave: (a: WorkspaceAction) => void;
  onClose: () => void;
}) {
  const [a, set] = useState<WorkspaceAction>({
    id: id(),
    title: '',
    owner: '',
    dueDate: '',
    status: 'open',
    notes: '',
  });
  return (
    <Modal title="Nieuwe verbeteractie" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(a);
        }}
      >
        <Field label="Actie">
          <input
            required
            autoFocus
            value={a.title}
            onChange={(e) => set({ ...a, title: e.target.value })}
          />
        </Field>
        <Field label="Gerelateerd scenario">
          <select
            value={a.scenarioId ?? ''}
            onChange={(e) =>
              set({
                ...a,
                scenarioId: e.target.value || undefined,
                dossierId: scenarios.find((s) => s.id === e.target.value)?.dossierId,
              })
            }
          >
            <option value="">Algemene verbetering</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Eigenaar">
            <input value={a.owner} onChange={(e) => set({ ...a, owner: e.target.value })} />
          </Field>
          <Field label="Streefdatum">
            <input
              type="date"
              value={a.dueDate}
              onChange={(e) => set({ ...a, dueDate: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Verificatieplan">
          <textarea
            required
            value={a.notes}
            onChange={(e) => set({ ...a, notes: e.target.value })}
            placeholder="Hoe stel je vast dat de actie werkt?"
          />
        </Field>
        <button className="primary" type="submit">
          Actie vastleggen
        </button>
      </form>
    </Modal>
  );
}
function Incidents({
  incidents,
  actions,
  scenarios,
  add,
  createAction,
  onEdit,
}: {
  onEdit: (i: WorkspaceIncident) => void;
  incidents: WorkspaceIncident[];
  actions: WorkspaceAction[];
  scenarios: Scenario[];
  add: () => void;
  createAction: (i: WorkspaceIncident) => void;
}) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REGISTREREN · VERBINDEN · LEREN</div>
          <h1>
            Elk signaal telt<span>.</span>
          </h1>
          <p>
            Koppel gebeurtenissen aan risicoscenario’s en toets welke barrières werkten of faalden.
          </p>
        </div>
        <button className="primary" onClick={add}>
          <Plus size={16} /> Incident of signaal
        </button>
      </div>
      <div className="incidents-list">
        {incidents.map((i) => (
          <section className="panel incident-card" key={i.id}>
            <div className="panel-heading">
              <div>
                <Badge
                  tone={i.type === 'incident' ? 'rose' : i.type === 'near_miss' ? 'amber' : 'blue'}
                >
                  {i.type === 'incident'
                    ? 'Incident'
                    : i.type === 'near_miss'
                      ? 'Bijna-ongeval'
                      : 'Waarneming'}
                </Badge>
                <h2>{i.title}</h2>
                <p>
                  {i.date} · {i.department}
                </p>
              </div>
              <GitBranch size={22} />
            </div>
            <p>{i.description}</p>
            <p className="caption">
              Werkelijke ernst: {i.actualSeverity ?? 'Onbekend'} · Potentiële ernst:{' '}
              {i.potentialSeverity ?? 'Onbekend'}
            </p>
            {i.immediateControls && <p>Direct handelen: {i.immediateControls}</p>}
            {i.openQuestions && <p>Open vragen: {i.openQuestions}</p>}
            <p className="caption">
              Risicoscenario:{' '}
              {scenarios.find((s) => s.id === i.scenarioId)?.title ?? 'Nog niet gekoppeld'}
            </p>
            {i.actionIds.length > 0 && (
              <p className="caption">
                Acties:{' '}
                {i.actionIds.map((x) => actions.find((a) => a.id === x)?.title ?? x).join('; ')}
              </p>
            )}
            <div className="button-row">
              <button className="secondary" onClick={() => onEdit(i)}>
                Melding beoordelen / wijzigen
              </button>
              <button
                className="secondary"
                onClick={() => setAnalysis(analysis === i.id ? null : i.id)}
              >
                <Search size={15} /> Onderzoeksvragen
              </button>
              <button className="secondary" onClick={() => createAction(i)}>
                <Plus size={15} /> Verbeteractie koppelen
              </button>
            </div>
            {analysis === i.id && (
              <div className="analysis-template">
                <h3>Van feiten naar barrièreanalyse</h3>
                <ol>
                  <li>Welke feiten zijn waargenomen, door wie en met welk bewijs?</li>
                  <li>Welk gevaar en welke gebeurtenis vormden het scenario?</li>
                  <li>Welke preventieve en mitigerende barrières waren verwacht?</li>
                  <li>Was de barrière aanwezig, beschikbaar, bruikbaar en gebruikt?</li>
                  <li>Welke organisatorische voorwaarden verklaren de faalwijze?</li>
                  <li>
                    Welke hogere AHS-maatregel voorkomt herhaling en hoe toetsen we de werking?
                  </li>
                </ol>
                <p className="caption">
                  Gebruik deze vragen voor een 5×Waarom- of BowTie-onderzoek. Sla conclusies en
                  bewijs vast in de gekoppelde actie en risicobeoordeling.
                </p>
              </div>
            )}
          </section>
        ))}
        {!incidents.length && (
          <Empty
            onAdd={add}
            title="Leg het eerste signaal vast"
            text="Feiten en verklaringen verdienen ieder een eigen plaats."
          />
        )}
      </div>
    </>
  );
}
function IncidentEditor({
  scenarios,
  initial,
  departments,
  onSave,
  onClose,
}: {
  scenarios: Scenario[];
  initial?: WorkspaceIncident;
  departments: Department[];
  onSave: (i: WorkspaceIncident) => void;
  onClose: () => void;
}) {
  const localDate = new Date().toLocaleDateString('sv-SE');
  const [i, set] = useState<WorkspaceIncident>(
    initial ?? {
      id: id(),
      title: '',
      date: localDate,
      department: '',
      type: 'near_miss',
      description: '',
      actionIds: [],
    },
  );
  return (
    <Modal title="Incident of signaal vastleggen" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(i);
        }}
      >
        <Field label="Titel">
          <input
            required
            autoFocus
            value={i.title}
            onChange={(e) => set({ ...i, title: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="Type">
            <select
              value={i.type}
              onChange={(e) => set({ ...i, type: e.target.value as WorkspaceIncident['type'] })}
            >
              <option value="near_miss">Bijna-ongeval</option>
              <option value="incident">Incident</option>
              <option value="observation">Waarneming</option>
            </select>
          </Field>
          <Field label="Datum">
            <input
              required
              type="date"
              value={i.date}
              onChange={(e) => set({ ...i, date: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Afdeling / locatie">
          <input value={i.department} onChange={(e) => set({ ...i, department: e.target.value })} />
        </Field>
        <Field label="Geregistreerde afdeling">
          <select
            value={i.departmentId ?? ''}
            onChange={(e) =>
              set({
                ...i,
                departmentId: e.target.value || undefined,
                department: departments.find((d) => d.id === e.target.value)?.name ?? i.department,
              })
            }
          >
            <option value="">Afdeling nog onbekend / werkruimtebreed</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          {(['actualSeverity', 'potentialSeverity'] as const).map((key) => (
            <Field
              key={key}
              label={key === 'actualSeverity' ? 'Werkelijke ernst' : 'Potentiële ernst'}
            >
              <select
                value={i[key] ?? ''}
                onChange={(e) => set({ ...i, [key]: e.target.value || undefined })}
              >
                <option value="">Niet vastgesteld</option>
                {[
                  'none',
                  'first_aid',
                  'medical_treatment',
                  'lost_time',
                  'major',
                  'permanent_injury',
                  'fatality',
                ].map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <details>
          <summary>Classificatie, context en direct handelen</summary>
          <div className="form-grid">
            {(['recordable', 'lostTime'] as const).map((key) => (
              <Field
                key={key}
                label={
                  key === 'recordable'
                    ? 'Recordable volgens gekozen registratieafspraak'
                    : 'Lost-time-incident'
                }
              >
                <select
                  value={i[key] === undefined ? '' : String(i[key])}
                  onChange={(e) =>
                    set({
                      ...i,
                      [key]: e.target.value === '' ? undefined : e.target.value === 'true',
                    })
                  }
                >
                  <option value="">Niet beoordeeld</option>
                  <option value="true">Ja</option>
                  <option value="false">Nee</option>
                </select>
              </Field>
            ))}
            <Field label="Verzuimdagen">
              <input
                type="number"
                min="0"
                step="1"
                value={i.lostTimeDays ?? ''}
                onChange={(e) =>
                  set({
                    ...i,
                    lostTimeDays: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Melder">
              <input
                value={i.reportedBy ?? ''}
                onChange={(e) => set({ ...i, reportedBy: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Activiteit">
            <input
              value={i.activity ?? ''}
              onChange={(e) => set({ ...i, activity: e.target.value })}
            />
          </Field>
          <Field label="Directe beheersing en eerste handelen">
            <textarea
              value={i.immediateControls ?? ''}
              onChange={(e) => set({ ...i, immediateControls: e.target.value })}
            />
          </Field>
          <Field label="Open onderzoeksvragen">
            <textarea
              value={i.openQuestions ?? ''}
              onChange={(e) => set({ ...i, openQuestions: e.target.value })}
            />
          </Field>
          <p className="caption">
            Classificatie wordt expliciet vastgelegd. De app leidt recordable of lost time niet af
            uit een ernstlabel of leeggemaakt veld.
          </p>
        </details>
        <Field label="Feiten">
          <textarea
            required
            rows={4}
            value={i.description}
            onChange={(e) => set({ ...i, description: e.target.value })}
            placeholder="Wat gebeurde? Wie was blootgesteld? Welke schade of potentiële schade?"
          />
        </Field>
        <Field label="Gerelateerd risicoscenario">
          <select
            value={i.scenarioId ?? ''}
            onChange={(e) => set({ ...i, scenarioId: e.target.value || undefined })}
          >
            <option value="">Nog niet gekoppeld</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </Field>
        <button className="primary" type="submit">
          Melding opslaan
        </button>
      </form>
    </Modal>
  );
}
function NameEditorContent({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (name: string) => void;
}) {
  const [name, set] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name.trim());
      }}
    >
      <Field label="Naam van de werkruimte">
        <input
          autoFocus
          required
          value={name}
          maxLength={160}
          onChange={(e) => set(e.target.value)}
        />
      </Field>
      <button className="primary" type="submit">
        Werkruimte openen
      </button>
    </form>
  );
}
function NameEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  return (
    <Modal title="Naam van je werkruimte" onClose={onClose}>
      <NameEditorContent initial={initial} onSave={onSave} />
    </Modal>
  );
}
function Sources({ workspace, onImport }: { workspace: WorkspaceState; onImport: () => void }) {
  const sourceList = [...builtinSources, ...workspace.sources];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KENNIS MET HERKOMST</div>
          <h1>
            Bronnen die je kunt terugvinden<span>.</span>
          </h1>
          <p>Methodiek, vragen en opleidingscontext met zichtbare status en publicatiegrens.</p>
        </div>
        <button className="primary" onClick={onImport}>
          <Upload size={16} /> Private content importeren
        </button>
      </div>
      <div className="content-packs">
        {contentPacks.map((p) => (
          <section className="panel pack-card" key={p.id}>
            <BookOpen size={23} />
            <Badge tone="blue">{p.level}</Badge>
            <h2>{p.title}</h2>
            <p>{p.description}</p>
            <small>
              {p.themeIds.length} thema’s · {p.status}
            </small>
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>Zo gebruikt IMA de modellen</h2>
        <div className="method-grid">
          <div>
            <h3>Fine–Kinney / Wiruth</h3>
            <p>
              W × B × E voor semikwantitatieve prioritering. Initieel, huidig en prognose blijven
              apart. Gevalideerde reducties veranderen een specifieke scorefactor.
            </p>
          </div>
          <div>
            <h3>LOPA</h3>
            <p>
              Frequentie van één initiator × bewezen voorwaardelijke modifiers × PFD’s van
              gekwalificeerde onafhankelijke lagen. Eenheid: gebeurtenissen per jaar.
            </p>
          </div>
          <div>
            <h3>AHS & justificatie</h3>
            <p>
              Bronaanpak, collectieve bescherming, individuele maatregelen en PBM krijgen een
              expliciete voorkeursweging. Uitvoerbaarheid verhoogt de lokale actiescore. De weging
              wijzigt geen restrisico.
            </p>
          </div>
          <div>
            <h3>Andere modellen</h3>
            <p>
              Een 5×5-matrix helpt communiceren; BowTie toont barrières en escalatie; FMEA
              beoordeelt faalwijzen. Scores van deze modellen zijn niet uitwisselbaar met Kinney of
              LOPA.
            </p>
          </div>
        </div>
        <a
          className="text-link"
          href="https://github.com/xenotroy/ima-apply/blob/main/docs/rebuild/risk-methodology.md"
          target="_blank"
          rel="noreferrer"
        >
          Volledige methodiek en bronverwijzingen <ArrowUpRight size={14} />
        </a>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Bronregister</h2>
          <Badge tone="blue">{sourceList.length} bronroutes</Badge>
        </div>
        <div className="source-list">
          {sourceList.map((s) => (
            <div className="source-row" key={s.id}>
              <FileText size={19} />
              <div>
                <strong>{String(s.title)}</strong>
                <small>
                  {s.id} · {String(s.kind)} · {String(s.readScope)}
                </small>
                <p>{String(s.notes)}</p>
              </div>
              <div>
                <Badge tone={s.publication === 'private' ? 'amber' : 'blue'}>
                  {String(s.status)}
                </Badge>
                <small>{String(s.publication)}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
      {(workspace.contentRecords?.length ?? 0) > 0 && (
        <section className="panel">
          <h2>Private contentrecords</h2>
          <p className="caption">
            Metadata of expliciet behouden brondata. Een LMS-deelname of cijfer kent geen
            maatregelcredit toe.
          </p>
          {workspace.contentRecords?.map((record) => (
            <details className="registry-item" key={record.id}>
              <summary>
                {String(record.sourceId ?? record.id)} · {String(record.format ?? 'content')}
                {record.rowCount !== undefined ? ` · ${record.rowCount} rijen` : ''}
              </summary>
              <pre className="private-record">{JSON.stringify(record, null, 2)}</pre>
            </details>
          ))}
        </section>
      )}
      <section className="panel">
        <h2>Vault, SDU en Moodle verbinden</h2>
        <p>
          Gebruik de lokale importer voor Markdown-vragenlijsten, legacy RI&E-JSON of een Moodle
          CSV-export. Laad het resultaat hier als private content. Je bronnen en geïmporteerde
          vragen worden uitsluitend opgeslagen in je werkruimte.
        </p>
        <code className="code-block">node scripts/import-content.mjs --help</code>
        <p className="caption">
          Gevonden bronroutes zijn niet hetzelfde als volledig gelezen documenten. Live Moodle-data
          en volledige gelicentieerde AI-bladen zijn niet automatisch opgehaald. Raadpleeg het
          bronregister voor de gelezen scope.
        </p>
      </section>
    </>
  );
}
function Report({ workspace, questions }: { workspace: WorkspaceState; questions: Question[] }) {
  const csv = () => {
    const escape = (s: unknown) => `"${String(s ?? '').replaceAll('"', '""')}"`;
    const rows = [
      [
        'Scenario',
        'Afdeling',
        'Gevaar',
        'Gevolg',
        'Initieel',
        'Huidig min',
        'Huidig',
        'Huidig max',
        'Prognose min',
        'Prognose',
        'Prognose max',
        'Conservatieve klasse',
        'Onderbouwing',
      ],
      ...workspace.scenarios.map((s) => {
        const r = evaluateRisk(s);
        return [
          s.title,
          s.department,
          s.hazard,
          s.consequence,
          r.initial,
          r.current.score.min,
          r.current.score.value,
          r.current.score.max,
          r.target.score.min,
          r.target.score.value,
          r.target.score.max,
          r.current.conservativeBand.label,
          s.assessmentNotes,
        ];
      }),
    ];
    download(
      'ima-risicoregister.csv',
      '\uFEFF' +
        rows
          .map((row) =>
            row
              .map((v) => escape(typeof v === 'string' && /^[=+@\-]/.test(v) ? `'${v}` : v))
              .join(';'),
          )
          .join('\r\n'),
      'text/csv;charset=utf-8',
    );
  };
  const markdown = () => {
    const lines = [
      `# RI&E — ${workspace.name}`,
      '',
      `Werkruimte ${workspace.id} · revisie ${workspace.revision}`,
      `Bijgewerkt: ${workspace.updatedAt}`,
      '',
      'Methodiek v2.0: Kinney-scores zijn geen ongevalskansen. Geplande maatregelen veranderen uitsluitend de prognose.',
      '',
    ];
    for (const s of workspace.scenarios) {
      const r = evaluateRisk(s);
      lines.push(
        `## ${s.title}`,
        '',
        `Scope: ${s.department}`,
        `Gevaar: ${s.hazard}`,
        `Gevolg: ${s.consequence}`,
        '',
        s.description,
        '',
        `W × B × E = ${s.probability} × ${s.exposure} × ${s.effect} = ${r.initial}`,
        `Huidig: ${r.current.score.value} [${r.current.score.min}, ${r.current.score.max}]`,
        `Prognose: ${r.target.score.value} [${r.target.score.min}, ${r.target.score.max}]`,
        `Conservatieve klasse huidig: ${r.current.conservativeBand.label}`,
        '',
        s.assessmentNotes ?? '',
        '',
      );
      for (const c of s.controls)
        lines.push(
          `- ${c.title} | ${AHS_LABELS[c.ahs]} | ${c.status} | ${c.evidence} | W:${pct(c.probabilityReduction.value)} B:${pct(c.exposureReduction.value)} E:${pct(c.effectReduction.value)}`,
          `  Onderbouwing: ${c.rationale}`,
          `  Bewijs: ${c.evidenceNote}`,
        );
      for (const x of r.current.excluded)
        lines.push(`- Geen huidige credit: ${x.title} — ${x.reason}`);
      if (r.lopa)
        lines.push(
          '',
          `LOPA: ${r.lopa.frequency.value}/jaar [${r.lopa.frequency.min}, ${r.lopa.frequency.max}]`,
          `Criterium: ${r.lopa.targetFrequency}/jaar (${r.lopa.comparison})`,
          `Frequentiebron: ${s.lopa?.frequencyEvidence ?? ''}`,
          `Aannames en criteriumbesluit: ${s.lopa?.assumptions || 'Niet vastgelegd; criterium onbevestigd'}`,
        );
      lines.push('');
    }
    lines.push('## Inventarisatie', '');
    for (const a of workspace.answers.filter((a) => !a.dossierId))
      lines.push(
        `### ${a.questionSnapshot ?? questions.find((q) => q.id === a.questionId)?.prompt ?? a.questionId}`,
        `${answerLabels[a.choice]} | Bewijs: ${a.evidence} | Toelichting: ${a.note}`,
        `Bronroutes: ${(a.sourceIds ?? []).join(', ')} | Contentversie: ${a.contentVersion ?? 'onbekend'}`,
        '',
      );
    lines.push('## Plan van aanpak', '');
    for (const a of workspace.actions)
      lines.push(
        `- ${a.title} | ${actionStageLabels[actionStage(a)]} | ${a.owner} | ${a.dueDate || 'Geen datum'} | ${a.notes} | Effectcontrole: ${a.effectCheck ?? 'Niet vastgelegd'} | ${a.verifiedAt ?? ''}`,
      );
    lines.push(...dossierMarkdown(workspace));
    lines.push(...riskAssessmentMarkdown(workspace.riskAssessments ?? []));
    download('ima-rie-rapport.md', lines.join('\n'), 'text/markdown');
  };
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <div className="eyebrow">HERLEIDBAAR · OVERDRAAGBAAR</div>
          <h1>
            Je onderbouwing, op papier<span>.</span>
          </h1>
          <p>Een leesbare projectie van je dossier. Volledige data blijven in de werkruimte.</p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={csv}>
            <ArrowDownToLine size={15} /> CSV
          </button>
          <button className="secondary" onClick={markdown}>
            <FileText size={15} /> Markdown
          </button>
          <button className="primary" onClick={() => window.print()}>
            <FileText size={15} /> Afdrukken / PDF
          </button>
        </div>
      </div>
      <article className="panel report">
        <div className="report-top">
          <div className="brand-mark">
            <Shield size={25} />
          </div>
          <span>
            IMA APPLY <small>RISICO-INVENTARISATIE & EVALUATIE</small>
          </span>
        </div>
        <h1>{workspace.name}</h1>
        <p>
          Revisie {workspace.revision} · {new Date(workspace.updatedAt).toLocaleDateString('nl-NL')}{' '}
          · methodiek v2.0
        </p>
        {workspace.name === 'Demonstratiewerkruimte' && (
          <p className="info-box">
            Demonstratiedossier. Alle projectgegevens, bewijsstukken en aannames zijn fictief.
          </p>
        )}
        <h2>Risicoregister</h2>
        <ScenarioTable scenarios={workspace.scenarios} onSelect={() => {}} />
        {workspace.scenarios.map((s) => {
          const r = evaluateRisk(s);
          return (
            <section className="report-scenario" key={s.id}>
              <h2>{s.title}</h2>
              <p>
                <strong>{s.department}</strong> · {s.hazard} → {s.consequence}
              </p>
              <p>{s.description}</p>
              <ScoreSummary scenario={s} />
              <p>{s.assessmentNotes}</p>
              <h3>Beheersmaatregelen</h3>
              {s.controls.map((c) => (
                <p key={c.id}>
                  <strong>{c.title}</strong> · {AHS_LABELS[c.ahs]} · {c.status} / {c.evidence}
                  <br />
                  {c.rationale}
                  <br />
                  <span className="muted">Bewijs: {c.evidenceNote || 'Niet geregistreerd'}</span>
                </p>
              ))}
              {r.current.excluded.map((x) => (
                <p className="caption" key={x.id}>
                  Niet meegeteld in huidig risico: {x.title} — {x.reason}
                </p>
              ))}
              {r.lopa && (
                <p>
                  LOPA: {exp(r.lopa.frequency.value)}/jaar; band {exp(r.lopa.frequency.min)}–
                  {exp(r.lopa.frequency.max)}. Projectcriterium {exp(r.lopa.targetFrequency)}/jaar (
                  {r.lopa.comparison}).
                  <br />
                  Frequentiebron: {s.lopa?.frequencyEvidence}
                  <br />
                  Aannames en criteriumbesluit:{' '}
                  {s.lopa?.assumptions || 'Niet vastgelegd; criterium onbevestigd'}
                </p>
              )}
            </section>
          );
        })}
        <h2>Plan van aanpak</h2>
        {workspace.actions.map((a) => (
          <p key={a.id}>
            <strong>{a.title}</strong> · {a.owner || 'Eigenaar ontbreekt'} ·{' '}
            {a.dueDate || 'Datum ontbreekt'} · {actionStageLabels[actionStage(a)]}
            <br />
            Plan/voortgang: {a.notes}
            <br />
            Effectcontrole: {a.effectCheck || 'Niet vastgelegd'}{' '}
            {a.verifiedAt && `(${a.verifiedAt})`}
          </p>
        ))}
        <h2>Inventarisatie</h2>
        {workspace.answers
          .filter((a) => !a.dossierId)
          .map((a) => (
            <p key={a.id}>
              <strong>
                {a.questionSnapshot ??
                  questions.find((q) => q.id === a.questionId)?.prompt ??
                  a.questionId}
              </strong>{' '}
              · {answerLabels[a.choice]}
              <br />
              Bewijs: {a.evidence || 'Niet vastgelegd'}
              <br />
              {a.note}
            </p>
          ))}
        <DossierReport workspace={workspace} />
        <p className="caption">
          Scorebanden zijn modelaannames, geen statistische betrouwbaarheidsintervallen. AHS-weging
          en uitvoerbaarheid veranderen de prioriteit en geven geen aanvullende fysieke
          risicoreductie. Dit rapport omvat uitsluitend de vastgelegde scope.
        </p>
      </article>
    </>
  );
}

function LopaSetup({
  scenario,
  onClose,
  onSave,
}: {
  scenario: Scenario;
  onClose: () => void;
  onSave: (l: NonNullable<Scenario['lopa']>) => void;
}) {
  const [event, setEvent] = useState(''),
    [frequency, setFrequency] = useState(0.1),
    [evidence, setEvidence] = useState(''),
    [criterion, setCriterion] = useState(0.0001),
    [basis, setBasis] = useState('');
  return (
    <Modal title="LOPA-scenario opzetten" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const l = {
            initiatingEvent: event.trim(),
            initiatingFrequency: { min: frequency, value: frequency, max: frequency },
            frequencyEvidence: evidence.trim(),
            consequence: scenario.consequence,
            layers: [],
            modifiers: [],
            targetFrequency: criterion,
            assumptions: basis.trim(),
          };
          calculateLopa(l);
          onSave(l);
        }}
      >
        <Field label="Eén initiërende gebeurtenis">
          <input required autoFocus value={event} onChange={(e) => setEvent(e.target.value)} />
        </Field>
        <Field
          label="Initiatorfrequentie per jaar"
          hint="0,1 is alleen een invulvoorbeeld. Vervang door een onderbouwde waarde."
        >
          <input
            required
            type="number"
            min="0.000000000001"
            step="any"
            value={frequency}
            onChange={(e) => setFrequency(Number(e.target.value))}
          />
        </Field>
        <Field label="Onderbouwing / bron initiatorfrequentie">
          <textarea required value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        </Field>
        <Field
          label="Projectcriterium per jaar"
          hint="Voorbeeldwaarde zonder normatieve status. Leg je eigen criteriumbesluit vast."
        >
          <input
            required
            type="number"
            min="0.000000000001"
            step="any"
            value={criterion}
            onChange={(e) => setCriterion(Number(e.target.value))}
          />
        </Field>
        <Field label="Aannames en vaststelling criterium">
          <textarea required value={basis} onChange={(e) => setBasis(e.target.value)} />
        </Field>
        <button className="primary" type="submit">
          LOPA-scenario vastleggen
        </button>
      </form>
    </Modal>
  );
}
function Justification({ scenario }: { scenario: Scenario }) {
  const r = evaluateRisk(scenario);
  const [cost, setCost] = useState(1),
    [correction, setCorrection] = useState(1),
    [kinneyCost, setKinneyCost] = useState(1);
  const fraction = r.current.score.value
    ? Math.max(0, 1 - r.target.score.value / r.current.score.value)
    : 0;
  return (
    <section className="panel">
      <details>
        <summary className="justification-summary">
          <Target size={17} /> Historische justificatie: Fine en Kinney/Wiruth
        </summary>
        <div className="method-grid">
          <div>
            <h3>Fine: J = R / (CF × DC)</h3>
            <p>
              DC is de historische correctierating, geen reductiepercentage. Historische
              kostenschalen vragen lokale kalibratie.
            </p>
            <Field label="Cost factor CF">
              <input
                type="number"
                min="0.001"
                step="any"
                value={cost}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n > 0) setCost(n);
                }}
              />
            </Field>
            <Field label="Degree of correction-rating DC">
              <input
                type="number"
                min="0.001"
                step="any"
                value={correction}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n > 0) setCorrection(n);
                }}
              />
            </Field>
            <div className="formula">
              <span>Huidige score {num(r.current.score.value)}</span>
              <strong>
                {num(calculateFineJustification(r.current.score.value, cost, correction))}
              </strong>
            </div>
          </div>
          <div>
            <h3>Kinney/Wiruth: J = R × reductie / kostendeler</h3>
            <p>
              De scoreverbetering van huidig naar prognose: {pct(fraction)}. De apart gekozen
              kostendeler wordt hier gebruikt; de koppeling van eurokosten aan deze schaal moet
              afzonderlijk worden vastgesteld.
            </p>
            <Field label="Kinney-kostendeler (eigen schaal)">
              <input
                type="number"
                min="0.001"
                step="any"
                value={kinneyCost}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n > 0) setKinneyCost(n);
                }}
              />
            </Field>
            <div className="formula">
              <span>J (nominale prognose)</span>
              <strong>
                {num(calculateKinneyJustification(r.current.score.value, fraction, kinneyCost))}
              </strong>
            </div>
            <p className="caption">
              Historische modeluitkomst met je eigen ratings. Geen automatische
              investeringsgoedkeuring of juridische vrijstelling. De IMA-prioriteit met AHS en
              haalbaarheid blijft een afzonderlijke lokale beleidskeuze. Deze ratings zijn
              tijdelijk; leg gebruikte ratings en je besluit vast in de beoordelingsonderbouwing.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}
