import type { WorkspaceState } from '../data/model';
import {
  actionSourceRecords,
  assertActionContext,
  sourceRefKey,
  type ActionSourceRef,
} from './action-context';

export type RecordContextKind = 'topic' | 'legal' | 'observation';
export interface TopicRecordContext {
  parentId?: string;
  tags?: string[];
  /** Preserve the original free status label; no invented active status. */
  status?: string;
}
export interface LegalRecordContext {
  publishedOn?: string;
  /** Affected objects are relationships, not proof or risk credit. */
  affectedRefs?: ActionSourceRef[];
}
export interface ObservationRecordContext {
  topicIds?: string[];
  observedAt?: string;
  location?: string;
  scopeId?: string;
  context?: string;
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
}

function text(value: unknown, label: string, max = 100_000): asserts value is string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error(`${label}: tekst vereist (maximaal ${max} tekens).`);
}
function ids(value: unknown, label: string, max = 160): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((v) => typeof v !== 'string' || !v.trim() || v.length > max) ||
    new Set(value).size !== value.length
  )
    throw new Error(
      `${label}: unieke niet-lege waarden vereist (maximaal ${max} tekens per waarde).`,
    );
}
function leap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function isSourceCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return (
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= monthDays[month - 1] + (month === 2 && leap(year) ? 1 : 0)
  );
}
function dayOrdinal(year: number, month: number, day: number): number {
  const prior = year - 1;
  return (
    prior * 365 +
    Math.floor(prior / 4) -
    Math.floor(prior / 100) +
    Math.floor(prior / 400) +
    monthDays.slice(0, month - 1).reduce((sum, days) => sum + days, 0) +
    (month > 2 && leap(year) ? 1 : 0) +
    day -
    1
  );
}
/** .NET DateTimeOffset range and seven fractional digits, without changing the source lexeme. */
export function isSourceOffsetTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match || !isSourceCalendarDate(match[1])) return false;
  const [hour, minute, second] = match.slice(2, 5).map(Number);
  const offsetHour = Number(match[8] ?? 0),
    offsetMinute = Number(match[9] ?? 0);
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  )
    return false;
  const [year, month, day] = match[1].split('-').map(Number);
  const offset = (offsetHour * 60 + offsetMinute) * (match[7] === '-' ? -1 : 1);
  const ticks =
    BigInt(dayOrdinal(year, month, day)) * 864_000_000_000n +
    BigInt(hour * 3600 + minute * 60 + second) * 10_000_000n +
    BigInt((match[5] ?? '').padEnd(7, '0')) -
    BigInt(offset) * 600_000_000n;
  const maximum = BigInt(dayOrdinal(9999, 12, 31) + 1) * 864_000_000_000n - 1n;
  return ticks >= 0n && ticks <= maximum;
}

/** Only additive fields are inspected; the workspace validator owns each baseline record. */
export function assertRecordContextStructure(kind: RecordContextKind, value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Recordcontext: object vereist.');
  const record = value as Record<string, unknown>;
  if (kind === 'topic') {
    if (record.parentId !== undefined) {
      text(record.parentId, 'Bovenliggend onderwerp', 160);
      if (!record.parentId.trim())
        throw new Error('Bovenliggend onderwerp vereist een niet-lege ID.');
    }
    if (record.tags !== undefined) ids(record.tags, 'Tags', 1_000);
    if (record.status !== undefined) text(record.status, 'Onderwerpstatus', 1_000);
  } else if (kind === 'legal') {
    if (record.publishedOn !== undefined && !isSourceCalendarDate(record.publishedOn))
      throw new Error('Publicatiedatum: een bestaande kalenderdatum YYYY-MM-DD vereist.');
    if (record.affectedRefs !== undefined) {
      // Reuse the exact 27-collection reference dialect; no action/effect fields are added.
      assertActionContext({ sourceRefs: record.affectedRefs as ActionSourceRef[] });
    }
  } else if (kind === 'observation') {
    if (record.topicIds !== undefined) ids(record.topicIds, 'Waarnemingsonderwerpen');
    for (const key of ['location', 'context'] as const)
      if (record[key] !== undefined) text(record[key], key);
    if (record.scopeId !== undefined) text(record.scopeId, 'Oorspronkelijke scope-ID', 160);
    for (const key of ['observedAt', 'sourceCreatedAt', 'sourceUpdatedAt'] as const)
      if (record[key] !== undefined && !isSourceOffsetTimestamp(record[key]))
        throw new Error(
          `${key}: exact ISO-tijdstip met tijdzone en maximaal 7 fractiecijfers vereist.`,
        );
    if (
      record.observedAt !== undefined &&
      record.date !== undefined &&
      record.date !== (record.observedAt as string).slice(0, 10)
    )
      throw new Error('Waarnemingsdatum moet de bronkalenderdatum van observedAt behouden.');
  } else throw new Error('Onbekende recordcontext.');
}

/** Validate actual collection/ID relationships; never infer a reverse legal impact or scope. */
export function assertRecordContextRelations(workspace: WorkspaceState): void {
  const topics = workspace.topics ?? [];
  const byId = new Map(topics.map((record) => [record.id, record]));
  for (const topic of topics) {
    assertRecordContextStructure('topic', topic);
    if (topic.parentId) {
      if (topic.parentId === topic.id) throw new Error('Onderwerp kan niet zijn eigen ouder zijn.');
      if (topics.filter((record) => record.id === topic.parentId).length !== 1)
        throw new Error('Bovenliggend onderwerp bestaat niet of is niet uniek.');
    }
  }
  // Iterative traversal avoids call-stack exhaustion on a deep but otherwise valid source tree.
  const complete = new Set<string>();
  for (const topic of topics) {
    const path = new Set<string>();
    let current: typeof topic | undefined = topic;
    while (current && !complete.has(current.id)) {
      if (path.has(current.id)) throw new Error('Onderwerphiërarchie bevat een cyclus.');
      path.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    path.forEach((id) => complete.add(id));
  }
  for (const observation of workspace.observations ?? []) {
    assertRecordContextStructure('observation', observation);
    for (const id of observation.topicIds ?? [])
      if (topics.filter((topic) => topic.id === id).length !== 1)
        throw new Error('Waarnemingsonderwerp bestaat niet of is niet uniek.');
  }
  for (const legal of workspace.legalRecords ?? []) {
    assertRecordContextStructure('legal', legal);
    for (const ref of legal.affectedRefs ?? []) {
      const matches =
        ref.kind === 'workspace'
          ? actionSourceRecords(workspace, ref.collection).filter((record) => record.id === ref.id)
          : ref.rawSourceId
            ? workspace.sources.filter((record) => record.id === ref.rawSourceId)
            : null;
      if (matches && matches.length !== 1)
        throw new Error(
          'Geraakt object of raw bronrecord ontbreekt of is niet uniek in de gekozen collectie.',
        );
    }
  }
}

function field(lines: string[], label: string, value: unknown): void {
  if (value !== undefined)
    lines.push(
      `${label}: ${typeof value === 'string' && value === '' ? '(expliciet leeg)' : String(value)}`,
    );
}
/** Additional report lines retain lexemes and distinguish absent from explicitly empty fields. */
export function recordContextMarkdown(kind: RecordContextKind, value: unknown): string[] {
  assertRecordContextStructure(kind, value);
  const record = value as Record<string, unknown>;
  const lines: string[] = [];
  if (kind === 'topic') {
    field(lines, 'Bovenliggend onderwerp-ID', record.parentId);
    if (record.tags !== undefined)
      field(
        lines,
        'Tags',
        (record.tags as string[]).length
          ? (record.tags as string[]).join(' · ')
          : '(expliciet leeg)',
      );
    field(lines, 'Onderwerpstatus (bronlabel)', record.status);
  } else if (kind === 'legal') {
    field(lines, 'Publicatiedatum', record.publishedOn);
    if (record.affectedRefs !== undefined) {
      const refs = record.affectedRefs as ActionSourceRef[];
      lines.push('Geraakte objecten (relaties; geen bewijs- of risicocredit):');
      if (!refs.length) lines.push('- (expliciet leeg)');
      refs.forEach((ref) =>
        lines.push(
          ref.kind === 'workspace'
            ? `- ${ref.collection} [${ref.id}]`
            : `- Onopgelost oorspronkelijk object [${ref.originalId}]${ref.rawSourceId ? ` · raw bron [${ref.rawSourceId}]` : ''}`,
        ),
      );
    }
  } else {
    field(lines, 'Waarnemingstijdstip (bronnotatie)', record.observedAt);
    field(lines, 'Locatie van de waarneming', record.location);
    field(lines, 'Oorspronkelijke scope-ID', record.scopeId);
    field(lines, 'Waarnemingscontext', record.context);
    if (record.topicIds !== undefined)
      field(
        lines,
        'Waarnemingsonderwerp-ID’s',
        (record.topicIds as string[]).length
          ? (record.topicIds as string[]).join(' · ')
          : '(expliciet leeg)',
      );
    field(lines, 'Oorspronkelijk aangemaakt op', record.sourceCreatedAt);
    field(lines, 'Oorspronkelijk bijgewerkt op', record.sourceUpdatedAt);
  }
  return lines;
}
export { sourceRefKey };
