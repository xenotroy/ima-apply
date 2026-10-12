import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen,
  ChevronRight,
  Compass,
  Layers,
  ListTree,
  Network,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { sources as catalogSources, type Question } from '../content/catalog';
import type { WorkspaceState } from '../data/model';
import { moduleOriginLabels, moduleQuestionIds, type PlannedModule } from '../data/module-plan';
import {
  moduleAdvice,
  moduleHazardProfiles,
  setModuleAllQuestionsSelected,
  setModuleEnabled,
  setModuleQuestionSelected,
} from '../data/module-selection';
import './ModuleSelectionExplorer.css';

export interface ModuleSelectionExplorerProps {
  workspace: WorkspaceState;
  questions: readonly Question[];
  modules: PlannedModule[];
  onModulesChange: (modules: PlannedModule[]) => void;
  signalIds?: string[];
  onSignalIdsChange?: (ids: string[]) => void;
  onCreatePlan?: () => void;
  renderModuleExtra?: (module: PlannedModule, index: number) => ReactNode;
}
function SelectionCheck({
  label,
  checked,
  mixed = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  mixed?: boolean;
  onChange: (value: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
function searchable(question?: Question): string {
  return question
    ? [
        question.id,
        question.title,
        question.prompt,
        question.richFields?.hazard,
        question.richFields?.risk,
        question.richFields?.riskFactor,
        question.acceptanceCriteria,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('nl-NL')
    : '';
}
function wrapTitle(title: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of title.split(/\s+/)) {
    if ((line + ' ' + word).length > 31 && line) {
      lines.push(line);
      line = word;
    } else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return lines
    .slice(0, 2)
    .map((line, index) => (index === 1 && lines.length > 2 ? line.slice(0, 28) + '…' : line));
}

export default function ModuleSelectionExplorer({
  workspace,
  questions,
  modules,
  onModulesChange,
  signalIds,
  onSignalIdsChange,
  onCreatePlan,
  renderModuleExtra,
}: ModuleSelectionExplorerProps) {
  const [view, setView] = useState<'tree' | 'map'>('tree');
  const [search, setSearch] = useState('');
  const [localSignals, setLocalSignals] = useState<string[]>([]);
  const signals = signalIds ?? localSignals;
  const setSignals = onSignalIdsChange ?? setLocalSignals;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusedModule, setFocusedModule] = useState<string>();
  const gradientId = `module-selection-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const query = search.trim().toLocaleLowerCase('nl-NL');
  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  );
  const advice = useMemo(
    () => moduleAdvice(modules, questions, signals),
    [modules, questions, signals],
  );
  const adviceById = new Map(advice.map((item) => [item.moduleId, item]));
  const recommended = advice.filter((item) => item.recommended);
  const selectedQuestions = new Set(
    modules.filter((module) => module.enabled).flatMap(moduleQuestionIds),
  );
  const selectedModules = modules.filter(
    (module) => module.enabled && moduleQuestionIds(module).length > 0,
  );
  const moduleMatches = (module: PlannedModule) =>
    [module.title, module.code, module.id].join(' ').toLocaleLowerCase('nl-NL').includes(query);
  const visible = modules.filter(
    (module) =>
      !query ||
      moduleMatches(module) ||
      module.questionIds.some((id) => searchable(questionById.get(id)).includes(query)),
  );
  const knownSources = new Map(
    [...catalogSources, ...workspace.sources].map((source) => [source.id, source]),
  );
  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function applyAdvice() {
    let next = modules;
    for (const item of recommended) next = setModuleEnabled(next, item.moduleId, true);
    onModulesChange(next);
  }
  function moduleRows(items: PlannedModule[], forceOpen = false) {
    return items.map((module) => {
      const selected = module.enabled ? moduleQuestionIds(module) : [];
      const all = module.questionIds.length > 0 && selected.length === module.questionIds.length;
      const mixed = selected.length > 0 && !all;
      const opened = forceOpen || expanded.has(module.id) || Boolean(query);
      const itemAdvice = adviceById.get(module.id);
      const questionIds = module.questionIds.filter(
        (id) => !query || moduleMatches(module) || searchable(questionById.get(id)).includes(query),
      );
      return (
        <div
          className={`mse-module registry-item ${selected.length ? 'is-selected' : ''}`}
          key={module.id}
        >
          <div className="mse-module-row">
            <SelectionCheck
              label={`Module kiezen: ${module.title}`}
              checked={all}
              mixed={mixed}
              onChange={(value) =>
                onModulesChange(setModuleAllQuestionsSelected(modules, module.id, value))
              }
            />
            <button
              type="button"
              className="mse-module-open"
              aria-label={`Vragen bekijken: ${module.title}`}
              aria-expanded={opened}
              onClick={() => toggleExpanded(module.id)}
            >
              <ChevronRight size={17} className={opened ? 'is-open' : ''} />
              <span>
                <strong>{module.title}</strong>
                <small>
                  {module.code} · {moduleOriginLabels[module.origin]}
                </small>
              </span>
            </button>
            {itemAdvice?.recommended && (
              <span className="mse-recommended" title={itemAdvice.reasons.join(' ')}>
                <Sparkles size={12} /> Advies
              </span>
            )}
            <span className="mse-module-count">
              {selected.length}
              <span> / {module.questionIds.length}</span>
            </span>
          </div>
          {opened && (
            <div className="mse-questions">
              <p className="mse-module-id">Module-ID: {module.id}</p>
              {itemAdvice?.reasons.length ? (
                <p className="mse-reason">
                  <Compass size={14} />
                  {itemAdvice.reasons.join(' ')}
                </p>
              ) : null}
              {questionIds.map((id) => {
                const question = questionById.get(id);
                const checked = module.enabled && selected.includes(id);
                return (
                  <div className={`mse-question ${checked ? 'is-selected' : ''}`} key={id}>
                    <SelectionCheck
                      label={`Vraag kiezen: ${id} ${question?.title ?? 'Niet beschikbaar'}`}
                      checked={checked}
                      onChange={(value) =>
                        onModulesChange(setModuleQuestionSelected(modules, module.id, id, value))
                      }
                    />
                    <details>
                      <summary>
                        <span>{question?.title ?? 'Vraagdefinitie niet beschikbaar'}</span>
                        <small>
                          {id}
                          {question
                            ? ` · ${question.route === 'kern' ? 'Kernvraag' : 'Verdieping'}`
                            : ''}
                        </small>
                        <ChevronRight size={15} />
                      </summary>
                      {question ? (
                        <div className="mse-question-body">
                          <p className="mse-question-prompt">{question.prompt}</p>
                          {(question.richFields?.hazard || question.richFields?.risk) && (
                            <dl>
                              <dt>Gevaar</dt>
                              <dd>
                                {question.richFields?.hazard || 'Niet afzonderlijk vastgelegd'}
                              </dd>
                              <dt>Risico</dt>
                              <dd>{question.richFields?.risk || 'Niet afzonderlijk vastgelegd'}</dd>
                            </dl>
                          )}
                          {question.acceptanceCriteria && (
                            <section>
                              <h5>Beoordelingscriteria</h5>
                              <p>{question.acceptanceCriteria}</p>
                            </section>
                          )}
                          {question.assessmentGuidance && (
                            <section>
                              <h5>Beoordelingsaanwijzing</h5>
                              <p>{question.assessmentGuidance}</p>
                            </section>
                          )}
                          {question.expectedEvidence && (
                            <section>
                              <h5>Verwacht bewijs</h5>
                              <p>{question.expectedEvidence}</p>
                            </section>
                          )}
                          {question.evidenceHints.length > 0 && (
                            <section>
                              <h5>Bewijsaanwijzingen</h5>
                              <ul>
                                {question.evidenceHints.map((hint, index) => (
                                  <li key={index}>{hint}</li>
                                ))}
                              </ul>
                            </section>
                          )}
                          {question.legalReferences && (
                            <section>
                              <h5>Oorspronkelijke normverwijzing</h5>
                              <p>{question.legalReferences}</p>
                            </section>
                          )}
                          <p className="mse-question-sources">
                            Bronnen:{' '}
                            {question.sourceIds
                              .map(
                                (sourceId) =>
                                  `${knownSources.get(sourceId)?.title ?? sourceId} [${sourceId}]`,
                              )
                              .join(' · ') || 'Niet vastgelegd'}
                          </p>
                        </div>
                      ) : (
                        <p className="mse-missing">
                          De werkelijke inhoud ontbreekt in deze werkruimte. Controleer de
                          beschikbaarheid vóór dossieraanmaak.
                        </p>
                      )}
                    </details>
                  </div>
                );
              })}
              {!questionIds.length && (
                <p className="mse-empty">Geen vraagteksten passen bij deze zoekterm.</p>
              )}
            </div>
          )}
          {module.enabled && renderModuleExtra && (
            <div className="mse-module-options">
              {renderModuleExtra(
                module,
                modules.findIndex((item) => item.id === module.id),
              )}
            </div>
          )}
        </div>
      );
    });
  }
  const mapHeight = Math.max(470, Math.ceil(visible.length / 2) * 79 + 80);
  const centerY = mapHeight / 2;
  const selectedFocused = visible.find((module) => module.id === focusedModule);
  return (
    <section className="mse" aria-label="Module- en vraagverkenner">
      <header className="mse-heading">
        <div className="mse-heading-icon">
          <Layers size={23} />
        </div>
        <div>
          <span className="mse-eyebrow">JOUW ONDERZOEK, JOUW SCOPE</span>
          <h3>Van thema naar de juiste vragen</h3>
          <p>Verken de inhoud. Kies hele modules of stel je eigen vraagselectie samen.</p>
        </div>
        {onCreatePlan && (
          <button type="button" className="mse-start" onClick={onCreatePlan}>
            Keuze vastleggen <ChevronRight size={17} />
          </button>
        )}
      </header>
      <div className="mse-layout">
        <aside className="mse-advice">
          <div className="mse-advice-heading">
            <Compass size={20} />
            <div>
              <h4>Keuzehulp</h4>
              <span>Welke gevaren spelen mogelijk?</span>
            </div>
          </div>
          <p>
            Kies herkenbare profielen. Het advies wijst je naar de werkelijke inhoud van de
            beschikbare modules.
          </p>
          <div className="mse-profiles">
            {moduleHazardProfiles.map((profile) => (
              <label
                key={profile.id}
                className={signals.includes(profile.id) ? 'is-active' : ''}
                title={profile.description}
              >
                <input
                  type="checkbox"
                  aria-label={`Gevaarprofiel: ${profile.label}`}
                  checked={signals.includes(profile.id)}
                  onChange={(event) =>
                    setSignals(
                      event.target.checked
                        ? [...signals, profile.id]
                        : signals.filter((id) => id !== profile.id),
                    )
                  }
                />
                <span>{profile.label}</span>
              </label>
            ))}
          </div>
          <div className="mse-advice-result">
            <Sparkles size={16} />
            <strong>{recommended.length} modules aanbevolen</strong>
          </div>
          <button
            type="button"
            className="mse-add-advice"
            disabled={!recommended.length}
            onClick={applyAdvice}
          >
            <Plus size={16} /> Aanbevolen modules toevoegen
          </button>
          <p className="mse-advice-footnote">
            Voegt alleen toe. Jouw uitsluitingen blijven behouden. Een aanbeveling stelt
            aanwezigheid, werking of naleving niet vast.
          </p>
          <details className="mse-advice-explanation">
            <summary>Waarom dit advies?</summary>
            <ul>
              {recommended.map((item) => (
                <li key={item.moduleId}>
                  <strong>{modules.find((module) => module.id === item.moduleId)?.title}</strong>
                  <span>{item.reasons.join(' ')}</span>
                </li>
              ))}
            </ul>
            <p>
              Geen match betekent dat de keuze nog te onderzoeken is. Alle modules blijven
              beschikbaar.
            </p>
          </details>
        </aside>
        <div className="mse-browser">
          <div className="mse-toolbar">
            <label className="mse-search">
              <Search size={17} />
              <input
                aria-label="Zoek modules en vragen"
                type="search"
                value={search}
                placeholder="Zoek op thema, vraag, gevaar of risico…"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="mse-view-switch" role="group" aria-label="Weergave modulekeuze">
              <button
                type="button"
                aria-label="Boomweergave"
                aria-pressed={view === 'tree'}
                onClick={() => setView('tree')}
              >
                <ListTree size={17} />
                <span>Boom</span>
              </button>
              <button
                type="button"
                aria-label="Mindmapweergave"
                aria-pressed={view === 'map'}
                onClick={() => setView('map')}
              >
                <Network size={17} />
                <span>Mindmap</span>
              </button>
            </div>
          </div>
          <div
            className="mse-selection-summary"
            role="status"
            aria-label="Geselecteerde vragen"
            aria-live="polite"
          >
            <span className="mse-selection-dot" />
            <strong>{selectedQuestions.size} vragen geselecteerd</strong>
            <span>in {selectedModules.length} modules</span>
            <small>
              {visible.length} van {modules.length} modules zichtbaar
            </small>
          </div>
          {view === 'tree' ? (
            <div className="mse-tree">
              {visible
                .reduce<{ origin: PlannedModule['origin']; modules: PlannedModule[] }[]>(
                  (groups, module) => {
                    const last = groups[groups.length - 1];
                    if (last?.origin === module.origin) last.modules.push(module);
                    else groups.push({ origin: module.origin, modules: [module] });
                    return groups;
                  },
                  [],
                )
                .map((group, index) => (
                  <section className="mse-group" key={`${group.origin}/${index}`}>
                    <h4>
                      <BookOpen size={15} />
                      {moduleOriginLabels[group.origin]}
                      <span>{group.modules.length}</span>
                    </h4>
                    {moduleRows(group.modules)}
                  </section>
                ))}
            </div>
          ) : (
            <>
              <div className="mse-map" aria-label="Mindmap van de beschikbare modules">
                <svg
                  viewBox={`0 0 1100 ${mapHeight}`}
                  width="1100"
                  height={mapHeight}
                  role="group"
                  aria-label="Klik op een moduletak om haar vragen te bekijken"
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#0eafa4" />
                      <stop offset="1" stopColor="#216fba" />
                    </linearGradient>
                  </defs>
                  <circle className="mse-map-orbit" cx="550" cy={centerY} r="117" />
                  <circle className="mse-map-orbit secondary" cx="550" cy={centerY} r="145" />
                  {visible.map((module, index) => {
                    const right = index % 2 === 1;
                    const count = Math.ceil(visible.length / 2);
                    const x = right ? 750 : 42;
                    const y = centerY - (count - 1) * 39.5 + Math.floor(index / 2) * 79;
                    const chosen = module.enabled ? moduleQuestionIds(module).length : 0;
                    const endpoint = right ? x : x + 308;
                    return (
                      <g key={module.id}>
                        <path
                          className={`mse-map-branch ${chosen ? 'is-selected' : ''}`}
                          d={`M ${right ? 643 : 457} ${centerY} C ${right ? 697 : 403} ${centerY}, ${right ? 697 : 403} ${y}, ${endpoint} ${y}`}
                        />
                        <g
                          className={`mse-map-node ${chosen ? 'is-selected' : ''} ${focusedModule === module.id ? 'is-focused' : ''}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Module in mindmap: ${module.title}`}
                          onClick={() => setFocusedModule(module.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setFocusedModule(module.id);
                            }
                          }}
                        >
                          <title>
                            {module.title} · {chosen} van {module.questionIds.length} vragen
                            geselecteerd
                          </title>
                          <rect x={x} y={y - 29} width="308" height="58" rx="14" />
                          <circle cx={x + 20} cy={y} r="5" />
                          {wrapTitle(module.title).map((line, lineIndex) => (
                            <text
                              key={lineIndex}
                              x={x + 35}
                              y={y - (wrapTitle(module.title).length > 1 ? 7 : 0) + lineIndex * 15}
                            >
                              {line}
                            </text>
                          ))}
                          <text className="mse-map-count" x={x + 284} y={y + 5} textAnchor="end">
                            {chosen}/{module.questionIds.length}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                  <circle
                    cx="550"
                    cy={centerY}
                    r="91"
                    fill={`url(#${gradientId})`}
                    className="mse-map-hub"
                  />
                  <text className="mse-map-hub-label" x="550" y={centerY - 17} textAnchor="middle">
                    Jouw selectie
                  </text>
                  <text className="mse-map-hub-number" x="550" y={centerY + 20} textAnchor="middle">
                    {selectedQuestions.size}
                  </text>
                  <text className="mse-map-hub-sub" x="550" y={centerY + 43} textAnchor="middle">
                    vragen
                  </text>
                </svg>
              </div>
              <p className="mse-map-hint">
                Klik op een tak om vragen te inspecteren en te kiezen. De boom en mindmap gebruiken
                dezelfde selectie.
              </p>
              {selectedFocused && (
                <div className="mse-map-detail">{moduleRows([selectedFocused], true)}</div>
              )}
            </>
          )}
          {!visible.length && (
            <div className="mse-no-results">
              <Search size={24} />
              <strong>Geen module of vraag gevonden</strong>
              <p>
                Probeer een andere titel, term uit een vraag of gevaar. Je bestaande selectie blijft
                behouden.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
