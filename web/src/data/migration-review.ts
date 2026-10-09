import { sha256 } from '@noble/hashes/sha2.js';
import type { JsonValue, WorkspaceRecord } from './model';

export interface MigrationWarning {
  code: string;
  sourceId: string;
  message: string;
}
export interface MigrationReport {
  schema: 'ima.migration-report/v1';
  migratedAt: string;
  target: string;
  warnings: MigrationWarning[];
  rules: string[];
  counts: Record<string, number>;
  sourceFormat?: 'sqlite';
  projectId?: number;
  databaseSha256?: string;
}
export type MigrationReview =
  | { sourceId: string; report: MigrationReport; error?: never }
  | { sourceId: string; report?: never; error: string };

/** Same canonical encoding as the read-only migration CLI; arrays retain source order. */
export function canonicalMigrationReportJson(value: JsonValue | MigrationReport): string {
  if (Array.isArray(value)) return `[${value.map(canonicalMigrationReportJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, JsonValue>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalMigrationReportJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
export function migrationReportHash(report: MigrationReport): string {
  return Array.from(sha256(new TextEncoder().encode(canonicalMigrationReportJson(report))))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 100_000;
}
function isReport(value: unknown): value is MigrationReport {
  if (!object(value)) return false;
  const core = ['counts', 'migratedAt', 'rules', 'schema', 'target', 'warnings'];
  const metadata = ['databaseSha256', 'projectId', 'sourceFormat'];
  const hasMetadata = metadata.some((key) => Object.hasOwn(value, key));
  const keys = hasMetadata ? [...core, ...metadata] : core;
  if (Object.keys(value).sort().join(',') !== keys.sort().join(',')) return false;
  if (
    hasMetadata &&
    (value.sourceFormat !== 'sqlite' ||
      !Number.isSafeInteger(value.projectId) ||
      (value.projectId as number) <= 0 ||
      typeof value.databaseSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.databaseSha256))
  )
    return false;
  return (
    value.schema === 'ima.migration-report/v1' &&
    text(value.migratedAt) &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.migratedAt) &&
    Number.isFinite(Date.parse(value.migratedAt)) &&
    text(value.target) &&
    Array.isArray(value.rules) &&
    value.rules.length <= 5000 &&
    value.rules.every(text) &&
    Array.isArray(value.warnings) &&
    value.warnings.length <= 5000 &&
    value.warnings.every(
      (warning) =>
        object(warning) &&
        Object.keys(warning).sort().join(',') === 'code,message,sourceId' &&
        text(warning.code) &&
        text(warning.sourceId) &&
        text(warning.message),
    ) &&
    object(value.counts) &&
    Object.keys(value.counts).length > 0 &&
    Object.entries(value.counts).every(
      ([key, count]) => text(key) && Number.isSafeInteger(count) && (count as number) >= 0,
    ) &&
    Number.isSafeInteger(value.counts.sources) &&
    (value.counts.sources as number) >= 1
  );
}
/** Only exact, intact review sources are rendered; arbitrary provenance raw is never displayed. */
export function readMigrationReviews(sources: WorkspaceRecord[]): MigrationReview[] {
  return sources
    .filter((source) => source.format === 'ima.migration-review/v1')
    .map((source) => {
      if (
        source.kind !== 'other' ||
        source.publication !== 'private' ||
        source.status !== 'review-required' ||
        !isReport(source.raw)
      ) {
        return {
          sourceId: source.id,
          error:
            'Migratiereview heeft geen geldig privaat rapport. Controleer de oorspronkelijke export.',
        };
      }
      if (source.contentSha256 !== migrationReportHash(source.raw)) {
        return {
          sourceId: source.id,
          error:
            'De migratiereview wijkt af van haar opgeslagen inhoudshash. De waarschuwingen zijn niet als intact rapport bevestigd.',
        };
      }
      return { sourceId: source.id, report: source.raw };
    });
}
export function migrationWarningCounts(report: MigrationReport): { code: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const warning of report.warnings)
    counts.set(warning.code, (counts.get(warning.code) ?? 0) + 1);
  return [...counts]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([code, count]) => ({ code, count }));
}
