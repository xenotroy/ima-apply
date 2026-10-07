import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildImport, parseCsv, parseCsvQuestions, parseJsonQuestions, parseMarkdownQuestionnaire, plainText } from './import-content.mjs';

const markdown = `# Technische check\n\n### 01. Werking\n\nRoute: Kern\n\nVraag:\n\nWerkt de barrière tijdens de taak?\n\nBeoordeling:\n\nOnbekend\n\nToelichting en bewijs:\n\n\nToetsingscriteria:\n\nWerking moet worden getest.\n\nWet en regelgeving of normen:\n\nControleer toepasselijkheid.\n\nVerificatie:\n\nTest onder belasting.\n\n### 02. Herstel\n\nRoute: Verdieping\n\nVraag:\n\nHoe wordt een defect hersteld?\n\nToetsingscriteria:\n\nControleer vóór vrijgave.\n\nVerificatie:\n\nVrijgavebewijs.\n`;

test('Markdown behouden vragen, route, criteria en verificatie zonder beoordelingsvelden te vermengen', () => {
  const result = parseMarkdownQuestionnaire(markdown.replace(/\n/g, '\r\n'), 'OWN');
  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[0].prompt, 'Werkt de barrière tijdens de taak?');
  assert.equal(result.questions[0].assessmentGuidance, 'Werking moet worden getest.');
  assert.deepEqual(result.questions[0].evidenceHints, ['Test onder belasting.']);
  assert.equal(result.questions[1].route, 'verdieping');
  assert.notEqual(result.questions[0].id, result.questions[1].id);
});

test('Legacy modules/vragen behouden onafhankelijke modulenamen en vraag-ID’s', () => {
  const result = parseJsonQuestions({ modules: [
    { code: '1.01', titel: 'Arbobeleid', vragen: [{ key: '1.01.01', titel: 'Scope', vraagtekst: 'Wat valt binnen de scope?', toetscriteria: 'Check alle taken.' }] },
    { code: '2.01', titel: 'Werkplek', vragen: [{ key: '2.01.01', titel: 'Taak', vraagtekst: 'Wat gebeurt bij storing?' }] },
  ] }, 'LEGACY');
  assert.equal(result.questions.length, 2);
  assert.equal(result.themes[0].title, 'Arbobeleid');
  assert.equal(result.questions[0].id, 'LEGACY:1.01.01');
  assert.equal(result.questions[0].assessmentGuidance, 'Check alle taken.');
});

test('Moodle question CSV verwerkt BOM, quoted comma, HTML en quoted newline', () => {
  const result = parseCsvQuestions('\uFEFFquestionname,questiontext,category\r\nAlarm,"<p>Werkt het alarm, onder belasting?</p>\nExtra context.",BHV\r\n', 'LMS');
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].title, 'Alarm');
  assert.equal(result.questions[0].prompt, 'Werkt het alarm, onder belasting?\n\nExtra context.');
  assert.equal(result.questions[0].themeId, 'LMS:bhv');
});

test('LMS-deelname of cijfergegevens worden niet tot verzonnen RI&E-vragen gemaakt', () => {
  const result = parseCsvQuestions('course;activity;fullname;grade;completion\nBHV;Quiz;Fictieve naam;80;1\n', 'LMS');
  assert.equal(result.questions.length, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.delimiter, ';');
});

test('Corrupte CSV en onverwacht JSON-schema worden geweigerd', () => {
  assert.throws(() => parseCsv('vraag,vraag\nA,B\n'), /dubbele/);
  assert.throws(() => parseCsv('vraag,titel\n"Niet afgesloten,B\n'), /niet afgesloten/);
  assert.throws(() => parseCsv('vraag,titel\nA,B,C\n'), /3 velden/);
  assert.throws(() => parseJsonQuestions({ schema: 'unknown/v8', questions: [] }, 'X'), /Onbekend JSON-schema/);
});

test('Geïmporteerde HTML is tekst, en scripts en styles worden verwijderd', () => {
  assert.equal(plainText('<script>alert(1)</script><style>p{display:none}</style><p>Bron &amp; taak</p>'), 'Bron & taak');
});

test('Private intake bewaart standaard geen ruwe deelnemersrijen en publiceert geen bronpad', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-import-'));
  try {
    const file = path.join(directory, 'voortgang.csv');
    await fs.writeFile(file, 'course,fullname,grade\nBHV,Fictieve deelnemer,90\n');
    const result = await buildImport([file], { kind: 'lms' });
    assert.equal(result.publication, 'private');
    assert.equal(result.sources[0].publication, 'private');
    assert.equal(result.records[0].rowCount, 1);
    assert.equal('rows' in result.records[0], false);
    assert.equal(JSON.stringify(result).includes('Fictieve deelnemer'), false);
    assert.equal(JSON.stringify(result).includes(directory), false);
    const explicit = await buildImport([file], { kind: 'lms', includeRaw: true });
    assert.equal(explicit.records[0].rows[0].fullname, 'Fictieve deelnemer');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('Archief en symlinks vallen buiten intake', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-import-'));
  try {
    const archive = path.join(directory, 'CortexVault');
    await fs.mkdir(archive);
    const file = path.join(archive, 'bron.md');
    await fs.writeFile(file, '# Bron');
    await assert.rejects(buildImport([file]), /CortexVault/);
    const source = path.join(directory, 'bron.md');
    await fs.writeFile(source, '# Bron');
    const link = path.join(directory, 'link.md');
    await fs.symlink(source, link);
    await assert.rejects(buildImport([link]), /symlinks/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('CLI kan private bronuitvoer niet naar web/src schrijven', async () => {
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const script = fileURLToPath(new URL('./import-content.mjs', import.meta.url));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-cli-boundary-'));
  try {
    const source = path.join(directory, 'bron.md');
    await fs.writeFile(source, markdown);
    const result = spawnSync(process.execPath, [script, '--input', source, '--out', path.join(repository, 'web/src/content/forbidden-output.json')], { encoding: 'utf8', cwd: directory });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /binnen private-data/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
