import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import MigrationReviewPanel from '../components/MigrationReviewPanel';
import { dossierMarkdown } from '../components/DossierReport';
import { createWorkspace } from './model';
import type { WorkspaceRecord } from './model';
import {
  canonicalMigrationReportJson,
  migrationReportHash,
  migrationWarningCounts,
  readMigrationReviews,
  type MigrationReport,
} from './migration-review';

function fixture(): { source: WorkspaceRecord; report: MigrationReport } {
  const report: MigrationReport = {
    schema: 'ima.migration-report/v1',
    migratedAt: '2026-10-09T10:00:00.000Z',
    target: 'IMA browser WorkspaceState schemaVersion 1',
    rules: ['Gemigreerde dossiers zijn concepten voor menselijke controle.'],
    counts: { sources: 7, answers: 1, scenarios: 0 },
    warnings: [
      {
        code: 'assumed_utc',
        sourceId: 'source:a',
        message: 'Zone-loos tijdstip op expliciete keuze als UTC gelezen.',
      },
      {
        code: 'assumed_utc',
        sourceId: 'source:b',
        message: 'Tweede UTC-aanname vereist controle.',
      },
      {
        code: 'sqlite_question_not_historically_frozen',
        sourceId: 'source:q',
        message: 'Vraag bij export bevroren; geen oorspronkelijk vraaghash.',
      },
      {
        code: 'legacy_rating_not_kinney',
        sourceId: 'source:r',
        message: '1–3 ratings blijven oorspronkelijk; herbeoordeling vereist.',
      },
      {
        code: 'legacy_control_raw_only',
        sourceId: 'source:c',
        message: 'ReductieScore niet als percentage geïnterpreteerd.',
      },
      {
        code: 'constructor',
        sourceId: 'source:custom',
        message: 'Onbekende waarschuwing <script>unsafe()</script>.',
      },
    ],
  };
  const source: WorkspaceRecord = {
    id: 'migration:1',
    title: 'Migratieconcept: menselijke controle vereist',
    format: 'ima.migration-review/v1',
    kind: 'other',
    publication: 'private',
    status: 'review-required',
    raw: JSON.parse(JSON.stringify(report)),
    contentSha256: migrationReportHash(report),
  };
  return { source, report };
}
describe('private migration review', () => {
  it('carries all interpretation warnings into readable reports without raw source text', () => {
    const { source, report } = fixture();
    const workspace = createWorkspace('Migration review fixture', {
      sources: [source, { id: 'raw:1', raw: 'RAW_CLIENT_SECRET' }],
    });
    const markdown = dossierMarkdown(workspace).join('\n');
    expect(markdown).toContain('Migratieconcept: menselijke controle vereist');
    for (const warning of report.warnings) {
      expect(markdown).toContain(warning.message);
      expect(markdown).toContain(warning.sourceId);
    }
    expect(markdown).not.toContain('RAW_CLIENT_SECRET');
  });
  it('verifies stable canonical hashes independent of object key insertion order and retains every warning', () => {
    const { source, report } = fixture();
    expect(canonicalMigrationReportJson({ z: 1, a: { y: 2, x: 3 } })).toBe(
      '{"a":{"x":3,"y":2},"z":1}',
    );
    expect(
      migrationReportHash({
        counts: report.counts,
        target: report.target,
        rules: report.rules,
        schema: report.schema,
        warnings: report.warnings,
        migratedAt: report.migratedAt,
      }),
    ).toBe(source.contentSha256);
    expect(readMigrationReviews([source])[0].report).toEqual(report);
    expect(migrationWarningCounts(report)).toContainEqual({ code: 'assumed_utc', count: 2 });
    expect(migrationWarningCounts(report).reduce((sum, item) => sum + item.count, 0)).toBe(
      report.warnings.length,
    );
  });
  it('rejects changed hashes, malformed counts, missing metadata and self-referential report metadata', () => {
    const { source, report } = fixture();
    for (const bad of [
      { ...source, contentSha256: '0'.repeat(64) },
      { ...source, raw: { ...JSON.parse(JSON.stringify(report)), counts: { sources: -1 } } },
      { ...source, publication: 'public' },
      { ...source, raw: { ...JSON.parse(JSON.stringify(report)), workspaceSha256: 'x' } },
      {
        ...source,
        raw: { ...JSON.parse(JSON.stringify(report)), warnings: [{ code: 'x', sourceId: 'y' }] },
      },
    ])
      expect(readMigrationReviews([bad])[0].error).toBeTruthy();
  });
  it('renders UTC, missing snapshots, old ratings and full warning text while excluding arbitrary raw client records', () => {
    const { source } = fixture();
    const raw: WorkspaceRecord = {
      id: 'source:private',
      format: 'legacy-sqlite',
      raw: { ClientText: 'RAW_CLIENT_SECRET' },
    };
    const html = renderToStaticMarkup(
      createElement(MigrationReviewPanel, { sources: [raw, source] }),
    );
    expect(html).toContain('Migratieconcept: menselijke controle vereist');
    expect(html).toContain('6 waarschuwingen');
    expect(html).toContain('Tijdzones: expliciet als UTC geïnterpreteerd: <strong>2</strong>');
    expect(html).toContain('Historische vraagversie ontbreekt');
    expect(html).toContain('Oude ratings vereisen nieuwe risicobeoordeling');
    expect(html).toContain('Tweede UTC-aanname vereist controle.');
    expect(html).toContain('source:q');
    expect(html).not.toContain('RAW_CLIENT_SECRET');
    expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(renderToStaticMarkup(createElement(MigrationReviewPanel, { sources: [raw] }))).toBe('');
  });
  it('keeps strict zero UTC counts visible and shows corrupted review as an error without rendering its warnings', () => {
    const { source, report } = fixture();
    const strict = {
      ...report,
      warnings: report.warnings.filter((warning) => warning.code !== 'assumed_utc'),
    };
    const strictSource = {
      ...source,
      raw: JSON.parse(JSON.stringify(strict)),
      contentSha256: migrationReportHash(strict),
    };
    expect(
      renderToStaticMarkup(createElement(MigrationReviewPanel, { sources: [strictSource] })),
    ).toContain('Tijdzones: expliciet als UTC geïnterpreteerd: <strong>0</strong>');
    const html = renderToStaticMarkup(
      createElement(MigrationReviewPanel, { sources: [{ ...source, contentSha256: 'bad' }] }),
    );
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Tweede UTC-aanname vereist controle.');
  });
});
