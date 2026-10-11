import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { migrateMarkdown, migrateSqlite, parseLegacyMarkdown, loadWorkspaceApi, writeMigrationOutput, canonicalMigrationReportJson } from './migrate-workspace.mjs';

const NOW = '2026-10-07T09:00:00.000Z';
const hash = value => createHash('sha256').update(value).digest('hex');
const md = (schema, id, metadata, body) => `---\nschema: ${schema}\nid: ${id}\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n${body}\n`;
async function temporary(t) { const root = await fs.mkdtemp(path.join(tmpdir(), 'ima-migration-test-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
async function put(root, relative, content) { const target = path.join(root, relative); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content); return target; }

// The original .NET helper hashes the UTF-8 encoding of File.ReadAllText, with BOM removed and CRLF retained.
const actionSourceTextHash = text => hash(text.replace(/^\uFEFF/, ''));
const actionArchiveStem = id => id.replaceAll(':', '--') + '--' + hash(id).slice(0, 16);
function actionSource(revision, previous, { id = 'action:archive-test', schema = 'ima.action/v2', crlf = false, bom = false } = {}) {
  let text = md(schema, id, { title: 'Fictieve archiefactie', revision, owner: 'Fictieve verantwoordelijke', status: 'planned',
    priority: 'medium', ahs_level: 'technical_collective', higher_levels_considered: [], source_ids: [], topic_ids: [],
    implemented_at: null, verification_due_at: null, verifier: '', effectiveness_result: 'pending',
    previous_revision_sha256: previous, created_at: NOW, updated_at: NOW },
    '# Fictieve archiefactie\n\n## Beoogd resultaat\n\nBewaar de oorspronkelijke inhoud en revisie ' + revision + '.\n\n## Uitvoering\n\nNog gepland.\n\n## Verificatiemethode\n\nFictieve test.\n\n## Evaluatie\n\n');
  if (crlf) text = text.replaceAll('\n', '\r\n');
  return (bom ? '\uFEFF' : '') + text;
}
async function actionArchiveFixture(t, options = {}) {
  const root = await temporary(t);
  const id = 'action:archive-test';
  const first = actionSource(1, '', options);
  const second = actionSource(2, actionSourceTextHash(first), options);
  const current = actionSource(3, actionSourceTextHash(second), options);
  const relativeDirectory = '.history/actions/' + actionArchiveStem(id);
  await put(root, 'actions/current.md', current);
  await put(root, relativeDirectory + '/revision-1.md', first);
  await put(root, relativeDirectory + '/revision-2.md', second);
  return { root, id, first, second, current, relativeDirectory };
}
const historyRecords = result => result.workspace.contentRecords?.filter(record => record.format === 'ima.legacy-action-history/v1') ?? [];

async function markdownFixture(t, { changedQuestion = false } = {}) {
  const root = await temporary(t);
  const originalQuestion = md('ima.rie-question-definition/v1', 'q:1', { title: 'Inspectie afscherming', version: '1.0.0', status: 'active', topic_ids: ['topic:machine'], legal_ids: ['law:1'], content_package_id: 'pack:1' }, '# Inspectie afscherming\n\n## Vraag\n\nIs de afscherming intact?\n\n## Toelichting\n\nControleer de hele knelzone.\n\n## Acceptatiecriteria\n\nAfscherming dekt toegang tot bewegende delen.\n\n## Verwacht bewijs\n\nEen inspectierapport.');
  const originalHash = hash(originalQuestion);
  await put(root, 'workspace.md', md('ima.workspace/v1', 'workspace:example', { title: 'Voorbeeldwerkruimte' }, '# Voorbeeld'));
  await put(root, 'rie/questions/q.md', changedQuestion ? originalQuestion.replace('Is de afscherming intact?', 'Is de nieuwe afscherming intact?') : originalQuestion);
  await put(root, 'rie/assessments/a.md', md('ima.rie-assessment/v1', 'assessment:1', { title: 'Machine RI&E', assessor: 'Rol: veiligheidskundige', status: 'active', question_refs: [`q:1@1.0.0#sha256:${originalHash}`] }, '# Machine RI&E\n\n## Doel en reikwijdte\n\nWerkplaats en rollenbaan.'));
  const attachment = 'Fictief inspectierapport, geen praktijkbewijs.';
  await put(root, 'attachments/inspection.txt', attachment);
  await put(root, 'rie/evidence/e.md', md('ima.rie-evidence/v1', 'evidence:1', { title: 'Inspectierapport', assessment_id: 'assessment:1', kind: 'document', relative_path: 'attachments/inspection.txt', sha256: hash(attachment), captured_at: '2026-10-06T10:00:00+02:00' }, '# Inspectierapport\n\n## Beschrijving\n\nFictieve vastlegging van een inspectie.'));
  await put(root, 'rie/responses/r.md', md('ima.rie-response/v1', 'response:1', { assessment_id: 'assessment:1', question_id: 'q:1', question_version: '1.0.0', question_sha256: originalHash, answer: 'no', responded_by: 'Vastgelegde beoordelaar', responded_at: '2026-10-06T10:15:00+02:00', evidence_ids: ['evidence:1'] }, '# Antwoord\n\n## Bevroren vraag\n\nIs de afscherming intact?\n\n## Motivering\n\nEen deel van de afscherming ontbreekt.'));
  await put(root, 'rie/observations/o.md', md('ima.rie-observation/v1', 'observation:1', { assessment_id: 'assessment:1', observed_at: '2026-10-07T00:30:00+02:00', observer: 'Rol: inspecteur', evidence_ids: ['EVIDENCE:1'] }, '# Waarneming\n\n## Feit\n\nEen opening is zichtbaar.\n\n## Context\n\nMachine stond stil.'));
  await put(root, 'rie/findings/f.md', md('ima.rie-finding/v2', 'finding:1', { title: 'Opening in afscherming', assessment_id: 'assessment:1', status: 'closed', observation_ids: ['observation:1'], evidence_ids: ['evidence:1'], topic_ids: ['topic:machine'], legal_ids: ['law:1'] }, '# Bevinding\n\n## Gevaar\n\nBewegende delen\n\n## Scenario\n\nHand door opening\n\n## Conclusie\n\nHerbeoordeling vereist.'));
  await put(root, 'actions/a.md', md('ima.action/v2', 'action:1', { title: 'Afscherming herstellen', status: 'closed', owner: 'Rol: technische dienst', target_date: '2026-10-10', source_ids: ['finding:1'], effectiveness_result: 'effective', verifier: 'Rol: controleur' }, '# Actie\n\n## Beoogd resultaat\n\nGeen toegang tot knelzone\n\n## Uitvoering\n\nAfscherming geplaatst\n\n## Evaluatie\n\nLegacy effectcontrole.'));
  await put(root, 'actions/cancelled.md', md('ima.action/v2', 'action:cancelled', { title: 'Oude vervallen actie', status: 'cancelled', owner: 'Rol: uitvoerder' }, '# Niet meer uitvoeren'));
  await put(root, 'incidents/i.md', md('ima.incident/v1', 'incident:1', { title: 'Bijna-beknelling', occurred_at: '2026-10-06T11:15:00+02:00', kind: 'near_miss', department: 'Werkplaats', reporter: 'Rol: medewerker', activity: 'Fictieve storingsinterventie', actual_severity: 'none', potential_severity: 'major', is_recordable: false, is_lost_time: false, lost_time_days: 0, action_ids: ['action:1'] }, '# Bijna-beknelling\n\n## Feiten\n\nFictieve feiten uit de bron.\n\n## Directe beheersing\n\nDe machine stilgelegd.\n\n## Open vragen\n\nWas energie geïsoleerd?'));
  await put(root, 'topics/t.md', md('ima.topic/v1', 'topic:machine', { title: 'Machineveiligheid', category: 'Arbeidsmiddelen', aliases: ['Machines'] }, '# Machineveiligheid'));
  await put(root, 'legal/l.md', md('ima.legal-update/v1', 'law:1', { title: 'Fictief wetsignaal', official_uri: 'https://example.org/law', jurisdiction: 'NL', citation: 'Fictieve fixture', status: 'signal', last_verified_on: '2026-10-01', topic_ids: ['topic:machine'] }, '# Wetsignaal\n\n## Samenvatting\n\nFictieve testinhoud.\n\n## Impact\n\nControle nodig.'));
  await put(root, 'metrics/exposure/e.md', md('ima.exposure/v1', 'exposure:1', { period: '2026-10', hours_worked: 1200, scope_id: '', source: 'Fictieve urenexport' }, '# Uren'));
  await put(root, 'rie/risk-assessments/r.md', md('ima.rie-risk-assessment/v1', 'risk:1', { finding_id: 'finding:1', method_id: 'legacy:local', method_version: '1.0.0' }, '# Beoordeling\n\n## Methode-invoer\n\nE=3, B=2, W=1. ReductieScore=3.\n\n## Resultaat\n\nOud lokaal oordeel.'));
  await put(root, 'analyses/a.md', md('ima.analysis/v1', 'analysis:1', { title: 'Oud onderzoek', method_id: 'ima-core:method:five-whys', method_version: '1.0.0', incident_id: 'incident:1', action_ids: ['action:1'] }, '# Analyse\n\n## Probleemdefinitie\n\nOorspronkelijke probleemomschrijving.\n\n## Waarom 1\n\nOnbevestigde hypothese.'));
  await put(root, 'custom/c.md', md('vendor.record/v2', 'custom:1', { title: 'Onbekend schema', relation_id: 'unknown:1' }, '# Unieke raw inhoud'));
  await put(root, 'templates/should-not-import.md', md('ima.action/v2', 'template:1', { title: 'Niet echt dossierwerk', status: 'planned' }, '# Template'));
  return { root, originalHash };
}

async function sqliteFixture(t, { multiple = false, naiveTime = false } = {}) {
  const root = await temporary(t); const filename = path.join(root, 'legacy.db');
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE RieProjecten (Id INTEGER PRIMARY KEY, Naam TEXT, Organisatie TEXT, Locatie TEXT, ContactNaam TEXT, CreatedAt TEXT);
    CREATE TABLE Modules (Id INTEGER PRIMARY KEY, Code TEXT, Titel TEXT);
    CREATE TABLE Vragen (Id INTEGER PRIMARY KEY, ModuleId INTEGER, ModuleCode TEXT, Titel TEXT, Vraagtekst TEXT, Toetscriteria TEXT, Wetgeving TEXT);
    CREATE TABLE GeselecteerdeModules (Id INTEGER PRIMARY KEY, RieProjectId INTEGER, ModuleId INTEGER);
    CREATE TABLE Antwoorden (Id INTEGER PRIMARY KEY, RieProjectId INTEGER, CompanyId INTEGER, DepartmentId INTEGER, VraagId INTEGER, Keuze INTEGER, Toelichting TEXT, UpdatedAt TEXT);
    CREATE TABLE Companies (Id INTEGER PRIMARY KEY, RieProjectId INTEGER, Name TEXT);
    CREATE TABLE Departments (Id INTEGER PRIMARY KEY, CompanyId INTEGER, Name TEXT);
    CREATE TABLE Risicos (Id INTEGER PRIMARY KEY, Titel TEXT, EffectScore INTEGER);
    CREATE TABLE Risicofactoren (Id INTEGER PRIMARY KEY, RisicoItemId INTEGER, Titel TEXT, Omschrijving TEXT);
    CREATE TABLE RisicofactorBeoordelingen (Id INTEGER PRIMARY KEY, RieProjectId INTEGER, CompanyId INTEGER, DepartmentId INTEGER, RisicofactorItemId INTEGER, BlootstellingScore INTEGER, WaarschijnlijkheidScore INTEGER, Relevantie INTEGER, Toelichting TEXT);
    CREATE TABLE MaatregelBeoordelingen (Id INTEGER PRIMARY KEY, RieProjectId INTEGER, ReductieScore INTEGER, KostenNiveau INTEGER, IsInPlace INTEGER, Toelichting TEXT);
    CREATE TABLE VendorPrivateData (Id INTEGER PRIMARY KEY, PrivateText TEXT);
  `);
  db.prepare('INSERT INTO RieProjecten VALUES (?,?,?,?,?,?)').run(1, 'Testproject', 'Voorbeeld BV', 'Werkplaats', 'Een contactpersoon, geen assessor', '2026-01-01 10:00:00');
  db.prepare('INSERT INTO Modules VALUES (?,?,?)').run(1, 'M1', 'Machines');
  db.prepare('INSERT INTO Vragen VALUES (?,?,?,?,?,?,?)').run(1, 1, 'M1', 'Afscherming', 'Is de afscherming intact?', 'Observeer de situatie.', 'Oorspronkelijke normverwijzing, ongewijzigd.');
  db.prepare('INSERT INTO GeselecteerdeModules VALUES (?,?,?)').run(1, 1, 1);
  db.prepare('INSERT INTO Companies VALUES (?,?,?)').run(1, 1, 'Voorbeeld BV');
  db.prepare('INSERT INTO Departments VALUES (?,?,?)').run(1, 1, 'Productie');
  db.prepare('INSERT INTO Antwoorden VALUES (?,?,?,?,?,?,?,?)').run(1, 1, 1, 1, 1, 1, 'Originele toelichting.', naiveTime ? '2026-10-06 10:00:00' : '2026-10-06T10:00:00Z');
  db.prepare('INSERT INTO Risicos VALUES (?,?,?)').run(1, 'Beknelling', 3);
  db.prepare('INSERT INTO Risicofactoren VALUES (?,?,?,?)').run(1, 1, 'Toegang tot bewegende delen', 'Oorspronkelijke factor.');
  db.prepare('INSERT INTO RisicofactorBeoordelingen VALUES (?,?,?,?,?,?,?,?,?)').run(1, 1, 1, 1, 1, 2, 3, 1, 'Oude 1–3 beoordeling.');
  db.prepare('INSERT INTO MaatregelBeoordelingen VALUES (?,?,?,?,?,?)').run(1, 1, 3, 0, 1, 'Aanwezig volgens oude beoordeling.');
  db.prepare('INSERT INTO VendorPrivateData VALUES (?,?)').run(1, 'Onbekende niet-geprojecteerde data');
  if (multiple) {
    db.prepare('INSERT INTO RieProjecten VALUES (?,?,?,?,?,?)').run(2, 'OTHER_PROJECT_PRIVATE', 'Andere organisatie', '', '', '2026-01-01 10:00:00');
    db.prepare('INSERT INTO Modules VALUES (?,?,?)').run(2, 'M2', 'OTHER_PROJECT_PRIVATE');
    db.prepare('INSERT INTO Vragen VALUES (?,?,?,?,?,?,?)').run(2, 2, 'M2', '', 'OTHER_PROJECT_PRIVATE', '', '');
    db.prepare('INSERT INTO GeselecteerdeModules VALUES (?,?,?)').run(2, 2, 2);
    db.prepare('INSERT INTO Companies VALUES (?,?,?)').run(2, 2, 'OTHER_PROJECT_PRIVATE');
    db.prepare('INSERT INTO Departments VALUES (?,?,?)').run(2, 2, 'OTHER_PROJECT_PRIVATE');
    db.prepare('INSERT INTO Antwoorden VALUES (?,?,?,?,?,?,?,?)').run(2, 2, 2, 2, 2, 0, 'OTHER_PROJECT_PRIVATE', '2026-10-06T10:00:00Z');
  }
  db.close();
  return { root, filename };
}

test('parses exact IMA scalar/list frontmatter and fails ambiguous YAML/sections', () => {
  const parsed = parseLegacyMarkdown('---\nschema: ima.action/v2\nid: action:1\nsource_ids:\n  - incident:1\n  - finding:2\nowner: \'Rol: uitvoerder\'\n---\n\n## Uitvoering\n\nExacte brontekst.\n');
  assert.deepEqual(parsed.metadata.source_ids, ['incident:1', 'finding:2']);
  assert.equal(parsed.metadata.owner, 'Rol: uitvoerder');
  assert.equal(parsed.sections.uitvoering, 'Exacte brontekst.');
  assert.throws(() => parseLegacyMarkdown('---\nid: a\nid: b\n---\nText'), /Duplicate/);
  assert.throws(() => parseLegacyMarkdown('---\nid: a\n---\n## Feit\na\n## Feit\nb'), /Duplicate/);
  assert.throws(() => parseLegacyMarkdown('---\nid: a\nnested:\n  thing: x\n---\nText'), /Unsupported/);
});

test('migrates Markdown dossier, frozen answer and evidence without inventing effectiveness', async t => {
  const { root, originalHash } = await markdownFixture(t);
  const before = await fs.readFile(path.join(root, 'rie/questions/q.md'));
  const result = await migrateMarkdown(root, { now: NOW });
  const api = await loadWorkspaceApi();
  assert.doesNotThrow(() => api.importWorkspace(result.serialized));
  assert.equal(result.workspace.name, 'Voorbeeldwerkruimte');
  assert.equal(result.workspace.dossiers.length, 1);
  assert.equal(result.workspace.dossiers[0].status, 'draft');
  assert.equal(result.workspace.answers.length, 1);
  const answer = result.workspace.answers[0];
  assert.equal(answer.choice, 'no');
  assert.equal(answer.questionSnapshot, 'Is de afscherming intact?');
  assert.equal(answer.questionSha256, result.workspace.dossiers[0].questions[0].sha256);
  assert.notEqual(answer.questionSha256, originalHash);
  assert.equal(result.workspace.evidence[0].status, 'unverified');
  assert.equal(result.workspace.observations[0].date, '2026-10-07');
  assert.match(result.workspace.observations[0].facts, /Feit:[\s\S]*Context:/);
  assert.equal(result.workspace.findings[0].status, 'open');
  assert.equal(result.workspace.actions.length, 1);
  assert.equal(result.workspace.actions[0].status, 'in_progress');
  assert.equal(result.workspace.actions[0].dossierId, result.workspace.findings[0].dossierId);
  assert.equal(result.workspace.incidents[0].actionIds[0], result.workspace.actions[0].id);
  assert.equal(result.workspace.incidents[0].potentialSeverity, 'major');
  assert.equal(result.workspace.incidents[0].reportedBy, 'Rol: medewerker');
  assert.equal(result.workspace.incidents[0].activity, 'Fictieve storingsinterventie');
  assert.equal(result.workspace.incidents[0].immediateControls, 'De machine stilgelegd.');
  assert.equal(result.workspace.incidents[0].openQuestions, 'Was energie geïsoleerd?');
  assert.equal(result.workspace.exposure[0].hoursWorked, 1200);
  assert.equal(result.workspace.scenarios.length, 0);
  assert.equal(result.workspace.investigations.length, 1);
  assert.equal(result.workspace.investigations[0].status, 'draft');
  assert.equal(result.workspace.investigations[0].whyChain[0], 'Onbevestigde hypothese.');
  assert.match(result.workspace.investigations[0].facts, /nog te toetsen/);
  assert(result.workspace.sources.some(source => source.raw?.text?.includes('ReductieScore=3')));
  assert(result.report.warnings.some(warning => warning.code === 'unsupported_record_raw_only'));
  assert(result.report.warnings.some(warning => warning.code === 'legacy_reference_unresolved'));
  assert(!result.serialized.includes('Niet echt dossierwerk'));
  assert.deepEqual(await fs.readFile(path.join(root, 'rie/questions/q.md')), before);
});

test('projects only selected exact draft BRF definitions without inventing owners, historical dates or converting free research codes', async t => {
  const { root } = await markdownFixture(t);
  const metadata = { title: 'Fictieve systeemconditie', taxonomy: 'ima-core:taxonomy:brf', version: '1.0.0', status: 'draft', parent_id: 'source:unversioned-parent' };
  const content = md('ima.taxonomy-term/v1', 'fixture:brf:01', metadata, '# Fictieve systeemconditie\n\nOorspronkelijke toepassingsgrens; nog geen causaal oordeel.');
  const sourceFile = await put(root, 'taxonomies/brf/selected.md', content);
  await put(root, 'taxonomies/brf/non-draft.md', md('ima.taxonomy-term/v1', 'fixture:brf:active', { ...metadata, status: 'active' }, '# Niet stil lokaal vastgesteld\n\nOorspronkelijke andere status.'));
  await put(root, 'taxonomies/other.md', md('ima.taxonomy-term/v1', 'fixture:other', { ...metadata, taxonomy: 'other:taxonomy' }, '# Andere taxonomie\n\nGeen bevestigde BRF.'));
  const analysisFile = path.join(root, 'analyses/a.md');
  await fs.writeFile(analysisFile, (await fs.readFile(analysisFile, 'utf8')).replace('incident_id:', 'basis_risk_factor_ids: ["fixture:brf:01", "LEGACY-FREE-CODE"]\nincident_id:'));
  const before = await fs.readFile(sourceFile);
  const result = await migrateMarkdown(root, { now: NOW });
  const api = await loadWorkspaceApi();
  assert.doesNotThrow(() => api.importWorkspace(result.serialized));
  assert.equal(result.workspace.basisRiskFactorRecords.length, 1);
  const record = result.workspace.basisRiskFactorRecords[0];
  assert.equal(record.factorId, 'fixture:brf:01');
  assert.equal(record.code, 'fixture:brf:01');
  assert.equal(record.version, '1.0.0');
  assert.equal(record.status, 'draft');
  assert.equal(record.description, 'Oorspronkelijke toepassingsgrens; nog geen causaal oordeel.');
  assert.equal(record.owner, ''); assert.equal(record.createdBy, '');
  assert.equal(record.createdAt, NOW);
  assert.match(record.changeNote, /nieuwe projectiedatum/);
  assert.match(record.sourceReference, /taxonomies\/brf\/selected\.md/);
  assert.equal(record.parentRecordId, undefined); assert.equal(record.supersedesId, undefined);
  assert.deepEqual(record.statusHistory, []);
  assert.deepEqual(result.workspace.investigations[0].basisRiskFactors, ['fixture:brf:01', 'LEGACY-FREE-CODE']);
  assert.equal(result.workspace.investigations[0].basisRiskFactorIds, undefined);
  assert.equal(result.report.counts.basisRiskFactorRecords, 1);
  assert(result.report.warnings.some(item => item.code === 'brf_parent_unversioned'));
  assert(result.report.warnings.some(item => item.code === 'brf_raw_only'));
  assert.deepEqual(await fs.readFile(sourceFile), before);
  const repeated = await migrateMarkdown(root, { now: NOW });
  assert.equal(repeated.workspace.basisRiskFactorRecords[0].id, record.id);
  await put(root, 'taxonomies/brf/duplicate.md', content);
  const ambiguous = await migrateMarkdown(root, { now: NOW });
  assert.equal(ambiguous.workspace.basisRiskFactorRecords.length, 0);
  assert(ambiguous.workspace.sources.some(source => source.raw?.text === content));
});

test('restores only known frozen answer text when current question source hash has changed', async t => {
  const { root, originalHash } = await markdownFixture(t, { changedQuestion: true });
  const result = await migrateMarkdown(root, { now: NOW });
  const frozen = result.workspace.dossiers[0].questions[0];
  assert.equal(frozen.prompt, 'Is de afscherming intact?');
  assert.equal(frozen.assessmentGuidance, '');
  assert.deepEqual(frozen.evidenceHints, []);
  assert.notEqual(frozen.sha256, originalHash);
  assert(result.report.warnings.some(warning => warning.code === 'restored_frozen_prompt'));
  assert(result.report.warnings.some(warning => warning.code === 'frozen_reference_unavailable'));
  assert(result.workspace.sources.some(source => source.raw?.metadata?.question_sha256 === originalHash));
});

test('missing assessments and unknown answer values remain raw without synthesized dossier or answer', async t => {
  const root = await temporary(t);
  await put(root, 'responses/r.md', md('ima.rie-response/v1', 'response:broken', { assessment_id: 'missing:1', answer: 'probably', responded_at: '2026-10-06T10:00:00Z' }, '## Bevroren vraag\n\nEen vraag.'));
  const result = await migrateMarkdown(root, { now: NOW });
  assert.equal(result.workspace.dossiers.length, 0);
  assert.equal(result.workspace.answers.length, 0);
  assert.equal(result.workspace.sources.filter(source => source.format !== 'ima.migration-review/v1').length, 1);
  assert(result.report.warnings.some(warning => warning.code === 'missing_assessment'));
});

test('malformed Markdown retains complete source rather than partially trusting a parser', async t => {
  const root = await temporary(t); const input = '---\nid: a\nid: b\n---\nUnieke oorspronkelijke tekst.';
  await put(root, 'broken.md', input);
  const result = await migrateMarkdown(root, { now: NOW });
  assert.equal(result.workspace.sources[0].raw.text, input);
  assert.equal(result.workspace.sources[0].format, 'legacy-markdown-unparsed');
  assert(result.report.warnings.some(warning => warning.code === 'markdown_not_projected'));
});

test('embeds the complete private review before final counting and hashes without circular output metadata', async t => {
  const { root } = await markdownFixture(t);
  const result = await migrateMarkdown(root, { now: NOW });
  const reviews = result.workspace.sources.filter(source => source.format === 'ima.migration-review/v1');
  assert.equal(reviews.length, 1);
  const review = reviews[0];
  assert.equal(review.title, 'Migratieconcept: menselijke controle vereist');
  assert.equal(review.kind, 'other'); assert.equal(review.status, 'review-required'); assert.equal(review.publication, 'private');
  assert.deepEqual(review.raw.warnings, result.report.warnings);
  assert.deepEqual(review.raw.rules, result.report.rules);
  assert.deepEqual(review.raw.counts, result.report.counts);
  assert.equal(review.raw.counts.sources, result.workspace.sources.length);
  assert.equal(review.raw.migratedAt, NOW);
  assert.equal(review.contentSha256, hash(canonicalMigrationReportJson(review.raw)));
  assert.equal(review.raw.workspaceSha256, undefined); assert.equal(review.raw.outputBytes, undefined);
  assert.equal(result.report.workspaceSha256, hash(result.serialized));
  assert.equal(result.report.outputBytes, Buffer.byteLength(result.serialized));
  assert.deepEqual(JSON.parse(result.serialized).sources.find(source => source.id === review.id), review);
  const repeated = await migrateMarkdown(root, { now: NOW });
  assert.equal(repeated.workspace.sources.find(source => source.format === review.format).id, review.id);
  assert(result.workspace.sources.some(source => source.originalSchema === 'ima.rie-risk-assessment/v1' && source.raw.text.includes('ReductieScore=3')));
});

test('rejects symlink source selection', async t => {
  const { root } = await markdownFixture(t);
  const outside = await temporary(t); await put(outside, 'external.md', 'Private unrelated data');
  await fs.symlink(path.join(outside, 'external.md'), path.join(root, 'linked.md'));
  await assert.rejects(migrateMarkdown(root), /symlink/);
});

test('preserves complete original action archives, independently inspectable manifest and roundtrip without new lifecycle events', async t => {
  const fixture = await actionArchiveFixture(t);
  const originalCurrent = await fs.readFile(path.join(fixture.root, 'actions/current.md'));
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  const [record] = historyRecords(result);
  assert.equal(historyRecords(result).length, 1);
  assert.equal(record.manifest.hashChainStatus, 'consistent');
  assert.deepEqual(record.manifest.issues, []);
  assert.deepEqual(record.manifest.missingRanges, []);
  assert.deepEqual(record.manifest.relativeDirectories, [fixture.relativeDirectory]);
  assert.equal(record.manifest.current.originalId, fixture.id);
  assert.equal(record.manifest.current.revision, 3);
  assert.equal(record.manifest.current.exactTextSha256, hash(fixture.current));
  assert.deepEqual(record.manifest.archives.map(item => item.fileRevision), [1, 2]);
  assert.equal(record.manifestSha256, hash(canonicalMigrationReportJson(record.manifest)));
  for (const [index, expected] of [fixture.first, fixture.second].entries()) {
    const reference = record.manifest.archives[index];
    const source = result.workspace.sources.find(item => item.id === reference.sourceId);
    assert.equal(source.format, 'legacy-action-revision/v1');
    assert.equal(source.raw.text, expected);
    assert.deepEqual(Buffer.from(source.raw.bytesBase64, 'base64'), Buffer.from(expected));
    assert.equal(source.contentSha256, hash(Buffer.from(expected)));
    assert.equal(reference.bytesSha256, source.contentSha256);
  }
  assert.equal(result.workspace.actions.length, 1);
  assert.equal(result.workspace.actions[0].lifecycle, undefined);
  assert.equal(result.workspace.actions[0].verifiedAt, undefined);
  assert.equal(result.workspace.actions[0].effectCheck, undefined);
  assert.equal(record.manifest.current.browserActionId, result.workspace.actions[0].id);
  assert(record.sourceIds.every(id => result.workspace.sources.some(source => source.id === id)));
  assert.equal(result.report.counts.contentRecords, 1);
  assert.equal(result.report.counts.sources, result.workspace.sources.length);
  const review = result.workspace.sources.find(source => source.format === 'ima.migration-review/v1');
  assert.deepEqual(review.raw.warnings, result.report.warnings);
  assert(review.raw.warnings.some(warning => warning.code === 'legacy_action_history_requires_review'));
  const api = await loadWorkspaceApi();
  assert.deepEqual(api.importWorkspace(result.serialized).contentRecords, result.workspace.contentRecords);
  assert.deepEqual(await fs.readFile(path.join(fixture.root, 'actions/current.md')), originalCurrent);
  const repeated = await migrateMarkdown(fixture.root, { now: NOW });
  assert.deepEqual(historyRecords(repeated), historyRecords(result));
});

test('original action hash chain uses decoded UTF-8 BOM and retained CRLF, separately from bytes and normalized Markdown', async t => {
  const fixture = await actionArchiveFixture(t, { crlf: true, bom: true });
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  const manifest = historyRecords(result)[0].manifest;
  assert.equal(manifest.hashChainStatus, 'consistent');
  const first = manifest.archives[0];
  const raw = result.workspace.sources.find(source => source.id === first.sourceId);
  assert.equal(first.bytesSha256, hash(Buffer.from(fixture.first)));
  assert.equal(first.exactTextSha256, hash(fixture.first.slice(1)));
  assert.notEqual(first.bytesSha256, first.exactTextSha256);
  assert.notEqual(first.exactTextSha256, first.normalizedDocumentSha256);
  assert.equal(first.normalizedDocumentSha256, hash(fixture.first.slice(1).replaceAll('\r\n', '\n')));
  assert.equal(raw.raw.text, fixture.first.slice(1));
  assert.equal(Buffer.from(raw.raw.bytesBase64, 'base64').toString('utf8'), fixture.first);
  assert.equal(manifest.current.exactTextSha256, actionSourceTextHash(fixture.current));
  assert.notEqual(manifest.current.bytesSha256, manifest.current.exactTextSha256);
  await put(fixture.root, fixture.relativeDirectory + '/revision-3.md', fixture.current);
  const prepared = await migrateMarkdown(fixture.root, { now: NOW });
  assert.equal(historyRecords(prepared)[0].manifest.hashChainStatus, 'consistent');
  assert(!prepared.report.warnings.some(warning => warning.code === 'legacy_action_history_prepared_revision_changed'));
});

test('UTF-16LE/BE BOM archives preserve original bytes and compare the original decoded UTF-8 source hash', async t => {
  for (const encoding of ['utf-16le', 'utf-16be']) {
    const fixture = await actionArchiveFixture(t);
    let payload = Buffer.from(fixture.first, 'utf16le');
    if (encoding === 'utf-16be') payload = Buffer.from(payload).swap16();
    payload = Buffer.concat([Buffer.from(encoding === 'utf-16le' ? [0xff, 0xfe] : [0xfe, 0xff]), payload]);
    await put(fixture.root, fixture.relativeDirectory + '/revision-1.md', payload);
    const result = await migrateMarkdown(fixture.root, { now: NOW });
    const manifest = historyRecords(result)[0].manifest;
    assert.equal(manifest.hashChainStatus, 'consistent');
    const first = manifest.archives[0];
    assert.equal(first.encoding, encoding);
    assert.equal(first.exactTextSha256, hash(fixture.first));
    assert.equal(first.bytesSha256, hash(payload));
    assert.deepEqual(Buffer.from(result.workspace.sources.find(source => source.id === first.sourceId).raw.bytesBase64, 'base64'), payload);
  }
});

test('changed archived text reports a broken source hash instead of repairing a predecessor', async t => {
  const fixture = await actionArchiveFixture(t);
  const changed = fixture.first.replace('oorspronkelijke inhoud', 'GEWIJZIGDE inhoud');
  await put(fixture.root, fixture.relativeDirectory + '/revision-1.md', changed);
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  const manifest = historyRecords(result)[0].manifest;
  assert.equal(manifest.hashChainStatus, 'issues');
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_hash_mismatch'));
  assert.equal(manifest.archives[0].exactTextSha256, hash(changed));
  assert.equal(manifest.archives[1].previousRevisionSha256, hash(fixture.first));
  assert.equal(result.workspace.actions[0].lifecycle, undefined);
});

test('missing one or all original archive revisions stays explicit and compact without invented historical records', async t => {
  const fixture = await actionArchiveFixture(t);
  await fs.unlink(path.join(fixture.root, fixture.relativeDirectory, 'revision-1.md'));
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  let manifest = historyRecords(result)[0].manifest;
  assert.deepEqual(manifest.missingRanges, [{ from: 1, through: 1 }]);
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_predecessor_unconfirmed'));
  assert.equal(manifest.archives.length, 1);
  await fs.rm(path.join(fixture.root, '.history'), { recursive: true });
  const missing = await migrateMarkdown(fixture.root, { now: NOW });
  manifest = historyRecords(missing)[0].manifest;
  assert.deepEqual(manifest.missingRanges, [{ from: 1, through: 2 }]);
  assert.deepEqual(manifest.archives, []);
  assert.deepEqual(manifest.relativeDirectories, []);
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_missing_revision'));
  assert.equal(missing.workspace.sources.filter(source => source.format === 'legacy-action-revision/v1').length, 0);
});

test('duplicate numeric filenames are all preserved and never become a selected predecessor', async t => {
  const fixture = await actionArchiveFixture(t);
  await put(fixture.root, fixture.relativeDirectory + '/revision-01.md', fixture.first + '\nAndere versie.');
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  const manifest = historyRecords(result)[0].manifest;
  assert.equal(manifest.archives.length, 3);
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_duplicate_revision'));
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_predecessor_unconfirmed'));
  assert.equal(result.workspace.actions.length, 1);
});

test('future and divergent prepared current revisions report rollback/fork evidence without changing the actual current action', async t => {
  const fixture = await actionArchiveFixture(t);
  await put(fixture.root, fixture.relativeDirectory + '/revision-3.md', fixture.current.replace('Fictieve test.', 'Andere test.'));
  await put(fixture.root, fixture.relativeDirectory + '/revision-4.md', actionSource(4, hash(fixture.current)));
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  const manifest = historyRecords(result)[0].manifest;
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_future_revision'));
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_prepared_revision_changed'));
  assert.equal(manifest.current.exactTextSha256, hash(fixture.current));
  assert.equal(result.workspace.sources.filter(source => source.format === 'legacy-action-revision/v1').length, 4);
  assert(result.workspace.actions[0].notes.includes('Fictieve test.'));
  assert(!result.workspace.actions[0].notes.includes('Andere test.'));
});

test('archive ID/revision mismatch, malformed filename and unsupported schema retain precise raw evidence', async t => {
  const fixture = await actionArchiveFixture(t);
  await put(fixture.root, fixture.relativeDirectory + '/revision-2.md', actionSource(4, hash(fixture.first), { id: 'action:OTHER' }));
  await put(fixture.root, fixture.relativeDirectory + '/revision-not-a-number.md', md('vendor.action/v3', 'foreign:1', { revision: 1 }, '# Geen ondersteund actieschema'));
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  const manifest = historyRecords(result)[0].manifest;
  for (const code of ['legacy_action_history_id_mismatch', 'legacy_action_history_revision_mismatch', 'legacy_action_history_filename_invalid', 'legacy_action_history_record_unconfirmed'])
    assert(manifest.issues.some(issue => issue.code === code), code);
  assert.equal(manifest.archives.length, 3);
  assert(manifest.archives.some(archive => archive.originalId === 'action:OTHER' && archive.revision === 4 && archive.fileRevision === 2));
  assert(result.workspace.sources.some(source => source.originalSchema === 'vendor.action/v3' && source.raw.text.includes('Geen ondersteund')));
});

test('unsupported archive YAML and unknown encoding stay byte-exact without false source-parser or hash-chain validation', async t => {
  const fixture = await actionArchiveFixture(t);
  const yaml = '---\nschema: ima.action/v2\nid: action:archive-test\nrevision: 1\nnested:\n  unknown: value\n---\nUnieke inhoud.';
  await put(fixture.root, fixture.relativeDirectory + '/revision-1.md', yaml);
  const encoded = Buffer.from([0xff, 0xfe, 0, 0, 0x41, 0, 0, 0]); // Actual UTF-32 BOM: deliberately unsupported dialect.
  await put(fixture.root, fixture.relativeDirectory + '/revision-2.md', encoded);
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  const manifest = historyRecords(result)[0].manifest;
  assert.notEqual(manifest.hashChainStatus, 'consistent');
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_parser_unconfirmed'));
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_encoding_unconfirmed'));
  const sources = result.workspace.sources.filter(source => source.format === 'legacy-action-revision/v1');
  assert(sources.some(source => source.raw.text === yaml && source.contentSha256 === hash(yaml)));
  assert(sources.some(source => Buffer.from(source.raw.bytesBase64, 'base64').equals(encoded) && source.raw.text === undefined));
  assert.equal(manifest.archives[1].exactTextSha256, null);
});

test('only known immediate action archives enter hidden selection; unrelated hidden trees and archive subdirectories remain ignored', async t => {
  const fixture = await actionArchiveFixture(t);
  const outside = await temporary(t);
  await put(outside, 'secret.md', 'UNRELATED_PRIVATE_SENTINEL');
  await fs.symlink(outside, path.join(fixture.root, '.unrelated-hidden'));
  await fs.symlink(outside, path.join(fixture.root, '.history/private'));
  await fs.symlink(outside, path.join(fixture.root, '.history/actions/.unknown-hidden'));
  await put(fixture.root, fixture.relativeDirectory + '/nested/revision-8.md', 'UNRELATED_PRIVATE_SENTINEL');
  await put(fixture.root, fixture.relativeDirectory + '/readme.md', 'UNRELATED_PRIVATE_SENTINEL');
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  assert.equal(historyRecords(result)[0].manifest.archives.length, 2);
  assert(!result.serialized.includes('UNRELATED_PRIVATE_SENTINEL'));
});

test('known history directories and revision files reject symlink traversal at every allowed boundary', async t => {
  for (const boundary of ['.history', '.history/actions', '.history/actions/' + actionArchiveStem('action:archive-test'), '.history/actions/' + actionArchiveStem('action:archive-test') + '/revision-1.md']) {
    const fixture = await actionArchiveFixture(t);
    const outside = await temporary(t);
    const target = path.join(fixture.root, boundary);
    await fs.rm(target, { recursive: true, force: true });
    await fs.symlink(outside, target);
    await assert.rejects(migrateMarkdown(fixture.root, { now: NOW }), /symlink/);
  }
});

test('a hidden archive stem is allowed only when computed from an actually selected original action ID', async t => {
  const root = await temporary(t);
  const id = '.action:known-hidden-stem';
  const first = actionSource(1, '', { id });
  const current = actionSource(2, actionSourceTextHash(first), { id });
  const directory = '.history/actions/' + actionArchiveStem(id);
  await put(root, 'actions/current.md', current);
  await put(root, directory + '/revision-1.md', first);
  await put(root, '.history/actions/.unknown-hidden/revision-1.md', 'UNRELATED_PRIVATE_SENTINEL');
  const result = await migrateMarkdown(root, { now: NOW });
  assert.equal(historyRecords(result).length, 1);
  assert.equal(historyRecords(result)[0].manifest.hashChainStatus, 'consistent');
  assert.deepEqual(historyRecords(result)[0].manifest.relativeDirectories, [directory]);
  assert(!result.serialized.includes('UNRELATED_PRIVATE_SENTINEL'));
  await fs.rm(path.join(root, directory), { recursive: true });
  const outside = await temporary(t);
  await fs.symlink(outside, path.join(root, directory));
  await assert.rejects(migrateMarkdown(root, { now: NOW }), /symlink/);
});

test('unmatched or duplicate-current archive folders are preserved without an invented unique current-action association', async t => {
  const fixture = await actionArchiveFixture(t);
  await fs.rename(path.join(fixture.root, fixture.relativeDirectory), path.join(fixture.root, '.history/actions/' + fixture.id));
  let result = await migrateMarkdown(fixture.root, { now: NOW });
  assert.equal(historyRecords(result).length, 2);
  const orphan = historyRecords(result).find(record => record.manifest.current === null);
  assert.equal(orphan.manifest.archives.length, 2);
  assert(orphan.manifest.issues.some(issue => issue.code === 'legacy_action_history_current_missing'));
  await fs.rename(path.join(fixture.root, '.history/actions/' + fixture.id), path.join(fixture.root, fixture.relativeDirectory));
  await put(fixture.root, 'actions/duplicate-current.md', fixture.current);
  result = await migrateMarkdown(fixture.root, { now: NOW });
  const ambiguous = historyRecords(result).find(record => record.manifest.current === null);
  assert(ambiguous.manifest.issues.some(issue => issue.code === 'legacy_action_history_current_ambiguous'));
  assert.equal(ambiguous.manifest.archives.length, 2);
});

test('actual v1 missing-revision fallback stays distinguishable from absent v2 or unusable original revisions', async t => {
  const root = await temporary(t);
  const id = 'action:legacy-default';
  const text = actionSource(1, '', { id, schema: 'ima.action/v1' }).replace('revision: 1\n', '');
  const directory = '.history/actions/' + actionArchiveStem(id);
  await put(root, 'actions/current.md', text);
  await put(root, directory + '/revision-1.md', text);
  let result = await migrateMarkdown(root, { now: NOW });
  let manifest = historyRecords(result)[0].manifest;
  assert.equal(manifest.current.parsedRevision, null);
  assert.equal(manifest.current.revision, 1);
  assert.equal(manifest.hashChainStatus, 'consistent');
  await put(root, 'actions/current.md', text.replace('ima.action/v1', 'ima.action/v2'));
  result = await migrateMarkdown(root, { now: NOW });
  manifest = historyRecords(result)[0].manifest;
  assert.equal(manifest.current.revision, null);
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_current_unconfirmed'));
  await put(root, 'actions/current.md', text.replace('status: "planned"', 'revision: true\nstatus: "planned"'));
  result = await migrateMarkdown(root, { now: NOW });
  assert.equal(historyRecords(result)[0].manifest.current.revision, null);
});

test('source revision lexemes prevent decimal coercion from falsely validating current and prepared legacy revisions', async t => {
  const root = await temporary(t);
  const id = 'action:decimal-revision';
  const text = actionSource(1, '', { id }).replace('revision: 1\n', 'revision: 1.0\n');
  await put(root, 'actions/current.md', text);
  await put(root, '.history/actions/' + actionArchiveStem(id) + '/revision-1.md', text);
  const result = await migrateMarkdown(root, { now: NOW });
  const manifest = historyRecords(result)[0].manifest;
  assert.notEqual(manifest.hashChainStatus, 'consistent');
  for (const entry of [manifest.current, ...manifest.archives]) {
    assert.equal(entry.parsedRevision, 1);
    assert.equal(entry.revisionLexeme, '1.0');
    assert.equal(entry.revision, null);
    assert.equal(result.workspace.sources.find(source => source.id === entry.sourceId).raw.text, text);
  }
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_current_unconfirmed'));
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_record_unconfirmed'));
});

test('original Integer-compatible quoted and signed leading-zero revision scalars remain valid without erasing their source spelling', async t => {
  for (const lexeme of ['"1"', '+0001', "' 1 '"]) {
    const root = await temporary(t);
    const id = 'action:integer-spelling';
    const text = actionSource(1, '', { id }).replace('revision: 1\n', 'revision: ' + lexeme + '\n');
    await put(root, 'actions/current.md', text);
    await put(root, '.history/actions/' + actionArchiveStem(id) + '/revision-1.md', text);
    const result = await migrateMarkdown(root, { now: NOW });
    const manifest = historyRecords(result)[0].manifest;
    assert.equal(manifest.hashChainStatus, 'consistent', lexeme);
    assert.equal(manifest.current.revision, 1);
    assert.equal(manifest.current.revisionLexeme, lexeme);
    assert.equal(manifest.archives[0].revision, 1);
  }
});

test('numeric or boolean previous-hash scalars remain actual nonempty source text rather than fabricated absence', async t => {
  for (const lexeme of ['12345', 'true']) {
    const root = await temporary(t);
    const id = 'action:previous-scalar';
    const text = actionSource(1, '', { id }).replace('previous_revision_sha256: ""\n', 'previous_revision_sha256: ' + lexeme + '\n');
    await put(root, 'actions/current.md', text);
    await put(root, '.history/actions/' + actionArchiveStem(id) + '/revision-1.md', text);
    const result = await migrateMarkdown(root, { now: NOW });
    const manifest = historyRecords(result)[0].manifest;
    assert.notEqual(manifest.hashChainStatus, 'consistent');
    for (const entry of [manifest.current, ...manifest.archives]) {
      assert.equal(entry.previousRevisionSha256, lexeme);
      assert.equal(entry.previousRevisionSha256Lexeme, lexeme);
      assert.equal(entry.parsedPreviousRevisionSha256, lexeme === 'true' ? true : 12345);
    }
    assert.equal(manifest.issues.filter(issue => issue.code === 'legacy_action_history_initial_hash_invalid').length, 2);
  }
});

test('original null previous-hash scalars stay empty while unsupported sequence values remain explicitly unconfirmed', async t => {
  for (const lexeme of ['null', '~', '"null"', '["unexpected"]']) {
    const root = await temporary(t);
    const id = 'action:previous-null';
    const text = actionSource(1, '', { id }).replace('previous_revision_sha256: ""\n', 'previous_revision_sha256: ' + lexeme + '\n');
    await put(root, 'actions/current.md', text);
    await put(root, '.history/actions/' + actionArchiveStem(id) + '/revision-1.md', text);
    const result = await migrateMarkdown(root, { now: NOW });
    const manifest = historyRecords(result)[0].manifest;
    if (lexeme.startsWith('[')) {
      assert.notEqual(manifest.hashChainStatus, 'consistent');
      assert.equal(manifest.current.previousRevisionSha256, null);
      assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_predecessor_scalar_unconfirmed'));
    } else {
      assert.equal(manifest.hashChainStatus, 'consistent', lexeme);
      assert.equal(manifest.current.previousRevisionSha256, '');
    }
    assert.equal(manifest.current.previousRevisionSha256Lexeme, lexeme);
  }
});

test('different Unicode ID spellings never inherit a false JS lowercase identity claim; exact Unicode and ASCII identities remain checkable', async t => {
  for (const [id, archiveId, expected] of [['action:İ', 'action:i\u0307', 'unconfirmed'], ['action:σ', 'action:ς', 'unconfirmed'],
    ['action:σ', 'action:σ', 'consistent'], ['action:ASCII', 'ACTION:ascii', 'consistent']]) {
    const root = await temporary(t);
    const first = actionSource(1, '', { id: archiveId });
    const current = actionSource(2, actionSourceTextHash(first), { id });
    await put(root, 'actions/current.md', current);
    await put(root, '.history/actions/' + actionArchiveStem(id) + '/revision-1.md', first);
    const result = await migrateMarkdown(root, { now: NOW });
    const manifest = historyRecords(result)[0].manifest;
    assert.equal(manifest.current.originalId, id);
    assert.equal(manifest.archives[0].originalId, archiveId);
    if (expected === 'unconfirmed') {
      assert.notEqual(manifest.hashChainStatus, 'consistent');
      assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_id_comparison_unconfirmed'));
      assert(!manifest.issues.some(issue => issue.code === 'legacy_action_history_id_mismatch'));
    } else assert.equal(manifest.hashChainStatus, 'consistent');
  }
});

test('archive selection counts toward the existing source-file limit rather than bypassing it', async t => {
  const root = await temporary(t);
  await put(root, 'actions/current.md', actionSource(1, ''));
  const directory = '.history/actions/' + actionArchiveStem('action:archive-test');
  await fs.mkdir(path.join(root, directory), { recursive: true });
  await Promise.all(Array.from({ length: 1000 }, (_, index) => put(root, directory + '/revision-' + (index + 1) + '.md', 'x')));
  await assert.rejects(migrateMarkdown(root, { now: NOW }), /1\.000 Markdown-records/);
});

test('large missing legacy ranges remain compact and first-revision predecessor declarations remain invalid', async t => {
  const fixture = await actionArchiveFixture(t);
  await put(fixture.root, 'actions/current.md', actionSource(1_000_000, hash(fixture.second)));
  await put(fixture.root, fixture.relativeDirectory + '/revision-1.md', actionSource(1, 'f'.repeat(64)));
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  const manifest = historyRecords(result)[0].manifest;
  assert.deepEqual(manifest.missingRanges, [{ from: 3, through: 999_999 }]);
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_initial_hash_invalid'));
  assert(manifest.issues.some(issue => issue.code === 'legacy_action_history_predecessor_unconfirmed'));
  assert.equal(manifest.archives.length, 2);
  assert(Buffer.byteLength(JSON.stringify(manifest)) < 10_000);
});

test('unsafe and unsupported evidence references stay raw without opening an outside file', async t => {
  const { root } = await markdownFixture(t);
  const filename = path.join(root, 'rie/evidence/e.md');
  const source = await fs.readFile(filename, 'utf8');
  await fs.writeFile(filename, source.replace('relative_path: "attachments/inspection.txt"', 'relative_path: "../../unrelated-private.txt"'));
  const unsafe = await migrateMarkdown(root, { now: NOW });
  assert.equal(unsafe.workspace.evidence.length, 0);
  assert(unsafe.report.warnings.some(warning => warning.code === 'unsafe_attachment_reference'));
  assert.equal(unsafe.workspace.answers[0].evidenceIds.length, 0);
  await fs.writeFile(filename, source.replace('relative_path: "attachments/inspection.txt"', 'source_uri: "file:///unrelated-private.txt"'));
  const nonHttp = await migrateMarkdown(root, { now: NOW });
  assert.equal(nonHttp.workspace.evidence.length, 0);
  assert(nonHttp.report.warnings.some(warning => warning.code === 'evidence_reference_unsupported'));
});

test('contradictory responses for one frozen question remain raw rather than choosing one', async t => {
  const { root } = await markdownFixture(t);
  const original = await fs.readFile(path.join(root, 'rie/responses/r.md'), 'utf8');
  await put(root, 'rie/responses/r2.md', original.replace('id: response:1', 'id: response:2').replace('answer: "no"', 'answer: "yes"'));
  const result = await migrateMarkdown(root, { now: NOW });
  assert.equal(result.workspace.answers.length, 0);
  assert.equal(result.workspace.sources.filter(source => source.originalSchema === 'ima.rie-response/v1').length, 2);
  assert(result.report.warnings.some(warning => warning.code === 'response_pair_ambiguous'));
});

test('incomplete draft assessment preserves empty unknown scope and assessor without fabricated text', async t => {
  const root = await temporary(t);
  await put(root, 'rie/assessments/a.md', md('ima.rie-assessment/v1', 'assessment:1', { title: 'Conceptdossier', assessor: '', status: 'draft', question_refs: [] }, '# Conceptdossier\n\n## Doel en reikwijdte\n'));
  const result = await migrateMarkdown(root, { now: NOW });
  assert.equal(result.workspace.dossiers[0].scope, '');
  assert.equal(result.workspace.dossiers[0].assessor, '');
  assert.equal(result.workspace.dossiers[0].status, 'draft');
  assert.equal(result.report.warnings.filter(warning => warning.code === 'dossier_unknown_metadata').length, 2);
});

test('SQLite migration uses a disposable read-only copy and preserves ratings without Kinney conversion', async t => {
  const { root, filename } = await sqliteFixture(t);
  const before = await fs.readFile(filename); const filesBefore = await fs.readdir(root);
  const result = await migrateSqlite(filename, { now: NOW });
  assert.deepEqual(await fs.readFile(filename), before);
  assert.deepEqual(await fs.readdir(root), filesBefore);
  assert.equal(result.workspace.answers.length, 1);
  assert.equal(result.workspace.answers[0].choice, 'no');
  assert.equal(result.workspace.scenarios.length, 0);
  assert.equal(result.workspace.findings.length, 1);
  assert.equal(result.workspace.findings[0].scenarioId, undefined);
  assert.equal(result.workspace.organisations[0].name, 'Voorbeeld BV');
  assert.equal(result.workspace.sites.length, 0);
  assert.equal(result.workspace.departments.length, 1);
  assert.equal(result.workspace.departments[0].name, 'Productie');
  assert.equal(result.workspace.departments[0].organisationId, result.workspace.organisations[0].id);
  assert.equal(result.workspace.departments[0].siteId, undefined);
  const answerDossier = result.workspace.dossiers.find(dossier => dossier.id === result.workspace.answers[0].dossierId);
  assert.deepEqual(answerDossier.departmentIds, [result.workspace.departments[0].id]);
  assert.equal(answerDossier.organisationId, result.workspace.organisations[0].id);
  assert.equal(result.workspace.dossiers[0].assessor, '');
  assert.notEqual(result.workspace.dossiers[0].assessor, 'Een contactpersoon, geen assessor');
  assert(result.workspace.sources.some(source => source.raw?.table === 'MaatregelBeoordelingen' && source.raw.row.ReductieScore === 3 && source.raw.row.IsInPlace === 1));
  assert.equal(result.workspace.dossiers[0].questions[0].legalReferences, 'Oorspronkelijke normverwijzing, ongewijzigd.');
  assert(result.report.warnings.some(warning => warning.code === 'legacy_control_raw_only'));
  assert(result.report.warnings.some(warning => warning.code === 'unknown_table'));
});

test('SQLite uses the real department-company relation when answer CompanyId is absent and detects equivalent duplicate scopes', async t => {
  const { filename } = await sqliteFixture(t);
  const database = new DatabaseSync(filename);
  database.exec('UPDATE Antwoorden SET CompanyId = NULL WHERE Id = 1');
  database.close();
  const result = await migrateSqlite(filename, { now: NOW });
  assert.equal(result.workspace.answers.length, 1);
  const department = result.workspace.departments[0];
  const dossier = result.workspace.dossiers.find(record => record.id === result.workspace.answers[0].dossierId);
  assert.deepEqual(dossier.departmentIds, [department.id]);
  assert.equal(dossier.organisationId, department.organisationId);
  assert.equal(result.workspace.sites.length, 0);
  assert(result.workspace.sources.some(source => source.raw?.table === 'Antwoorden' && source.raw.row.CompanyId === null));

  const duplicate = new DatabaseSync(filename);
  duplicate.prepare('INSERT INTO Antwoorden VALUES (?,?,?,?,?,?,?,?)').run(2, 1, 1, 1, 1, 0, 'Tegenstrijdig antwoord binnen dezelfde werkelijke scope', '2026-10-07T10:00:00Z');
  duplicate.close();
  const ambiguous = await migrateSqlite(filename, { now: NOW });
  assert.equal(ambiguous.workspace.answers.length, 0);
  assert.equal(ambiguous.workspace.sources.filter(source => source.raw?.table === 'Antwoorden').length, 2);
  assert(ambiguous.report.warnings.some(warning => warning.code === 'sqlite_answer_pair_ambiguous'));
});

test('SQLite never chooses a department organisation over a contradictory explicit company relationship', async t => {
  const { filename } = await sqliteFixture(t);
  const database = new DatabaseSync(filename);
  database.prepare('INSERT INTO Companies VALUES (?,?,?)').run(2, 1, 'Andere echte organisatie');
  database.exec('UPDATE Antwoorden SET CompanyId = 2 WHERE Id = 1');
  database.close();
  const result = await migrateSqlite(filename, { now: NOW });
  assert.equal(result.workspace.answers.length, 0);
  assert.equal(result.workspace.sites.length, 0);
  assert.equal(result.workspace.departments.length, 1);
  assert.equal(result.workspace.organisations.find(record => record.id === result.workspace.departments[0].organisationId).name, 'Voorbeeld BV');
  assert(result.workspace.sources.some(source => source.raw?.table === 'Antwoorden' && source.raw.row.CompanyId === 2));
  assert(result.report.warnings.some(warning => warning.code === 'sqlite_scope_conflict'));
});

test('SQLite keeps an unnamed organisation and its department raw without fabricating a usable parent', async t => {
  const { filename } = await sqliteFixture(t);
  const database = new DatabaseSync(filename);
  database.exec("UPDATE Companies SET Name = '' WHERE Id = 1");
  database.close();
  const result = await migrateSqlite(filename, { now: NOW });
  assert.equal(result.workspace.departments.length, 0);
  assert.equal(result.workspace.sites.length, 0);
  assert(result.workspace.sources.some(source => source.raw?.table === 'Departments' && source.raw.row.CompanyId === 1));
  assert(result.report.warnings.some(warning => warning.code === 'department_raw_only'));
});

test('SQLite unknown timestamp zones stay raw unless an explicit UTC assumption was selected', async t => {
  const { filename } = await sqliteFixture(t, { naiveTime: true });
  const conservative = await migrateSqlite(filename, { now: NOW });
  assert.equal(conservative.workspace.answers.length, 0);
  assert(conservative.workspace.sources.some(source => source.raw?.table === 'Antwoorden'));
  const assumed = await migrateSqlite(filename, { now: NOW, assumeUtc: true });
  assert.equal(assumed.workspace.answers.length, 1);
  assert.equal(assumed.workspace.answers[0].answeredAt, '2026-10-06T10:00:00.000Z');
  assert(assumed.report.warnings.some(warning => warning.code === 'assumed_utc'));
  const strictReview = conservative.workspace.sources.find(source => source.format === 'ima.migration-review/v1');
  const utcReview = assumed.workspace.sources.find(source => source.format === 'ima.migration-review/v1');
  assert.equal(strictReview.raw.warnings.filter(warning => warning.code === 'assumed_utc').length, 0);
  assert.equal(utcReview.raw.warnings.filter(warning => warning.code === 'assumed_utc').length, assumed.report.warnings.filter(warning => warning.code === 'assumed_utc').length);
  assert.equal(strictReview.raw.counts.answers, 0); assert.equal(utcReview.raw.counts.answers, 1);
  for (const result of [conservative, assumed]) {
    const review = result.workspace.sources.find(source => source.format === 'ima.migration-review/v1');
    assert.deepEqual(review.raw.warnings, result.report.warnings);
    assert.equal(review.raw.counts.sources, result.workspace.sources.length);
    assert.equal(review.raw.warnings.filter(warning => warning.code === 'sqlite_question_not_historically_frozen').length, result.workspace.answers.length);
    assert(review.raw.warnings.some(warning => warning.code === 'legacy_rating_not_kinney'));
    assert(review.raw.warnings.some(warning => warning.code === 'legacy_control_raw_only'));
  }
});

test('duplicate SQLite answers in one scope remain raw without latest-answer guessing', async t => {
  const { filename } = await sqliteFixture(t);
  const database = new DatabaseSync(filename);
  database.prepare('INSERT INTO Antwoorden VALUES (?,?,?,?,?,?,?,?)').run(2, 1, 1, 1, 1, 0, 'Conflicting response', '2026-10-07T10:00:00Z');
  database.close();
  const result = await migrateSqlite(filename, { now: NOW });
  assert.equal(result.workspace.answers.length, 0);
  assert.equal(result.workspace.sources.filter(source => source.raw?.table === 'Antwoorden').length, 2);
  assert(result.report.warnings.some(warning => warning.code === 'sqlite_answer_pair_ambiguous'));
});

test('multiple SQLite projects require selection and exclude other project data', async t => {
  const { filename } = await sqliteFixture(t, { multiple: true });
  await assert.rejects(migrateSqlite(filename), /Meerdere projecten/);
  const result = await migrateSqlite(filename, { projectId: 1, now: NOW });
  assert(!result.serialized.includes('OTHER_PROJECT_PRIVATE'));
  assert.equal(result.report.projectId, 1);
  await assert.rejects(migrateSqlite(filename, { projectId: 999 }), /bestaat niet/);
});

test('nonempty WAL prevents partial export and preserves all original files', async t => {
  const { filename } = await sqliteFixture(t);
  const wal = Buffer.from('Pending WAL fixture'); await fs.writeFile(`${filename}-wal`, wal);
  await assert.rejects(migrateSqlite(filename), /WAL-bestand/);
  assert.deepEqual(await fs.readFile(`${filename}-wal`), wal);
});

test('private outputs are create-only; public destinations and symlink parents are rejected', async t => {
  const root = await temporary(t); await put(root, '.gitignore', 'private-data/\n');
  const legacy = path.join(root, 'legacy'); await put(legacy, 'source.md', md('vendor.record/v1', 'vendor:1', { title: 'Raw bron' }, '# Raw bron'));
  const result = await migrateMarkdown(legacy, { now: NOW });
  const output = path.join(root, 'private-data/workspace.json');
  const saved = await writeMigrationOutput(result, output, { root });
  assert.equal(await fs.readFile(output, 'utf8'), result.serialized);
  assert.equal(JSON.parse(await fs.readFile(saved.reportPath, 'utf8')).schema, 'ima.migration-report/v1');
  await assert.rejects(writeMigrationOutput(result, output, { root }), /EEXIST/);
  assert.equal(await fs.readFile(output, 'utf8'), result.serialized);
  await assert.rejects(writeMigrationOutput(result, path.join(root, 'web/public/unsafe.json'), { root }), /private-data/);
  const unrelated = await temporary(t); await fs.symlink(unrelated, path.join(root, 'private-data/link'));
  await assert.rejects(writeMigrationOutput(result, path.join(root, 'private-data/link/workspace.json'), { root }), /symlink/);
});

test('existing report prevents export and never overwrites the previous report', async t => {
  const root = await temporary(t); await put(root, '.gitignore', 'private-data/\n');
  const legacy = path.join(root, 'legacy'); await put(legacy, 'source.md', md('vendor.record/v1', 'vendor:1', {}, '# Bron'));
  const result = await migrateMarkdown(legacy, { now: NOW });
  const report = await put(root, 'private-data/workspace.migration-report.json', 'old report');
  const output = path.join(root, 'private-data/workspace.json');
  await assert.rejects(writeMigrationOutput(result, output, { root }), /EEXIST/);
  assert.equal(await fs.readFile(report, 'utf8'), 'old report');
  await assert.rejects(fs.stat(output), /ENOENT/);
});

test('credential-bearing legacy content is not silently exported and source remains unchanged', async t => {
  const root = await temporary(t); const token = `github_pat_${'x'.repeat(60)}`;
  const source = await put(root, 'secret.md', md('vendor.record/v1', 'vendor:secret', {}, `# Bron\n${token}`));
  const before = await fs.readFile(source);
  await assert.rejects(migrateMarkdown(root, { now: NOW }), error => error.name === 'WorkspaceValidationError' && !error.message.includes(token));
  assert.deepEqual(await fs.readFile(source), before);
});

test('CLI help is available without opening any private source or writing output', () => {
  const output = execFileSync(process.execPath, ['scripts/migrate-workspace.mjs', '--help'], { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' });
  assert.match(output, /--markdown/); assert.match(output, /--sqlite/); assert.match(output, /No uploads/);
});

test('SQLite projects retain all thirteen meaningful context fields and unknown original timestamps', async t => {
  const { filename } = await sqliteFixture(t);
  const api = await loadWorkspaceApi();
  const db = new DatabaseSync(filename);
  const originalKeys = ['ActiviteitenEnProcessen', 'WerkplekkenEnSituaties', 'Personeelsopbouw', 'WerkEnRoostersystematiek', 'ArbeidsmiddelenEnInstallaties', 'GevaarlijkeStoffenEnBiologischeAgentia', 'FysiekeBelasting', 'PsychosocialeArbeidsbelasting', 'Verzuimgegevens', 'OngevallenEnIncidentgegevens', 'EerdereRieEnOpenstaandeActies', 'BhvEnNoodorganisatie', 'ToegepasteWetEnRegelgeving'];
  for (const originalKey of originalKeys) {
    db.exec(`ALTER TABLE RieProjecten ADD COLUMN ${originalKey} TEXT;`);
    db.prepare(`UPDATE RieProjecten SET ${originalKey}=? WHERE Id=1`).run(`Exacte inhoud ${originalKey}\nTweede regel.`);
  }
  db.exec('ALTER TABLE RieProjecten ADD COLUMN ContactEmail TEXT; ALTER TABLE RieProjecten ADD COLUMN UpdatedAt TEXT;');
  db.prepare('UPDATE RieProjecten SET ContactEmail=?, UpdatedAt=? WHERE Id=1').run('contact@example.invalid', '2026-10-06T13:00:00+02:00');
  db.close();
  const before = await fs.readFile(filename);
  const result = await migrateSqlite(filename, { now: NOW });
  const context = result.workspace.projectContexts[0];
  assert.equal(context.title, 'Testproject');
  assert.equal(context.contactName, 'Een contactpersoon, geen assessor');
  assert.equal(context.contactEmail, 'contact@example.invalid');
  assert.equal(context.locationText, 'Werkplaats');
  assert.equal(context.createdAt, undefined);
  assert.equal(context.updatedAt, '2026-10-06T11:00:00.000Z');
  assert.equal(result.workspace.sites.length, 0);
  assert.deepEqual(context.details, {
    activities: 'Exacte inhoud ActiviteitenEnProcessen\nTweede regel.',
    workplaces: 'Exacte inhoud WerkplekkenEnSituaties\nTweede regel.',
    workforce: 'Exacte inhoud Personeelsopbouw\nTweede regel.',
    schedules: 'Exacte inhoud WerkEnRoostersystematiek\nTweede regel.',
    equipment: 'Exacte inhoud ArbeidsmiddelenEnInstallaties\nTweede regel.',
    substances: 'Exacte inhoud GevaarlijkeStoffenEnBiologischeAgentia\nTweede regel.',
    physicalLoad: 'Exacte inhoud FysiekeBelasting\nTweede regel.',
    psychosocialLoad: 'Exacte inhoud PsychosocialeArbeidsbelasting\nTweede regel.',
    absence: 'Exacte inhoud Verzuimgegevens\nTweede regel.',
    incidents: 'Exacte inhoud OngevallenEnIncidentgegevens\nTweede regel.',
    previousAssessments: 'Exacte inhoud EerdereRieEnOpenstaandeActies\nTweede regel.',
    emergencyOrganisation: 'Exacte inhoud BhvEnNoodorganisatie\nTweede regel.',
    regulations: 'Exacte inhoud ToegepasteWetEnRegelgeving\nTweede regel.',
  });
  assert(result.workspace.dossiers.every(dossier => dossier.projectContextId === context.id));
  assert(result.workspace.sources.some(source => source.id === context.sourceIds[0] && source.raw.row.ContactEmail === 'contact@example.invalid'));
  assert.deepEqual(api.importWorkspace(result.serialized).projectContexts, result.workspace.projectContexts);
  assert.deepEqual(await fs.readFile(filename), before);
});

test('SQLite walkthroughs preserve prose, real scope and modules selected only by the report without synthesizing facts', async t => {
  const { filename } = await sqliteFixture(t);
  const db = new DatabaseSync(filename);
  db.exec('CREATE TABLE WalkthroughReports (Id INTEGER PRIMARY KEY, CompanyId INTEGER, DepartmentId INTEGER, Title TEXT, Date TEXT, Author TEXT, Summary TEXT, Body TEXT, CreatedAt TEXT, UpdatedAt TEXT); CREATE TABLE WalkthroughReportModules (WalkthroughReportId INTEGER, ModuleId INTEGER);');
  db.prepare('INSERT INTO Modules VALUES (?,?,?)').run(50, 'M50', 'Alleen rondgangmodule');
  db.prepare('INSERT INTO WalkthroughReports VALUES (?,?,?,?,?,?,?,?,?,?)').run(1, 1, 1, 'Bronrondgang', '2026-09-23 00:00:00', 'Fictieve inspecteur', 'Complete samenvatting.', 'Volledig verslag\nMet tweede regel.', '2026-09-23T08:00:00Z', '2026-09-24T08:00:00Z');
  db.prepare('INSERT INTO WalkthroughReports VALUES (?,?,?,?,?,?,?,?,?,?)').run(2, 1, null, 'Organisatierondgang', 'ongeldige datum', '', '', 'Auteur en datum ontbreken werkelijk.', null, null);
  db.prepare('INSERT INTO WalkthroughReportModules VALUES (?,?)').run(1, 50);
  db.prepare('INSERT INTO WalkthroughReportModules VALUES (?,?)').run(1, 999);
  db.close();
  const before = await fs.readFile(filename);
  const result = await migrateSqlite(filename, { now: NOW });
  const report = result.workspace.walkthroughs.find(item => item.title === 'Bronrondgang');
  assert.equal(report.body, 'Volledig verslag\nMet tweede regel.');
  assert.equal(report.summary, 'Complete samenvatting.');
  assert.equal(report.date, '2026-09-23');
  assert.equal(report.author, 'Fictieve inspecteur');
  assert.equal(report.createdAt, '2026-09-23T08:00:00.000Z');
  assert.equal(report.departmentId, result.workspace.departments[0].id);
  assert.equal(report.organisationId, result.workspace.organisations[0].id);
  assert.equal(report.projectContextId, result.workspace.projectContexts[0].id);
  assert.deepEqual(result.workspace.dossiers.find(item => item.id === report.dossierId).departmentIds, [report.departmentId]);
  assert.equal(report.modules.length, 1);
  assert.equal(report.modules[0].code, 'M50');
  assert.equal(report.modules[0].title, 'Alleen rondgangmodule');
  assert.equal(result.workspace.observations.length, 0);
  assert.equal(result.workspace.walkthroughs.find(item => item.title === 'Organisatierondgang').date, '');
  assert.equal(result.workspace.walkthroughs.find(item => item.title === 'Organisatierondgang').author, '');
  assert(result.report.warnings.some(item => item.code === 'walkthrough_module_unresolved'));
  assert(result.workspace.sources.some(source => source.raw?.table === 'WalkthroughReports' && source.raw.row.Body === report.body));
  assert.equal((await migrateSqlite(filename, { now: NOW })).workspace.walkthroughs[0].id, result.workspace.walkthroughs[0].id);
  assert.deepEqual(await fs.readFile(filename), before);
});

test('SQLite walkthroughs with conflicting or unavailable department scope remain raw without widening their scope', async t => {
  const { filename } = await sqliteFixture(t);
  const db = new DatabaseSync(filename);
  db.exec('CREATE TABLE WalkthroughReports (Id INTEGER PRIMARY KEY, CompanyId INTEGER, DepartmentId INTEGER, Title TEXT, Date TEXT, Author TEXT, Summary TEXT, Body TEXT);');
  db.prepare('INSERT INTO Companies VALUES (?,?,?)').run(2, 1, 'Tweede organisatie');
  db.prepare('INSERT INTO WalkthroughReports VALUES (?,?,?,?,?,?,?,?)').run(1, 2, 1, 'Tegenstrijdige scope', '2026-09-23', '', '', 'Niet kiezen tussen bron-FKs.');
  db.prepare('INSERT INTO WalkthroughReports VALUES (?,?,?,?,?,?,?,?)').run(2, 1, 999, 'Ontbrekende afdeling', '2026-09-23', '', '', 'Niet verbreden naar organisatiebreed.');
  db.close();
  const result = await migrateSqlite(filename, { now: NOW });
  assert.equal(result.workspace.walkthroughs.length, 0);
  assert.equal(result.workspace.sources.filter(source => source.raw?.table === 'WalkthroughReports').length, 2);
  assert.equal(result.report.warnings.filter(item => item.code === 'walkthrough_raw_only').length, 2);
});

test('SQLite preserves project versus department module plans, notes and order including an entirely unanswered department', async t => {
  const { filename } = await sqliteFixture(t);
  const db = new DatabaseSync(filename);
  db.exec(`ALTER TABLE Modules ADD COLUMN Categorie TEXT; ALTER TABLE Modules ADD COLUMN SortOrder INTEGER;
    ALTER TABLE Vragen ADD COLUMN SortOrder INTEGER; ALTER TABLE Vragen ADD COLUMN Nummer TEXT;
    CREATE TABLE DepartmentModules (Id INTEGER PRIMARY KEY, DepartmentId INTEGER, ModuleId INTEGER, ScopeNotes TEXT, SortOrder INTEGER);`);
  db.prepare('UPDATE Modules SET Categorie=?, SortOrder=? WHERE Id=1').run('Arbeidsmiddelen', 8);
  db.prepare('INSERT INTO Modules (Id,Code,Titel,Categorie,SortOrder) VALUES (?,?,?,?,?)').run(20, 'M20', 'Afdelingsmodule', 'Proces', 2);
  db.prepare('INSERT INTO Vragen (Id,ModuleId,ModuleCode,Titel,Vraagtekst,Toetscriteria,Wetgeving,SortOrder,Nummer) VALUES (?,?,?,?,?,?,?,?,?)').run(20,20,'M20','Tweede vraag','Onbeantwoorde vraag twee?','','',2,'2');
  db.prepare('INSERT INTO Vragen (Id,ModuleId,ModuleCode,Titel,Vraagtekst,Toetscriteria,Wetgeving,SortOrder,Nummer) VALUES (?,?,?,?,?,?,?,?,?)').run(21,20,'M20','Eerste vraag','Onbeantwoorde vraag één?','','',1,'1');
  db.prepare('INSERT INTO Departments VALUES (?,?,?)').run(20,1,'Zonder antwoorden');
  db.prepare('INSERT INTO DepartmentModules VALUES (?,?,?,?,?)').run(20,20,20,'Uitsluitend de vulhal, geen opslag.',7);
  db.close();
  const before = await fs.readFile(filename);
  const result = await migrateSqlite(filename, { now: NOW });
  const api = await loadWorkspaceApi(); assert.doesNotThrow(() => api.importWorkspace(result.serialized));
  const projectPlan = result.workspace.modulePlans.find(plan => plan.scope === 'project');
  const departmentPlan = result.workspace.modulePlans.find(plan => plan.scope === 'department');
  assert.equal(projectPlan.modules.length,1); assert.equal(projectPlan.modules[0].code,'M1');
  assert.equal(projectPlan.modules[0].definitionSortOrder,8); assert.equal(projectPlan.modules[0].sortOrder,undefined);
  assert.equal(departmentPlan.modules[0].code,'M20'); assert.equal(departmentPlan.modules[0].sortOrder,7);
  assert.equal(departmentPlan.modules[0].definitionSortOrder,2); assert.equal(departmentPlan.modules[0].scopeNotes,'Uitsluitend de vulhal, geen opslag.');
  assert.equal(departmentPlan.modules[0].origin,'legacy_module');
  assert.equal(departmentPlan.projectContextId,result.workspace.projectContexts[0].id);
  const department = result.workspace.departments.find(item => item.name === 'Zonder antwoorden');
  assert.equal(departmentPlan.departmentId,department.id); assert.equal(departmentPlan.organisationId,department.organisationId);
  const dossier = result.workspace.dossiers.find(item => item.departmentIds.includes(department.id));
  assert.deepEqual(dossier.questions.map(question => question.prompt),['Onbeantwoorde vraag één?','Onbeantwoorde vraag twee?']);
  assert.deepEqual(departmentPlan.modules[0].questionIds,dossier.questions.map(question => question.id));
  assert.equal(dossier.assessor,''); assert.equal(dossier.status,'draft'); assert.equal(dossier.modulePlanSnapshot,undefined);
  assert.equal(result.workspace.answers.filter(answer => answer.dossierId === dossier.id).length,0);
  const base = result.workspace.dossiers.find(item => item.departmentIds.length === 0);
  assert.deepEqual(base.questions.map(question => question.prompt),['Is de afscherming intact?']);
  assert.equal(result.workspace.answers.length,1);
  assert(result.workspace.sources.some(source => source.raw?.table === 'DepartmentModules' && source.raw.row.ScopeNotes === departmentPlan.modules[0].scopeNotes));
  assert(result.report.warnings.some(warning => warning.code === 'module_questions_frozen_at_export'));
  assert.equal(result.report.counts.modulePlans,2); assert.deepEqual(await fs.readFile(filename),before);
  const again = await migrateSqlite(filename, { now: NOW }); assert.deepEqual(again.workspace.modulePlans,result.workspace.modulePlans);
});

test('SQLite module assignment ambiguities and unavailable department scopes remain raw without project-wide inclusion', async t => {
  const { filename } = await sqliteFixture(t);
  const db = new DatabaseSync(filename);
  db.exec('CREATE TABLE DepartmentModules (Id INTEGER PRIMARY KEY, DepartmentId INTEGER, ModuleId INTEGER, ScopeNotes TEXT, SortOrder INTEGER);');
  db.prepare('INSERT INTO Modules VALUES (?,?,?)').run(20,'M20','Afdeling alleen');
  db.prepare('INSERT INTO Vragen VALUES (?,?,?,?,?,?,?)').run(20,20,'M20','','Alleen afdelingsvraag?','','');
  db.prepare('INSERT INTO DepartmentModules VALUES (?,?,?,?,?)').run(20,1,20,'Eerste strijdige notitie',1);
  db.prepare('INSERT INTO DepartmentModules VALUES (?,?,?,?,?)').run(21,1,20,'Andere strijdige notitie',2);
  db.prepare('INSERT INTO DepartmentModules VALUES (?,?,?,?,?)').run(22,1,999,'Ontbrekende module',3);
  db.close();
  const result = await migrateSqlite(filename, { now: NOW });
  const departmentPlan = result.workspace.modulePlans.find(plan => plan.scope === 'department');
  assert.deepEqual(departmentPlan.modules,[]);
  assert(result.report.warnings.some(warning => warning.code === 'module_assignment_ambiguous'));
  assert(result.report.warnings.some(warning => warning.code === 'module_assignment_raw_only'));
  assert(result.workspace.sources.some(source => source.raw?.row?.ScopeNotes === 'Andere strijdige notitie'));
  assert(!result.workspace.dossiers.find(item => item.departmentIds.length === 0).questions.some(question => question.prompt === 'Alleen afdelingsvraag?'));
  const db2 = new DatabaseSync(filename); db2.prepare('UPDATE Companies SET Name=? WHERE Id=1').run(''); db2.close();
  const unavailable = await migrateSqlite(filename, { now: NOW });
  assert(!unavailable.workspace.modulePlans.some(plan => plan.scope === 'department'));
  assert(unavailable.report.warnings.some(warning => warning.code === 'department_module_plan_raw_only'));
});

async function managedMarkdownFixture(t) {
  const fixture = await markdownFixture(t);
  const qfile = path.join(fixture.root, 'rie/questions/q.md');
  const qtext = (await fs.readFile(qfile, 'utf8')).replace('content_package_id: "pack:1"', 'content_package_id: "pack:1"\ncontent_package_version: "1.0.0"\ncreated_at: "2026-10-01T08:00:00Z"\nupdated_at: "2026-10-02T08:00:00Z"\ntags: ["Exact bronlabel", "inspectie"]');
  await fs.writeFile(qfile, qtext);
  const companion = md('ima.rie-question-definition/v1', 'q:companion', { title: 'Niet geselecteerde conceptdefinitie', version: '1.0.0', status: 'draft', content_package_id: 'pack:1', content_package_version: '1.0.0', topic_ids: [], legal_ids: [], tags: [] }, '# Concept\n\n## Vraag\n\nOorspronkelijke niet geselecteerde vraag?\n\n## Toelichting\n\nExacte toelichting.\n\n## Acceptatiecriteria\n\nEigen criteria.\n\n## Verwacht bewijs\n\nEigen bewijsveld.');
  await put(fixture.root, 'rie/questions/companion.md', companion);
  const successor = md('ima.rie-question-definition/v1', 'q:successor', { title: 'Werkelijke tweede versie', version: '2.0.0', status: 'active', content_package_id: 'pack:1', content_package_version: '2.0.0', supersedes_id: 'q:1', topic_ids: [], legal_ids: [], tags: [] }, '# Opvolger\n\n## Vraag\n\nOorspronkelijke tweede controle?\n\n## Toelichting\n\nTweede uitleg.');
  await put(fixture.root, 'rie/questions/successor.md', successor);
  const questionSha = hash(qtext);
  const packageSha = hash(['ima.rie-question-content-package/v1', 'pack:1', '1.0.0', ...[`q:1@1.0.0#sha256:${questionSha}`, `q:companion@1.0.0#sha256:${hash(companion)}`].sort()].join('\n'));
  const assessmentFile = path.join(fixture.root, 'rie/assessments/a.md');
  await fs.writeFile(assessmentFile, (await fs.readFile(assessmentFile, 'utf8')).replace(fixture.originalHash, questionSha).replace('question_refs:', `content_package_refs: ["pack:1@1.0.0#sha256:${packageSha}"]\nquestion_refs:`));
  const responseFile = path.join(fixture.root, 'rie/responses/r.md');
  await fs.writeFile(responseFile, (await fs.readFile(responseFile, 'utf8')).replace(fixture.originalHash, questionSha));
  return { ...fixture, questionSha, packageSha, qfile, qtext };
}

test('Markdown preserves authoritative separate content, actual managed versions, predecessor and ALL frozen package definitions', async t => {
  const fixture = await managedMarkdownFixture(t);
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  const api = await loadWorkspaceApi();
  const q = result.workspace.questions.find(q => q.title === 'Inspectie afscherming');
  assert.equal(q.assessmentGuidance, 'Controleer de hele knelzone.');
  assert.equal(q.acceptanceCriteria, 'Afscherming dekt toegang tot bewegende delen.');
  assert.equal(q.expectedEvidence, 'Een inspectierapport.');
  assert.deepEqual(q.evidenceHints, []);
  assert.equal(q.definition.version, '1.0.0'); assert.equal(q.definition.contentPackageVersion, '1.0.0');
  assert.equal(q.definition.status, 'active'); assert.equal(q.definition.sourceSha256, fixture.questionSha);
  assert.equal(q.definition.createdAt, '2026-10-01T08:00:00.000Z');
  assert.deepEqual(q.definition.tags, ['Exact bronlabel', 'inspectie']);
  assert.deepEqual(q.definition.topicIds, [result.workspace.topics[0].id]);
  assert.deepEqual(q.definition.legalIds, [result.workspace.legalRecords[0].id]);
  const successor = result.workspace.questions.find(q => q.title === 'Werkelijke tweede versie');
  assert.equal(successor.definition.supersedesId, q.id); assert.equal(successor.definition.version, '2.0.0');
  assert.equal(successor.definition.createdAt, undefined);
  const dossier = result.workspace.dossiers[0];
  assert.equal(dossier.questions.length, 1); assert.equal(dossier.questions[0].version, '1.0.0');
  assert.equal(dossier.contentPackageSnapshots.length, 1); assert.equal(dossier.contentPackageSnapshots[0].version, '1.0.0');
  assert.equal(dossier.contentPackageSnapshots[0].questions.length, 2);
  assert(dossier.contentPackageSnapshots[0].questions.some(q => q.definition.status === 'draft'));
  assert.equal(result.workspace.answers[0].respondedBy, 'Vastgelegde beoordelaar');
  assert(!result.report.warnings.some(w => ['package_frozen_at_export', 'package_reference_unconfirmed'].includes(w.code)));
  assert.deepEqual(api.importWorkspace(result.serialized).dossiers, result.workspace.dossiers);
  assert.deepEqual(await fs.readFile(fixture.qfile, 'utf8'), fixture.qtext);
  assert(result.workspace.sources.some(source => source.raw?.text === fixture.qtext));
});

test('unusable managed source version/status/precedessor metadata remains explicitly unmanaged with full raw provenance', async t => {
  const root = await temporary(t);
  for (const [id, fields] of [
    ['status', { version: '1.0.0', status: 'unconfirmed', content_package_version: '1.0.0' }],
    ['version', { version: '1.0.0-beta.1', status: 'active', content_package_version: '1.0.0' }],
    ['package', { version: '1.0.0', status: 'active' }],
    ['predecessor', { version: '2.0.0', status: 'active', content_package_version: '2.0.0', supersedes_id: 'absent:question' }],
  ]) await put(root, `questions/${id}.md`, md('ima.rie-question-definition/v1', `q:${id}`, { title: id, content_package_id: 'actual:pack', ...fields }, `# ${id}\n\n## Vraag\n\nExacte bronvraag ${id}?\n\n## Acceptatiecriteria\n\nExact criterium.`));
  const result = await migrateMarkdown(root, { now: NOW });
  assert.equal(result.workspace.questions.length, 4);
  assert(result.workspace.questions.every(q => q.definition === undefined && q.acceptanceCriteria === 'Exact criterium.'));
  assert.equal(result.workspace.sources.filter(source => source.format === 'legacy-markdown').length, 4);
  assert.equal(result.report.warnings.filter(w => w.code === 'question_definition_unmanaged').length, 4);
});

test('an unconfirmed original package hash keeps exact frozen questions but does not claim a managed historical package freeze', async t => {
  const fixture = await managedMarkdownFixture(t);
  const file = path.join(fixture.root, 'rie/assessments/a.md');
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(fixture.packageSha, 'f'.repeat(64)));
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  assert.equal(result.workspace.questions.find(q => q.title === 'Inspectie afscherming').definition.status, 'active');
  assert.equal(result.workspace.dossiers[0].contentPackageSnapshots, undefined);
  assert.equal(result.workspace.dossiers[0].questions[0].definition, undefined);
  assert.equal(result.workspace.dossiers[0].questions[0].acceptanceCriteria, 'Afscherming dekt toegang tot bewegende delen.');
  assert.equal(result.workspace.answers[0].questionSha256, result.workspace.dossiers[0].questions[0].sha256);
  assert(result.report.warnings.some(w => w.code === 'package_reference_unconfirmed'));
});

test('a missing nonselected package definition cannot be silently excluded from a claimed full package freeze', async t => {
  const fixture = await managedMarkdownFixture(t);
  const companionFile = path.join(fixture.root, 'rie/questions/companion.md');
  await fs.writeFile(companionFile, (await fs.readFile(companionFile, 'utf8')).replace('status: "draft"', 'status: "unknown"'));
  const result = await migrateMarkdown(fixture.root, { now: NOW });
  assert.equal(result.workspace.dossiers[0].contentPackageSnapshots, undefined);
  assert(result.report.warnings.some(w => w.code === 'package_reference_unconfirmed'));
  assert(result.workspace.sources.some(source => source.raw?.text.includes('status: "unknown"')));
});

test('Markdown response actors and multiple known links survive in both directions while missing/foreign-scope links stay raw', async t => {
  const { root, originalHash } = await markdownFixture(t);
  const responseFile = path.join(root, 'rie/responses/r.md');
  await fs.writeFile(responseFile, (await fs.readFile(responseFile, 'utf8')).replace('evidence_ids:', 'observation_ids: ["observation:1", "observation:missing", "observation:other"]\nfinding_ids: ["finding:1", "finding:other"]\nevidence_ids:'));
  await put(root, 'rie/assessments/other.md', md('ima.rie-assessment/v1', 'assessment:other', { title: 'Tweede echte scope', assessor: 'Andere beoordelaar', question_refs: [`q:1@1.0.0#sha256:${originalHash}`] }, '# Ander dossier\n\n## Doel en reikwijdte\n\nAndere afgebakende scope.'));
  await put(root, 'rie/observations/second.md', md('ima.rie-observation/v1', 'observation:second', { assessment_id: 'assessment:1', observed_at: '2026-10-06T10:00:00Z', observer: 'Werkelijke bronactor', question_response_ids: ['response:1'] }, '# Tweede waarneming\n\n## Feit\n\nTweede zelfstandig bronfeit.'));
  await put(root, 'rie/observations/other.md', md('ima.rie-observation/v1', 'observation:other', { assessment_id: 'assessment:other', observed_at: '2026-10-06T10:00:00Z', observer: 'Werkelijke andere actor', question_response_ids: ['response:1'] }, '# Andere waarneming\n\n## Feit\n\nDeze scope mag niet worden samengevoegd.'));
  await put(root, 'rie/findings/second.md', md('ima.rie-finding/v2', 'finding:second', { assessment_id: 'assessment:1', title: 'Tweede bevinding', status: 'open', question_response_ids: ['response:1'] }, '# Feitelijke tweede bevinding'));
  await put(root, 'rie/findings/other.md', md('ima.rie-finding/v2', 'finding:other', { assessment_id: 'assessment:other', title: 'Andere bevinding', status: 'open' }, '# Feitelijke andere bevinding'));
  const result = await migrateMarkdown(root, { now: NOW });
  const answer = result.workspace.answers[0];
  assert.equal(answer.respondedBy, 'Vastgelegde beoordelaar');
  assert.equal(answer.observationIds.length, 2); assert.equal(answer.findingIds.length, 2);
  for (const target of [...result.workspace.observations, ...result.workspace.findings]) {
    if (target.dossierId === answer.dossierId) assert.deepEqual(target.responseIds, [answer.id]);
    else assert.equal(target.responseIds, undefined);
  }
  assert(result.report.warnings.filter(w => w.code === 'response_relation_not_transferred').length >= 3);
  assert.deepEqual((await loadWorkspaceApi()).importWorkspace(result.serialized).answers, result.workspace.answers);
  await fs.writeFile(responseFile, (await fs.readFile(responseFile, 'utf8')).replace('responded_by: "Vastgelegde beoordelaar"\n', ''));
  const unknown = await migrateMarkdown(root, { now: NOW });
  assert.equal(unknown.workspace.answers[0].respondedBy, undefined);
  assert(unknown.report.warnings.some(w => w.code === 'response_actor_unknown'));
});

test('SQLite separates criteria and preserves ALL original rich fields without fabricated version, respondent or effect metadata', async t => {
  const { filename } = await sqliteFixture(t);
  const db = new DatabaseSync(filename);
  for (const field of ['Nummer', 'Gevaar', 'Risico', 'Risicofactor', 'TechnischeMaatregelen', 'OrganisatorischeMaatregelen', 'Basisoorzaken', 'Cultuur']) {
    db.exec(`ALTER TABLE Vragen ADD COLUMN ${field} TEXT;`);
    db.prepare(`UPDATE Vragen SET ${field}=? WHERE Id=1`).run(`Exacte ${field}\nTweede bronregel.`);
  }
  db.exec('ALTER TABLE Vragen ADD COLUMN SortOrder INTEGER;'); db.prepare('UPDATE Vragen SET SortOrder=? WHERE Id=1').run(23); db.close();
  const bytes = await fs.readFile(filename);
  const result = await migrateSqlite(filename, { now: NOW });
  const q = result.workspace.questions[0];
  assert.equal(q.assessmentGuidance, ''); assert.equal(q.acceptanceCriteria, 'Observeer de situatie.');
  assert.equal(q.expectedEvidence, undefined); assert.equal(q.definition, undefined);
  assert.deepEqual(q.richFields, { number: 'Exacte Nummer\nTweede bronregel.', hazard: 'Exacte Gevaar\nTweede bronregel.', risk: 'Exacte Risico\nTweede bronregel.', riskFactor: 'Exacte Risicofactor\nTweede bronregel.', technicalControls: 'Exacte TechnischeMaatregelen\nTweede bronregel.', organisationalControls: 'Exacte OrganisatorischeMaatregelen\nTweede bronregel.', rootCauses: 'Exacte Basisoorzaken\nTweede bronregel.', culture: 'Exacte Cultuur\nTweede bronregel.', sortOrder: 23 });
  assert.deepEqual(result.workspace.dossiers.find(d => d.departmentIds.length).questions[0].richFields, q.richFields);
  assert.equal(result.workspace.answers[0].respondedBy, undefined); assert.equal(result.workspace.answers[0].observationIds, undefined);
  assert(result.report.warnings.some(w => w.code === 'response_actor_unknown'));
  assert.deepEqual(await fs.readFile(filename), bytes);
});

test('SQLite typed library keeps shared controls, exact ordinal reviews, separate scopes and typed layouts without extra raw records', async t => {
  const { filename } = await sqliteFixture(t);
  const db = new DatabaseSync(filename);
  db.exec(`ALTER TABLE Modules ADD COLUMN Omschrijving TEXT; ALTER TABLE Modules ADD COLUMN SortOrder INTEGER;
    ALTER TABLE Risicos ADD COLUMN GevaarItemId INTEGER; ALTER TABLE Risicos ADD COLUMN Code TEXT; ALTER TABLE Risicos ADD COLUMN Omschrijving TEXT; ALTER TABLE Risicos ADD COLUMN SortOrder INTEGER;
    ALTER TABLE Risicofactoren ADD COLUMN Code TEXT; ALTER TABLE Risicofactoren ADD COLUMN LodBeschrijving TEXT; ALTER TABLE Risicofactoren ADD COLUMN DefaultWaarschijnlijkheidScore INTEGER; ALTER TABLE Risicofactoren ADD COLUMN SortOrder INTEGER;
    CREATE TABLE Gevaren (Id INTEGER PRIMARY KEY, ModuleId INTEGER, Code TEXT, Titel TEXT, Omschrijving TEXT, SortOrder INTEGER);
    CREATE TABLE Beheersmaatregelen (Id INTEGER PRIMARY KEY, Code TEXT, Titel TEXT, Omschrijving TEXT, Type INTEGER, SortOrder INTEGER);
    CREATE TABLE BeheersmaatregelRisicofactoren (Id INTEGER PRIMARY KEY, RisicofactorItemId INTEGER, BeheersmaatregelId INTEGER, ReductieScore INTEGER, KostenNiveau INTEGER, SortOrder INTEGER);
    CREATE TABLE BeoordelingsVragen (Id INTEGER PRIMARY KEY, RisicofactorItemId INTEGER, Vraagtekst TEXT, Toelichting TEXT, SortOrder INTEGER);
    CREATE TABLE RiskMapNodeLayouts (Id INTEGER PRIMARY KEY, RieProjectId INTEGER, CompanyId INTEGER, DepartmentId INTEGER, NodeType TEXT, NodeId INTEGER, X REAL, Y REAL, UpdatedAt TEXT);
    ALTER TABLE MaatregelBeoordelingen ADD COLUMN CompanyId INTEGER; ALTER TABLE MaatregelBeoordelingen ADD COLUMN DepartmentId INTEGER; ALTER TABLE MaatregelBeoordelingen ADD COLUMN BeheersmaatregelRisicofactorId INTEGER; ALTER TABLE MaatregelBeoordelingen ADD COLUMN UpdatedAt TEXT;`);
  db.prepare('UPDATE Modules SET Omschrijving=?,SortOrder=? WHERE Id=1').run('Exacte modulebron.', 1);
  db.prepare('INSERT INTO Gevaren VALUES (?,?,?,?,?,?)').run(1, 1, 'G', 'Gevaar', 'Oorspronkelijke gevaarbeschrijving.', 1);
  db.prepare('UPDATE Risicos SET GevaarItemId=?,Code=?,Omschrijving=?,SortOrder=? WHERE Id=1').run(1, 'R', 'Risico exact', 1);
  db.prepare('UPDATE Risicofactoren SET Code=?,LodBeschrijving=?,DefaultWaarschijnlijkheidScore=?,SortOrder=? WHERE Id=1').run('F1', 'LoD-bron.', 2, 1);
  db.prepare('INSERT INTO Risicofactoren VALUES (?,?,?,?,?,?,?,?)').run(2,1,'Tweede factor','Andere factoromschrijving.','F2','Andere LoD-bron.',1,2);
  db.prepare('INSERT INTO Beheersmaatregelen VALUES (?,?,?,?,?,?)').run(1,'C1','Gedeelde technische maatregel','Exacte bronmaatregel.',0,1);
  db.prepare('INSERT INTO BeheersmaatregelRisicofactoren VALUES (?,?,?,?,?,?)').run(1,1,1,3,0,1);
  db.prepare('INSERT INTO BeheersmaatregelRisicofactoren VALUES (?,?,?,?,?,?)').run(2,2,1,1,2,2);
  db.prepare('INSERT INTO BeoordelingsVragen VALUES (?,?,?,?,?)').run(1,1,'Factorvraag?','Afzonderlijke vraagtoelichting.',1);
  db.prepare('INSERT INTO Departments VALUES (?,?,?)').run(2,1,'Tweede afdeling');
  db.prepare('INSERT INTO RisicofactorBeoordelingen VALUES (?,?,?,?,?,?,?,?,?)').run(2,1,1,2,1,1,2,2,'Andere scope-rating.');
  db.prepare('UPDATE MaatregelBeoordelingen SET CompanyId=?,DepartmentId=?,BeheersmaatregelRisicofactorId=?,UpdatedAt=? WHERE Id=1').run(1,1,1,'2026-10-06 10:00:00');
  for (const [id,type,nodeId] of [[1,'Gevaar',1],[2,'Risico',1],[3,'Risicofactor',1],[4,'Maatregel',1]]) db.prepare('INSERT INTO RiskMapNodeLayouts VALUES (?,?,?,?,?,?,?,?,?)').run(id,1,1,1,type,nodeId,id*17,id*11,'2026-10-06 10:00:00');
  db.close();
  const before = await fs.readFile(filename); const result = await migrateSqlite(filename, { now: NOW });
  const api = await loadWorkspaceApi(); api.importWorkspace(result.serialized);
  assert.equal(result.workspace.riskLibraries.length, 1); const library = result.workspace.riskLibraries[0];
  assert.equal(library.origin, 'legacy_sqlite'); assert.equal(library.sourceSha256, hash(before));
  assert.equal(library.controls.length,1); assert.equal(library.links.length,2);
  assert.equal(library.links[0].controlId,library.links[1].controlId);
  assert.equal(library.controls[0].type,'technical'); assert.equal(library.controls[0].hierarchy,undefined);
  assert.equal(library.questions[0].explanation,'Afzonderlijke vraagtoelichting.');
  assert.equal(library.risks[0].effectRating,3); assert.equal(library.links[0].reductionRating,3);
  const factors = result.workspace.riskLibraryReviews.filter(review=>review.kind==='factor');
  assert.equal(factors.length,2); assert.notEqual(factors[0].scope.departmentId,factors[1].scope.departmentId);
  assert.deepEqual(factors.map(review=>review.relevance),['relevant','not_relevant']);
  const control = result.workspace.riskLibraryReviews.find(review=>review.kind==='control_link');
  assert.equal(control.isInPlace,true); assert.equal(control.reductionRating,3); assert.equal(control.costLevel,'low');
  assert.equal(control.reviewedAt,undefined); assert.equal(control.assessor,undefined); assert.equal(control.legacyUpdatedAt,'2026-10-06 10:00:00');
  assert.equal(result.workspace.riskLibraryLayouts.length,4);
  assert(result.workspace.riskLibraryLayouts.some(layout=>layout.nodeType==='control_link'&&layout.nodeId===library.links[0].id));
  assert.equal(result.workspace.sources.filter(source=>source.format==='legacy-sqlite-row'&&source.raw.table==='RiskMapNodeLayouts').length,4);
  assert.equal(result.workspace.scenarios.length,0); assert.deepEqual(await fs.readFile(filename),before);
});
