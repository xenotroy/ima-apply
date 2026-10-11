import type { WorkspaceIncident, WorkspaceState } from '../data/model';
import { isSourceOffsetTimestamp } from './record-context';

/** These are the seven original IncidentKind meanings, separate from the old UI type. */
export const incidentKinds = [
  'unsafe_condition',
  'near_miss',
  'injury',
  'illness',
  'property_damage',
  'environmental',
  'other',
] as const;
export type IncidentKind = (typeof incidentKinds)[number];
export const incidentKindLabels: Record<IncidentKind, string> = {
  unsafe_condition: 'Onveilige situatie',
  near_miss: 'Bijna-ongeval',
  injury: 'Letsel',
  illness: 'Ziekte',
  property_damage: 'Materiële schade',
  environmental: 'Milieu',
  other: 'Overig',
};
export const incidentContextKeys = [
  'kind',
  'occurredAt',
  'reportedAt',
  'scopeId',
  'organisation',
  'location',
  'status',
  'tags',
  'topicIds',
  'basisRiskFactorIds',
  'evidenceIds',
  'investigationIds',
  'sourceCreatedAt',
  'sourceUpdatedAt',
] as const;
export type IncidentContext = Pick<WorkspaceIncident, (typeof incidentContextKeys)[number]>;

/** Share the source calendar/DateTimeOffset range check; never rewrite the original lexeme. */
export function isIsoOffsetLexeme(value: unknown): value is string {
  return isSourceOffsetTimestamp(value);
}
export function assertIsoOffsetLexeme(value: unknown, label = 'Tijdstip'): asserts value is string {
  if (!isIsoOffsetLexeme(value))
    throw new Error(
      `${label}: geldig ISO-tijdstip met expliciete offset en maximaal zeven fractiecijfers vereist.`,
    );
}
function text(value: unknown, label: string, max = 100_000): asserts value is string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error(`${label}: tekst van maximaal ${max} tekens vereist.`);
}
function stringList(value: unknown, label: string, maxLength = 160): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > 10_000 ||
    value.some((item) => typeof item !== 'string' || !item.trim() || item.length > maxLength) ||
    new Set(value).size !== value.length
  )
    throw new Error(
      `${label}: unieke, niet-lege teksten van maximaal ${maxLength} tekens vereist.`,
    );
}
/** Additive checks only: existing base fields are validated by the native incident validator. */
export function assertIncidentContextStructure(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Incidentcontext: object vereist.');
  const incident = value as Record<string, unknown>;
  if (incident.kind !== undefined && !incidentKinds.includes(incident.kind as IncidentKind))
    throw new Error('Incidentsoort: onbekende keuze.');
  for (const key of ['occurredAt', 'reportedAt', 'sourceCreatedAt', 'sourceUpdatedAt'] as const)
    if (incident[key] !== undefined) assertIsoOffsetLexeme(incident[key], key);
  if (
    incident.occurredAt !== undefined &&
    incident.date !== undefined &&
    (typeof incident.date !== 'string' ||
      (incident.occurredAt as string).slice(0, 10) !== incident.date)
  )
    throw new Error('Incidentdatum moet overeenkomen met de lokale kalenderdag van occurredAt.');
  for (const key of ['scopeId', 'organisation', 'location', 'status'] as const)
    if (incident[key] !== undefined) text(incident[key], key);
  if (incident.tags !== undefined) stringList(incident.tags, 'Tags', 1_000);
  for (const key of ['topicIds', 'basisRiskFactorIds', 'evidenceIds', 'investigationIds'] as const)
    if (incident[key] !== undefined) stringList(incident[key], key);
}
/** IDs resolve in their stated collection; a BRF identity/code never substitutes for a version ID. */
export function assertIncidentContextRelations(
  incident: WorkspaceIncident,
  workspace: WorkspaceState,
): void {
  assertIncidentContextStructure(incident);
  for (const [key, records, label] of [
    ['topicIds', workspace.topics ?? [], 'Onderwerp'],
    ['basisRiskFactorIds', workspace.basisRiskFactorRecords ?? [], 'BRF-definitieversie'],
    ['evidenceIds', workspace.evidence ?? [], 'Bewijs'],
    ['investigationIds', workspace.investigations ?? [], 'Onderzoek'],
  ] as const)
    for (const id of incident[key] ?? []) {
      const matches = records.filter((record) => record.id === id);
      if (matches.length !== 1)
        throw new Error(`${label}: gekoppeld ID ontbreekt of is niet uniek.`);
      if (
        key === 'investigationIds' &&
        !workspace.investigations?.some(
          (record) => record.id === id && record.incidentId === incident.id,
        )
      )
        throw new Error('Onderzoek: gekoppeld onderzoek hoort bij een ander incident.');
    }
}

/** Emit only explicitly stored context, keeping offset/fraction/source text unchanged. */
export function incidentContextMarkdown(incident: WorkspaceIncident): string[] {
  const lines: string[] = [];
  if (incident.kind !== undefined)
    lines.push(`Incidentsoort: ${incidentKindLabels[incident.kind]} [${incident.kind}]`);
  const labels = {
    occurredAt: 'Tijdstip gebeurtenis',
    reportedAt: 'Tijdstip melding',
    scopeId: 'Oorspronkelijk scope-ID',
    organisation: 'Organisatie (brontekst)',
    location: 'Locatie (brontekst)',
    status: 'Incidentstatus (brontekst)',
    sourceCreatedAt: 'Oorspronkelijk aangemaakt op',
    sourceUpdatedAt: 'Oorspronkelijk gewijzigd op',
  };
  for (const key of Object.keys(labels) as (keyof typeof labels)[])
    if (incident[key] !== undefined) lines.push(`${labels[key]}: ${incident[key]}`);
  for (const [key, label] of [
    ['tags', 'Tags'],
    ['topicIds', 'Onderwerp-ID’s'],
    ['basisRiskFactorIds', 'BRF-definitieversie-ID’s'],
    ['evidenceIds', 'Bewijs-ID’s'],
    ['investigationIds', 'Onderzoek-ID’s'],
  ] as const)
    if (incident[key] !== undefined)
      lines.push(`${label}: ${incident[key].join(', ') || 'Geen vastgelegd'}`);
  return lines;
}
