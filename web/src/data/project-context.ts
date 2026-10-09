import type { WorkspaceState } from './model';

/** The original RieProject fields, with their meaning retained during migration. */
export const projectContextFields = [
  ['activities', 'Activiteiten en processen', 'ActiviteitenEnProcessen'],
  ['workplaces', 'Werkplekken en situaties', 'WerkplekkenEnSituaties'],
  ['workforce', 'Personeelsopbouw', 'Personeelsopbouw'],
  ['schedules', 'Werk- en roostersystematiek', 'WerkEnRoostersystematiek'],
  ['equipment', 'Arbeidsmiddelen en installaties', 'ArbeidsmiddelenEnInstallaties'],
  [
    'substances',
    'Gevaarlijke stoffen en biologische agentia',
    'GevaarlijkeStoffenEnBiologischeAgentia',
  ],
  ['physicalLoad', 'Fysieke belasting', 'FysiekeBelasting'],
  ['psychosocialLoad', 'Psychosociale arbeidsbelasting', 'PsychosocialeArbeidsbelasting'],
  ['absence', 'Verzuimgegevens', 'Verzuimgegevens'],
  ['incidents', 'Ongevallen en incidentgegevens', 'OngevallenEnIncidentgegevens'],
  ['previousAssessments', 'Eerdere RI&E en openstaande acties', 'EerdereRieEnOpenstaandeActies'],
  ['emergencyOrganisation', 'BHV en noodorganisatie', 'BhvEnNoodorganisatie'],
  ['regulations', 'Toegepaste wet- en regelgeving', 'ToegepasteWetEnRegelgeving'],
] as const;

export type ProjectContextKey = (typeof projectContextFields)[number][0];
export interface ProjectContext {
  id: string;
  title: string;
  /** Source descriptions do not invent a registered organisation or site. */
  organisationText: string;
  locationText: string;
  contactName: string;
  contactEmail: string;
  organisationIds: string[];
  details: Record<ProjectContextKey, string>;
  createdAt?: string;
  updatedAt?: string;
  sourceIds: string[];
}

export interface Walkthrough {
  id: string;
  title: string;
  organisationId: string;
  departmentId?: string;
  dossierId?: string;
  projectContextId?: string;
  /** Empty means no usable date was present; no migration date is substituted. */
  date: string;
  author: string;
  summary: string;
  body: string;
  /** Actual selected module identities and labels, distinct from new questionnaire themes. */
  modules: { id: string; code: string; title: string }[];
  createdAt?: string;
  updatedAt?: string;
  sourceIds: string[];
}

export function emptyProjectDetails(): ProjectContext['details'] {
  return Object.fromEntries(
    projectContextFields.map(([key]) => [key, '']),
  ) as ProjectContext['details'];
}

export function projectContextMarkdown(workspace: WorkspaceState): string[] {
  const lines: string[] = [];
  if (workspace.projectContexts?.length) lines.push('', '## Projectcontext', '');
  for (const context of workspace.projectContexts ?? []) {
    lines.push(
      `### ${context.title} [${context.id}]`,
      `Organisatiebeschrijving: ${context.organisationText || 'Niet vastgelegd'} | locatiebeschrijving ${context.locationText || 'Niet vastgelegd'}`,
      `Contact: ${context.contactName || 'Niet vastgelegd'} | ${context.contactEmail}`,
      `Organisaties: ${context.organisationIds.join(', ')}`,
      `Aangemaakt: ${context.createdAt ?? 'Niet vastgelegd'} | bijgewerkt ${context.updatedAt ?? 'Niet vastgelegd'}`,
    );
    for (const [key, label] of projectContextFields)
      lines.push(`${label}: ${context.details[key] || 'Niet vastgelegd'}`);
    lines.push(`Bronrecords: ${context.sourceIds.join(', ')}`, '');
  }
  if (workspace.walkthroughs?.length) lines.push('', '## Rondgangverslagen', '');
  for (const report of workspace.walkthroughs ?? []) {
    lines.push(
      `### ${report.title} [${report.id}]`,
      `Datum: ${report.date || 'Niet vastgelegd'} | auteur ${report.author || 'Niet vastgelegd'}`,
      `Organisatie: ${report.organisationId} | afdeling ${report.departmentId ?? 'Organisatiebreed'} | dossier ${report.dossierId ?? 'Niet gekoppeld'}`,
      `Projectcontext: ${report.projectContextId ?? 'Niet gekoppeld'}`,
      `Aangemaakt: ${report.createdAt ?? 'Niet vastgelegd'} | bijgewerkt ${report.updatedAt ?? 'Niet vastgelegd'}`,
      `Samenvatting: ${report.summary}`,
      report.body,
      `Geselecteerde modules: ${report.modules.map((module) => `${module.code} ${module.title} [${module.id}]`).join('; ')}`,
      `Waarnemingen: ${(workspace.observations ?? [])
        .filter((observation) => observation.walkthroughId === report.id)
        .map((observation) => `${observation.title} [${observation.id}]`)
        .join('; ')}`,
      `Bronrecords: ${report.sourceIds.join(', ')}`,
      '',
    );
  }
  return lines;
}
