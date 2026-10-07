#!/usr/bin/env node
/** Private, explicit source intake. Never copies source files into the public app. */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateRoot = path.join(repositoryRoot, 'private-data');
const allowedExtensions = new Set(['.md', '.markdown', '.json', '.csv', '.tsv']);
const maxFileBytes = 15 * 1024 * 1024;
const maxQuestions = 10_000;
const maxFiles = 1_000;

const usage = `IMA private content intake

  node scripts/import-content.mjs --input <selected-file> [--input <another-file>]
       [--out private-data/content.json] [--kind vault|questionnaire|reference|training|lms]
       [--source-prefix OWN] [--include-raw] [--recursive]

Supported: Markdown questionnaires, IMA legacy modules/vragen JSON,
ima.content/v1 JSON, generic question JSON, Moodle question CSV and LMS CSV.
Directories require --recursive. CortexVault and symlinks are excluded.
Output must stay inside the ignored repository private-data directory.
Without --include-raw, source texts and participant rows are not retained.
Nothing is uploaded. No source file is modified.
`;

export function slug(value) {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'import';
}

function text(value) {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value.trim() : String(value).trim();
}

export function plainText(value) {
  return text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity.toLowerCase()])
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, number) => {
      const codePoint = number[0].toLowerCase() === 'x' ? Number.parseInt(number.slice(1), 16) : Number.parseInt(number, 10);
      return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    }).trim();
}

function stringList(value) {
  return Array.isArray(value) ? value.map(plainText).filter(Boolean) : text(value) ? [plainText(value)] : [];
}

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const id = key(item);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }
  return groups;
}

function inferDelimiter(input) {
  let quoted = false;
  const counts = new Map([[',', 0], [';', 0], ['\t', 0]]);
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === '\n' || character === '\r')) break;
    else if (!quoted && counts.has(character)) counts.set(character, counts.get(character) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

/** RFC 4180-style quoted fields, including newlines; delimiter is inferred from headers. */
export function parseCsv(input, suppliedDelimiter) {
  const source = input.replace(/^\uFEFF/, '');
  const delimiter = suppliedDelimiter ?? inferDelimiter(source);
  const matrix = [];
  let row = [], field = '', quoted = false, closedQuote = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') { quoted = false; closedQuote = true; }
      else field += character;
    } else if (character === '"' && field.length === 0 && !closedQuote) quoted = true;
    else if (character === delimiter) { row.push(field); field = ''; closedQuote = false; }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell !== '')) matrix.push(row);
      row = []; field = ''; closedQuote = false;
    } else {
      if (closedQuote && character.trim()) throw new Error('Ongeldig CSV: tekst na een afgesloten quoted veld.');
      if (!closedQuote) field += character;
    }
  }
  if (quoted) throw new Error('Ongeldig CSV: niet afgesloten quoted veld.');
  if (field.length || row.length || closedQuote) { row.push(field); matrix.push(row); }
  if (!matrix.length) return { delimiter, headers: [], rows: [] };
  const headers = matrix[0].map((item) => item.trim());
  if (headers.some((item) => !item) || new Set(headers.map((item) => item.toLowerCase())).size !== headers.length) {
    throw new Error('Ongeldig CSV: lege of dubbele kolomnaam.');
  }
  const rows = matrix.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) throw new Error(`Ongeldig CSV: rij ${rowIndex + 2} heeft ${cells.length} velden; verwacht ${headers.length}.`);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
  return { delimiter, headers, rows };
}

function fieldBlock(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`(?:^|\\n)(?:#{1,6}\\s*)?${escaped}:?\\s*\\n([\\s\\S]*?)(?=\\n(?:#{1,6}\\s*)?(?:Vraag|Beoordeling|Toelichting en bewijs|Toetsingscriteria|Wet en regelgeving of normen|Verificatie|Route):?\\s*\\n|$)`, 'i');
  return text(body.match(expression)?.[1]);
}

function question(item, sourceId, themeId, index) {
  const prompt = plainText(item.prompt ?? item.questiontext ?? item.vraagtekst ?? item.question ?? item.text);
  if (!prompt) return null;
  const levels = new Set(['eliminate', 'source', 'collective', 'individual', 'ppe']);
  return {
    id: `${sourceId}:${text(item.id ?? item.key) || `${slug(themeId.replace(`${sourceId}:`, ''))}-${String(index + 1).padStart(3, '0')}`}`,
    themeId,
    title: plainText(item.title ?? item.titel ?? item.name ?? item.questionname) || `Vraag ${index + 1}`,
    prompt,
    route: item.route === 'verdieping' || /verdieping/i.test(text(item.route)) ? 'verdieping' : 'kern',
    evidenceHints: stringList(item.evidenceHints ?? item.verificatie ?? item.evidence),
    assessmentGuidance: plainText(item.assessmentGuidance ?? item.toetscriteria ?? item.guidance),
    legalReferences: plainText(item.legalReferences ?? item.wetgeving),
    sourceIds: [sourceId],
    suggestedHierarchy: stringList(item.suggestedHierarchy).filter((level) => levels.has(level)),
    roles: stringList(item.roles),
  };
}

/** Parses the labelled private questionnaire format without synthesising missing questions. */
export function parseMarkdownQuestionnaire(input, sourceId, fallbackTitle = 'Markdown bron') {
  input = input.replace(/\r\n/g, '\n');
  const title = plainText(input.match(/^#\s+(.+)$/m)?.[1] ?? fallbackTitle);
  const themeId = `${sourceId}:${slug(title)}`;
  const sections = [...input.matchAll(/^###\s+(?:\d+[.)]?\s+)?(.+)\n([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/gm)];
  const questions = sections.map((section, index) => {
    const body = section[2];
    const prompt = fieldBlock(body, 'Vraag');
    if (!prompt) return null;
    return question({ title: section[1], prompt, route: body.match(/^Route:\s*(.+)$/mi)?.[1], evidenceHints: fieldBlock(body, 'Verificatie'), assessmentGuidance: fieldBlock(body, 'Toetsingscriteria'), legalReferences: fieldBlock(body, 'Wet en regelgeving of normen') }, sourceId, themeId, index);
  }).filter(Boolean);
  const sourceMetadata = {};
  const frontmatter = input.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  if (frontmatter) for (const line of frontmatter.split('\n')) {
    const entry = line.match(/^([a-zA-Z_][a-zA-Z_\d-]*):\s*(.*?)\s*$/);
    if (entry && entry[2]) sourceMetadata[entry[1]] = entry[2];
  }
  function documentSection(heading) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text(input.match(new RegExp(`^##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'gm'))?.[0]?.replace(/^##[^\n]*\n/, ''));
  }
  return {
    questions,
    themes: questions.length ? [{ id: themeId, title, description: 'Private import van de oorspronkelijke themavragenlijst; broninhoud niet onafhankelijk gevalideerd.', sourceIds: [sourceId], questions }] : [],
    sourceMetadata,
    documentGuidance: documentSection('Beslisregel voor afsluiten van het thema'),
    sourceReferenceText: documentSection('Bronbasis'),
  };
}

export function parseJsonQuestions(value, sourceId, fallbackTitle = 'JSON bron') {
  if (!value || typeof value !== 'object') throw new Error('JSON-inhoud moet een object of vragenarray zijn.');
  if (typeof value.schema === 'string' && value.schema !== 'ima.content/v1') throw new Error('Onbekend JSON-schema; verwacht ima.content/v1 of een vragenbank zonder schema.');
  const modules = Array.isArray(value.modules) ? value.modules : Array.isArray(value.vragen) ? [value] : [];
  if (modules.length) {
    const themes = modules.map((module, moduleIndex) => {
      const id = `${sourceId}:${slug(module.code ?? module.id ?? `module-${moduleIndex + 1}`)}`;
      if (!Array.isArray(module.vragen ?? module.questions)) return null;
      const questions = (module.vragen ?? module.questions).map((item, index) => question(item, sourceId, id, index)).filter(Boolean);
      return { id, title: plainText(module.titel ?? module.title) || `Module ${moduleIndex + 1}`, description: plainText(module.categorie ?? module.description), sourceIds: [sourceId], questions };
    }).filter(Boolean);
    return { themes, questions: themes.flatMap((item) => item.questions) };
  }
  const supplied = Array.isArray(value) ? value : Array.isArray(value.questions) ? value.questions : [];
  const fallbackTheme = slug(fallbackTitle);
  const questions = supplied.map((item, index) => question(item, sourceId, `${sourceId}:${slug(item.themeId ?? item.topic ?? fallbackTheme)}`, index)).filter(Boolean);
  const groups = groupBy(questions, (item) => item.themeId);
  const themes = [...groups].map(([id, group]) => {
    const original = Array.isArray(value.themes) ? value.themes.find((theme) => `${sourceId}:${slug(theme.id)}` === id) : null;
    return { id, title: plainText(original?.title) || fallbackTitle, description: plainText(original?.description), sourceIds: [sourceId], questions: group };
  });
  return { themes, questions };
}

export function parseCsvQuestions(input, sourceId, fallbackTitle = 'CSV bron', delimiter) {
  const parsed = parseCsv(input, delimiter);
  const aliases = { prompt: ['prompt', 'questiontext', 'vraagtekst', 'question', 'vraag', 'text'], title: ['title', 'questionname', 'titel', 'name'], topic: ['themeid', 'topic', 'theme', 'thema', 'category', 'categorie'], guidance: ['assessmentguidance', 'guidance', 'toetscriteria'], evidence: ['evidencehints', 'evidence', 'verificatie'] };
  const headerMap = new Map(parsed.headers.map((header) => [header.toLowerCase().replace(/\s|_/g, ''), header]));
  const column = (key) => aliases[key].map((alias) => headerMap.get(alias)).find(Boolean);
  if (!column('prompt')) return { ...parsed, questions: [], themes: [] };
  const questions = parsed.rows.map((row, index) => {
    const themeId = `${sourceId}:${slug(row[column('topic')] || fallbackTitle)}`;
    return question({ prompt: row[column('prompt')], title: row[column('title')], assessmentGuidance: row[column('guidance')], evidenceHints: row[column('evidence')] }, sourceId, themeId, index);
  }).filter(Boolean);
  const themes = [...groupBy(questions, (item) => item.themeId)].map(([id, group]) => ({ id, title: fallbackTitle, description: 'Private vragenimport uit CSV; inhoud en juistheid niet onafhankelijk gevalideerd.', sourceIds: [sourceId], questions: group }));
  return { ...parsed, questions, themes };
}

function excludeArchive(filePath) {
  if (filePath.split(/[\\/]/).some((part) => part.toLowerCase() === 'cortexvault')) throw new Error('CortexVault valt buiten deze importer. Selecteer een actieve bron.');
}

async function selectFiles(inputPath, recursive, results) {
  const resolved = path.resolve(inputPath);
  excludeArchive(resolved);
  const stat = await fs.lstat(resolved);
  if (stat.isSymbolicLink()) throw new Error('Symlinks worden niet geïmporteerd; selecteer het oorspronkelijke actieve bronbestand.');
  excludeArchive(await fs.realpath(resolved));
  if (stat.isDirectory()) {
    if (!recursive) throw new Error('Mapselectie vereist --recursive; selecteer bij voorkeur afzonderlijke relevante bestanden.');
    const entries = (await fs.readdir(resolved, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.toLowerCase() === 'cortexvault' || entry.isSymbolicLink()) continue;
      if (entry.isDirectory() || allowedExtensions.has(path.extname(entry.name).toLowerCase())) await selectFiles(path.join(resolved, entry.name), true, results);
    }
  } else if (stat.isFile()) {
    if (!allowedExtensions.has(path.extname(resolved).toLowerCase())) throw new Error('Niet ondersteund bronformaat; gebruik Markdown, JSON, CSV of TSV.');
    if (stat.size > maxFileBytes) throw new Error('Bronbestand te groot; splits de geselecteerde bron tot maximaal 15 MiB per bestand.');
    if (!results.includes(resolved)) results.push(resolved);
    if (results.length > maxFiles) throw new Error('Meer dan 1.000 geselecteerde bestanden; verklein de bronselectie.');
  } else throw new Error('Selectie is geen regulier bronbestand of map.');
}

export async function buildImport(files, { kind = 'vault', sourcePrefix = 'OWN', includeRaw = false } = {}) {
  const result = { schema: 'ima.content/v1', importedAt: new Date().toISOString(), publication: 'private', sources: [], themes: [], questions: [], records: [], warnings: [] };
  const seen = new Set();
  for (const file of files) {
    excludeArchive(path.resolve(file));
    excludeArchive(await fs.realpath(file));
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Import verwacht een regulier bronbestand; symlinks worden uitgesloten.');
    if (stat.size > maxFileBytes) throw new Error('Bronbestand groter dan de toegestane 15 MiB.');
    const input = (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '');
    const contentHash = createHash('sha256').update(input).digest('hex');
    if (seen.has(contentHash)) { result.warnings.push('Een identiek bronbestand is één keer verwerkt.'); continue; }
    seen.add(contentHash);
    const id = `${slug(sourcePrefix).toUpperCase()}-${contentHash.slice(0, 16)}`;
    const fileTitle = path.basename(file, path.extname(file));
    const extension = path.extname(file).toLowerCase();
    let parsed = { themes: [], questions: [] };
    let title = fileTitle;
    let format = extension.slice(1);
    if (extension === '.md' || extension === '.markdown') {
      parsed = parseMarkdownQuestionnaire(input, id, fileTitle);
      title = plainText(input.match(/^#\s+(.+)$/m)?.[1]) || fileTitle;
    } else if (extension === '.json') {
      parsed = parseJsonQuestions(JSON.parse(input), id, fileTitle);
    } else {
      parsed = parseCsvQuestions(input, id, fileTitle, extension === '.tsv' ? '\t' : undefined);
      format = parsed.questions.length ? 'question-csv' : 'lms-or-table-csv';
    }
    result.sources.push({ id, title, kind, status: 'read', readScope: `${format}; ${parsed.questions.length} herkenbare checkvragen verwerkt.`, publication: 'private', notes: `SHA-256 ${contentHash}. Oorspronkelijke broninhoud niet onafhankelijk gevalideerd. ${includeRaw ? 'Ruwe bron is op expliciete importoptie behouden.' : 'Ruwe bron en deelnemersrijen zijn niet behouden.'}`, ...(parsed.sourceMetadata && Object.keys(parsed.sourceMetadata).length ? { sourceMetadata: parsed.sourceMetadata } : {}), ...(parsed.documentGuidance ? { documentGuidance: parsed.documentGuidance } : {}), ...(parsed.sourceReferenceText ? { sourceReferenceText: parsed.sourceReferenceText } : {}) });
    result.themes.push(...parsed.themes);
    result.questions.push(...parsed.questions);
    if (result.questions.length > maxQuestions) throw new Error('Meer dan 10.000 vragen; verklein de bronselectie.');
    if (includeRaw) result.records.push({ sourceId: id, format, ...(parsed.rows ? { headers: parsed.headers, rows: parsed.rows } : { content: input }) });
    else if (parsed.rows) result.records.push({ sourceId: id, format, headers: parsed.headers, rowCount: parsed.rows.length });
    if (!parsed.questions.length) result.warnings.push(`${id}: bron geregistreerd zonder checkvragen; geen vragen gesynthetiseerd uit lesproza of LMS-voortgangsrijen.`);
  }
  const questionIds = result.questions.map((item) => item.id);
  if (new Set(questionIds).size !== questionIds.length) throw new Error('Dubbele vraag-ID in geselecteerde bronnen; corrigeer IDs vóór import.');
  return result;
}

function parseArguments(args) {
  const options = { inputs: [], out: path.join(privateRoot, 'content.json'), kind: 'vault', sourcePrefix: 'OWN', includeRaw: false, recursive: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--include-raw') options.includeRaw = true;
    else if (arg === '--recursive') options.recursive = true;
    else if (['--input', '--out', '--kind', '--source-prefix'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Waarde ontbreekt voor ${arg}.`);
      if (arg === '--input') options.inputs.push(value);
      if (arg === '--out') options.out = path.resolve(value);
      if (arg === '--kind') options.kind = value;
      if (arg === '--source-prefix') options.sourcePrefix = value;
    } else throw new Error(`Onbekende optie: ${arg}.`);
  }
  if (!['vault', 'questionnaire', 'reference', 'training', 'lms', 'web', 'other'].includes(options.kind)) throw new Error('Onbekende brontype --kind.');
  return options;
}

async function ensurePrivateOutput(output) {
  const ignore = await fs.readFile(path.join(repositoryRoot, '.gitignore'), 'utf8');
  if (!/^\/?private-data\/$/m.test(ignore)) throw new Error('private-data/ ontbreekt in .gitignore; herstel de uitsluiting vóór import.');
  const relative = path.relative(privateRoot, output);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Uitvoer moet een bestand binnen private-data/ zijn.');
  await fs.mkdir(privateRoot, { recursive: true, mode: 0o700 });
  const realRoot = await fs.realpath(privateRoot);
  if (realRoot !== privateRoot) throw new Error('private-data/ mag geen symlink zijn.');
  let parent = path.dirname(output);
  while (parent !== privateRoot) {
    try {
      if ((await fs.lstat(parent)).isSymbolicLink()) throw new Error('Uitvoermap bevat een symlink.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    parent = path.dirname(parent);
  }
  try {
    if ((await fs.lstat(output)).isSymbolicLink()) throw new Error('Uitvoerbestand mag geen symlink zijn.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write(usage); return; }
  if (!options.inputs.length) throw new Error('Selecteer minstens één bron met --input. Gebruik --help voor voorbeelden.');
  const files = [];
  for (const selected of options.inputs) await selectFiles(selected, options.recursive, files);
  if (!files.length) throw new Error('Geen ondersteunde bronbestanden in de selectie.');
  await ensurePrivateOutput(options.out);
  const content = await buildImport(files, options);
  const temporary = `${options.out}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, options.out);
  } catch (error) { await fs.unlink(temporary).catch(() => {}); throw error; }
  process.stdout.write(`Private intake gereed: ${content.sources.length} bronnen, ${content.themes.length} thema’s, ${content.questions.length} vragen.\n`);
  process.stdout.write(`Uitvoer: ${path.relative(repositoryRoot, options.out)}\n`);
  if (content.warnings.length) process.stdout.write(`${content.warnings.length} bronwaarschuwing(en); details staan alleen in het private importbestand.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // File-system errors often include a personal path; report the code without it.
    const message = error.code ? `Bestandsbewerking mislukt (${error.code}).` : error instanceof SyntaxError ? 'Ongeldige JSON-inhoud; corrigeer het geselecteerde bronbestand.' : error.message;
    process.stderr.write(`Import gestopt: ${message}\n`);
    process.exitCode = 1;
  });
}
