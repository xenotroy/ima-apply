import { useState } from 'react';
import { GitBranch, Plus, Upload, ClipboardCheck, Move } from 'lucide-react';
import type { WorkspacePatch } from '../data/model';
import type { Scenario } from '../domain/types';
import { KINNEY_SCALES } from '../domain/risk';
import { departmentOrganisationId } from '../data/dossier';
import {
  assertRiskLibrary,
  assertRiskLibraryUpdate,
  captureRiskLibraryReview,
  captureRiskLibraryLayout,
  createLibraryScenario,
  latestLibraryReview,
  latestLibraryLayout,
  ordinalScreening,
  rankLibraryControls,
  riskLibraryScopeKey,
  libraryControlLabels,
  libraryCostLabels,
  libraryRelevanceLabels,
  type RiskLibrary,
  type RiskLibraryWorkspaceState,
  type RiskLibraryScope,
  type RiskLibraryReview,
  type LibraryFactorReview,
  type LibraryControlReview,
  type LibraryNodeType,
  type OrdinalRating,
  type LibraryRelevance,
  type LibraryCostLevel,
  type RiskLibraryLayout,
} from '../data/risk-library';
import { draftBase } from '../data/local-drafts';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import DraftNotice from './DraftNotice';
import { Badge, Field, Modal } from './Primitives';

type LibraryPatch = WorkspacePatch & {
  riskLibraries?: RiskLibrary[];
  riskLibraryReviews?: RiskLibraryReview[];
  riskLibraryLayouts?: RiskLibraryLayout[];
};
interface ScopeOption {
  key: string;
  label: string;
  scope: RiskLibraryScope;
  native: boolean;
}
function scopeOptions(workspace: RiskLibraryWorkspaceState): ScopeOption[] {
  const options: ScopeOption[] = [];
  for (const dossier of workspace.dossiers ?? []) {
    const common = {
      dossierId: dossier.id,
      ...(dossier.projectContextId ? { projectContextId: dossier.projectContextId } : {}),
      ...(dossier.organisationId ? { organisationId: dossier.organisationId } : {}),
    };
    options.push({
      key: riskLibraryScopeKey(common),
      label: `${dossier.title} · dossierbreed`,
      scope: common,
      native: true,
    });
    for (const departmentId of dossier.departmentIds) {
      const department = workspace.departments?.find((item) => item.id === departmentId);
      const organisationId = departmentOrganisationId(department, workspace.sites ?? []);
      const scope = { ...common, departmentId, ...(organisationId ? { organisationId } : {}) };
      options.push({
        key: riskLibraryScopeKey(scope),
        label: `${dossier.title} · ${department?.name ?? departmentId}`,
        scope,
        native: true,
      });
    }
  }
  for (const record of [
    ...(workspace.riskLibraryReviews ?? []),
    ...(workspace.riskLibraryLayouts ?? []),
  ]) {
    const key = riskLibraryScopeKey(record.scope);
    if (options.some((option) => option.key === key)) continue;
    const scope = record.scope;
    const label = [
      workspace.projectContexts?.find((item) => item.id === scope.projectContextId)?.title,
      workspace.organisations?.find((item) => item.id === scope.organisationId)?.name,
      workspace.departments?.find((item) => item.id === scope.departmentId)?.name,
    ]
      .filter(Boolean)
      .join(' · ');
    options.push({ key, label: `Oorspronkelijke scope · ${label || key}`, scope, native: false });
  }
  return options;
}
interface Selection {
  type: LibraryNodeType;
  id: string;
}
export default function RiskLibraryWorkspace({
  workspace,
  onUpdate,
  onScenario,
}: {
  workspace: RiskLibraryWorkspaceState;
  onUpdate: (patch: LibraryPatch) => boolean;
  onScenario: (scenario: Scenario) => boolean;
}) {
  const libraries = workspace.riskLibraries ?? [];
  const [libraryId, setLibraryId] = useState(libraries.at(-1)?.id ?? '');
  const library = libraries.find((item) => item.id === libraryId) ?? libraries.at(-1);
  const scopes = scopeOptions(workspace);
  const [scopeKey, setScopeKey] = useState(scopes[0]?.key ?? '');
  const selectedScope = scopes.find((item) => item.key === scopeKey) ?? scopes[0];
  const [moduleId, setModuleId] = useState('');
  const [selection, setSelection] = useState<Selection>();
  const [dialog, setDialog] = useState<'import' | 'review' | 'layout' | 'scenario'>();
  const factor = library?.factors.find(
    (item) => item.id === selection?.id && selection.type === 'factor',
  );
  const link = library?.links.find(
    (item) => item.id === selection?.id && selection.type === 'control_link',
  );
  const control = library?.controls.find((item) => item.id === link?.controlId);
  const scope = selectedScope?.scope;
  const factorReview =
    library && factor && scope
      ? latestLibraryReview(workspace.riskLibraryReviews ?? [], library, scope, 'factor', factor.id)
      : undefined;
  const controlReview =
    library && link && scope
      ? latestLibraryReview(
          workspace.riskLibraryReviews ?? [],
          library,
          scope,
          'control_link',
          link.id,
        )
      : undefined;
  const update = (patch: LibraryPatch) => {
    assertRiskLibraryUpdate(workspace, { ...workspace, ...patch });
    return onUpdate(patch);
  };
  return (
    <section className="panel risk-library-workspace">
      <div className="section-row">
        <h2>
          <GitBranch size={18} /> Herbruikbare risicobibliotheek
        </h2>
        <button className="secondary" onClick={() => setDialog('import')}>
          <Upload size={14} /> Bibliotheekversie importeren
        </button>
      </div>
      <p className="muted">
        Verken gevaar → risico → factor, beoordelingsvragen en gedeelde maatregelen. De bibliotheek
        is een bevroren inhoudsversie. Lokale reviews horen bij één exacte dossier- of
        oorspronkelijke scope.
      </p>
      {!library ? (
        <p className="muted">
          Nog geen risicobibliotheek. Importeer een gecontroleerde bibliotheekversie of een
          gemigreerde oorspronkelijke werkruimte.
        </p>
      ) : (
        <>
          <div className="form-grid">
            <Field label="Bibliotheekversie">
              <select
                value={library.id}
                onChange={(event) => {
                  setLibraryId(event.target.value);
                  setModuleId('');
                  setSelection(undefined);
                }}
              >
                {libraries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} @{item.version}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bibliotheekscope">
              <select
                value={selectedScope?.key ?? ''}
                onChange={(event) => setScopeKey(event.target.value)}
              >
                <option value="" disabled>
                  Kies een dossier of oorspronkelijke scope
                </option>
                {scopes.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bibliotheekmodule">
              <select
                value={moduleId}
                onChange={(event) => {
                  setModuleId(event.target.value);
                  setSelection(undefined);
                }}
              >
                <option value="">Alle modules</option>
                {library.modules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.code} {module.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="muted">
            <Badge tone="blue">Versie {library.version}</Badge>{' '}
            {library.origin === 'legacy_sqlite'
              ? 'Oorspronkelijke SQLite-bibliotheek'
              : 'Lokale bibliotheek'}{' '}
            · {library.hazards.length} gevaren · {library.risks.length} risico’s ·{' '}
            {library.factors.length} factoren · {library.controls.length} gedeelde maatregelen /{' '}
            {library.links.length} koppelingen
          </p>
          <small>Bevroren SHA256: {library.sha256}</small>
          <LibraryGraph
            library={library}
            workspace={workspace}
            scope={scope}
            moduleId={moduleId}
            selected={selection}
            onSelect={setSelection}
          />
          <details>
            <summary>Bibliotheekboom en gedeelde relaties</summary>
            <LibraryTree library={library} moduleId={moduleId} onSelect={setSelection} />
          </details>
          <p className="muted">
            De 1–3-ratings en type-/kosten-/afnemende-opbrengstgewichten tonen lokale ordinale
            prioriteit. Een reductierating is geen percentage of PFD. ‘Aanwezig’ levert geen bewezen
            risicoreductie of AHS-broncredit op.
          </p>
          {selection && (
            <div className="registry-item">
              <div className="section-row">
                <h3>
                  {factor?.title ??
                    control?.title ??
                    library.hazards.find((item) => item.id === selection.id)?.title ??
                    library.risks.find((item) => item.id === selection.id)?.title}
                </h3>
                <button
                  className="secondary"
                  disabled={!selectedScope?.native}
                  onClick={() => setDialog('layout')}
                >
                  <Move size={14} /> Kaartpositie vastleggen
                </button>
              </div>
              {factor && (
                <>
                  <p>{factor.description}</p>
                  <p>
                    <strong>LOD:</strong> {factor.lodDescription || 'Geen toelichting vastgelegd'}
                  </p>
                  {scope && (
                    <p>
                      Lokale screening: {ordinalScreening(library, factor.id, factorReview).score} /
                      27 · {ordinalScreening(library, factor.id, factorReview).label} ·{' '}
                      {libraryRelevanceLabels[factorReview?.relevance ?? 'unknown']} ·{' '}
                      {factorReview
                        ? 'Scopebeoordeling vastgelegd'
                        : 'Alleen bibliotheekdefaults; niet beoordeeld'}
                    </p>
                  )}
                  <h4>Beoordelingsvragen bij deze factor</h4>
                  {library.questions
                    .filter((item) => item.factorId === factor.id)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((question) => (
                      <div key={question.id}>
                        <strong>{question.prompt}</strong>
                        <p>{question.explanation || 'Geen aanvullende toelichting'}</p>
                      </div>
                    ))}
                  <h4>Gedeelde maatregelen en oorspronkelijke rangschikking</h4>
                  {scope &&
                    rankLibraryControls(
                      library,
                      factor.id,
                      scope,
                      workspace.riskLibraryReviews ?? [],
                    ).map((entry) => (
                      <div className="registry-item" key={entry.link.id}>
                        <button
                          className="secondary"
                          onClick={() => setSelection({ type: 'control_link', id: entry.link.id })}
                        >
                          {entry.control.title}
                        </button>
                        <p>
                          {libraryControlLabels[entry.control.type]} · gedeeld met{' '}
                          {
                            library.links.filter((item) => item.controlId === entry.control.id)
                              .length
                          }{' '}
                          factoren · lokale rangscore {entry.rankScore} · reductierating{' '}
                          {entry.reductionRating} · kosten {libraryCostLabels[entry.costLevel]}
                        </p>
                        <small>
                          Typegewicht {entry.typeWeight} · kostenmodifier {entry.costWeight} ·
                          afnemende-opbrengstgewicht {entry.diminishingWeight} · aanwezigheid{' '}
                          {entry.review
                            ? entry.review.isInPlace
                              ? 'Ja, lokaal gemeld'
                              : 'Nee, lokaal gemeld'
                            : 'Niet beoordeeld'}
                        </small>
                      </div>
                    ))}
                  <div className="button-row">
                    <button
                      className="secondary"
                      disabled={!selectedScope?.native}
                      onClick={() => setDialog('review')}
                    >
                      <ClipboardCheck size={14} /> Factorreview vastleggen
                    </button>
                    <button
                      className="primary"
                      disabled={!selectedScope?.native}
                      onClick={() => setDialog('scenario')}
                    >
                      <Plus size={14} /> Nieuw Kinney-scenario vanuit factor
                    </button>
                  </div>
                </>
              )}
              {link && control && (
                <>
                  <p>{control.description}</p>
                  <p>
                    {libraryControlLabels[control.type]} · gekoppeld aan{' '}
                    {library.links.filter((item) => item.controlId === control.id).length} factoren
                    · bibliotheekreductierating {link.reductionRating} · bibliotheekkosten{' '}
                    {libraryCostLabels[link.costLevel]}
                  </p>
                  <h4>Alle factorrelaties van deze maatregel</h4>
                  {library.links
                    .filter((item) => item.controlId === control.id)
                    .map((related) => (
                      <p key={related.id}>
                        <button
                          className="secondary"
                          onClick={() => setSelection({ type: 'factor', id: related.factorId })}
                        >
                          {library.factors.find((item) => item.id === related.factorId)?.title}
                        </button>{' '}
                        · koppeling {related.id}
                      </p>
                    ))}
                  <button
                    className="secondary"
                    disabled={!selectedScope?.native}
                    onClick={() => setDialog('review')}
                  >
                    <ClipboardCheck size={14} /> Maatregelreview vastleggen
                  </button>
                </>
              )}
              {(factorReview || controlReview) && (
                <ReviewDescription review={(factorReview ?? controlReview)!} />
              )}
              {!selectedScope?.native && (
                <p className="muted">
                  Kies een dossier als scope om een nieuwe eigen review, kaartpositie of scenario
                  vast te leggen. Oorspronkelijke reviews behouden hun oorspronkelijke scope en
                  onbekende auteur/tijdzone.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {dialog === 'import' && (
        <Modal title="Bibliotheekversie importeren" wide onClose={() => setDialog(undefined)}>
          <LibraryImport
            workspace={workspace}
            onSave={(item) => {
              if (update({ riskLibraries: [...libraries, item] })) {
                setLibraryId(item.id);
                setSelection(undefined);
                setDialog(undefined);
                return true;
              }
              return false;
            }}
          />
        </Modal>
      )}
      {dialog === 'review' && library && scope && selectedScope?.native && (factor || link) && (
        <Modal
          title={factor ? 'Factorreview vastleggen' : 'Maatregelreview vastleggen'}
          onClose={() => setDialog(undefined)}
        >
          <ReviewForm
            key={`${library.id}/${selectedScope.key}/${factor?.id ?? link?.id}`}
            workspace={workspace}
            library={library}
            scope={scope}
            factorId={factor?.id}
            linkId={link?.id}
            previous={factorReview ?? controlReview}
            onSave={(review) => {
              if (
                update({ riskLibraryReviews: [...(workspace.riskLibraryReviews ?? []), review] })
              ) {
                setDialog(undefined);
                return true;
              }
              return false;
            }}
          />
        </Modal>
      )}
      {dialog === 'layout' && library && scope && selectedScope?.native && selection && (
        <Modal title="Kaartpositie vastleggen" onClose={() => setDialog(undefined)}>
          <LayoutForm
            key={`${library.id}/${selectedScope.key}/${selection.type}/${selection.id}`}
            workspace={workspace}
            library={library}
            scope={scope}
            node={selection}
            onSave={(layout) => {
              if (
                update({ riskLibraryLayouts: [...(workspace.riskLibraryLayouts ?? []), layout] })
              ) {
                setDialog(undefined);
                return true;
              }
              return false;
            }}
          />
        </Modal>
      )}
      {dialog === 'scenario' && library && factor && scope && selectedScope?.native && (
        <Modal
          title="Nieuw scenario vanuit bibliotheekfactor"
          wide
          onClose={() => setDialog(undefined)}
        >
          <ScenarioForm
            key={`${library.id}/${selectedScope.key}/${factor.id}`}
            workspace={workspace}
            library={library}
            factorId={factor.id}
            scope={scope}
            onSave={(scenario) => {
              if (onScenario(scenario)) {
                setDialog(undefined);
                return true;
              }
              return false;
            }}
          />
        </Modal>
      )}
    </section>
  );
}

function ReviewDescription({ review }: { review: RiskLibraryReview }) {
  return (
    <div className="registry-item">
      <strong>Laatste review in deze exacte scope</strong>
      <p>
        {review.kind === 'factor'
          ? `${libraryRelevanceLabels[review.relevance]} · lokale B ${review.exposureRating}, W ${review.likelihoodRating}`
          : `Lokale reductierating ${review.reductionRating} · kosten ${libraryCostLabels[review.costLevel]} · aanwezig ${review.isInPlace ? 'Ja' : 'Nee'}`}
      </p>
      <p>{review.note}</p>
      <small>
        Beoordelaar: {review.assessor ?? 'Onbekend in bron'} ·{' '}
        {review.reviewedAt ??
          `oorspronkelijke tijdwaarde ${review.legacyUpdatedAt || 'onbekend'}; tijdzone niet afgeleid`}{' '}
        · SHA256 {review.sha256}
      </small>
    </div>
  );
}
function LibraryTree({
  library,
  moduleId,
  onSelect,
}: {
  library: RiskLibrary;
  moduleId: string;
  onSelect: (selection: Selection) => void;
}) {
  return (
    <div>
      {library.hazards
        .filter((item) => !moduleId || item.moduleId === moduleId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((hazard) => (
          <details key={hazard.id} open>
            <summary>
              {hazard.code} {hazard.title}
            </summary>
            {library.risks
              .filter((item) => item.hazardId === hazard.id)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((risk) => (
                <details key={risk.id} open>
                  <summary>
                    {risk.code} {risk.title}
                  </summary>
                  {library.factors
                    .filter((item) => item.riskId === risk.id)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((factor) => (
                      <div className="registry-item" key={factor.id}>
                        <button
                          className="secondary"
                          onClick={() => onSelect({ type: 'factor', id: factor.id })}
                        >
                          {factor.code} {factor.title}
                        </button>
                        {library.links
                          .filter((item) => item.factorId === factor.id)
                          .map((link) => (
                            <p key={link.id}>
                              <button
                                className="secondary"
                                onClick={() => onSelect({ type: 'control_link', id: link.id })}
                              >
                                {library.controls.find((item) => item.id === link.controlId)?.title}
                              </button>{' '}
                              · gedeelde maatregel {link.controlId}
                            </p>
                          ))}
                      </div>
                    ))}
                </details>
              ))}
          </details>
        ))}
    </div>
  );
}
function LibraryGraph({
  library,
  workspace,
  scope,
  moduleId,
  selected,
  onSelect,
}: {
  library: RiskLibrary;
  workspace: RiskLibraryWorkspaceState;
  scope?: RiskLibraryScope;
  moduleId: string;
  selected?: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const hazards = library.hazards
      .filter((item) => !moduleId || item.moduleId === moduleId)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    risks = library.risks
      .filter((item) => hazards.some((hazard) => hazard.id === item.hazardId))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    factors = library.factors
      .filter((item) => risks.some((risk) => risk.id === item.riskId))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    links = library.links
      .filter((item) => factors.some((factor) => factor.id === item.factorId))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const columns = [
    { type: 'hazard' as const, title: 'Gevaar', rows: hazards },
    { type: 'risk' as const, title: 'Risico', rows: risks },
    { type: 'factor' as const, title: 'Factor', rows: factors },
    {
      type: 'control_link' as const,
      title: 'Maatregelkoppeling',
      rows: links.map((link) => ({
        ...link,
        title: library.controls.find((item) => item.id === link.controlId)?.title ?? link.controlId,
      })),
    },
  ];
  const nodes = columns.flatMap((column, index) =>
    column.rows.map((row, rowIndex) => {
      const layout =
        scope &&
        latestLibraryLayout(
          workspace.riskLibraryLayouts ?? [],
          library,
          scope,
          column.type,
          row.id,
        );
      return {
        type: column.type,
        id: row.id,
        title: row.title,
        x: layout?.x ?? 20 + index * 250,
        y: layout?.y ?? 55 + rowIndex * 100,
      };
    }),
  );
  const position = (type: LibraryNodeType, id: string) =>
    nodes.find((item) => item.type === type && item.id === id);
  const edges = [
    ...risks.map((risk) => [position('hazard', risk.hazardId), position('risk', risk.id)]),
    ...factors.map((factor) => [position('risk', factor.riskId), position('factor', factor.id)]),
    ...links.map((link) => [position('factor', link.factorId), position('control_link', link.id)]),
  ].filter((pair) => pair[0] && pair[1]);
  const width = Math.max(1020, ...nodes.map((item) => item.x + 250)),
    height = Math.max(220, ...nodes.map((item) => item.y + 110));
  return (
    <div
      style={{
        overflow: 'auto',
        maxHeight: 620,
        borderRadius: 12,
        marginTop: 18,
        background: '#071c29',
      }}
    >
      <svg
        role="img"
        aria-label="Graph van bibliotheekgevaren, risico’s, factoren en gedeelde maatregelkoppelingen"
        width={width}
        height={height}
        style={{ display: 'block' }}
      >
        <defs>
          <filter id="library-node-glow">
            <feGaussianBlur stdDeviation="2" />
          </filter>
          <linearGradient id="library-edge-gradient">
            <stop stopColor="#63e0ed" />
            <stop offset="1" stopColor="#8ee9b8" />
          </linearGradient>
        </defs>
        {columns.map((column, index) => (
          <text key={column.type} x={20 + index * 250} y={27} fill="#b9d8e5" fontSize={13}>
            {column.title}
          </text>
        ))}
        {edges.map(([from, to], index) => (
          <path
            key={index}
            d={`M ${from!.x + 210} ${from!.y + 34} C ${from!.x + 250} ${from!.y + 34}, ${to!.x - 30} ${to!.y + 34}, ${to!.x} ${to!.y + 34}`}
            stroke="url(#library-edge-gradient)"
            opacity={0.7}
            strokeWidth={2}
            fill="none"
          />
        ))}
        {nodes.map((node) => {
          const active = selected?.type === node.type && selected.id === node.id;
          const factorReview =
            node.type === 'factor' && scope
              ? latestLibraryReview(
                  workspace.riskLibraryReviews ?? [],
                  library,
                  scope,
                  'factor',
                  node.id,
                )
              : undefined;
          const label =
            node.type === 'factor'
              ? factorReview
                ? `${libraryRelevanceLabels[factorReview.relevance]} · lokale score ${ordinalScreening(library, node.id, factorReview).score}`
                : 'Niet beoordeeld · lokale defaults'
              : node.type === 'control_link'
                ? 'Gedeelde definitie · eigen factorlink'
                : node.type === 'risk'
                  ? 'Oorspronkelijke lokale effectrating'
                  : (library.modules.find(
                      (item) =>
                        item.id ===
                        library.hazards.find((hazard) => hazard.id === node.id)?.moduleId,
                    )?.title ?? 'Module niet vastgelegd');
          return (
            <g
              key={`${node.type}:${node.id}`}
              role="button"
              tabIndex={0}
              aria-label={`Selecteer ${node.type}: ${node.title}`}
              onClick={() => onSelect({ type: node.type, id: node.id })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect({ type: node.type, id: node.id });
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={node.x}
                y={node.y}
                width={210}
                height={72}
                rx={12}
                stroke={active ? '#f9f296' : '#60d5d4'}
                fill={active ? '#123b47' : '#0d2c3c'}
                strokeWidth={active ? 2.5 : 1}
              />
              <text x={node.x + 12} y={node.y + 26} fill="#e0f4f5" fontSize={13}>
                {node.title.length > 28 ? `${node.title.slice(0, 27)}…` : node.title}
              </text>
              <text x={node.x + 12} y={node.y + 52} fill="#92b6c6" fontSize={10}>
                {label.length > 38 ? `${label.slice(0, 37)}…` : label}
              </text>
              <title>
                {node.title} — {label} — {node.id}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LibraryImport({
  workspace,
  onSave,
}: {
  workspace: RiskLibraryWorkspaceState;
  onSave: (library: RiskLibrary) => boolean;
}) {
  const [json, setJson, draft] = usePersistentDraft(`${workspace.id}/risk-library-import`, '');
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const library: unknown = JSON.parse(json);
          assertRiskLibrary(library);
          assertRiskLibraryUpdate(workspace, {
            ...workspace,
            riskLibraries: [...(workspace.riskLibraries ?? []), library],
          });
          if (onSave(library)) draft.clear();
        } catch (error) {
          setError(String(error));
        }
      }}
    >
      <p>
        Voeg een volledige getypeerde bibliotheekversie met geldige inhoudshash toe. Bestaande
        versies blijven bewaard. Een opvolger heeft dezelfde bibliotheekidentiteit, een hogere
        versie en de exacte voorganger-ID. Bron-ID’s verwijzen naar bestaande werkruimtebronnen.
      </p>
      <Field label="Bibliotheek-JSON">
        <textarea
          required
          rows={14}
          value={json}
          onChange={(event) => setJson(event.target.value)}
        />
      </Field>
      <DraftNotice status={draft} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        Bibliotheekversie toevoegen
      </button>
    </form>
  );
}
function ReviewForm({
  workspace,
  library,
  scope,
  factorId,
  linkId,
  previous,
  onSave,
}: {
  workspace: RiskLibraryWorkspaceState;
  library: RiskLibrary;
  scope: RiskLibraryScope;
  factorId?: string;
  linkId?: string;
  previous?: RiskLibraryReview;
  onSave: (review: RiskLibraryReview) => boolean;
}) {
  const factor = library.factors.find((item) => item.id === factorId),
    link = library.links.find((item) => item.id === linkId);
  const oldFactor = previous?.kind === 'factor' ? previous : undefined,
    oldControl = previous?.kind === 'control_link' ? previous : undefined;
  const [values, setValues, draft] = usePersistentDraft(
    `${workspace.id}/risk-library-review/${library.id}/${riskLibraryScopeKey(scope)}/${factorId ?? linkId}`,
    {
      assessor: '',
      note: '',
      relevance: oldFactor?.relevance ?? ('unknown' as LibraryRelevance),
      exposure: String(oldFactor?.exposureRating ?? 1),
      likelihood: String(oldFactor?.likelihoodRating ?? factor?.defaultLikelihoodRating ?? 1),
      reduction: String(oldControl?.reductionRating ?? link?.reductionRating ?? 1),
      cost: oldControl?.costLevel ?? link?.costLevel ?? ('medium' as LibraryCostLevel),
      inPlace: oldControl?.isInPlace ?? false,
    },
    previous ? previous.sha256 : library.sha256,
  );
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const common = {
            id: crypto.randomUUID(),
            scope,
            origin: 'native' as const,
            assessor: values.assessor,
            reviewedAt: new Date().toISOString(),
            note: values.note,
            sourceIds: [] as string[],
            ...(previous ? { supersedesId: previous.id } : {}),
          };
          const record = captureRiskLibraryReview(
            library,
            factorId
              ? {
                  ...common,
                  kind: 'factor',
                  factorId,
                  relevance: values.relevance,
                  exposureRating: Number(values.exposure) as OrdinalRating,
                  likelihoodRating: Number(values.likelihood) as OrdinalRating,
                }
              : {
                  ...common,
                  kind: 'control_link',
                  linkId: linkId!,
                  reductionRating: Number(values.reduction) as OrdinalRating,
                  costLevel: values.cost,
                  isInPlace: values.inPlace,
                },
          );
          if (onSave(record)) draft.clear();
        } catch (error) {
          setError(String(error));
        }
      }}
    >
      <p>
        Nieuwe lokale ordinale beoordeling. De exacte bibliotheekhash en scope worden bewaard;
        eerdere reviews blijven leesbaar.
      </p>
      {factorId ? (
        <>
          <Field label="Factorrelevantie">
            <select
              value={values.relevance}
              onChange={(event) =>
                setValues({ ...values, relevance: event.target.value as LibraryRelevance })
              }
            >
              {Object.entries(libraryRelevanceLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <OrdinalField
            label="Lokale blootstellingsrating"
            value={values.exposure}
            onChange={(exposure) => setValues({ ...values, exposure })}
          />
          <OrdinalField
            label="Lokale waarschijnlijkheidsrating"
            value={values.likelihood}
            onChange={(likelihood) => setValues({ ...values, likelihood })}
          />
        </>
      ) : (
        <>
          <OrdinalField
            label="Lokale reductierating"
            value={values.reduction}
            onChange={(reduction) => setValues({ ...values, reduction })}
          />
          <Field label="Lokale kostencategorie">
            <select
              value={values.cost}
              onChange={(event) =>
                setValues({ ...values, cost: event.target.value as LibraryCostLevel })
              }
            >
              {Object.entries(libraryCostLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <label className="check-row">
            <input
              type="checkbox"
              checked={values.inPlace}
              onChange={(event) => setValues({ ...values, inPlace: event.target.checked })}
            />{' '}
            Maatregel lokaal aanwezig gemeld
          </label>
        </>
      )}
      <Field label="Beoordelaar">
        <input
          required
          value={values.assessor}
          onChange={(event) => setValues({ ...values, assessor: event.target.value })}
        />
      </Field>
      <Field label="Beoordelingsgrond">
        <textarea
          required
          rows={4}
          value={values.note}
          onChange={(event) => setValues({ ...values, note: event.target.value })}
        />
      </Field>
      <DraftNotice status={draft} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        Lokale review opslaan
      </button>
    </form>
  );
}
function OrdinalField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint="Lokale ordinale schaal 1–3; geen Kinney-factor of percentage.">
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {[1, 2, 3].map((rating) => (
          <option key={rating} value={String(rating)}>
            {rating}
          </option>
        ))}
      </select>
    </Field>
  );
}
function LayoutForm({
  workspace,
  library,
  scope,
  node,
  onSave,
}: {
  workspace: RiskLibraryWorkspaceState;
  library: RiskLibrary;
  scope: RiskLibraryScope;
  node: Selection;
  onSave: (layout: RiskLibraryLayout) => boolean;
}) {
  const previous = latestLibraryLayout(
    workspace.riskLibraryLayouts ?? [],
    library,
    scope,
    node.type,
    node.id,
  );
  const [values, setValues, draft] = usePersistentDraft(
    `${workspace.id}/risk-library-layout/${library.id}/${riskLibraryScopeKey(scope)}/${node.type}/${node.id}`,
    { x: String(previous?.x ?? 20), y: String(previous?.y ?? 55), assessor: '', note: '' },
    draftBase(previous ?? { library: library.sha256, node, scope }),
  );
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const record = captureRiskLibraryLayout(library, {
            id: crypto.randomUUID(),
            scope,
            origin: 'native',
            assessor: values.assessor,
            reviewedAt: new Date().toISOString(),
            note: values.note,
            sourceIds: [],
            ...(previous ? { supersedesId: previous.id } : {}),
            nodeType: node.type,
            nodeId: node.id,
            x: Number(values.x),
            y: Number(values.y),
          });
          if (onSave(record)) draft.clear();
        } catch (error) {
          setError(String(error));
        }
      }}
    >
      <div className="form-grid">
        <Field label="Kaartpositie X">
          <input
            type="number"
            step="any"
            min={0}
            max={1000000}
            required
            value={values.x}
            onChange={(event) => setValues({ ...values, x: event.target.value })}
          />
        </Field>
        <Field label="Kaartpositie Y">
          <input
            type="number"
            step="any"
            min={0}
            max={1000000}
            required
            value={values.y}
            onChange={(event) => setValues({ ...values, y: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Vastlegger">
        <input
          required
          value={values.assessor}
          onChange={(event) => setValues({ ...values, assessor: event.target.value })}
        />
      </Field>
      <Field label="Positietoelichting">
        <textarea
          required
          value={values.note}
          onChange={(event) => setValues({ ...values, note: event.target.value })}
        />
      </Field>
      <DraftNotice status={draft} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        Kaartpositie opslaan
      </button>
    </form>
  );
}
function ScenarioForm({
  workspace,
  library,
  factorId,
  scope,
  onSave,
}: {
  workspace: RiskLibraryWorkspaceState;
  library: RiskLibrary;
  factorId: string;
  scope: RiskLibraryScope;
  onSave: (scenario: Scenario) => boolean;
}) {
  const factor = library.factors.find((item) => item.id === factorId)!;
  const [values, setValues, draft] = usePersistentDraft(
    `${workspace.id}/risk-library-scenario/${library.id}/${riskLibraryScopeKey(scope)}/${factorId}`,
    { title: factor.title, consequence: '', probability: '', exposure: '', effect: '', notes: '' },
    library.sha256,
  );
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const scenario = createLibraryScenario(library, factorId, {
            id: crypto.randomUUID(),
            title: values.title,
            consequence: values.consequence,
            probability: Number(values.probability),
            exposure: Number(values.exposure),
            effect: Number(values.effect),
            assessmentNotes: values.notes,
            scope,
            department:
              workspace.departments?.find((item) => item.id === scope.departmentId)?.name ?? '',
          });
          if (onSave(scenario)) draft.clear();
        } catch (error) {
          setError(String(error));
        }
      }}
    >
      <p>
        Leg nieuwe Kinney-factoren en hun grond vast. De oude 1–3-ratings worden niet overgenomen.
        Het nieuwe scenario start met nul gecrediteerde maatregelen; beoordeel werking en bewijs
        later afzonderlijk.
      </p>
      <Field label="Scenariotitel">
        <input
          required
          value={values.title}
          onChange={(event) => setValues({ ...values, title: event.target.value })}
        />
      </Field>
      <Field label="Specifieke consequentie">
        <input
          required
          value={values.consequence}
          onChange={(event) => setValues({ ...values, consequence: event.target.value })}
        />
      </Field>
      {(['probability', 'exposure', 'effect'] as const).map((key) => (
        <Field
          key={key}
          label={
            {
              probability: 'Nieuwe Kinney-waarschijnlijkheid',
              exposure: 'Nieuwe Kinney-blootstelling',
              effect: 'Nieuw Kinney-effect',
            }[key]
          }
        >
          <select
            required
            value={values[key]}
            onChange={(event) => setValues({ ...values, [key]: event.target.value })}
          >
            <option value="">Kies een nieuwe beoordeling</option>
            {KINNEY_SCALES[key].map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.value} · {option.label}
              </option>
            ))}
          </select>
        </Field>
      ))}
      <Field label="Grond van de nieuwe risicobeoordeling">
        <textarea
          required
          rows={4}
          value={values.notes}
          onChange={(event) => setValues({ ...values, notes: event.target.value })}
        />
      </Field>
      <DraftNotice status={draft} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        Nieuw scenario vastleggen
      </button>
    </form>
  );
}
