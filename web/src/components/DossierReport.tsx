import type { WorkspaceState } from '../data';

/** Readable projection; the JSON export remains the complete portable record. */
export function dossierMarkdown(workspace: WorkspaceState): string[] {
  const lines: string[] = [];
  if (workspace.organisations?.length) {
    lines.push('', '## Organisatie', '');
    for (const o of workspace.organisations) lines.push(`- ${o.name} [${o.id}] — ${o.description}`);
    for (const s of workspace.sites ?? [])
      lines.push(`- Locatie ${s.name} [${s.id}], organisatie ${s.organisationId}: ${s.address}`);
    for (const d of workspace.departments ?? [])
      lines.push(`- Afdeling ${d.name} [${d.id}], locatie ${d.siteId}: ${d.activity}`);
  }
  for (const dossier of workspace.dossiers ?? []) {
    lines.push(
      '',
      `## Beoordelingsdossier: ${dossier.title}`,
      '',
      `ID: ${dossier.id} | Status: ${dossier.status}`,
      `Scope: ${dossier.scope || 'Niet vastgelegd'}`,
      `Beoordelaar: ${dossier.assessor || 'Niet vastgelegd'}`,
      `Organisatie: ${dossier.organisationId ?? 'Werkruimtebreed'}`,
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
        o.facts,
        `Bewijs: ${o.evidenceIds.join(', ')}`,
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
      `Vastgelegd: ${e.recordedAt} | Verwijzing: ${e.reference}`,
      e.description,
      `Verificatie: ${e.verificationNote ?? 'Niet vastgelegd'} | ${e.verifiedBy ?? ''} | ${e.verifiedAt ?? ''}`,
      '',
    );
  if (workspace.topics?.length) lines.push('', '## Onderwerpen', '');
  for (const t of workspace.topics ?? [])
    lines.push(
      `- ${t.title} [${t.id}] | ${t.category}: ${t.description} | synoniemen ${t.aliases.join(', ')}`,
    );
  if (workspace.legalRecords?.length) lines.push('', '## Regelgevingsregister', '');
  for (const l of workspace.legalRecords ?? [])
    lines.push(
      `### ${l.title}`,
      `${l.officialUrl} | ${l.citation} | ${l.jurisdiction} | ${l.status}`,
      `Gecontroleerd: ${l.lastVerifiedOn} | Ingangsdatum: ${l.effectiveOn || 'Onbekend'}`,
      l.summary,
      `Toepassing: ${l.impact}`,
      '',
    );
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
  return lines;
}

export default function DossierReport({ workspace }: { workspace: WorkspaceState }) {
  const lines = dossierMarkdown(workspace);
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
