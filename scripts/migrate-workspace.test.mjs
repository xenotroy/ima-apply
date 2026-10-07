import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { migrateMarkdown, migrateSqlite, parseLegacyMarkdown, loadWorkspaceApi, writeMigrationOutput } from './migrate-workspace.mjs';

const NOW = '2026-10-07T09:00:00.000Z';
const hash = value => createHash('sha256').update(value).digest('hex');
const md = (schema, id, metadata, body) => `---\nschema: ${schema}\nid: ${id}\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n${body}\n`;
async function temporary(t) { const root = await fs.mkdtemp(path.join(tmpdir(), 'ima-migration-test-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
async function put(root, relative, content) { const target = path.join(root, relative); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content); return target; }

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
  assert.equal(result.workspace.sources.length, 1);
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

test('rejects symlink source selection', async t => {
  const { root } = await markdownFixture(t);
  const outside = await temporary(t); await put(outside, 'external.md', 'Private unrelated data');
  await fs.symlink(path.join(outside, 'external.md'), path.join(root, 'linked.md'));
  await assert.rejects(migrateMarkdown(root), /symlink/);
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
  assert.equal(result.workspace.departments.length, 0);
  assert.equal(result.workspace.dossiers[0].assessor, '');
  assert.notEqual(result.workspace.dossiers[0].assessor, 'Een contactpersoon, geen assessor');
  assert(result.workspace.sources.some(source => source.raw?.table === 'MaatregelBeoordelingen' && source.raw.row.ReductieScore === 3 && source.raw.row.IsInPlace === 1));
  assert.equal(result.workspace.dossiers[0].questions[0].legalReferences, 'Oorspronkelijke normverwijzing, ongewijzigd.');
  assert(result.report.warnings.some(warning => warning.code === 'legacy_control_raw_only'));
  assert(result.report.warnings.some(warning => warning.code === 'unknown_table'));
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
