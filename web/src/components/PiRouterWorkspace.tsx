import { useState, cloneElement, type ReactElement } from 'react';
import { GitBranch, Save, Download, Plus, Trash2 } from 'lucide-react';
import type { WorkspaceState, WorkspacePatch, WorkspaceRecord } from '../data/model';
import {
  PI_PROFILE_FEATURES,
  PI_ROUTER_RULES,
  PI_LEGAL_SOURCES,
  PI_ROUTER_VERSION,
  capturePiRouterRecord,
  assertPiRouterInputs,
  emptyPiRouterInputs,
  resolvePiRoute,
  piBindingsFromWorkspace,
  piApplicabilityLabels,
  piRouterMarkdown,
  piRouterRecord,
  piRouterHasDossierAnchor,
  piRiskLibrariesFromWorkspace,
  createPiProjectWorkspace,
  type PiRouterInputs,
  type PiTopicRoute,
  type PiRouterRecord,
  type PiRouterSignal,
  type PiRiskSelection,
  type PiPresence,
  type PiDocumentClaim,
} from '../data/pi-router';
import { Badge, Field } from './Primitives';
import { usePersistentDraft } from '../hooks/usePersistentDraft';
import DraftNotice from './DraftNotice';
import { exportWorkspace } from '../data/validation';

const priorityLabels = {
  normal: 'Normale onderzoeksprioriteit',
  elevated: 'Verhoogde onderzoeksprioriteit',
  urgent: 'Urgente onderzoeksprioriteit',
};
const presenceLabels = {
  unknown: 'Onbekend',
  present: 'Aanwezig volgens invoer',
  absent: 'Afwezig volgens invoer',
};
function downloadProject(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ima-projectwerkruimte.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadMarkdown(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'rie-router-onderzoeksset.md';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PiRouterWorkspace({
  workspace,
  onUpdate,
  onUseQuestionSet,
}: {
  workspace: WorkspaceState;
  onUpdate: (patch: WorkspacePatch) => boolean;
  onUseQuestionSet?: (record: PiRouterRecord) => void;
}) {
  const [input, setInput, draft] = usePersistentDraft<PiRouterInputs>(
    `${workspace.id}/pi-router/new`,
    emptyPiRouterInputs,
    'new/v1',
    (value) => {
      try {
        assertPiRouterInputs(value);
        return true;
      } catch {
        return false;
      }
    },
  );
  const [error, setError] = useState('');
  const [signalTopic, setSignalTopic] = useState('aggression');
  const [signalKind, setSignalKind] = useState<PiRouterSignal['kind']>('incident');
  const [signalSeverity, setSignalSeverity] = useState<PiRouterSignal['severity']>('unspecified');
  const [source, setSource] = useState('');
  const [claimTopic, setClaimTopic] = useState('aggression');
  const [claimKind, setClaimKind] = useState<PiDocumentClaim['claim']>('unknown');
  const [claimSource, setClaimSource] = useState('');
  const [exclusionTopic, setExclusionTopic] = useState('height');
  const bindings = piBindingsFromWorkspace(workspace);
  const libraries = piRiskLibrariesFromWorkspace(workspace);
  const result = resolvePiRoute(input, bindings);
  const stored = (workspace.contentRecords ?? [])
    .map(piRouterRecord)
    .filter((record): record is PiRouterRecord => Boolean(record));
  const knownQuestionIds = new Set(workspace.questions.map((q) => q.id));
  const missingDefinitions = result.questionIds.filter((id) => !knownQuestionIds.has(id));
  const change = (patch: Partial<PiRouterInputs>) =>
    setInput((current) => ({ ...current, ...patch }));
  function save() {
    try {
      const record = capturePiRouterRecord(workspace, input);
      if (
        !onUpdate({
          contentRecords: [
            ...(workspace.contentRecords ?? []),
            record as unknown as WorkspaceRecord,
          ],
        })
      )
        throw new Error('Vastleggen is niet gelukt. Het concept blijft beschikbaar.');
      draft.clear();
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <section className="panel pi-router-workspace">
      <div className="section-row">
        <h2>
          <GitBranch size={18} /> RI&E-router en PI-risicobasis
        </h2>
        <Badge tone="blue">Regels {PI_ROUTER_VERSION}</Badge>
      </div>
      <p className="muted">
        Vier ingangen leveren een onderzoeksset: profiel, risico’s, verplichtingen en signalen. Niet
        geselecteerd blijft onbekend. Een centrale maatregel vraagt een lokale controle op
        aanwezigheid, toepassing en werking.
      </p>
      {libraries.length > 0 && (
        <details>
          <summary>
            Geïmporteerde brongetrouwe risicobasis — centrale basis en lokale verificatielaag
          </summary>
          {libraries.map((library) => (
            <article key={library.id}>
              <h3>{library.id}</h3>
              <p>{library.scope}</p>
              <p className="muted">
                Brongetrouw concept · {library.date}. Een documentclaim bewijst geen lokale
                aanwezigheid, toepassing of werking.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Thema / activiteit</th>
                      <th>Gevaar / scenario</th>
                      <th>Groepen</th>
                      <th>Gevolgen</th>
                      <th>AHS-principes</th>
                      <th>Bestaande maatregel / verificatie</th>
                      <th>Lokaal verhogend</th>
                      <th>Onderzoeksvragen</th>
                      <th>Bronsstatus en datagaten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {library.rows.map((row) => {
                      const rule = PI_ROUTER_RULES.find((rule) => rule.id === row.riskId)!;
                      return (
                        <tr key={row.id}>
                          <td>
                            {rule.title}
                            <br />
                            {rule.activity}
                          </td>
                          <td>{rule.hazard}</td>
                          <td>{rule.groups.join('; ')}</td>
                          <td>{rule.consequences.join('; ')}</td>
                          <td>
                            Bron: {rule.controls.source}
                            <br />
                            Collectief: {rule.controls.collective}
                            <br />
                            Individueel: {rule.controls.individual}
                            <br />
                            PBM: {rule.controls.ppe}
                          </td>
                          <td>
                            {row.documentedControls.join(' ')}
                            <p>
                              {row.claimSourceIds.length
                                ? 'Toegeschreven documentclaim'
                                : 'Niet aangetoond'}
                              ; lokale aanwezigheid, toepassing en effect onbekend.
                            </p>
                          </td>
                          <td>{rule.localIncreases.join('; ')}</td>
                          <td>{rule.questions.join(' ')}</td>
                          <td>
                            {row.claimSourceIds.join(', ') ||
                              'Algemene vakkennis; geen specifieke lokale claim'}
                            <br />
                            {row.missingInformation.join('; ')}
                            <br />
                            Bronvraagbinding: {row.questionBindingRecordId}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul>
                {library.boundaries.map((boundary) => (
                  <li key={boundary}>{boundary}</li>
                ))}
              </ul>
            </article>
          ))}
        </details>
      )}
      <div className="registry-grid">
        <PiField label="Onderzoeksscope">
          <input
            value={input.scopeTitle}
            onChange={(e) => change({ scopeTitle: e.target.value })}
            placeholder="Locatie, afdeling, taken en diensten"
          />
        </PiField>
        <PiField label="Routeronderzoeker">
          <input
            value={input.assessor}
            onChange={(e) => change({ assessor: e.target.value })}
            placeholder="Wie maakt deze afbakening?"
          />
        </PiField>
        <PiField label="Onderzoekslaag">
          <select
            aria-label="Onderzoekslaag"
            value={input.researchLevel ?? 'local'}
            onChange={(e) =>
              change({ researchLevel: e.target.value as PiRouterInputs['researchLevel'] })
            }
          >
            <option value="central">Inrichtingsbreed / centraal</option>
            <option value="department">Organisatie / afdeling</option>
            <option value="local">Lokaal / taak en werkgebied</option>
          </select>
        </PiField>
        <PiField label="Routerorganisatie">
          <select
            aria-label="Routerorganisatie"
            value={input.organisationId ?? ''}
            onChange={(e) => change({ organisationId: e.target.value || undefined })}
          >
            <option value="">Kies organisatie of gebruik een gekoppeld dossier</option>
            {(workspace.organisations ?? []).map((organisation) => (
              <option key={organisation.id} value={organisation.id}>
                {organisation.name}
              </option>
            ))}
          </select>
        </PiField>
        <PiField label="Routerdossier">
          <select
            aria-label="Routerdossier"
            value={input.dossierId ?? ''}
            onChange={(e) => change({ dossierId: e.target.value || undefined })}
          >
            <option value="">Nog niet aan dossier gekoppeld</option>
            {(workspace.dossiers ?? []).map((dossier) => (
              <option key={dossier.id} value={dossier.id}>
                {dossier.title}
              </option>
            ))}
          </select>
        </PiField>
      </div>
      <DraftNotice status={draft} />
      <details open>
        <summary>1. Organisatieprofiel — taken, middelen, groepen en diensten</summary>
        <div className="registry-grid">
          {PI_PROFILE_FEATURES.map(([id, label]) => (
            <PiField key={id} label={label}>
              <select
                aria-label={label}
                value={input.features[id] ?? 'unknown'}
                onChange={(e) =>
                  change({ features: { ...input.features, [id]: e.target.value as PiPresence } })
                }
              >
                {Object.entries(presenceLabels).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </PiField>
          ))}
        </div>
      </details>
      <details>
        <summary>2. Risico’s — mogelijke, vastgestelde en lokaal verhoogde risico’s</summary>
        <p className="muted">
          De selectie is een onderzoeksingang. Vastgesteld of verhoogd wordt alleen toegeschreven
          aan jouw invoer; de router kent geen risicoscore toe.
        </p>
        <div className="registry-grid">
          {PI_ROUTER_RULES.filter((rule) => rule.kind === 'risk').map((rule) => (
            <PiField key={rule.id} label={`Risico: ${rule.title}`}>
              <select
                aria-label={`Risico: ${rule.title}`}
                value={input.risks[rule.id] ?? 'unknown'}
                onChange={(e) =>
                  change({
                    risks: { ...input.risks, [rule.id]: e.target.value as PiRiskSelection },
                  })
                }
              >
                <option value="unknown">Onbekend / niet geselecteerd</option>
                <option value="possible">Mogelijk risico</option>
                <option value="confirmed">Vastgesteld volgens invoer</option>
                <option value="increased">Lokaal verhoogd volgens invoer</option>
              </select>
            </PiField>
          ))}
        </div>
      </details>
      <details>
        <summary>3. Wetgeving, interne eisen en goede praktijken</summary>
        <p className="muted">
          De vijf zelfstandige wettelijke onderwerpen blijven te beoordelen zonder een concreet
          risico of incident. Interne eisen vragen bevestiging van versie en vaststelling; goede
          praktijken blijven afzonderlijk herkenbaar.
        </p>
        {PI_ROUTER_RULES.filter((rule) => rule.kind === 'obligation').map((rule) => (
          <label className="check-row" key={rule.id}>
            <input
              type="checkbox"
              checked={Boolean(rule.mandatory || input.selectedObligations.includes(rule.id))}
              disabled={rule.mandatory}
              onChange={(e) =>
                change({
                  selectedObligations: e.target.checked
                    ? [...input.selectedObligations, rule.id]
                    : input.selectedObligations.filter((id) => id !== rule.id),
                })
              }
            />
            {rule.title} ·{' '}
            {rule.obligationKind === 'law'
              ? 'wettelijk onderwerp'
              : rule.obligationKind === 'internal'
                ? 'interne eis te verifiëren'
                : 'goede praktijk'}
          </label>
        ))}
        <details>
          <summary>Officiële bronnen en verificatiegrens</summary>
          <p>
            Officiële uitleg geraadpleegd op 11 oktober 2026. Zekerheid: matig over de volledige
            juridische kwalificatie; de geconsolideerde wetstekst en bijzondere uitzonderingen zijn
            hier niet volledig gecontroleerd.
          </p>
          <ul>
            {PI_LEGAL_SOURCES.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>{' '}
                · {source.checkedAt}
              </li>
            ))}
          </ul>
        </details>
      </details>
      <details>
        <summary>4. Incidenten, bijna-ongevallen, klachten en veranderingen</summary>
        <label className="check-row">
          <input
            type="checkbox"
            checked={Boolean(input.noSignalsDeclared)}
            onChange={(e) => change({ noSignalsDeclared: e.target.checked })}
          />
          Er zijn volgens de beschikbare invoer geen signalen. Dit bewijst geen afwezig risico.
        </label>
        <div className="registry-grid">
          <PiField label="Signaalonderwerp">
            <select
              aria-label="Signaalonderwerp"
              value={signalTopic}
              onChange={(e) => setSignalTopic(e.target.value)}
            >
              {PI_ROUTER_RULES.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.title}
                </option>
              ))}
            </select>
          </PiField>
          <PiField label="Signaaltype">
            <select
              aria-label="Signaaltype"
              value={signalKind}
              onChange={(e) => setSignalKind(e.target.value as PiRouterSignal['kind'])}
            >
              <option value="incident">Incident</option>
              <option value="near_miss">Bijna-ongeval</option>
              <option value="complaint">Klacht of ander signaal</option>
              <option value="change">Verandering</option>
            </select>
          </PiField>
          <PiField label="Signaalernst">
            <select
              aria-label="Signaalernst"
              value={signalSeverity}
              onChange={(e) => setSignalSeverity(e.target.value as PiRouterSignal['severity'])}
            >
              <option value="unspecified">Nog niet bepaald</option>
              <option value="serious">Ernstig volgens bron/invoer</option>
            </select>
          </PiField>
          <PiField label="Signaalbron">
            <select
              aria-label="Signaalbron"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Nog geen bron ontvangen</option>
              {workspace.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {String(s.title ?? s.id)}
                </option>
              ))}
            </select>
          </PiField>
        </div>
        <button
          className="secondary"
          onClick={() =>
            change({
              signals: [
                ...input.signals,
                {
                  id: crypto.randomUUID(),
                  topicIds: [signalTopic],
                  kind: signalKind,
                  severity: signalSeverity,
                  sourceIds: source ? [source] : [],
                  note: '',
                },
              ],
            })
          }
        >
          <Plus size={14} /> Signaal toevoegen
        </button>
        {input.signals.map((signal, index) => (
          <article className="registry-item" key={signal.id}>
            <div className="section-row">
              <strong>
                {PI_ROUTER_RULES.find((rule) => rule.id === signal.topicIds[0])?.title} ·{' '}
                {signal.kind}
              </strong>
              <button
                className="icon-button"
                aria-label={`Signaal verwijderen ${index + 1}`}
                onClick={() => change({ signals: input.signals.filter((s) => s.id !== signal.id) })}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <PiField label={`Signaalnotitie ${index + 1}`}>
              <textarea
                value={signal.note}
                onChange={(e) =>
                  change({
                    signals: input.signals.map((s) =>
                      s.id === signal.id ? { ...s, note: e.target.value } : s,
                    ),
                  })
                }
              />
            </PiField>
            <small>
              Bronnen: {signal.sourceIds.join(', ') || 'Nog te ontvangen'} · onderzoeksprioriteit,
              geen risicoscore
            </small>
          </article>
        ))}
      </details>
      <details>
        <summary>Documentclaims en gecontroleerde uitsluiting</summary>
        <p className="muted">
          Een documentclaim is afzonderlijk van een lokale bevinding. Een uitsluiting wordt pas
          toegepast bij aantoonbaar afwezige profieltriggers, bewijs, onderzoeker en passende scope;
          een positieve trigger of wettelijke basiscontrole blokkeert uitsluiting.
        </p>
        <div className="registry-grid">
          <PiField label="Documentclaimonderwerp">
            <select
              aria-label="Documentclaimonderwerp"
              value={claimTopic}
              onChange={(e) => setClaimTopic(e.target.value)}
            >
              {PI_ROUTER_RULES.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.title}
                </option>
              ))}
            </select>
          </PiField>
          <PiField label="Documentclaim">
            <select
              aria-label="Documentclaim"
              value={claimKind}
              onChange={(e) => setClaimKind(e.target.value as PiDocumentClaim['claim'])}
            >
              <option value="unknown">Nog onbekend</option>
              <option value="present">Aanwezig volgens document</option>
              <option value="absent">Afwezig volgens document</option>
              <option value="effective">Maatregel werkt volgens document</option>
              <option value="ineffective">Onvoldoende werking volgens document</option>
            </select>
          </PiField>
          <PiField label="Documentclaimbron">
            <select
              aria-label="Documentclaimbron"
              value={claimSource}
              onChange={(e) => setClaimSource(e.target.value)}
            >
              <option value="">Kies ontvangen bron</option>
              {workspace.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {String(s.title ?? s.id)}
                </option>
              ))}
            </select>
          </PiField>
        </div>
        <button
          className="secondary"
          disabled={!claimSource}
          onClick={() =>
            change({
              documentClaims: [
                ...input.documentClaims,
                { topicId: claimTopic, sourceId: claimSource, claim: claimKind, note: '' },
              ],
            })
          }
        >
          Documentclaim toevoegen
        </button>
        {input.documentClaims.map((claim, index) => (
          <article className="registry-item" key={`${index}/${claim.topicId}`}>
            <div className="section-row">
              <strong>
                {PI_ROUTER_RULES.find((rule) => rule.id === claim.topicId)?.title} · {claim.claim}
              </strong>
              <button
                className="icon-button"
                aria-label={`Documentclaim verwijderen ${index + 1}`}
                onClick={() =>
                  change({ documentClaims: input.documentClaims.filter((_, i) => i !== index) })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
            <PiField label={`Documentclaimnotitie ${index + 1}`}>
              <textarea
                value={claim.note}
                onChange={(e) =>
                  change({
                    documentClaims: input.documentClaims.map((c, i) =>
                      i === index ? { ...c, note: e.target.value } : c,
                    ),
                  })
                }
              />
            </PiField>
            <small>Bron {claim.sourceId}; lokale werking nog niet geverifieerd</small>
          </article>
        ))}
        <PiField label="Uitsluitonderwerp">
          <select
            aria-label="Uitsluitonderwerp"
            value={exclusionTopic}
            onChange={(e) => setExclusionTopic(e.target.value)}
          >
            {PI_ROUTER_RULES.filter(
              (rule) => !input.exclusions.some((exclusion) => exclusion.topicId === rule.id),
            ).map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.title}
              </option>
            ))}
          </select>
        </PiField>
        <button
          className="secondary"
          disabled={input.exclusions.some((exclusion) => exclusion.topicId === exclusionTopic)}
          onClick={() =>
            change({
              exclusions: [
                ...input.exclusions,
                {
                  topicId: exclusionTopic,
                  scopeTitle: input.scopeTitle,
                  reason: '',
                  evidenceIds: [],
                  assessor: input.assessor,
                  reviewedAt: new Date().toISOString(),
                },
              ],
            })
          }
        >
          Uitsluiting onderbouwen
        </button>
        {input.exclusions.map((exclusion, index) => (
          <article className="registry-item" key={exclusion.topicId}>
            <div className="section-row">
              <strong>
                {PI_ROUTER_RULES.find((rule) => rule.id === exclusion.topicId)?.title}
              </strong>
              <button
                className="icon-button"
                aria-label={`Uitsluiting verwijderen ${index + 1}`}
                onClick={() =>
                  change({
                    exclusions: input.exclusions.filter((e) => e.topicId !== exclusion.topicId),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
            <PiField label={`Uitsluitmotivering ${index + 1}`}>
              <textarea
                value={exclusion.reason}
                onChange={(e) =>
                  change({
                    exclusions: input.exclusions.map((x) =>
                      x.topicId === exclusion.topicId ? { ...x, reason: e.target.value } : x,
                    ),
                  })
                }
              />
            </PiField>
            <small>
              Scope: {exclusion.scopeTitle || 'Ontbreekt'} · onderzoeker:{' '}
              {exclusion.assessor || 'Ontbreekt'} · datum: {exclusion.reviewedAt}
            </small>
            <PiField label={`Uitsluitbewijs ${index + 1}`}>
              <select
                aria-label={`Uitsluitbewijs ${index + 1}`}
                multiple
                value={exclusion.evidenceIds}
                onChange={(e) =>
                  change({
                    exclusions: input.exclusions.map((x) =>
                      x.topicId === exclusion.topicId
                        ? {
                            ...x,
                            evidenceIds: Array.from(
                              e.target.selectedOptions,
                              (option) => option.value,
                            ),
                          }
                        : x,
                    ),
                  })
                }
              >
                {(workspace.evidence ?? [])
                  .filter(
                    (evidence) =>
                      !input.dossierId ||
                      !evidence.dossierId ||
                      evidence.dossierId === input.dossierId,
                  )
                  .map((evidence) => (
                    <option key={evidence.id} value={evidence.id}>
                      {evidence.title}
                    </option>
                  ))}
              </select>
            </PiField>
          </article>
        ))}
      </details>
      <PiField label="Routernotities en ontbrekende taken">
        <textarea
          value={input.notes}
          onChange={(e) => change({ notes: e.target.value })}
          placeholder="Onzekerheden, niet onderzochte diensten, ontbrekende bronnen of handelingen"
        />
      </PiField>
      <div className="button-row">
        <button className="primary" onClick={save}>
          <Save size={14} /> Onderzoeksset vastleggen
        </button>
        <button
          className="secondary"
          disabled={!stored.length && !libraries.length}
          onClick={() => downloadMarkdown(piRouterMarkdown(workspace).join('\n'))}
        >
          <Download size={14} /> Router Markdown
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="registry-grid">
        <article className="registry-item">
          <strong>{result.selectedTopicIds.length} onderwerpen in onderzoeksset</strong>
          <p>{result.obligations.length} zelfstandige/gekozen verplichtingen</p>
        </article>
        <article className="registry-item">
          <strong>{result.unknownTopicIds.length} toepasselijkheidsvragen open</strong>
          <p>
            {result.topics.filter((topic) => topic.applicability === 'excluded').length}{' '}
            gemotiveerde uitsluitingen
          </p>
        </article>
        <article className="registry-item">
          <strong>{result.questionIds.length} exacte bronvraagkoppelingen</strong>
          <p>
            {bindings.length} private bronbindings · {missingDefinitions.length} ontbrekende
            vraagdefinities
          </p>
          {bindings.some((binding) => binding.coverage === 'scoped_selection') && (
            <p>
              Afgebakende projectselectie. Uitbreiding vraagt herselectie uit de afzonderlijke
              volledige bronbank.
            </p>
          )}
        </article>
      </div>
      {missingDefinitions.length > 0 && (
        <p role="alert">
          Bronvraagcodes zijn gekoppeld, maar {missingDefinitions.length} definities ontbreken in
          deze werkruimte. Importeer de bijbehorende bank voordat je een vragenlijst gebruikt.
        </p>
      )}
      <h3>Tegenstrijdigheden</h3>
      {result.contradictions.length ? (
        <ul>
          {result.contradictions.map((contradiction, index) => (
            <li key={index}>
              {contradiction.reason}{' '}
              {contradiction.topicId &&
                `(${PI_ROUTER_RULES.find((r) => r.id === contradiction.topicId)?.title})`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          Geen tegenstrijdigheid gevonden door deze regels. Dit bewijst geen volledige dekking.
        </p>
      )}
      <h3>Gerichte onderzoeksset</h3>
      {result.topics
        .filter((topic) => ['selected', 'required'].includes(topic.applicability))
        .map((topic) => (
          <TopicCard topic={topic} key={topic.rule.id} />
        ))}
      <details>
        <summary>Onbekende onderwerpen en gemotiveerde uitsluitingen</summary>
        {result.topics
          .filter((topic) => ['needs_verification', 'excluded'].includes(topic.applicability))
          .map((topic) => (
            <TopicCard topic={topic} key={topic.rule.id} />
          ))}
      </details>
      <h3>Vastgelegde onderzoekssets</h3>
      <p className="muted">
        Voor een interview met veel vragen: exporteer een afzonderlijke projectwerkruimte. Die bevat
        alle geselecteerde bronvragen, het bevroren dossier en bronbankhash, met meer ruimte voor
        antwoorden. Importeer het JSONbestand via Werkruimte importeren; huidige dossiers en de
        volledige bronbank blijven in hun eigen werkruimte bewaard.
      </p>
      {stored.map((record) => (
        <article className="registry-item" key={record.id}>
          <div className="section-row">
            <strong>
              {record.title} · {record.inputs.assessor}
            </strong>
            <Badge tone="blue">Bevroren</Badge>
          </div>
          <p>
            {record.createdAt} · {record.result.selectedTopicIds.length} onderwerpen ·{' '}
            {record.result.questionIds.length} bronvraagkoppelingen
          </p>
          <small>SHA-256 {record.sha256}</small>
          {onUseQuestionSet && (
            <>
              <p className="muted">
                Controleer kandidaatkoppelingen en dekking vóór gebruik. Dit is een voorstel per
                bronvraag; technische selectie van volledige procesblokken en daadwerkelijke
                RIEporter-invoer zijn nog niet bevestigd.
              </p>
              <button
                className="secondary"
                disabled={
                  !record.result.questionIds.length ||
                  !piRouterHasDossierAnchor(workspace, record.inputs) ||
                  record.result.questionIds.some((id) => !knownQuestionIds.has(id))
                }
                onClick={() => {
                  try {
                    onUseQuestionSet(record);
                    setError('');
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : String(cause));
                  }
                }}
              >
                Gebruik exacte onderzoeksset
              </button>
              <button
                className="secondary"
                disabled={
                  !record.result.questionIds.length ||
                  !piRouterHasDossierAnchor(workspace, record.inputs) ||
                  record.result.questionIds.some((id) => !knownQuestionIds.has(id))
                }
                onClick={() => {
                  try {
                    downloadProject(exportWorkspace(createPiProjectWorkspace(workspace, record)));
                    setError('');
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : String(cause));
                  }
                }}
              >
                <Download size={14} /> Projectwerkruimte exporteren
              </button>
              {!piRouterHasDossierAnchor(workspace, record.inputs) && (
                <p role="status">
                  Maak eerst een organisatie aan onder Organisatie en kies die bij
                  Routerorganisatie, of koppel een bestaand dossier met een organisatie, afdeling of
                  projectcontext. Leg daarna de onderzoeksset opnieuw vast.
                </p>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
function TopicCard({ topic }: { topic: PiTopicRoute }) {
  return (
    <article className="registry-item" data-router-topic={topic.rule.id}>
      <div className="section-row">
        <h4>{topic.rule.title}</h4>
        <Badge tone={topic.priority === 'urgent' ? 'red' : 'blue'}>
          {priorityLabels[topic.priority]}
        </Badge>
      </div>
      <p>
        {piApplicabilityLabels[topic.applicability]} ·{' '}
        {topic.rule.scope === 'both'
          ? 'Inrichtingsbreed én lokaal'
          : topic.rule.scope === 'central'
            ? 'Inrichtingsbreed'
            : 'Lokaal'}
      </p>
      <p>{topic.reasons.join(' ')}</p>
      <p className="muted">{topic.missing.join(' ')}</p>
      {topic.applicability !== 'excluded' && (
        <details>
          <summary>Scenario, beheersprincipes en onderzoeksvragen</summary>
          <p>
            <strong>Activiteit:</strong> {topic.rule.activity}
          </p>
          <p>
            <strong>Scenario:</strong> {topic.rule.hazard}
          </p>
          <p>
            <strong>Groepen:</strong> {topic.rule.groups.join('; ')}
          </p>
          <p>
            <strong>Gevolgen:</strong> {topic.rule.consequences.join('; ')}
          </p>
          <p>
            Bron: {topic.rule.controls.source} Collectief: {topic.rule.controls.collective}{' '}
            Individueel: {topic.rule.controls.individual} PBM: {topic.rule.controls.ppe}
          </p>
          <p>Lokaal verhogend: {topic.rule.localIncreases.join('; ')}</p>
          <p>Benodigde documenten: {topic.rule.documents.join('; ')}</p>
          <ul>
            {topic.rule.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
          <p>
            Controleer aanwezigheid → toepassing → effect met passende observatie, registratie of
            meting. Er is hier geen geverifieerde bestaande maatregel of reductiepercentage
            toegekend.
          </p>
          {topic.questions.length > 0 && (
            <details>
              <summary>{topic.questions.length} exacte bronvraagkoppelingen — voorstel</summary>
              <ul>
                {topic.questions.map((q) => (
                  <li key={q.questionId}>
                    {q.code} [{q.key}] · {q.process} · {q.aspect} · bron {q.sourceId}, p. {q.page} ·{' '}
                    {q.mappingStatus}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p>Uitsluitvoorwaarden: {topic.rule.exclusionConditions}</p>
        </details>
      )}
    </article>
  );
}

function PiField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactElement<{ 'aria-label'?: string }>;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {cloneElement(children, { 'aria-label': children.props['aria-label'] ?? label })}
    </Field>
  );
}
