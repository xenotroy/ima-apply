import type { WorkspaceState } from '../data';
import { useRiskEvidence } from './RiskEvidenceContext';
import { actionContextMarkdown } from '../domain/action-context';
import { incidentContextMarkdown } from '../domain/incident-context';
import { recordContextMarkdown } from '../domain/record-context';
import type { EvidenceFileIntegrityContext } from '../data/evidence-file-types';
import { actionStage, actionStageLabels } from '../domain/action-lifecycle';
import { projectContextMarkdown } from '../data/project-context';
import { basisRiskFactorMarkdown } from '../data/brf';
import { riskAssessmentMarkdown } from './RiskAssessmentPanel';
import { justificationMarkdown } from '../data/justification';
import { modulePlanMarkdown } from '../data/module-plan';
import { questionPackagesMarkdown } from '../data/question-definition';
import { piRouterMarkdown } from '../data/pi-router';
import { responseRelationsMarkdown } from '../data/response-relations';
import { readMigrationReviews } from '../data/migration-review';

/** Readable projection; the JSON export remains the complete portable record. */
export function dossierMarkdown(
  workspace: WorkspaceState,
  fileContext?: EvidenceFileIntegrityContext,
): string[] {
  const lines: string[] = [];
  for (const review of readMigrationReviews(workspace.sources)) {
    lines.push('', '## Migratieconcept: menselijke controle vereist', '');
    if (!review.report) {
      lines.push(review.error);
      continue;
    }
    lines.push(
      `Reviewbron: ${review.sourceId} | nieuwe migratieprojectie ${review.report.migratedAt}`,
      'De migratie stelt geen oorspronkelijke vraagversie, tijdzone, effectiviteit of menselijke goedkeuring vast.',
      ...review.report.rules,
      `Waarschuwingen: ${review.report.warnings.length}`,
      ...review.report.warnings.map((w) => `[${w.code}] ${w.message} | bron ${w.sourceId}`),
      '',
    );
  }
  lines.push(...projectContextMarkdown(workspace));
  lines.push(...modulePlanMarkdown(workspace));
  lines.push(...piRouterMarkdown(workspace));
  if (workspace.organisations?.length) {
    lines.push('', '## Organisatie', '');
    for (const o of workspace.organisations) lines.push(`- ${o.name} [${o.id}] — ${o.description}`);
    for (const s of workspace.sites ?? [])
      lines.push(`- Locatie ${s.name} [${s.id}], organisatie ${s.organisationId}: ${s.address}`);
    for (const d of workspace.departments ?? [])
      lines.push(
        `- Afdeling ${d.name} [${d.id}], ${d.siteId ? `locatie ${d.siteId}` : `organisatie ${d.organisationId}; locatie niet vastgelegd`}: ${d.activity}`,
      );
  }
  lines.push(...responseRelationsMarkdown(workspace));
  for (const dossier of workspace.dossiers ?? []) {
    const packageText = questionPackagesMarkdown(dossier);
    if (packageText) lines.push(packageText);
    lines.push(
      '',
      `## Beoordelingsdossier: ${dossier.title}`,
      '',
      `ID: ${dossier.id} | Status: ${dossier.status}`,
      `Scope: ${dossier.scope || 'Niet vastgelegd'}`,
      `Beoordelaar: ${dossier.assessor || 'Niet vastgelegd'}`,
      `Organisatie: ${dossier.organisationId ?? 'Werkruimtebreed'}`,
      `Projectcontext: ${dossier.projectContextId ?? 'Niet gekoppeld'}`,
      `Afdelingen: ${dossier.departmentIds.join(', ')}`,
      `Besluit: ${dossier.reviewNote ?? 'Nog niet beoordeeld'} | ${dossier.reviewedBy ?? ''} | ${dossier.reviewedAt ?? ''}`,
      '',
      '### Bevroren vragen en antwoorden',
      '',
    );
    for (const source of dossier.sourceSnapshots ?? [])
      lines.push(
        `Bron ${source.id}: ${String(source.title ?? '')} | ${String(source.status ?? '')}`,
        `Gelezen scope: ${String(source.readScope ?? '')}`,
        ...(source.documentGuidance
          ? [`Bron-afsluitcriteria: ${String(source.documentGuidance)}`]
          : []),
        ...(source.sourceMetadata
          ? [`Bronmetadata: ${JSON.stringify(source.sourceMetadata)}`]
          : []),
        '',
      );
    for (const q of dossier.questions) {
      const a = workspace.answers.find((a) => a.dossierId === dossier.id && a.questionId === q.id);
      lines.push(
        `#### ${q.prompt}`,
        `Vraag ${q.id} | versie ${q.version} | SHA256 ${q.sha256}`,
        `Bronroutes: ${q.sourceIds.join(', ')}`,
        `Toetsingsrichting: ${q.assessmentGuidance}`,
        ...(q.acceptanceCriteria !== undefined
          ? [`Acceptatiecriteria: ${q.acceptanceCriteria}`]
          : []),
        ...(q.expectedEvidence !== undefined ? [`Verwacht bewijs: ${q.expectedEvidence}`] : []),
        `Bewijsaanwijzingen: ${q.evidenceHints.join('; ')}`,
        ...(q.legalReferences ? [`Normverwijzingen: ${q.legalReferences}`] : []),
        `Antwoord: ${a?.choice ?? 'Niet beantwoord'} | ${a?.answeredAt ?? ''}`,
        `Bewijs: ${a?.evidence ?? ''} | records ${(a?.evidenceIds ?? []).join(', ')}`,
        `Toelichting: ${a?.note ?? ''}`,
        '',
      );
    }
    for (const o of workspace.observations?.filter((o) => o.dossierId === dossier.id) ?? [])
      lines.push(
        `### Waarneming: ${o.title}`,
        `${o.date} | ${o.observer} | afdeling ${o.departmentId ?? 'Dossierbreed'}`,
        `Rondgangverslag: ${o.walkthroughId ?? 'Niet gekoppeld'}`,
        o.facts,
        `Bewijs: ${o.evidenceIds.join(', ')}`,
        ...recordContextMarkdown('observation', o),
        '',
      );
    for (const f of workspace.findings?.filter((f) => f.dossierId === dossier.id) ?? [])
      lines.push(
        `### Bevinding: ${f.title}`,
        `ID: ${f.id} | status ${f.status} | vraag ${f.questionId ?? ''} | scenario ${f.scenarioId ?? 'Nog te beoordelen'}`,
        f.description,
        `Bewijs: ${f.evidenceIds.join(', ')} | Waarnemingen: ${f.observationIds.join(', ')}`,
        `Onderwerpen: ${f.topicIds.join(', ')} | Regelgeving: ${f.legalIds.join(', ')}`,
        `Besluit: ${f.decisionNote} | ${f.decisionBy}`,
        `Acties: ${workspace.actions
          .filter((a) => a.findingId === f.id)
          .map((a) => `${a.title} [${a.id}]`)
          .join('; ')}`,
        '',
      );
  }
  if (workspace.evidence?.length) lines.push('', '## Bewijsregister', '');
  for (const e of workspace.evidence ?? [])
    lines.push(
      `### ${e.title} [${e.id}]`,
      `Soort: ${e.kind} | dossier ${e.dossierId ?? 'Werkruimtebreed'} | ${e.status}`,
      `Vastgelegd: ${e.recordedAt} | Vastlegger: ${e.capturedBy ?? 'Niet vastgelegd'} | Verwijzing: ${e.reference}`,
      ...(e.file
        ? [
            `Bestand: ${e.file.originalFileName ?? 'Naam onbekend'} | verwachte SHA256 ${e.file.expectedSha256} | lengte ${e.file.expectedByteLength ?? 'onbekend'} | MIME ${e.file.declaredMimeType ?? 'onbekend'} (${e.file.mimeTypeOrigin})`,
            `Originele verwijzing: ${e.file.originalReference ?? 'Niet vastgelegd'} | bron-ID ${e.file.sourceId ?? 'Niet gekoppeld'} | menselijke bestandsbinding ${e.verifiedFileBindingSha256 ?? 'Niet bevestigd'}`,
            `Laatste bestandscontrole (historische waarneming, opnieuw controleren per sessie): ${e.fileCheck?.state ?? 'Nog niet gecontroleerd'} | ${e.fileCheck?.checkedAt ?? ''} | ${e.fileCheck?.checkedBy ?? ''} | ${e.fileCheck?.method ?? ''} | bronstatus ${e.fileCheck?.sourceState ?? 'onbekend'}`,
            ...(e.file.storage
              ? [
                  `Private bestandsopslag: ${e.file.storage.owner}/${e.file.storage.repo} | ${e.file.storage.branch} | ${e.file.storage.path} | blob ${e.file.storage.blobSha} | commit ${e.file.storage.commitSha}`,
                ]
              : []),
          ]
        : []),
      e.description,
      `Verificatie: ${e.verificationNote ?? 'Niet vastgelegd'} | ${e.verifiedBy ?? ''} | ${e.verifiedAt ?? ''}`,
      '',
    );
  if (workspace.topics?.length) lines.push('', '## Onderwerpen', '');
  for (const t of workspace.topics ?? [])
    lines.push(
      `- ${t.title} [${t.id}] | ${t.category}: ${t.description} | synoniemen ${t.aliases.join(', ')}`,
      ...recordContextMarkdown('topic', t),
    );
  if (workspace.legalRecords?.length) lines.push('', '## Regelgevingsregister', '');
  for (const l of workspace.legalRecords ?? [])
    lines.push(
      `### ${l.title}`,
      `${l.officialUrl} | ${l.citation} | ${l.jurisdiction} | ${l.status}`,
      `Gecontroleerd: ${l.lastVerifiedOn} | Ingangsdatum: ${l.effectiveOn || 'Onbekend'}`,
      l.summary,
      `Toepassing: ${l.impact}`,
      ...recordContextMarkdown('legal', l),
      '',
    );
  if (workspace.actions.some((a) => a.lifecycle))
    lines.push('', '## Actiecyclus en wijzigingshistorie', '');
  for (const a of workspace.actions.filter((a) => a.lifecycle)) {
    lines.push(
      `### ${a.title} [${a.id}]`,
      `Fase: ${actionStageLabels[actionStage(a)]} | revisie ${a.lifecycle!.revision} | eigenaar ${a.owner}`,
      `Dossier: ${a.dossierId ?? 'Werkruimtebreed'} | bevinding ${a.findingId ?? ''} | scenario ${a.scenarioId ?? ''}`,
      `Uitvoering: ${a.lifecycle!.implementedAt ?? 'Nog niet vastgelegd'} | geplande controle ${a.lifecycle!.verificationDueAt ?? 'Nog niet vastgelegd'}`,
      `Effectbeoordeling: ${a.lifecycle!.effectiveness} | ${a.lifecycle!.verifier ?? ''} | ${a.lifecycle!.evaluatedAt ?? ''}`,
      `Resultaat: ${a.effectCheck ?? 'Niet actief beoordeeld'}`,
      ...actionContextMarkdown(a, workspace, fileContext),
    );
    for (const proof of a.lifecycle!.evidenceSnapshots)
      lines.push(
        `Beoordeelde bewijsversie: ${proof.title} [${proof.id}] | SHA256 ${proof.verifiedContentSha256} | ${proof.reference} | ${proof.verifiedAt}`,
      );
    for (const event of a.lifecycle!.history) {
      lines.push(
        `Revisie ${event.revision}: ${actionStageLabels[actionStage(event.before)]} → ${actionStageLabels[actionStage(event.after)]} | ${event.actor} | ${event.at}`,
        `Redenering: ${event.reason}`,
        `Vóór: ${event.before.title} | eigenaar ${event.before.owner} | termijn ${event.before.dueDate} | plan ${event.before.notes} | resultaat ${event.before.effectCheck ?? 'Niet actief beoordeeld'}`,
        `Na: ${event.after.title} | eigenaar ${event.after.owner} | termijn ${event.after.dueDate} | plan ${event.after.notes} | resultaat ${event.after.effectCheck ?? 'Niet actief beoordeeld'}`,
        'Historische actiecontext vóór:',
        ...actionContextMarkdown(event.before),
        'Historische actiecontext na:',
        ...actionContextMarkdown(event.after),
        `Revisie-SHA256: ${event.sha256}`,
      );
    }
    lines.push('');
  }
  if (workspace.incidents.length) lines.push('', '## Incidentregister', '');
  for (const incident of workspace.incidents) {
    lines.push(
      `### ${incident.title} [${incident.id}]`,
      `${incident.date} | type ${incident.type} | afdeling ${(incident.departmentId ?? incident.department) || 'Onbekend'}`,
      `Werkelijke ernst: ${incident.actualSeverity ?? 'Niet vastgesteld'} | potentiële ernst ${incident.potentialSeverity ?? 'Niet vastgesteld'}`,
      `Recordable: ${incident.recordable === undefined ? 'Niet beoordeeld' : incident.recordable ? 'Ja' : 'Nee'} | lost time ${incident.lostTime === undefined ? 'Niet beoordeeld' : incident.lostTime ? 'Ja' : 'Nee'} | verzuimdagen ${incident.lostTimeDays ?? 'Niet vastgesteld'}`,
      `Melder: ${incident.reportedBy ?? 'Onbekend'} | activiteit ${incident.activity ?? 'Niet vastgelegd'}`,
      `Feiten: ${incident.description}`,
      `Direct handelen: ${incident.immediateControls ?? 'Niet vastgelegd'}`,
      `Open vragen: ${incident.openQuestions ?? 'Niet vastgelegd'}`,
      `Scenario: ${incident.scenarioId ?? ''} | acties ${incident.actionIds.join(', ')}`,
      ...incidentContextMarkdown(incident),
      '',
    );
  }
  if (workspace.investigations?.length) lines.push('', '## Incidentonderzoeken', '');
  for (const i of workspace.investigations ?? [])
    lines.push(
      `### ${i.title}`,
      `Incident: ${i.incidentId} | methode ${i.method}@${i.methodVersion} | ${i.status}`,
      `Feiten: ${i.facts}`,
      `Waaromketen: ${i.whyChain.join(' → ')}`,
      `BowTie-gebeurtenis: ${i.topEvent}`,
      `Oorzaken: ${i.threats.join('; ')}`,
      `Preventieve barrières: ${i.preventiveBarriers.join('; ')}`,
      `Gevolgen: ${i.consequences.join('; ')}`,
      `Mitigerende barrières: ${i.recoveryBarriers.join('; ')}`,
      `Basisrisicofactoren (projectcodering): ${i.basisRiskFactors.join(', ')}`,
      `Bewijs: ${i.evidenceIds.join(', ')} | acties ${i.actionIds.join(', ')}`,
      `Conclusie: ${i.conclusion}`,
      `Beoordeling: ${i.reviewNote} | ${i.reviewedBy}`,
      '',
    );
  if (workspace.exposure?.length) lines.push('', '## Urenbasis (hele kalendermaanden)', '');
  for (const h of workspace.exposure ?? [])
    lines.push(
      `- ${h.period} | ${h.departmentId || 'Hele werkruimte'} | ${h.hoursWorked} gewerkte uren | bron ${h.source}`,
    );
  lines.push(...basisRiskFactorMarkdown(workspace));
  return lines;
}

export default function DossierReport({ workspace }: { workspace: WorkspaceState }) {
  const { context } = useRiskEvidence();
  const lines = [
    ...dossierMarkdown(workspace, context),
    ...riskAssessmentMarkdown(workspace.riskAssessments ?? []),
    ...justificationMarkdown(workspace.justifications ?? []),
  ];
  if (!lines.length) return null;
  return (
    <div className="dossier-report">
      {lines.map((line, index) => {
        if (line.startsWith('#### ')) return <h4 key={index}>{line.slice(5)}</h4>;
        if (line.startsWith('### ')) return <h3 key={index}>{line.slice(4)}</h3>;
        if (line.startsWith('## ')) return <h2 key={index}>{line.slice(3)}</h2>;
        if (!line) return null;
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}
