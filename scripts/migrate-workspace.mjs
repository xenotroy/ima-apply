#!/usr/bin/env node
/** Read-only legacy dossier export. Outputs stay private; nothing is uploaded. */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes, createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const maxRows = 5_000;
const maxFiles = 1_000;
const maxSourceBytes = 64 * 1024 * 1024;
const maxEvidenceFileBytes = 10_000_000;
const hash = value => createHash('sha256').update(value).digest('hex');
const string = value => typeof value === 'string' ? value : '';
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
const stableId = (kind, value) => `legacy-${kind}:${hash(String(value)).slice(0, 24)}`;
/** Stable report JSON: object keys sorted by code point, array order retained. */
export function canonicalMigrationReportJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalMigrationReportJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalMigrationReportJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const severities = ['none', 'first_aid', 'medical_treatment', 'lost_time', 'major', 'permanent_injury', 'fatality'];

const usage = `IMA legacy dossier migration (Node.js 24+)

  node scripts/migrate-workspace.mjs --markdown <IMA-workspace-directory>
       [--name <name>] [--out private-data/migrated-workspace.json]
  node scripts/migrate-workspace.mjs --sqlite <closed-database-copy>
       [--project-id <integer>] [--assume-utc] [--name <name>]
       [--out private-data/migrated-workspace.json]

Both commands create a separately validated browser workspace and migration report.
Original files are read-only. No uploads and no overwrite of existing exports.
Outputs must be under ignored private-data/. Multiple SQLite projects require an ID.
Original ratings and unsupported records remain raw provenance, never percentages.
--assume-utc explicitly interprets zone-less SQLite timestamps as UTC, with warnings.
`;

/** Use the actual browser boundary, rather than a second approximate schema. */
export async function loadWorkspaceApi() {
  const modules = new Map();
  const require = createRequire(path.join(repositoryRoot, 'web/package.json'));
  async function moduleUrl(filename) {
    if (modules.has(filename)) return modules.get(filename);
    // Authored browser modules include parameter properties; these require transform mode.
    const code = stripTypeScriptTypes(await fs.readFile(filename, 'utf8'), {mode:'transform'});
    let rewritten = code;
    const imports = [...code.matchAll(/(?:from\s+|import\s*)(['"])([^'"\n]+)\1/g)];
    for (const match of imports) {
      const relative = match[2];
      const url = relative.startsWith('.')
        ? await moduleUrl(path.resolve(path.dirname(filename), relative.endsWith('.ts') ? relative : `${relative}.ts`))
        : relative.startsWith('node:') ? relative : pathToFileURL(require.resolve(relative)).href;
      rewritten = rewritten.split(`${match[1]}${relative}${match[1]}`).join(`${match[1]}${url}${match[1]}`);
    }
    const url = `data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`;
    modules.set(filename, url);
    return url;
  }
  const model = await import(await moduleUrl(path.join(repositoryRoot, 'web/src/data/model.ts')));
  const validation = await import(await moduleUrl(path.join(repositoryRoot, 'web/src/data/validation.ts')));
  const questionDefinitions = await import(await moduleUrl(path.join(repositoryRoot, 'web/src/data/question-definition.ts')));
  const riskLibrary = await import(await moduleUrl(path.join(repositoryRoot, 'web/src/data/risk-library.ts')));
  const frozen = await import(await moduleUrl(path.join(repositoryRoot, 'web/src/data/frozen.ts')));
  const actionContext = await import(await moduleUrl(path.join(repositoryRoot, 'web/src/domain/action-context.ts')));
  return { ...model, ...validation, ...questionDefinitions, ...riskLibrary, ...frozen, ...actionContext };
}

function scalar(input) {
  const value = input.trim();
  if (!value || /^(?:null|~)$/i.test(value)) return null;
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw new Error('Unclosed YAML string');
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new Error('Unclosed YAML list');
    const inside = value.slice(1, -1).trim();
    if (!inside) return [];
    const parts = []; let start = 0; let quote = '';
    for (let index = 0; index < inside.length; index++) {
      const char = inside[index];
      if (quote) { if (char === quote && inside[index - 1] !== '\\') quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ',') { parts.push(inside.slice(start, index)); start = index + 1; }
    }
    if (quote) throw new Error('Unclosed YAML list string');
    parts.push(inside.slice(start));
    return parts.map(scalar);
  }
  if (/^(?:true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (/^[!&*{]/.test(value)) throw new Error('Unsupported YAML construction');
  // Avoid silently changing an unquoted string that contains a YAML comment.
  if (/\s#/.test(value)) throw new Error('Inline YAML comments require quoted values');
  return value;
}

/** The scalar/list subset written by IMA. Unsupported YAML stays raw, with a warning. */
export function parseLegacyMarkdown(input) {
  const normalized = input.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) throw new Error('Missing YAML frontmatter');
  const metadata = {}; const lines = match[1].split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = line.match(/^([a-zA-Z][a-zA-Z0-9_]*):(?:\s+(.*)|\s*)$/);
    if (!item) throw new Error('Unsupported YAML structure');
    const key = item[1].toLowerCase();
    if (['constructor', 'prototype', '__proto__'].includes(key) || Object.hasOwn(metadata, key)) throw new Error('Duplicate or unsafe YAML key');
    const value = item[2] ?? '';
    if (!value && /^\s*-\s+/.test(lines[index + 1] ?? '')) {
      const list = [];
      while (/^\s*-\s+/.test(lines[index + 1] ?? '')) list.push(scalar(lines[++index].replace(/^\s*-\s+/, '')));
      metadata[key] = list;
    } else if (/^[|>][-+]?$/.test(value)) {
      const block = [];
      while (/^\s+\S|^\s*$/.test(lines[index + 1] ?? '') && index + 1 < lines.length) block.push(lines[++index]);
      const indentation = Math.min(...block.filter(line => line.trim()).map(line => line.match(/^\s*/)[0].length), 0x7fffffff);
      const stripped = block.map(line => line.slice(indentation));
      metadata[key] = value[0] === '>' ? stripped.join(' ').trim() : stripped.join('\n').trimEnd();
    } else metadata[key] = scalar(value);
  }
  const sections = {};
  let section; const body = match[2];
  for (const line of body.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1].toLowerCase();
      if (Object.hasOwn(sections, section)) throw new Error('Duplicate Markdown section');
      sections[section] = [];
    } else if (section) sections[section].push(line);
  }
  return { metadata, sections: Object.fromEntries(Object.entries(sections).map(([key, lines]) => [key, lines.join('\n').trim()])), body, legacySha256: hash(normalized) };
}

function timestamp(value, context, sourceId, assumeUtc = false) {
  let input = string(value);
  if (assumeUtc && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(input)) {
    input = `${input.replace(' ', 'T')}Z`;
    warning(context, 'assumed_utc', sourceId, 'Zone-loos SQLite-tijdstip op expliciete --assume-utc keuze als UTC gelezen.');
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input) || !Number.isFinite(Date.parse(input))) return null;
  return new Date(input).toISOString();
}

function calendarDate(value) {
  const input = string(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || !Number.isFinite(Date.parse(input))) return '';
  return new Date(input).toISOString().slice(0, 10) === input ? input : '';
}

function warning(context, code, sourceId, message) { context.report.warnings.push({ code, sourceId, message }); }
function rawSource(context, { sourceId, title, format, raw, contentSha256, originalId = '', originalSchema = '' }) {
  context.workspace.sources.push({ id: sourceId, title, kind: 'other', status: 'read', readScope: format,
    publication: 'private', notes: 'Oorspronkelijk record behouden voor controle. Oude ratings zijn geen percentagewerking of nieuwe modelkalibratie.',
    format, contentSha256, originalId, originalSchema, raw });
}
function question(fields) {
  // This exact order is the dossier snapshot hash contract.
  return { id: fields.id, themeId: fields.themeId || 'legacy-unclassified', title: fields.title || fields.prompt,
    prompt: fields.prompt, route: 'verdieping', evidenceHints: fields.evidenceHints ?? [],
    assessmentGuidance: fields.assessmentGuidance ?? '', sourceIds: fields.sourceIds,
    suggestedHierarchy: [], roles: [],
    ...(fields.acceptanceCriteria !== undefined ? { acceptanceCriteria: fields.acceptanceCriteria } : {}),
    ...(fields.expectedEvidence !== undefined ? { expectedEvidence: fields.expectedEvidence } : {}),
    ...(fields.richFields !== undefined ? { richFields: fields.richFields } : {}),
    ...(fields.definition !== undefined ? { definition: fields.definition } : {}),
    ...(fields.legalReferences !== undefined ? { legalReferences: fields.legalReferences } : {}) };
}
function addFrozen(context, dossier, value, version) {
  const frozen = context.api.freezeQuestion(value, value.definition?.version ?? (version || 'legacy-import/1.0.0'));
  const existing = dossier.questions.find(item => item.id === value.id);
  if (existing && existing.sha256 !== frozen.sha256) throw new Error('Conflicting frozen question projection');
  if (!existing) dossier.questions.push(frozen);
  if (!context.workspace.questions.some(item => item.id === value.id)) context.workspace.questions.push(value);
  return frozen;
}
function newDossier(context, id, title, fields = {}) {
  const dossier = { id, title, departmentIds: [], scope: '', assessor: '', status: 'draft', createdAt: context.workspace.createdAt, questions: [], ...fields };
  for (const key of ['scope', 'assessor']) if (!dossier[key].trim()) {
    warning(context, 'dossier_unknown_metadata', id, `Dossier ${key} ontbreekt in de bron; expliciet onbekend, geen identiteit of scope afgeleid.`);
  }
  context.workspace.dossiers.push(dossier);
  return dossier;
}
async function contextFor(name, now) {
  const api = await loadWorkspaceApi();
  const workspace = api.createWorkspace(name);
  if (now) workspace.createdAt = workspace.updatedAt = now;
  return { api, workspace, report: { schema: 'ima.migration-report/v1', migratedAt: workspace.createdAt,
    target: 'IMA browser WorkspaceState schemaVersion 1', warnings: [], rules: [
      'Bronnen worden alleen gelezen; output is een afzonderlijke private export.',
      'Geen omzetting van legacy 1–3 ratings naar Kinney, LOPA of reductiepercentages.',
      'Oude bronhash en nieuw snapshot-JSON-hash zijn verschillende provenancevelden.',
      'Gemigreerde dossiers zijn concepten voor menselijke controle.',
      'De migratiedatum is een nieuwe projectiedatum, geen oorspronkelijk beoordelingstijdstip.',
    ] } };
}

async function selectedMarkdownFiles(root) {
  const files = [];
  async function walk(directory) {
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Markdown-invoer vereist een echte werkruimtemap, geen symlink.');
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || ['templates', 'attachments'].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error('Werkruimteselectie bevat een symlink; maak een gecontroleerde gewone bronkopie.');
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(filename);
      if (files.length > maxFiles) throw new Error('Meer dan 1.000 Markdown-records; splits de bronselectie.');
    }
  }
  await walk(root);
  return files;
}

/** Only the original, immediate action archive structure is allowed through hidden-directory filtering. */
async function selectedActionArchives(root, ordinaryCount, knownStems) {
  const folders = [];
  const directory = async filename => {
    let stat;
    try { stat = await fs.lstat(filename); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Actiearchiefselectie vereist een echte map, geen symlink.');
    return true;
  };
  const history = path.join(root, '.history');
  if (!await directory(history)) return folders;
  const actions = path.join(history, 'actions');
  if (!await directory(actions)) return folders;
  let selectedCount = ordinaryCount;
  for (const entry of (await fs.readdir(actions, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') && !knownStems.has(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error('Actiearchiefselectie bevat een symlink.');
    if (!entry.isDirectory()) continue;
    const folder = path.join(actions, entry.name);
    await directory(folder);
    const files = [];
    for (const file of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      // Preserve malformed/case-variant revision filenames too, but never recurse into an archive.
      if (!/^revision-.*\.md$/i.test(file.name)) continue;
      if (file.isSymbolicLink()) throw new Error('Actierevisie bevat een symlink.');
      if (!file.isFile()) continue;
      files.push(path.join(folder, file.name));
      if (++selectedCount > maxFiles) throw new Error('Meer dan 1.000 Markdown-records inclusief actiearchieven; splits de bronselectie.');
    }
    folders.push({ stem: entry.name, relativeDirectory: path.relative(root, folder).split(path.sep).join('/'), files });
    if (folders.length > maxFiles) throw new Error('Meer dan 1.000 actiearchiefmappen; splits de bronselectie.');
  }
  return folders;
}

function actionScalarLexeme(sourceText, key) {
  const frontmatter = sourceText?.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  return frontmatter?.match(new RegExp('^' + key + ':[ \\t]*(.*)$', 'mi'))?.[1].trim() ?? null;
}

function sourceActionScalar(metadata, key, sourceText) {
  const lexeme = actionScalarLexeme(sourceText, key);
  const parsed = metadata[key];
  // MarkdownDocument.String reads the original YAML scalar text; numeric/boolean
  // JavaScript coercions must not erase it. Its IsNull also applies to quoted null/~.
  if (parsed === undefined || parsed === null || typeof parsed === 'string' && /^(?:null|~)$/i.test(parsed))
    return { lexeme, value: '', confirmed: true };
  if (typeof parsed === 'string') return { lexeme, value: parsed.trim(), confirmed: true };
  if ((typeof parsed === 'number' || typeof parsed === 'boolean') && lexeme !== null)
    return { lexeme, value: lexeme, confirmed: true };
  return { lexeme, value: null, confirmed: false };
}

function sourceActionRevision(metadata, sourceText) {
  const scalar = sourceActionScalar(metadata, 'revision', sourceText);
  if (!scalar.confirmed) return null;
  if (metadata.schema === 'ima.action/v1' && !scalar.value) return 1; // Actual .NET parser default, not a fabricated event.
  if (!/^[+-]?\d+$/.test(scalar.value)) return null;
  const value = Number(scalar.value);
  return Number.isInteger(value) && value >= 1 && value <= 1_000_000 ? value : null;
}

function sourceActionIdentityEqual(left, right) {
  if (left === right) return true;
  // .NET OrdinalIgnoreCase is not JS Unicode lowercasing. Confirm the shared ASCII
  // subset only; a different non-ASCII spelling requires original-runtime review.
  return /^[\x00-\x7f]*$/.test(left + right) ? left.toLowerCase() === right.toLowerCase() : null;
}

function sourceActionStems(id) {
  // FileStem is OS-dependent in the original .NET code. Preserve both observed platform rules.
  const stem = windows => [...id].map(character => character === ':' ? '--'
    : /[\u0000-\u001f\u007f-\u009f/]/.test(character) || windows && /[<>"\\|?*]/.test(character) ? '-' : character).join('');
  return [...new Set([stem(false), stem(true)])].map(value => value + '--' + hash(id).slice(0, 16));
}

function archiveText(bytes) {
  // File.ReadAllText detects these BOMs before hashing its decoded exact string as UTF-8.
  if (bytes.subarray(0, 4).equals(Buffer.from([0xff, 0xfe, 0, 0])) || bytes.subarray(0, 4).equals(Buffer.from([0, 0, 0xfe, 0xff])))
    return { text: null, encoding: 'unconfirmed-utf32' };
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  try { return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding }; }
  catch { return { text: null, encoding: 'unconfirmed' }; }
}

async function preserveLegacyActionHistories(context, root, folders, records) {
  const actionSchemas = ['ima.action/v1', 'ima.action/v2'];
  const currents = records.filter(record => actionSchemas.includes(record.metadata.schema));
  const groups = new Map();
  for (const current of currents) {
    const previous = sourceActionScalar(current.metadata, 'previous_revision_sha256', current.sourceText);
    if (sourceActionRevision(current.metadata, current.sourceText) > 1 || previous.value || !previous.confirmed) {
      groups.set(current.sourceId, { current, folders: [], ambiguous: false });
    }
  }
  for (const folder of folders) {
    const matches = currents.filter(current => string(current.metadata.id).trim() && sourceActionStems(string(current.metadata.id).trim()).includes(folder.stem));
    const key = matches.length === 1 ? matches[0].sourceId : 'directory:' + folder.relativeDirectory;
    if (!groups.has(key)) groups.set(key, { current: matches.length === 1 ? matches[0] : null, folders: [], ambiguous: matches.length > 1 });
    groups.get(key).folders.push(folder);
  }
  for (const [key, group] of groups) {
    const archives = [];
    const issues = [];
    let unconfirmed = false;
    const current = group.current;
    const currentSource = current && context.workspace.sources.find(source => source.id === current.sourceId);
    const manifestId = stableId('action-history', key);
    const reportSourceId = current?.sourceId || manifestId;
    const issue = (code, sourceId, message) => {
      issues.push({ code, sourceId, message });
      warning(context, code, sourceId, message);
    };
    if (!current) {
      unconfirmed = true;
      issue(group.ambiguous ? 'legacy_action_history_current_ambiguous' : 'legacy_action_history_current_missing', reportSourceId,
        'Archiefmap heeft geen unieke actuele actie volgens de oorspronkelijke InternalActionStem-regel; geen actuele actie gegokt.');
    }
    if (group.folders.length > 1) issue('legacy_action_history_directory_ambiguous', reportSourceId, 'Meer dan één archiefmap past bij dezelfde actuele actie; alle bestanden blijven afzonderlijk bewaard.');
    for (const folder of group.folders) for (const filename of folder.files) {
      const stat = await fs.lstat(filename);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Actierevisie is geen gewoon bestand of bevat een symlink.');
      if (stat.size > maxSourceBytes) throw new Error('Actierevisiebron te groot.');
      const bytes = await fs.readFile(filename);
      const relativePath = path.relative(root, filename).split(path.sep).join('/');
      const sourceId = stableId('md-action-archive', relativePath);
      const decoded = archiveText(bytes);
      let parsed;
      if (decoded.text !== null) { try { parsed = parseLegacyMarkdown(decoded.text); } catch { /* Unsupported source syntax remains exact raw. */ } }
      const m = parsed?.metadata;
      const filenameMatch = path.basename(filename).match(/^revision-(\d+)\.md$/);
      const fileNumber = filenameMatch ? Number(filenameMatch[1]) : null;
      const fileRevision = Number.isInteger(fileNumber) && fileNumber >= 1 && fileNumber <= 2_147_483_647 ? fileNumber : null;
      rawSource(context, { sourceId, title: string(m?.title) || path.basename(filename), format: 'legacy-action-revision/v1',
        raw: { relativePath, bytesBase64: bytes.toString('base64'), byteLength: bytes.length, encoding: decoded.encoding,
          ...(decoded.text !== null ? { text: decoded.text } : {}), ...(m ? { metadata: m } : {}),
          ...(parsed ? { legacyNormalizedSha256: parsed.legacySha256 } : {}) },
        contentSha256: hash(bytes), originalId: string(m?.id), originalSchema: string(m?.schema) });
      const previous = m && sourceActionScalar(m, 'previous_revision_sha256', decoded.text);
      const archive = { sourceId, relativePath, fileRevision, parsedRevision: m?.revision ?? null,
        revisionLexeme: actionScalarLexeme(decoded.text, 'revision'),
        revision: m && actionSchemas.includes(m.schema) ? sourceActionRevision(m, decoded.text) : null,
        originalId: string(m?.id) || null, originalSchema: string(m?.schema) || null, byteLength: bytes.length,
        bytesSha256: hash(bytes), exactTextSha256: decoded.text !== null ? hash(decoded.text) : null,
        normalizedDocumentSha256: parsed?.legacySha256 ?? null, encoding: decoded.encoding,
        parsedPreviousRevisionSha256: m?.previous_revision_sha256 ?? null,
        previousRevisionSha256Lexeme: previous?.lexeme ?? null,
        previousRevisionSha256: previous?.value ?? null,
        parserStatus: parsed ? 'supported-subset' : 'unconfirmed' };
      archives.push(archive);
      if (fileRevision === null) issue('legacy_action_history_filename_invalid', sourceId, 'Archiefnaam heeft geen oorspronkelijke positieve revision-<nummer>.md; volledige bytes blijven behouden.');
      if (!parsed) {
        unconfirmed = true;
        issue(decoded.text === null ? 'legacy_action_history_encoding_unconfirmed' : 'legacy_action_history_parser_unconfirmed', sourceId,
          'De broncodering of YAML/sectiedialect is niet volledig bevestigd; bytes behouden en geen hashketen-validiteit gegokt.');
        continue;
      }
      if (!actionSchemas.includes(m.schema) || !string(m.id).trim() || archive.revision === null) {
        unconfirmed = true;
        issue('legacy_action_history_record_unconfirmed', sourceId, 'Archief mist bruikbaar oorspronkelijk actieschema, ID of revisie; metadata en bytes blijven behouden.');
      }
      if (previous && !previous.confirmed) {
        unconfirmed = true;
        issue('legacy_action_history_predecessor_scalar_unconfirmed', sourceId, 'Oorspronkelijke voorgangerhash is geen bevestigde YAML-scalar; geen lege voorganger gegokt.');
      }
      if (current) {
        const sameId = sourceActionIdentityEqual(string(m.id).trim(), string(current.metadata.id).trim());
        if (sameId === false) issue('legacy_action_history_id_mismatch', sourceId, 'Gearchiveerde actie-ID past niet bij de actuele actie van deze oorspronkelijke archiefmap.');
        else if (sameId === null) {
          unconfirmed = true;
          issue('legacy_action_history_id_comparison_unconfirmed', sourceId, 'Verschillende niet-ASCII-ID’s vereisen .NET OrdinalIgnoreCase-broncontrole; geen overeenkomst of mismatch gegokt.');
        }
      }
      if (fileRevision !== null && archive.revision !== null && archive.revision !== fileRevision)
        issue('legacy_action_history_revision_mismatch', sourceId, 'De gedeclareerde archiefrevisie wijkt af van de revisie in de bestandsnaam.');
    }
    archives.sort((a, b) => (a.fileRevision ?? Number.MAX_SAFE_INTEGER) - (b.fileRevision ?? Number.MAX_SAFE_INTEGER) || a.relativePath.localeCompare(b.relativePath));
    const byRevision = new Map();
    for (const archive of archives.filter(entry => entry.fileRevision !== null)) {
      if (!byRevision.has(archive.fileRevision)) byRevision.set(archive.fileRevision, []);
      byRevision.get(archive.fileRevision).push(archive);
    }
    for (const [revision, entries] of byRevision) if (entries.length > 1)
      issue('legacy_action_history_duplicate_revision', reportSourceId, 'Meer dan één archiefbestand declareert bestandsrevisie ' + revision + '; geen willekeurige voorganger gekozen.');
    const currentRevision = current ? sourceActionRevision(current.metadata, current.sourceText) : null;
    const currentPrevious = current && sourceActionScalar(current.metadata, 'previous_revision_sha256', current.sourceText);
    if (currentPrevious && !currentPrevious.confirmed) {
      unconfirmed = true;
      issue('legacy_action_history_predecessor_scalar_unconfirmed', current.sourceId, 'Actuele oorspronkelijke voorgangerhash is geen bevestigde YAML-scalar; geen lege voorganger gegokt.');
    }
    if (current && currentRevision === null) {
      unconfirmed = true;
      issue('legacy_action_history_current_unconfirmed', current.sourceId, 'Actuele oorspronkelijke revisie is onbekend of buiten de ondersteunde brongrens.');
    }
    const missingRanges = [];
    if (currentRevision !== null) {
      let expected = 1;
      for (const revision of [...byRevision.keys()].filter(value => value < currentRevision).sort((a, b) => a - b)) {
        if (revision > expected) missingRanges.push({ from: expected, through: revision - 1 });
        expected = revision + 1;
      }
      if (expected < currentRevision) missingRanges.push({ from: expected, through: currentRevision - 1 });
      for (const range of missingRanges) issue('legacy_action_history_missing_revision', current.sourceId,
        'Oorspronkelijke archiefrevisie(s) ontbreken: ' + range.from + ' t/m ' + range.through + '. Geen voorganger gereconstrueerd.');
      for (const [revision] of byRevision) if (revision > currentRevision)
        issue('legacy_action_history_future_revision', current.sourceId, 'Archiefrevisie ' + revision + ' ligt vóór op actuele revisie ' + currentRevision + '; mogelijke rollback of fork.');
    }
    const checkHash = (entry, revision) => {
      if (!entry || revision === null) return;
      const declared = entry.previousRevisionSha256?.trim() ?? '';
      if (revision === 1) {
        if (declared) issue('legacy_action_history_initial_hash_invalid', entry.sourceId, 'Eerste oorspronkelijke revisie verwijst onverwacht naar een voorganger.');
        return;
      }
      const predecessors = byRevision.get(revision - 1) ?? [];
      if (predecessors.length !== 1 || predecessors[0].exactTextSha256 === null || !declared) {
        unconfirmed = true;
        issue('legacy_action_history_predecessor_unconfirmed', entry.sourceId, 'Geen unieke exact gedecodeerde voorgangerhash beschikbaar voor revisie ' + revision + '.');
      } else if (declared.toLowerCase() !== predecessors[0].exactTextSha256)
        issue('legacy_action_history_hash_mismatch', entry.sourceId, 'Oorspronkelijke previous_revision_sha256 wijkt af van de exacte teksthash van revisie ' + (revision - 1) + '.');
    };
    for (const archive of archives) if (archive.parserStatus === 'supported-subset' && archive.originalSchema && actionSchemas.includes(archive.originalSchema))
      checkHash(archive, archive.fileRevision);
    const currentEntry = current ? { sourceId: current.sourceId, originalId: current.metadata.id, originalSchema: current.metadata.schema,
      parsedRevision: current.metadata.revision ?? null, revisionLexeme: actionScalarLexeme(current.sourceText, 'revision'), revision: currentRevision,
      relativePath: currentSource.raw.relativePath, bytesSha256: currentSource.contentSha256,
      exactTextSha256: hash(currentSource.raw.text), normalizedDocumentSha256: current.legacySha256,
      parsedPreviousRevisionSha256: current.metadata.previous_revision_sha256 ?? null,
      previousRevisionSha256Lexeme: currentPrevious.lexeme, previousRevisionSha256: currentPrevious.value,
      browserActionId: context.workspace.actions.some(action => action.id === current.targetId) ? current.targetId : null } : null;
    checkHash(currentEntry, currentRevision);
    if (currentEntry && byRevision.has(currentRevision)) for (const prepared of byRevision.get(currentRevision)) {
      if (prepared.exactTextSha256 !== currentEntry.exactTextSha256)
        issue('legacy_action_history_prepared_revision_changed', prepared.sourceId, 'Archiefbestand voor de actuele revisie wijkt af van de actuele bron; mogelijke rollback of fork.');
    }
    const manifest = { schema: 'ima.legacy-action-history/v1', current: currentEntry,
      relativeDirectories: group.folders.map(folder => folder.relativeDirectory).sort(),
      expectedDirectoryStems: current ? sourceActionStems(string(current.metadata.id).trim()) : [],
      archives, missingRanges, issues, hashChainStatus: issues.length ? 'issues' : unconfirmed ? 'unconfirmed' : 'consistent',
      validationScope: 'source-identity (exact equality or ASCII OrdinalIgnoreCase subset), original revision/previous-hash scalars, revision-files and SHA-256 of exact decoded text; not full .NET parser/lifecycle validation or authenticated authorship',
      hashAlgorithm: 'SHA-256(UTF-8(File.ReadAllText source string)); CRLF is retained; a BOM is decoded, not included as a character',
      interpretation: 'Original source consistency only; no new browser events, actor, time or effectiveness approval.' };
    context.workspace.contentRecords ??= [];
    context.workspace.contentRecords.push({ id: manifestId, sourceIds: [current?.sourceId, ...archives.map(archive => archive.sourceId)].filter(Boolean), format: manifest.schema,
      publication: 'private', manifest, manifestSha256: hash(canonicalMigrationReportJson(manifest)) });
    warning(context, 'legacy_action_history_requires_review', reportSourceId,
      'Oorspronkelijke actiearchieven en inspectiemanifest ' + manifestId + ' behouden (' + archives.length + ' bestanden; keten ' + manifest.hashChainStatus + '). Bronconsistentie is geen nieuwe lifecycle- of effectgoedkeuring.');
  }
}

export async function migrateMarkdown(root, options = {}) {
  root = path.resolve(root);
  const context = await contextFor(options.name || 'Gemigreerde IMA-werkruimte', options.now);
  const records = [];
  const selected = await selectedMarkdownFiles(root);
  for (const filename of selected) {
    const stat = await fs.stat(filename);
    if (stat.size > maxSourceBytes) throw new Error('Markdown-bron te groot.');
    const bytes = await fs.readFile(filename);
    const rawText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const relative = path.relative(root, filename).split(path.sep).join('/');
    const sourceId = stableId('md-source', relative);
    let parsed;
    try { parsed = parseLegacyMarkdown(rawText); } catch {
      rawSource(context, { sourceId, title: path.basename(filename), format: 'legacy-markdown-unparsed', raw: { relativePath: relative, text: rawText }, contentSha256: hash(bytes) });
      warning(context, 'markdown_not_projected', sourceId, 'Frontmatter of secties niet veilig herkend; volledige tekst bewaard, geen typed record gegokt.');
      continue;
    }
    const m = parsed.metadata;
    rawSource(context, { sourceId, title: string(m.title) || path.basename(filename), format: 'legacy-markdown', raw: { relativePath: relative, text: rawText, metadata: m, legacyNormalizedSha256: parsed.legacySha256 }, contentSha256: hash(bytes), originalId: string(m.id), originalSchema: string(m.schema) });
    records.push({ ...parsed, sourceText: rawText, sourceId, targetId: stableId('md', `${m.schema}|${m.id}|${relative}`) });
  }
  const knownArchiveStems = new Set(records.filter(record => ['ima.action/v1', 'ima.action/v2'].includes(record.metadata.schema))
    .flatMap(record => string(record.metadata.id).trim() ? sourceActionStems(string(record.metadata.id).trim()) : []));
  const archiveFolders = await selectedActionArchives(root, selected.length, knownArchiveStems);
  const { workspace } = context;
  const bySchema = schema => records.filter(record => record.metadata.schema === schema);
  const unique = (schema, id) => { const candidates = bySchema(schema).filter(record => string(record.metadata.id).toLowerCase() === string(id).toLowerCase()); return id && candidates.length === 1 ? candidates[0] : null; };
  // Original source_ids have no schema discriminator. Resolve across all selected
  // active records, not the first matching collection. Different Unicode case
  // spellings require original-runtime review; JS case-folding is not .NET's
  // OrdinalIgnoreCase. Its possible matches are retained as ambiguity, not credit.
  const actionRelationCandidates = (id, schema) => (schema ? bySchema(schema) : records).filter(record => {
    const actual = string(record.metadata.id);
    return actual === id || actual && (actual.toLowerCase() === id.toLowerCase() || actual.toUpperCase() === id.toUpperCase());
  });
  const actionRelationUnique = (id, schema) => {
    const candidates = actionRelationCandidates(id, schema);
    return candidates.length === 1 && sourceActionIdentityEqual(string(candidates[0].metadata.id), id) === true ? candidates[0] : null;
  };
  const originalQuestion = (id, version, sha256) => {
    const matches = bySchema('ima.rie-question-definition/v1').filter(record => string(record.metadata.id).toLowerCase() === string(id).toLowerCase() && record.metadata.version === version && record.legacySha256 === string(sha256).toLowerCase());
    return matches.length === 1 ? matches[0] : null;
  };
  const projectedQuestion = record => question({ id: record.targetId, title: string(record.metadata.title), prompt: record.sections.vraag,
    themeId: strings(record.metadata.topic_ids)[0], evidenceHints: [],
    assessmentGuidance: record.sections.toelichting ?? '',
    ...(record.sections.acceptatiecriteria !== undefined ? { acceptanceCriteria: record.sections.acceptatiecriteria } : {}),
    ...(record.sections['verwacht bewijs'] !== undefined ? { expectedEvidence: record.sections['verwacht bewijs'] } : {}), sourceIds: [record.sourceId],
    ...(record.sections.wetgeving !== undefined ? { legalReferences: record.sections.wetgeving } : {}) });
  const workspaceRecord = bySchema('ima.workspace/v1')[0];
  if (!options.name && string(workspaceRecord?.metadata.title)) workspace.name = workspaceRecord.metadata.title;
  const brfProjectedSources = new Set();
  for (const record of bySchema('ima.taxonomy-term/v1')) {
    const m = record.metadata;
    // Only the actually selected, explicitly draft local BRF namespace is known.
    // This does not seed the browser or convert free investigation codes.
    const description = record.body.trimStart().replace(/^# [^\n]*(?:\n|$)/, '').trim();
    const identifiers = [m.id, m.taxonomy, m.version].map(string);
    const duplicates = bySchema('ima.taxonomy-term/v1').filter(item => string(item.metadata.id).toLowerCase() === string(m.id).toLowerCase() && item.metadata.version === m.version);
    if (m.taxonomy !== 'ima-core:taxonomy:brf' || m.status !== 'draft' || identifiers.some(value => !value.trim() || value.length > 160) || !string(m.title).trim() || !description || duplicates.length !== 1) {
      warning(context, 'brf_raw_only', record.sourceId, 'Alleen exact herkenbare unieke draft-BRF-definities worden geprojecteerd; onbekende taxonomie/status, ontbrekende betekenis of dubbele identiteit/versie blijft volledig raw.');
      continue;
    }
    const source = workspace.sources.find(item => item.id === record.sourceId);
    workspace.basisRiskFactorRecords.push({
      id: stableId('brf-version', `${m.id}|${m.version}|${record.legacySha256}`),
      factorId: m.id, taxonomy: m.taxonomy, code: m.id, title: m.title, version: m.version,
      status: 'draft', description,
      sourceReference: `Oorspronkelijke Markdown: ${source.raw.relativePath} [${record.sourceId}] | bron-SHA256 ${record.legacySha256}`,
      owner: '', createdBy: '', createdAt: workspace.createdAt,
      changeNote: 'Structurele migratieprojectie van de geselecteerde draft-bron. Vastleggingstijd is de nieuwe projectiedatum; oorspronkelijke auteur, eigenaar en historische vastleggingstijd zijn onbekend.',
      statusHistory: [],
    });
    brfProjectedSources.add(record.sourceId);
    warning(context, 'brf_draft_projection', record.sourceId, 'BRF-ID, versie en betekenis exact uit draft-bron behouden. Nieuwe createdAt is expliciet migratieprojectiedatum; geen eigenaar, oude actor, bronvalidatie of causaal oordeel afgeleid.');
    if (string(m.parent_id)) warning(context, 'brf_parent_unversioned', record.sourceId, 'Oorspronkelijke parent_id bevat geen concrete definitieversie; relatie blijft raw, geen bovenliggende versie gekozen.');
  }
  for (const record of bySchema('ima.rie-question-definition/v1')) {
    if (record.sections.vraag) workspace.questions.push(projectedQuestion(record));
    else warning(context, 'question_raw_only', record.sourceId, 'Vraagdefinitie zonder afzonderlijke Vraag-sectie blijft raw.');
  }
  for (const record of bySchema('ima.topic/v1')) {
    if (!string(record.metadata.title)) { warning(context, 'topic_raw_only', record.sourceId, 'Onderwerp zonder titel blijft raw.'); continue; }
    workspace.topics.push({ id: record.targetId, title: record.metadata.title, category: string(record.metadata.category), description: record.body, aliases: strings(record.metadata.aliases) });
  }
  const topicMap = new Map(bySchema('ima.topic/v1').filter(record => workspace.topics.some(topic => topic.id === record.targetId) && unique('ima.topic/v1', record.metadata.id) === record).map(record => [string(record.metadata.id).toLowerCase(), record.targetId]));
  const mappedRefs = (ids, schema, sourceId) => strings(ids).flatMap(id => {
    const record = unique(schema, id);
    if (record) return [record.targetId];
    warning(context, 'unresolved_relation', sourceId, `Relatie ${schema} → ${id} ontbreekt of is niet uniek; originele ID blijft in raw record.`);
    return [];
  });
  for (const record of bySchema('ima.legal-update/v1')) {
    const m = record.metadata;
    if (!/^https?:\/\//.test(string(m.official_uri)) || !['signal', 'published', 'effective', 'superseded', 'withdrawn'].includes(m.status) || !string(m.title) || !string(m.jurisdiction) || !calendarDate(m.last_verified_on) || !record.sections.samenvatting) {
      warning(context, 'legal_not_projected', record.sourceId, 'Wetgevingsrecord mist geldige officiële URL/status; raw behouden.'); continue;
    }
    workspace.legalRecords.push({ id: record.targetId, title: string(m.title), officialUrl: m.official_uri, citation: string(m.citation), jurisdiction: string(m.jurisdiction), status: m.status,
      effectiveOn: calendarDate(m.effective_on), lastVerifiedOn: calendarDate(m.last_verified_on), summary: record.sections.samenvatting || '', impact: record.sections.impact || '', topicIds: strings(m.topic_ids).flatMap(id => topicMap.has(id.toLowerCase()) ? [topicMap.get(id.toLowerCase())] : []) });
  }
  // Definitions are enriched only after their actual relation targets are known.
  // A source snapshot is never promoted to managed status by a migration default.
  const managedCandidates = new Map();
  for (const record of bySchema('ima.rie-question-definition/v1')) {
    const m = record.metadata; const q = workspace.questions.find(item => item.id === record.targetId);
    if (!q) continue;
    const predecessor = string(m.supersedes_id) ? unique('ima.rie-question-definition/v1', m.supersedes_id) : undefined;
    const listFieldsValid = ['topic_ids', 'legal_ids', 'tags'].every(key => m[key] === undefined || Array.isArray(m[key]) && m[key].every(value => typeof value === 'string' && value.trim()));
    if (!listFieldsValid || unique('ima.rie-question-definition/v1', m.id) !== record || string(m.supersedes_id) && !predecessor) {
      warning(context, 'question_definition_unmanaged', record.sourceId, 'Beheerde bronmetadata heeft onbruikbare/dubbele identiteit, lijsten of voorganger; exacte inhoud blijft onbeheerd met volledig raw bronrecord.'); continue;
    }
    const definition = { schema: 'ima.question-definition/v1', version: m.version, status: m.status,
      contentPackageId: m.content_package_id, contentPackageVersion: m.content_package_version,
      ...(predecessor ? { supersedesId: predecessor.targetId } : {}),
      topicIds: [...new Set(mappedRefs(m.topic_ids, 'ima.topic/v1', record.sourceId).filter(id => workspace.topics.some(item => item.id === id)))],
      legalIds: [...new Set(mappedRefs(m.legal_ids, 'ima.legal-update/v1', record.sourceId).filter(id => workspace.legalRecords.some(item => item.id === id)))],
      tags: strings(m.tags), sourcePath: workspace.sources.find(source => source.id === record.sourceId).raw.relativePath, sourceSha256: record.legacySha256 };
    for (const [sourceKey, targetKey] of [['created_at', 'createdAt'], ['updated_at', 'updatedAt']]) {
      const time = timestamp(m[sourceKey], context, record.sourceId);
      if (time) definition[targetKey] = time;
      else if (string(m[sourceKey])) warning(context, 'legacy_time_unresolved', record.sourceId, `${sourceKey} blijft historisch onbekend wegens ontbrekende/ongeldige tijdzone; bronwaarde blijft raw.`);
    }
    try { context.api.assertManagedQuestion({ ...q, definition }); managedCandidates.set(record.targetId, { record, q, definition }); }
    catch { warning(context, 'question_definition_unmanaged', record.sourceId, 'Vraag-/pakketversie of status is niet bruikbaar in het beheerde browsermodel; geen versie/status afgeleid. Afzonderlijke brontekst en metadata blijven behouden.'); }
  }
  // An unusable predecessor invalidates the complete successor chain. Do not
  // silently drop supersedes_id merely to make a definition pass validation.
  let candidateChanged;
  do {
    candidateChanged = false;
    for (const [id, candidate] of managedCandidates) {
      const meta = candidate.definition, previous = meta.supersedesId && managedCandidates.get(meta.supersedesId);
      if (meta.supersedesId && (!previous || previous.definition.contentPackageId.toLowerCase() !== meta.contentPackageId.toLowerCase() ||
          !context.api.isHigherQuestionVersion(meta.version, previous.definition.version) || !context.api.isHigherQuestionVersion(meta.contentPackageVersion, previous.definition.contentPackageVersion) ||
          meta.createdAt && previous.definition.createdAt && Date.parse(meta.createdAt) < Date.parse(previous.definition.createdAt))) {
        managedCandidates.delete(id); candidateChanged = true;
        warning(context, 'question_definition_unmanaged', candidate.record.sourceId, 'Opvolger mist een aantoonbare bruikbare voorganger in hetzelfde pakket met hogere vraag- én pakketversie; relatie blijft raw zonder een versie te raden.');
      }
    }
  } while (candidateChanged);
  for (const candidate of managedCandidates.values()) candidate.q.definition = candidate.definition;
  const originalPackageHash = (id, version) => {
    const definitions = bySchema('ima.rie-question-definition/v1').filter(record => string(record.metadata.content_package_id).toLowerCase() === id.toLowerCase() && record.metadata.content_package_version === version);
    if (!definitions.length || definitions.some(record => unique('ima.rie-question-definition/v1', record.metadata.id) !== record)) return null;
    return hash(['ima.rie-question-content-package/v1', id, version, ...definitions.map(record => `${record.metadata.id}@${record.metadata.version}#sha256:${record.legacySha256}`).sort()].join('\n'));
  };
  for (const record of bySchema('ima.rie-assessment/v1')) {
    const m = record.metadata;
    if (!string(m.title)) { warning(context, 'assessment_raw_only', record.sourceId, 'Assessment zonder titel blijft raw.'); continue; }
    const dossier = newDossier(context, record.targetId, string(m.title), { scope: record.sections['doel en reikwijdte'] || '', assessor: string(m.assessor) });
    if (m.status !== 'draft') warning(context, 'assessment_requires_review', record.sourceId, 'Legacy dossierstatus raw behouden; nieuwe projectie staat op draft totdat provenance en overdracht zijn gecontroleerd.');
    for (const reference of strings(m.question_refs)) {
      const ref = reference.match(/^(.+)@([^@#]+)#sha256:([a-f0-9]{64})$/i);
      const original = ref && originalQuestion(ref[1], ref[2], ref[3]);
      if (!original || !original.sections.vraag) {
        warning(context, 'frozen_reference_unavailable', record.sourceId, 'Bevroren vraagreferentie kan niet tegen de geselecteerde vraagbron worden bevestigd; raw referentie blijft behouden.'); continue;
      }
      addFrozen(context, dossier, workspace.questions.find(q => q.id === original.targetId), ref[2]);
    }
    const downgradePackages = new Set();
    const selectedVersions = new Map();
    for (const q of dossier.questions.filter(q => q.definition)) {
      const meta = q.definition, key = meta.contentPackageId.toLowerCase();
      if (bySchema('ima.rie-question-definition/v1').some(source => string(source.metadata.content_package_id).toLowerCase() === key && source.metadata.content_package_version === meta.contentPackageVersion && !managedCandidates.has(source.targetId))) downgradePackages.add(key);
      if (meta.status !== 'active' || selectedVersions.has(key) && selectedVersions.get(key) !== meta.contentPackageVersion) downgradePackages.add(key);
      selectedVersions.set(key, meta.contentPackageVersion);
      const refs = strings(m.content_package_refs).map(ref => ref.match(/^(.+)@([^@#]+)#sha256:([a-f0-9]{64})$/i)).filter(Boolean)
        .filter(ref => ref[1].toLowerCase() === key && ref[2] === meta.contentPackageVersion);
      if (refs.length > 1 || refs.length === 1 && originalPackageHash(refs[0][1], refs[0][2]) !== refs[0][3].toLowerCase()) downgradePackages.add(key);
      if (!refs.length) warning(context, 'package_frozen_at_export', record.sourceId, 'Originele pakketreferentie ontbreekt. Volledige beschikbare bronpakketversie wordt bij deze export vastgelegd; een historische pakketfreeze is niet bewezen.');
    }
    if (downgradePackages.size) {
      dossier.questions = dossier.questions.map(q => {
        if (!q.definition || !downgradePackages.has(q.definition.contentPackageId.toLowerCase())) return q;
        const { definition, version, sha256, ...content } = q;
        return context.api.freezeQuestion(content, version);
      });
      warning(context, 'package_reference_unconfirmed', record.sourceId, 'Pakketbronhash/inhoud, actieve selectie of enkele pakketversie is niet bevestigd. Exacte vragen blijven bevroren, maar dit dossier claimt voor die vragen geen beheerde pakketfreeze.');
    }
    const snapshots = context.api.captureQuestionPackages(dossier.questions.filter(q => q.definition).map(q => q.id), { ...workspace, dossiers: workspace.dossiers.filter(item => item !== dossier) });
    if (snapshots.length) dossier.contentPackageSnapshots = snapshots;
  }
  const dossierFor = (oldId, sourceId) => {
    const record = unique('ima.rie-assessment/v1', oldId);
    const dossier = record && workspace.dossiers.find(item => item.id === record.targetId);
    if (!dossier) warning(context, 'missing_assessment', sourceId, 'Assessment-relatie ontbreekt of is dubbel; record blijft raw zonder verzonnen dossier.');
    return dossier;
  };
  const evidenceProjected = new Set();
  for (const record of bySchema('ima.rie-evidence/v1')) {
    const m = record.metadata; const dossier = dossierFor(m.assessment_id, record.sourceId);
    const time = timestamp(m.captured_at, context, record.sourceId);
    const local = string(m.relative_path); const remote = string(m.source_uri);
    const reference = local || remote;
    const expectedSha256 = string(m.sha256).toLowerCase();
    const hasExpectedHash = /^[a-f0-9]{64}$/.test(expectedSha256);
    const mime = string(m.mime_type);
    const hasMime = /^[a-z\d!#$&^_.+-]+\/[a-z\d!#$&^_.+-]+$/i.test(mime);
    const capturedBy = string(m.captured_by);
    const hasCapturer = Boolean(capturedBy.trim()) && capturedBy.length <= 2_000 && !/[\x00-\x1f]/.test(capturedBy);
    let verifiedByteLength;
    if (!dossier || !time || !reference || !string(m.title) || !record.sections.beschrijving || !['document', 'photograph', 'interview', 'measurement', 'record', 'other'].includes(m.kind)) {
      warning(context, 'evidence_not_projected', record.sourceId, 'Bewijs mist vereiste bekende velden; raw behouden.'); continue;
    }
    if (Boolean(local) === Boolean(remote)) { warning(context, 'evidence_reference_ambiguous', record.sourceId, 'Legacy bewijs moet precies één lokale of HTTP(S)-bron hebben; raw behouden.'); continue; }
    if (remote) {
      try { if (!['http:', 'https:'].includes(new URL(remote).protocol)) throw new Error(); }
      catch { warning(context, 'evidence_reference_unsupported', record.sourceId, 'Niet-HTTP(S)-bron wordt uitsluitend raw behouden.'); continue; }
    }
    if (string(m.relative_path)) {
      const relative = m.relative_path;
      if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..' || part === '.')) {
        warning(context, 'unsafe_attachment_reference', record.sourceId, 'Bijlageverwijzing buiten de werkruimte wordt niet geopend.'); continue;
      }
      try {
        const filename = path.resolve(root, relative);
        const real = await fs.realpath(filename);
        const realRoot = await fs.realpath(root);
        if (!real.startsWith(`${realRoot}${path.sep}`) || (await fs.lstat(filename)).isSymbolicLink()) throw new Error('Unsafe reference');
        const stat = await fs.stat(filename);
        if (!stat.isFile() || stat.size > maxEvidenceFileBytes) {
          warning(context, 'attachment_size_unavailable', record.sourceId, 'Bijlage is geen regulier bestand of overschrijdt 10.000.000 bytes; bronmetadata blijft behouden zonder byteoverdracht.');
          throw new Error('Attachment size unavailable');
        }
        // Read at most the cap plus one byte even if the file grows after stat.
        // This pass establishes provenance, never transfers or embeds the bytes.
        const handle = await fs.open(filename, 'r');
        const digest = createHash('sha256');
        let byteLength = 0;
        try {
          const buffer = Buffer.alloc(64 * 1024);
          for (;;) {
            const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, maxEvidenceFileBytes + 1 - byteLength));
            if (!bytesRead) break;
            byteLength += bytesRead;
            if (byteLength > maxEvidenceFileBytes) throw new Error('Attachment grew beyond size limit');
            digest.update(buffer.subarray(0, bytesRead));
          }
        } finally { await handle.close(); }
        if (digest.digest('hex') !== expectedSha256) warning(context, 'attachment_hash_mismatch', record.sourceId, 'Werkelijke bijlagehash wijkt af van de legacy bewijshash; projectie blijft unverified.');
        else verifiedByteLength = byteLength;
      } catch { warning(context, 'attachment_unavailable', record.sourceId, 'Bijlage niet veilig beschikbaar; alleen verwijzing en originele metadata zijn behouden.'); }
    }
    if (!hasExpectedHash) warning(context, 'attachment_hash_unresolved', record.sourceId, 'Oorspronkelijke bijlage-SHA256 ontbreekt of is ongeldig; geen bytesidentiteit verzonnen.');
    if (mime && !hasMime) warning(context, 'attachment_mime_unresolved', record.sourceId, 'Oorspronkelijk MIME-type is ongeldig; bronwaarde blijft exact raw, type blijft onbekend.');
    if (capturedBy && !hasCapturer) warning(context, 'attachment_capturer_unresolved', record.sourceId, 'Oorspronkelijke vastlegger is geen bruikbare enkelregelige waarde; exacte bronwaarde blijft raw.');
    const file = hasExpectedHash ? { schema: 'ima.evidence-file/v1', expectedSha256,
      ...(verifiedByteLength !== undefined ? {expectedByteLength:verifiedByteLength} : {}),
      ...(local && path.basename(local).trim() && !/[\x00-\x1f]/.test(path.basename(local)) ? {originalFileName:path.basename(local)} : {}),
      ...(hasMime ? {declaredMimeType:mime, mimeTypeOrigin:'legacy'} : {mimeTypeOrigin:'unknown'}),
      originalReference:reference, sourceId:record.sourceId } : undefined;
    workspace.evidence.push({ id: record.targetId, title: string(m.title), dossierId: dossier.id, kind: m.kind,
      reference, description: record.sections.beschrijving || '', recordedAt: time, status: 'unverified',
      ...(hasCapturer ? {capturedBy} : {}), ...(file ? {file} : {}) });
    evidenceProjected.add(record.targetId);
  }
  const evidenceRefs = (ids, record) => mappedRefs(ids, 'ima.rie-evidence/v1', record.sourceId).filter(id => {
    const ownDossier = unique('ima.rie-assessment/v1', record.metadata.assessment_id)?.targetId;
    if (evidenceProjected.has(id) && workspace.evidence.find(item => item.id === id)?.dossierId === ownDossier) return true;
    warning(context, 'evidence_raw_only', record.sourceId, 'Bewijskoppeling blijft raw omdat het doel niet getypeerd kon worden.'); return false;
  });
  const responsePairs = new Map();
  for (const record of bySchema('ima.rie-response/v1')) {
    const pair = JSON.stringify([string(record.metadata.assessment_id).toLowerCase(), string(record.metadata.question_id).toLowerCase()]);
    responsePairs.set(pair, (responsePairs.get(pair) ?? 0) + 1);
  }
  for (const record of bySchema('ima.rie-response/v1')) {
    const m = record.metadata; const dossier = dossierFor(m.assessment_id, record.sourceId);
    if (responsePairs.get(JSON.stringify([string(m.assessment_id).toLowerCase(), string(m.question_id).toLowerCase()])) > 1) {
      warning(context, 'response_pair_ambiguous', record.sourceId, 'Meerdere oorspronkelijke responses voor dezelfde dossiervraag: alle raw behouden, geen laatste of gunstigste antwoord gekozen.'); continue;
    }
    const time = timestamp(m.responded_at, context, record.sourceId);
    const choice = { yes: 'yes', no: 'no', not_applicable: 'na', unknown: 'unknown' }[m.answer];
    const prompt = record.sections['bevroren vraag'];
    if (!dossier || !time || !choice || !prompt) { warning(context, 'response_not_projected', record.sourceId, 'Antwoord mist bekend dossier, tijdzone, antwoordenum of bevroren tekst; raw behouden.'); continue; }
    const original = originalQuestion(m.question_id, m.question_version, m.question_sha256);
    let frozen = original && original.sections.vraag === prompt
      ? dossier.questions.find(item => item.id === original.targetId) : null;
    if (!frozen) {
      const projectionId = stableId('frozen-question', `${m.assessment_id}|${m.question_id}|${m.question_sha256}|${prompt}`);
      frozen = addFrozen(context, dossier, question({ id: projectionId, title: `Bevroren vraag ${string(m.question_id)}`, prompt, sourceIds: [record.sourceId] }), string(m.question_version));
      warning(context, 'restored_frozen_prompt', record.sourceId, 'Alleen aantoonbare bevroren antwoordtekst hersteld; onbekende vraagmetadata leeg. Oude bronhash raw behouden; nieuw JSON-snapshothash berekend.');
    }
    const evidenceIds = evidenceRefs(m.evidence_ids, record);
    workspace.answers.push({ id: record.targetId, questionId: frozen.id, dossierId: dossier.id, choice, evidence: evidenceIds.length ? `Legacy bewijskoppelingen: ${strings(m.evidence_ids).join(', ')}` : '',
      evidenceIds, ...(string(m.responded_by).trim() ? { respondedBy: m.responded_by } : {}), note: record.sections.motivering || '', answeredAt: time, questionSnapshot: frozen.prompt, sourceIds: [record.sourceId], contentVersion: frozen.version, questionSha256: frozen.sha256 });
    if (!string(m.responded_by).trim()) warning(context, 'response_actor_unknown', record.sourceId, 'Historische respondent ontbreekt in de bron; geen assessor, migratieactor of andere persoon ingevuld.');
  }
  for (const record of bySchema('ima.rie-observation/v1')) {
    const m = record.metadata; const dossier = dossierFor(m.assessment_id, record.sourceId);
    const time = timestamp(m.observed_at, context, record.sourceId);
    if (!dossier || !time || !record.sections.feit || !string(m.observer)) { warning(context, 'observation_not_projected', record.sourceId, 'Waarneming mist bekende contextvelden; raw behouden.'); continue; }
    workspace.observations.push({ id: record.targetId, title: record.body.match(/^#\s+(.+)$/m)?.[1] || 'Legacy waarneming', dossierId: dossier.id, date: string(m.observed_at).slice(0, 10), observer: m.observer,
      facts: `Feit:\n${record.sections.feit}${record.sections.context ? `\n\nContext:\n${record.sections.context}` : ''}`, evidenceIds: evidenceRefs(m.evidence_ids, record) });
  }
  const findingProjected = new Set();
  for (const record of bySchema('ima.rie-finding/v2')) {
    const m = record.metadata; const dossier = dossierFor(m.assessment_id, record.sourceId);
    if (!dossier || !string(m.title)) continue;
    const status = ['open', 'action_required'].includes(m.status) ? m.status : 'open';
    if (status !== m.status) warning(context, 'finding_decision_requires_review', record.sourceId, 'Oud afsluit-/acceptatiebesluit raw behouden; geen nieuw bekrachtigd besluit uit alleen lifecyclelabel afgeleid.');
    const observations = mappedRefs(m.observation_ids, 'ima.rie-observation/v1', record.sourceId).filter(id => {
      if (workspace.observations.some(item => item.id === id && item.dossierId === dossier.id)) return true;
      warning(context, 'observation_relation_not_transferred', record.sourceId, 'Waarneming ontbreekt als typed record of hoort bij een ander assessment; raw relatie behouden.'); return false;
    });
    workspace.findings.push({ id: record.targetId, title: m.title, dossierId: dossier.id, description: record.body, status,
      observationIds: observations, evidenceIds: evidenceRefs(m.evidence_ids, record), topicIds: strings(m.topic_ids).flatMap(id => topicMap.has(id.toLowerCase()) ? [topicMap.get(id.toLowerCase())] : []),
      legalIds: mappedRefs(m.legal_ids, 'ima.legal-update/v1', record.sourceId).filter(id => workspace.legalRecords.some(item => item.id === id)), decisionBy: '', decisionNote: '' });
    findingProjected.add(record.targetId);
  }
  // Second pass: responses, observations and findings must already be projected.
  // Each edge requires an actual source reference; reverse indexes preserve that
  // same relationship, without inferring extra links from textual similarity.
  const connectResponse = (response, target, key, sourceId) => {
    if (!response || !target || response.dossierId !== target.dossierId) {
      warning(context, 'response_relation_not_transferred', sourceId, 'Response-relatie mist een uniek getypeerd doel in hetzelfde dossier; oorspronkelijke verwijzing blijft raw.'); return;
    }
    response[key] = [...new Set([...(response[key] ?? []), target.id])];
    target.responseIds = [...new Set([...(target.responseIds ?? []), response.id])];
  };
  for (const record of bySchema('ima.rie-response/v1')) {
    const response = workspace.answers.find(answer => answer.id === record.targetId);
    for (const [sourceKey, schema, collection, key] of [['observation_ids', 'ima.rie-observation/v1', workspace.observations, 'observationIds'], ['finding_ids', 'ima.rie-finding/v2', workspace.findings, 'findingIds']]) {
      for (const originalId of strings(record.metadata[sourceKey])) {
        const targetSource = unique(schema, originalId);
        connectResponse(response, targetSource && collection.find(item => item.id === targetSource.targetId), key, record.sourceId);
      }
    }
  }
  for (const [schema, collection, key] of [['ima.rie-observation/v1', workspace.observations, 'observationIds'], ['ima.rie-finding/v2', workspace.findings, 'findingIds']]) {
    for (const record of bySchema(schema)) for (const originalId of strings(record.metadata.question_response_ids)) {
      const responseSource = unique('ima.rie-response/v1', originalId);
      connectResponse(responseSource && workspace.answers.find(item => item.id === responseSource.targetId), collection.find(item => item.id === record.targetId), key, record.sourceId);
    }
  }
  for (const record of records.filter(item => ['ima.action/v1', 'ima.action/v2'].includes(item.metadata.schema))) {
    const m = record.metadata;
    if (!string(m.title) || m.status === 'cancelled') { warning(context, 'action_raw_only', record.sourceId, 'Geannuleerde of titelloze actie blijft raw, zodat zij niet opnieuw als open werk verschijnt.'); continue; }
    const known = ['proposed', 'planned', 'in_progress', 'implemented', 'verification_due', 'effective', 'ineffective', 'closed', 'reopened', 'open'];
    if (!known.includes(m.status)) { warning(context, 'action_raw_only', record.sourceId, 'Onbekende actiestatus: geen lifecycle gegokt.'); continue; }
    const status = ['proposed', 'planned', 'open'].includes(m.status) ? 'open' : 'in_progress';
    if (['closed', 'effective', 'implemented'].includes(m.status)) warning(context, 'action_verification_not_transferred', record.sourceId, 'Legacy uitvoering/effectstatus raw behouden. Het nieuwe done vereist afzonderlijke menselijke effectverificatie.');
    const linkedFindings = [...new Set(strings(m.source_ids).map(id => actionRelationUnique(id)).filter(item => item?.metadata.schema === 'ima.rie-finding/v2' && findingProjected.has(item.targetId)))];
    const finding = linkedFindings.length === 1 ? workspace.findings.find(item => item.id === linkedFindings[0].targetId) : undefined;
    if (linkedFindings.length > 1) warning(context, 'action_multiple_findings', record.sourceId, 'Actie verwijst naar meerdere bevindingen; het nieuwe enkele findingId is niet willekeurig gekozen.');
    const projectedContext = {};
    for (const [sourceKey, targetKey, choices] of [['ahs_level', 'ahsLevel', context.api.actionAhsLevels], ['priority', 'priority', context.api.actionPriorities]]) {
      if (!Object.hasOwn(m, sourceKey)) continue;
      if (choices.includes(m[sourceKey])) projectedContext[targetKey] = m[sourceKey];
      else warning(context, 'action_context_value_unresolved', record.sourceId, `${sourceKey} is geen exacte ondersteunde bronkeuze; originele waarde blijft raw, geen standaard ingevuld.`);
    }
    if (Object.hasOwn(m, 'higher_levels_considered')) {
      if (Array.isArray(m.higher_levels_considered) && m.higher_levels_considered.every(value => context.api.actionAhsLevels.includes(value))) {
        projectedContext.higherLevelsConsidered = [...new Set(m.higher_levels_considered)];
        if (projectedContext.higherLevelsConsidered.length !== m.higher_levels_considered.length) warning(context, 'action_context_duplicate_values', record.sourceId, 'Dubbele oorspronkelijke overwogen AHS-niveaus eenmaal geprojecteerd; volledige originele lijst blijft raw.');
      } else warning(context, 'action_context_value_unresolved', record.sourceId, 'higher_levels_considered bevat geen volledig herkenbare lijst; geen niveaus geraden of selectief weggelaten. Exacte lijst blijft raw.');
    }
    if (Object.hasOwn(m, 'deviation_rationale')) {
      if (typeof m.deviation_rationale === 'string' && m.deviation_rationale.length <= 100_000) projectedContext.deviationRationale = m.deviation_rationale;
      else warning(context, 'action_context_value_unresolved', record.sourceId, 'deviation_rationale is geen ondersteunde tekstwaarde; exacte bronwaarde blijft raw.');
    }
    for (const [heading, key] of [['beoogd resultaat', 'intendedResult'], ['uitvoering', 'implementation'], ['verificatiemethode', 'verificationMethod']]) {
      if (!Object.hasOwn(record.sections, heading)) continue;
      if (record.sections[heading].length <= 100_000) projectedContext[key] = record.sections[heading];
      else warning(context, 'action_context_section_unresolved', record.sourceId, `Actiesectie ${heading} overschrijdt de native veldgrens; volledige sectie blijft in notes en raw, niet afgekapt.`);
    }
    workspace.actions.push({ id: record.targetId, title: m.title, owner: string(m.owner), dueDate: calendarDate(m.target_date), status, notes: record.body,
      ...projectedContext, ...(finding ? { findingId: finding.id, dossierId: finding.dossierId } : {}) });
  }
  for (const record of bySchema('ima.incident/v1')) {
    const m = record.metadata;
    const occurred = string(m.occurred_at); const time = timestamp(occurred, context, record.sourceId);
    if (!time || !string(m.title)) { warning(context, 'incident_not_projected', record.sourceId, 'Incident zonder exact bruikbaar feitelijk tijdstip of titel blijft raw.'); continue; }
    const type = m.kind === 'near_miss' ? 'near_miss' : m.kind === 'unsafe_condition' ? 'observation' : ['injury', 'illness', 'property_damage', 'environmental', 'other'].includes(m.kind) ? 'incident' : null;
    if (!type) { warning(context, 'incident_not_projected', record.sourceId, 'Onbekend incidenttype niet ingevuld.'); continue; }
    const actionIds = strings(m.action_ids).flatMap(id => { const candidates = workspace.actions.filter(action => records.some(item => item.targetId === action.id && string(item.metadata.id).toLowerCase() === id.toLowerCase()));
      if (candidates.length === 1) return [candidates[0].id]; warning(context, 'unresolved_relation', record.sourceId, 'Incidentactie ontbreekt of is niet uniek; oorspronkelijke verwijzing raw behouden.'); return []; });
    workspace.incidents.push({ id: record.targetId, title: m.title, date: occurred.slice(0, 10), department: string(m.department), type, description: record.body, actionIds,
      ...(severities.includes(m.actual_severity) ? { actualSeverity: m.actual_severity } : {}), ...(severities.includes(m.potential_severity) ? { potentialSeverity: m.potential_severity } : {}),
      ...(typeof m.is_recordable === 'boolean' ? { recordable: m.is_recordable } : {}), ...(typeof m.is_lost_time === 'boolean' ? { lostTime: m.is_lost_time } : {}),
      ...(Number.isInteger(m.lost_time_days) && m.lost_time_days >= 0 ? { lostTimeDays: m.lost_time_days } : {}),
      ...(typeof m.reporter === 'string' ? { reportedBy: m.reporter } : {}), ...(typeof m.activity === 'string' ? { activity: m.activity } : {}),
      ...(record.sections['directe beheersing'] !== undefined ? { immediateControls: record.sections['directe beheersing'] } : {}),
      ...(record.sections['open vragen'] !== undefined ? { openQuestions: record.sections['open vragen'] } : {}) });
  }
  for (const record of bySchema('ima.exposure/v1')) {
    const m = record.metadata;
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(string(m.period)) || typeof m.hours_worked !== 'number' || m.hours_worked < 0 || string(m.scope_id) || !string(m.source)) {
      warning(context, 'exposure_raw_only', record.sourceId, 'Noemer met ontbrekende bron, onduidelijke scope of ongeldige maand blijft raw.'); continue;
    }
    workspace.exposure.push({ id: record.targetId, period: m.period, hoursWorked: m.hours_worked, departmentId: '', source: m.source });
  }
  for (const record of bySchema('ima.rie-risk-assessment/v1')) warning(context, 'risk_not_recalculated', record.sourceId, 'Vrije methode-invoer en oorspronkelijke uitkomst raw behouden; geen numerieke risicofactoren of percentages uit proza afgeleid.');
  for (const record of bySchema('ima.analysis/v1')) {
    const m = record.metadata; const incident = unique('ima.incident/v1', m.incident_id);
    const method = { 'ima-core:method:five-whys': 'five_whys', 'ima-core:method:bowtie': 'bow_tie' }[m.method_id];
    if (!incident || !workspace.incidents.some(item => item.id === incident.targetId) || !method || !string(m.title) || !string(m.method_version)) {
      warning(context, 'analysis_raw_only', record.sourceId, 'Analyse mist aantoonbaar incident, titel of bekende methodeversie; proza blijft raw.'); continue;
    }
    const actionIds = strings(m.action_ids).flatMap(id => {
      const matches = records.filter(item => ['ima.action/v1', 'ima.action/v2'].includes(item.metadata.schema) && string(item.metadata.id).toLowerCase() === id.toLowerCase());
      return matches.length === 1 && workspace.actions.some(action => action.id === matches[0].targetId) ? [matches[0].targetId] : [];
    });
    const sectionList = heading => record.sections[heading] ? [record.sections[heading]] : [];
    if (method === 'bow_tie' && record.sections['gevaar en top event'] && !record.sections['top event']) warning(context, 'bowtie_top_event_unseparated', record.sourceId, 'Samengestelde Gevaar en top event-sectie blijft raw; geen afzonderlijke ongewenste gebeurtenis gegokt.');
    workspace.investigations.push({ id: record.targetId, title: m.title, incidentId: incident.targetId, method, methodVersion: m.method_version, status: 'draft',
      facts: record.sections.feiten || (record.sections.probleemdefinitie ? `Legacy probleemdefinitie (nog te toetsen):\n${record.sections.probleemdefinitie}` : ''),
      whyChain: [1, 2, 3, 4, 5].flatMap(index => sectionList(`waarom ${index}`)), topEvent: record.sections['top event'] || '', threats: sectionList('dreigingen'),
      preventiveBarriers: sectionList('preventieve barrières'), recoveryBarriers: sectionList('mitigerende barrières'), consequences: sectionList('gevolgen'),
      basisRiskFactors: strings(m.basis_risk_factor_ids), evidenceIds: mappedRefs(m.evidence_ids, 'ima.rie-evidence/v1', record.sourceId).filter(id => evidenceProjected.has(id)), actionIds,
      conclusion: record.sections['conclusie en bewijs'] || '', reviewedBy: '', reviewNote: '' });
    warning(context, 'analysis_requires_review', record.sourceId, 'Herkenbare bronsecties als draft onderzoek overgedragen. Waarom-antwoorden blijven hypotheses; geen oorzaken, reviewgoedkeuring of barrièrecredit afgeleid.');
  }
  // Complete the original action edges only after every possible typed target
  // has been projected. A raw-only original remains explicitly unresolved.
  for (const record of records.filter(item => ['ima.action/v1', 'ima.action/v2'].includes(item.metadata.schema))) {
    const action = workspace.actions.find(item => item.id === record.targetId);
    if (!action) continue;
    for (const [sourceKey, targetKey] of [['source_ids', 'sourceRefs'], ['topic_ids', 'topicIds']]) {
      if (!Object.hasOwn(record.metadata, sourceKey)) continue;
      const originals = record.metadata[sourceKey];
      if (!Array.isArray(originals)) {
        warning(context, 'action_context_relation_unresolved', record.sourceId, `${sourceKey} is geen oorspronkelijke lijst; exacte waarde blijft raw, geen relaties afgeleid.`);
        continue;
      }
      const projected = [];
      for (const originalId of originals) {
        if (typeof originalId !== 'string' || !originalId.trim() || originalId.length > 1_000) {
          warning(context, 'action_context_relation_unresolved', record.sourceId, `${sourceKey} bevat een onbruikbare ID; exact raw behouden, niet afgekapt of tot tekst omgezet.`);
          continue;
        }
        const source = actionRelationUnique(originalId, sourceKey === 'topic_ids' ? 'ima.topic/v1' : undefined);
        if (sourceKey === 'topic_ids') {
          if (source && workspace.topics.filter(topic => topic.id === source.targetId).length === 1) projected.push(source.targetId);
          else warning(context, 'action_topic_unresolved', record.sourceId, `Oorspronkelijk topic_ids → ${originalId} ontbreekt, is dubbel of niet bevestigd. Exacte onderwerp-ID blijft in raw bron ${record.sourceId}; geen bronrelatie of onderwerp verzonnen.`);
          continue;
        }
        const targetIds = source ? [source.targetId] : [];
        if (source && brfProjectedSources.has(source.sourceId)) targetIds.push(stableId('brf-version', `${source.metadata.id}|${source.metadata.version}|${source.legacySha256}`));
        const targets = source ? context.api.actionSourceCollections.flatMap(collection => context.api.actionSourceRecords(workspace, collection)
          .filter(target => targetIds.includes(target.id)).map(target => ({ kind: 'workspace', collection, id: target.id }))) : [];
        if (targets.length === 1) projected.push(targets[0]);
        else {
          projected.push({ kind: 'unresolved', originalId, rawSourceId: source?.sourceId ?? record.sourceId });
          warning(context, 'action_source_unresolved', record.sourceId, `Oorspronkelijk source_ids → ${originalId} ontbreekt, is dubbel of heeft geen uniek getypeerd doel. Onopgeloste verwijzing en exacte raw bron behouden; geen collectie gekozen.`);
        }
      }
      const keys = projected.map(value => targetKey === 'sourceRefs' ? context.api.sourceRefKey(value) : value);
      action[targetKey] = projected.filter((value, index) => keys.indexOf(keys[index]) === index);
      if (action[targetKey].length !== projected.length) warning(context, 'action_context_duplicate_relations', record.sourceId, `Dubbele ${sourceKey}-relaties eenmaal geprojecteerd; volledige oorspronkelijke lijst blijft raw.`);
    }
    context.api.assertActionContextRelations(action, workspace);
  }
  for (const record of records) {
    if (record.metadata.scope_id) warning(context, 'scope_raw_only', record.sourceId, 'Oude scope-ID raw behouden; Markdown bevat geen bevestigde organisation/site/department-definitie voor deze ID.');
    for (const [key, value] of Object.entries(record.metadata)) if (/(?:_id|_ids)$/.test(key)) {
      for (const id of Array.isArray(value) ? strings(value) : string(value) ? [value] : []) {
        const candidates = records.filter(item => string(item.metadata.id).toLowerCase() === id.toLowerCase());
        if (candidates.length !== 1) warning(context, 'legacy_reference_unresolved', record.sourceId, `Oorspronkelijke ${key}-relatie ontbreekt of is dubbel; alleen raw bewaard.`);
      }
    }
    if (!brfProjectedSources.has(record.sourceId) && !['ima.workspace/v1', 'ima.topic/v1', 'ima.legal-update/v1', 'ima.rie-question-definition/v1', 'ima.rie-assessment/v1', 'ima.rie-evidence/v1', 'ima.rie-response/v1', 'ima.rie-observation/v1', 'ima.rie-finding/v2', 'ima.action/v1', 'ima.action/v2', 'ima.incident/v1', 'ima.exposure/v1', 'ima.rie-risk-assessment/v1', 'ima.analysis/v1'].includes(record.metadata.schema)) {
      warning(context, 'unsupported_record_raw_only', record.sourceId, 'Dit legacy schema is uitsluitend als compleet raw record overgedragen; geen typed functiepariteit geclaimd.');
    }
  }
  await preserveLegacyActionHistories(context, root, archiveFolders, records);
  return finish(context);
}

const knownTables = new Set(['RieProjecten', 'Companies', 'Departments', 'DepartmentModules', 'WalkthroughReports', 'WalkthroughReportModules', 'Modules', 'Vragen', 'GeselecteerdeModules', 'Antwoorden', 'Gevaren', 'Risicos', 'Risicofactoren', 'Beheersmaatregelen', 'BeheersmaatregelRisicofactoren', 'BeoordelingsVragen', 'RisicofactorBeoordelingen', 'MaatregelBeoordelingen', 'RiskMapNodeLayouts', '__EFMigrationsHistory']);
export async function migrateSqlite(filename, options = {}) {
  filename = path.resolve(filename);
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxSourceBytes) throw new Error('SQLite-invoer moet een gewone databasekopie zijn van maximaal 64 MiB.');
  const checkWal = async () => {
    try { const wal = await fs.lstat(`${filename}-wal`); if (wal.isSymbolicLink() || wal.size > 0) throw new Error('Database heeft een actief WAL-bestand. Sluit de desktopapp en gebruik een stabiele complete databasekopie.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  await checkWal();
  const sourceBytes = await fs.readFile(filename);
  const sourceHash = hash(sourceBytes);
  const { DatabaseSync } = await import('node:sqlite');
  // Only the disposable byte-identical copy is opened by SQLite. No journal,
  // shm or WAL sidecar can be created next to the original source.
  const temporary = await fs.mkdtemp(path.join(tmpdir(), 'ima-legacy-db-'));
  const copy = path.join(temporary, 'source.sqlite');
  let database;
  const all = {};
  try {
    await fs.writeFile(copy, sourceBytes, { mode: 0o600, flag: 'wx' });
    database = new DatabaseSync(copy, { readOnly: true });
    database.exec('PRAGMA query_only = ON; BEGIN;');
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
    for (const table of tables) {
      if (!knownTables.has(table)) { all[table] = null; continue; }
      const rows = database.prepare(`SELECT * FROM "${table}" LIMIT ${maxRows + 1}`).all();
      if (rows.length > maxRows) throw new Error('SQLite-tabel bevat meer dan 5.000 records; maak een gecontroleerde kleinere bronexport.');
      all[table] = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Uint8Array ? { encoding: 'base64', content: Buffer.from(value).toString('base64') } : value])));
    }
    database.exec('ROLLBACK;');
  } finally { database?.close(); await fs.rm(temporary, { recursive: true, force: true }); }
  if (sourceHash !== hash(await fs.readFile(filename))) throw new Error('SQLite-bron is tijdens lezen gewijzigd. Sluit de desktopapp en gebruik een stabiele databasekopie.');
  await checkWal();
  const projects = all.RieProjecten ?? [];
  if (!projects.length) throw new Error('Geen herkenbare RieProjecten in deze database.');
  if (projects.length > 1 && options.projectId === undefined) throw new Error('Meerdere projecten: selecteer expliciet --project-id.');
  const project = options.projectId === undefined ? projects[0] : projects.find(row => row.Id === Number(options.projectId));
  if (!project) throw new Error('Geselecteerde project-ID bestaat niet.');
  const context = await contextFor(options.name || string(project.Naam) || 'Gemigreerd RI&E-project', options.now);
  context.report.sourceFormat = 'sqlite'; context.report.projectId = project.Id; context.report.databaseSha256 = sourceHash;
  const rows = {};
  for (const [table, values] of Object.entries(all)) {
    if (values === null) { warning(context, 'unknown_table', '', `Niet-herkende tabel ${table} niet geprojecteerd; originele database blijft intact.`); continue; }
    rows[table] = values.filter(row => table === 'RieProjecten' ? row.Id === project.Id : Object.hasOwn(row, 'RieProjectId') ? row.RieProjectId === project.Id : true);
  }
  const companyIds = new Set((rows.Companies ?? []).map(row => row.Id));
  rows.Departments = (rows.Departments ?? []).filter(row => companyIds.has(row.CompanyId));
  const departmentIds = new Set(rows.Departments.map(row => row.Id));
  rows.DepartmentModules = (rows.DepartmentModules ?? []).filter(row => departmentIds.has(row.DepartmentId));
  rows.WalkthroughReports = (rows.WalkthroughReports ?? []).filter(row => companyIds.has(row.CompanyId));
  const walkthroughIds = new Set(rows.WalkthroughReports.map(row => row.Id));
  rows.WalkthroughReportModules = (rows.WalkthroughReportModules ?? []).filter(row => walkthroughIds.has(row.WalkthroughReportId));
  const moduleIds = new Set([...(rows.GeselecteerdeModules ?? []).map(row => row.ModuleId), ...rows.DepartmentModules.map(row => row.ModuleId), ...rows.WalkthroughReportModules.map(row => row.ModuleId)]);
  const answeredQuestionIds = new Set((rows.Antwoorden ?? []).map(row => row.VraagId));
  rows.Vragen = (rows.Vragen ?? []).filter(row => moduleIds.has(row.ModuleId) || answeredQuestionIds.has(row.Id));
  for (const row of rows.Vragen) moduleIds.add(row.ModuleId);
  rows.Modules = (rows.Modules ?? []).filter(row => moduleIds.has(row.Id));
  const sourceFor = (table, row) => stableId('sqlite-source', `${project.Id}|${table}|${row.Id ?? hash(JSON.stringify(row))}`);
  const targetFor = (table, row) => stableId('sqlite', `${project.Id}|${table}|${row.Id ?? hash(JSON.stringify(row))}`);
  for (const [table, values] of Object.entries(rows)) for (const row of values) {
    rawSource(context, { sourceId: sourceFor(table, row), title: `${table} record ${row.Id ?? ''}`, format: 'legacy-sqlite-row',
      raw: { table, row }, contentSha256: hash(JSON.stringify(row)), originalId: String(row.Id ?? ''), originalSchema: `RieBuilder.Data/${table}` });
  }
  const { workspace } = context;
  const organisationByCompany = new Map(); const departmentMap = new Map();
  if (rows.Companies?.length) {
    for (const company of rows.Companies) {
      const id = targetFor('Companies', company); organisationByCompany.set(company.Id, id);
      if (!string(company.Name)) { warning(context, 'company_raw_only', sourceFor('Companies', company), 'Company zonder naam blijft raw.'); organisationByCompany.delete(company.Id); continue; }
      workspace.organisations.push({ id, name: company.Name, description: string(company.Description) });
    }
  } else if (string(project.Organisatie)) {
    workspace.organisations.push({ id: targetFor('ProjectOrganisation', project), name: project.Organisatie, description: '' });
  }
  const originalTimes = (row, sourceId) => {
    const result = {};
    for (const [sourceKey, targetKey] of [['CreatedAt', 'createdAt'], ['UpdatedAt', 'updatedAt']]) {
      const value = timestamp(row[sourceKey], context, sourceId, options.assumeUtc);
      if (value) result[targetKey] = value;
      else if (string(row[sourceKey])) warning(context, 'legacy_time_unresolved', sourceId, `${sourceKey} heeft geen ondubbelzinnige tijdzone; oorspronkelijke waarde blijft raw, geen migratietijd ingevuld.`);
    }
    return result;
  };
  const projectContextId = string(project.Naam).trim() ? targetFor('RieProjecten', project) : undefined;
  if (projectContextId) workspace.projectContexts.push({
    id: projectContextId, title: project.Naam, organisationText: string(project.Organisatie), locationText: string(project.Locatie),
    contactName: string(project.ContactNaam), contactEmail: string(project.ContactEmail), organisationIds: workspace.organisations.map(item => item.id),
    details: Object.fromEntries(context.api.projectContextFields.map(([key, , originalKey]) => [key, string(project[originalKey])])),
    ...originalTimes(project, sourceFor('RieProjecten', project)), sourceIds: [sourceFor('RieProjecten', project)],
  });
  else warning(context, 'project_context_raw_only', sourceFor('RieProjecten', project), 'Project zonder naam blijft raw; geen titel of contextidentiteit gegokt.');
  for (const department of rows.Departments) {
    // CompanyId is an actual source relationship. A missing site is not a missing organisation.
    const organisationId = organisationByCompany.get(department.CompanyId);
    if (!organisationId || !string(department.Name).trim()) {
      warning(context, 'department_raw_only', sourceFor('Departments', department), 'Afdeling mist een bekende benoemde organisatie of afdelingsnaam; oorspronkelijke relatie blijft raw.');
      continue;
    }
    const id = targetFor('Departments', department);
    departmentMap.set(department.Id, id);
    workspace.departments.push({ id, organisationId, name: department.Name, activity: '' });
    warning(context, 'department_site_unknown', sourceFor('Departments', department), 'Afdeling rechtstreeks gekoppeld aan haar oorspronkelijke organisatie; locatie blijft onbekend, geen site verzonnen.');
  }
  const resolveScope = row => {
    const department = rows.Departments.find(item => item.Id === row.DepartmentId);
    const companyId = row.CompanyId ?? department?.CompanyId;
    const company = rows.Companies?.find(item => item.Id === companyId);
    const organisationId = organisationByCompany.get(companyId) ?? (companyId == null && workspace.organisations.length === 1 ? workspace.organisations[0]?.id : undefined);
    const departmentId = departmentMap.get(row.DepartmentId);
    const conflict = department && row.CompanyId != null && row.CompanyId !== department.CompanyId;
    return { department, companyId, company, organisationId, departmentId, conflict };
  };
  const dossiers = new Map();
  const getDossier = (row, sourceId = '') => {
    const { department, companyId, company, organisationId, departmentId, conflict } = resolveScope(row);
    if (conflict) {
      warning(context, 'sqlite_scope_conflict', sourceId, 'CompanyId en DepartmentId verwijzen naar verschillende organisaties; oorspronkelijke rij blijft raw, geen dossierprojectie gekozen.');
      return null;
    }
    const key = `${companyId ?? 'project'}:${row.DepartmentId ?? 'all'}`;
    if (!dossiers.has(key)) {
      const scope = [string(project.Organisatie), string(project.Locatie), string(company?.Name), string(department?.Name)].filter(Boolean).join(' / ');
      const dossier = newDossier(context, stableId('sqlite-dossier', `${project.Id}|${key}`), [string(project.Naam), string(department?.Name)].filter(Boolean).join(' — ') || 'Legacy dossier', { scope, ...(organisationId ? { organisationId } : {}), ...(projectContextId ? { projectContextId } : {}), departmentIds: departmentId ? [departmentId] : [] });
      dossiers.set(key, dossier);
      if (companyId != null && !company || row.DepartmentId != null && !department) warning(context, 'sqlite_scope_unresolved', sourceId, 'Antwoordscope verwijst naar ontbrekende company/department; bron-FKs blijven raw behouden.');
    }
    return dossiers.get(key);
  };
  const baseDossier = getDossier({});
  const originalQuestionOrder = (a, b) => (Number.isSafeInteger(a.SortOrder) ? a.SortOrder : 0) - (Number.isSafeInteger(b.SortOrder) ? b.SortOrder : 0) || string(a.Nummer).localeCompare(string(b.Nummer)) || a.Id - b.Id;
  const questionByOriginalId = new Map();
  for (const original of [...rows.Vragen].sort(originalQuestionOrder)) {
    if (!string(original.Vraagtekst).trim()) continue;
    const richFields = {};
    for (const [sourceKey, targetKey] of [['Nummer', 'number'], ['Gevaar', 'hazard'], ['Risico', 'risk'], ['Risicofactor', 'riskFactor'], ['TechnischeMaatregelen', 'technicalControls'], ['OrganisatorischeMaatregelen', 'organisationalControls'], ['Basisoorzaken', 'rootCauses'], ['Cultuur', 'culture']]) {
      if (typeof original[sourceKey] === 'string') richFields[targetKey] = original[sourceKey];
    }
    if (Number.isSafeInteger(original.SortOrder)) richFields.sortOrder = original.SortOrder;
    const q = question({ id: targetFor('Vragen', original), title: string(original.Titel), prompt: original.Vraagtekst,
      themeId: string(original.ModuleCode) || String(original.ModuleId), assessmentGuidance: '',
      ...(typeof original.Toetscriteria === 'string' ? { acceptanceCriteria: original.Toetscriteria } : {}),
      ...(Object.keys(richFields).length ? { richFields } : {}),
      sourceIds: [sourceFor('Vragen', original)], legalReferences: string(original.Wetgeving) });
    questionByOriginalId.set(original.Id, q);
    if (!workspace.questions.some(item => item.id === q.id)) workspace.questions.push(q);
  }
  const projectModuleLinks = rows.GeselecteerdeModules ?? [];
  const planModules = (links, table) => {
    const counts = new Map();
    for (const link of links) counts.set(link.ModuleId, (counts.get(link.ModuleId) ?? 0) + 1);
    const projected = [];
    for (const link of links) {
      const module = rows.Modules.find(item => item.Id === link.ModuleId);
      if (counts.get(link.ModuleId) > 1) { warning(context, 'module_assignment_ambiguous', sourceFor(table, link), 'Dubbele moduletoewijzing binnen dezelfde scope blijft raw; geen notes of volgorde gekozen.'); continue; }
      if (!module || !string(module.Titel).trim()) { warning(context, 'module_assignment_raw_only', sourceFor(table, link), 'Moduletoewijzing mist een benoemde bestaande module; oorspronkelijke FK blijft raw.'); continue; }
      projected.push({ id: targetFor('Modules', module), origin: 'legacy_module', code: string(module.Code), title: module.Titel,
        questionIds: [...rows.Vragen].filter(question => question.ModuleId === module.Id).sort(originalQuestionOrder).flatMap(question => questionByOriginalId.has(question.Id) ? [questionByOriginalId.get(question.Id).id] : []),
        enabled: true, scopeNotes: string(link.ScopeNotes), ...(Number.isSafeInteger(link.SortOrder) ? { sortOrder: link.SortOrder } : {}),
        ...(Number.isSafeInteger(module.SortOrder) ? { definitionSortOrder: module.SortOrder } : {}), sourceIds: [sourceFor(table, link), sourceFor('Modules', module)],
        originalCategory: string(module.Categorie) });
    }
    // Source order values remain distinct. Project order follows the original repository query;
    // department assignment order retains its persisted SortOrder with stable definition ties.
    projected.sort((a, b) => table === 'DepartmentModules'
      ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.originalCategory.localeCompare(b.originalCategory) || (a.definitionSortOrder ?? 0) - (b.definitionSortOrder ?? 0) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id)
      : a.originalCategory.localeCompare(b.originalCategory) || (a.definitionSortOrder ?? 0) - (b.definitionSortOrder ?? 0) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
    return projected.map(({ originalCategory, ...module }) => module);
  };
  const freezePlanQuestions = (plan, dossier) => {
    if (!dossier) return;
    for (const questionId of [...new Set(plan.modules.flatMap(module => module.questionIds))]) {
      const q = [...questionByOriginalId.values()].find(question => question.id === questionId);
      if (q) addFrozen(context, dossier, q, 'legacy-import/1.0.0');
    }
    if (plan.modules.length) warning(context, 'module_questions_frozen_at_export', plan.id, 'Geselecteerde modulevragen bij deze export bevroren, inclusief onbeantwoorde vragen. Dit reconstrueert geen historische module- of vraagversie.');
  };
  if (projectModuleLinks.length) {
    if (projectContextId || baseDossier.organisationId) {
      const plan = { id: stableId('sqlite-module-plan', `${project.Id}|project`), title: `${string(project.Naam) || 'Project'} — modulekeuze`, scope: 'project',
        ...(projectContextId ? { projectContextId } : {}), ...(baseDossier.organisationId ? { organisationId: baseDossier.organisationId } : {}),
        modules: planModules(projectModuleLinks, 'GeselecteerdeModules'), revision: 0, sourceIds: [sourceFor('RieProjecten', project)] };
      workspace.modulePlans.push(plan); freezePlanQuestions(plan, baseDossier);
    } else warning(context, 'project_module_plan_raw_only', sourceFor('RieProjecten', project), 'Modulekeuze mist een benoemde projectcontext of organisatie; oorspronkelijke selectie blijft raw.');
  }
  for (const originalDepartment of rows.Departments) {
    const links = rows.DepartmentModules.filter(link => link.DepartmentId === originalDepartment.Id);
    if (!links.length) continue;
    const departmentId = departmentMap.get(originalDepartment.Id);
    const organisationId = organisationByCompany.get(originalDepartment.CompanyId);
    if (!departmentId || !organisationId) { for (const link of links) warning(context, 'department_module_plan_raw_only', sourceFor('DepartmentModules', link), 'Afdelingsmodule mist een bruikbare oorspronkelijke afdelingsscope; raw bewaard zonder projectbreed te verbreden.'); continue; }
    const plan = { id: stableId('sqlite-module-plan', `${project.Id}|department|${originalDepartment.Id}`), title: `${originalDepartment.Name} — modulekeuze`, scope: 'department',
      ...(projectContextId ? { projectContextId } : {}), organisationId, departmentId, modules: planModules(links, 'DepartmentModules'), revision: 0,
      sourceIds: [sourceFor('Departments', originalDepartment)] };
    workspace.modulePlans.push(plan);
    freezePlanQuestions(plan, getDossier({ CompanyId: originalDepartment.CompanyId, DepartmentId: originalDepartment.Id }, sourceFor('Departments', originalDepartment)));
  }
  const answerPairs = new Map();
  const sqlitePair = answer => JSON.stringify([resolveScope(answer).companyId ?? null, answer.DepartmentId ?? null, answer.VraagId]);
  for (const answer of rows.Antwoorden ?? []) answerPairs.set(sqlitePair(answer), (answerPairs.get(sqlitePair(answer)) ?? 0) + 1);
  for (const answer of rows.Antwoorden ?? []) {
    const sourceId = sourceFor('Antwoorden', answer);
    if (answerPairs.get(sqlitePair(answer)) > 1) { warning(context, 'sqlite_answer_pair_ambiguous', sourceId, 'Meerdere antwoorden binnen dezelfde company/department/vraag-scope: alle raw behouden, geen keuze gegokt.'); continue; }
    const original = rows.Vragen.find(row => row.Id === answer.VraagId);
    const time = timestamp(answer.UpdatedAt, context, sourceId, options.assumeUtc === true);
    const choice = new Map([[0, 'yes'], [1, 'no'], [2, 'na'], [null, 'unknown']]).get(answer.Keuze);
    if (!original || !time || !choice || !string(original.Vraagtekst)) { warning(context, 'sqlite_answer_raw_only', sourceId, 'Antwoord mist leesbare vraag, exacte datumtijdzone of bekend enum; raw behouden.'); continue; }
    const dossier = getDossier(answer, sourceId);
    if (!dossier) continue;
    const q = questionByOriginalId.get(original.Id);
    if (!q) continue;
    const frozen = addFrozen(context, dossier, q, 'legacy-import/1.0.0');
    // SQLite did not freeze question text historically. This is the exported current
    // database definition, not a claim that it was exactly the definition at answer time.
    warning(context, 'sqlite_question_not_historically_frozen', sourceId, 'Vraag bij export bevroren; de legacy SQLite-antwoorden bevatten geen oorspronkelijke vraaghash/snapshot.');
    workspace.answers.push({ id: targetFor('Antwoorden', answer), questionId: q.id, dossierId: dossier.id, choice, evidence: '', evidenceIds: [], note: string(answer.Toelichting),
      ...(string(answer.RespondedBy).trim() ? { respondedBy: answer.RespondedBy } : {}), answeredAt: time, questionSnapshot: q.prompt, questionSha256: frozen.sha256, contentVersion: frozen.version, sourceIds: [sourceId] });
    if (!string(answer.RespondedBy).trim()) warning(context, 'response_actor_unknown', sourceId, 'SQLite-antwoord heeft geen bekende respondent in de bron; contactpersoon en assessor zijn niet als auteur ingevuld.');
  }
  for (const rating of rows.RisicofactorBeoordelingen ?? []) {
    const factor = (rows.Risicofactoren ?? []).find(row => row.Id === rating.RisicofactorItemId);
    const risk = factor && (rows.Risicos ?? []).find(row => row.Id === factor.RisicoItemId);
    const sourceId = sourceFor('RisicofactorBeoordelingen', rating);
    warning(context, 'legacy_rating_not_kinney', sourceId, '1–3 E/B/W- en relevantieratings zijn oorspronkelijke lokale prioritering, geen Kinney-factoren of gevalideerde percentagewerking.');
    if (!factor || !risk || !string(factor.Titel)) continue;
    const dossier = getDossier(rating, sourceId);
    if (!dossier) continue;
    workspace.findings.push({ id: targetFor('RisicofactorBeoordelingen', rating), title: factor.Titel, dossierId: dossier.id,
      description: `Legacy risicofactor: ${string(factor.Omschrijving)}\nLegacy risico: ${string(risk.Titel)}\nOorspronkelijke beoordeling: ${string(rating.Toelichting)}\nNumerieke ratings behouden hun oorspronkelijke ordinale betekenis in de bron en, bij aantoonbare relaties, de getypeerde bibliotheek; herbeoordeling vereist.`,
      status: 'open', observationIds: [], evidenceIds: [], topicIds: [], legalIds: [], decisionBy: '', decisionNote: '' });
  }
  const libraryProjection = context.api.projectLegacyRiskLibrary(rows, {
    id: stableId('risk-library-version', `${project.Id}|${sourceHash}`), libraryId: stableId('risk-library', project.Id),
    title: `${string(project.Naam) || 'Geselecteerd project'} — oorspronkelijke risicobibliotheek`, sourceSha256: sourceHash, version: '1.0.0',
    targetIdFor: targetFor, sourceIdFor: sourceFor,
    scopeFor: row => {
      if (row.RieProjectId !== project.Id || !projectContextId) return undefined;
      const scope = resolveScope(row);
      if (scope.conflict || row.CompanyId != null && !organisationByCompany.has(row.CompanyId) || row.DepartmentId != null && !scope.departmentId) return undefined;
      return { projectContextId,
        ...(row.CompanyId != null || row.DepartmentId != null ? { organisationId: scope.organisationId } : {}),
        ...(row.DepartmentId != null ? { departmentId: scope.departmentId } : {}) };
    },
    warning: (code, table, row, message) => warning(context, code, sourceFor(table, row), message),
  });
  if (libraryProjection.library) {
    workspace.riskLibraries.push(libraryProjection.library);
    workspace.riskLibraryReviews.push(...libraryProjection.reviews);
    workspace.riskLibraryLayouts.push(...libraryProjection.layouts);
    warning(context, 'risk_library_projection_version', libraryProjection.library.id, 'Versie 1.0.0 is de nieuwe getypeerde exportprojectie met exacte databasebronhash; een historische bibliotheekversie of actor wordt niet afgeleid. Oorspronkelijke 1–3-ratings blijven ordinaal; aanwezigheid is geen effectbewijs.');
  }
  for (const rating of rows.MaatregelBeoordelingen ?? []) {
    const sourceId = sourceFor('MaatregelBeoordelingen', rating);
    const projected = libraryProjection.reviews.some(review => review.kind === 'control_link' && review.sourceIds.includes(sourceId));
    warning(context, projected ? 'legacy_control_not_effectiveness' : 'legacy_control_raw_only', sourceId, projected
      ? 'Oorspronkelijke maatregelrating als ordinale scopebeoordeling én raw behouden. Aanwezigheid is geen effectbewijs; geen percentage, PFD of AHS-broncredit afgeleid.'
      : 'ReductieScore/KostenNiveau/IsInPlace raw behouden zonder bruikbare getypeerde relatie. Geen procenten, bewijsstatus, AHS-broncredit of nieuwe actie-inspanning uit ratings gegokt.');
  }
  for (const walkthrough of rows.WalkthroughReports) {
    const sourceId = sourceFor('WalkthroughReports', walkthrough);
    const scope = resolveScope(walkthrough);
    if (!string(walkthrough.Title).trim() || !scope.organisationId || scope.conflict || walkthrough.DepartmentId != null && !scope.departmentId) {
      warning(context, 'walkthrough_raw_only', sourceId, 'Rondgang mist een benoemde titel of heeft geen eenduidige echte organisatie/afdeling; bronrapport blijft volledig raw.');
      continue;
    }
    const dossier = getDossier(walkthrough, sourceId);
    if (!dossier) continue;
    const links = rows.WalkthroughReportModules.filter(link => link.WalkthroughReportId === walkthrough.Id);
    const modules = links.flatMap(link => {
      const module = rows.Modules.find(item => item.Id === link.ModuleId);
      if (!module) { warning(context, 'walkthrough_module_unresolved', sourceFor('WalkthroughReportModules', link), 'Geselecteerde module bestaat niet in de bronselectie; oorspronkelijke module-FK blijft raw.'); return []; }
      return [{ id: targetFor('Modules', module), code: string(module.Code), title: string(module.Titel) }];
    });
    const date = calendarDate(string(walkthrough.Date).slice(0, 10));
    if (!date) warning(context, 'walkthrough_date_unknown', sourceId, 'Rondgangdatum niet geldig; datum blijft onbekend zonder migratiedatum in te vullen.');
    workspace.walkthroughs.push({ id: targetFor('WalkthroughReports', walkthrough), title: walkthrough.Title,
      organisationId: scope.organisationId, ...(scope.departmentId ? { departmentId: scope.departmentId } : {}), dossierId: dossier.id,
      ...(projectContextId ? { projectContextId } : {}), date, author: string(walkthrough.Author), summary: string(walkthrough.Summary), body: string(walkthrough.Body),
      modules: [...new Map(modules.map(module => [module.id, module])).values()], ...originalTimes(walkthrough, sourceId),
      sourceIds: [sourceId, ...links.map(link => sourceFor('WalkthroughReportModules', link))],
    });
  }
  return finish(context);
}

function finish(context) {
  const selectedSources = context.workspace.sources.map(source => ({ id: source.id, contentSha256: source.contentSha256 })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const review = { id: stableId('migration-review', canonicalMigrationReportJson(selectedSources)),
    title: 'Migratieconcept: menselijke controle vereist', kind: 'other', status: 'review-required',
    readScope: 'migration-review', publication: 'private', format: 'ima.migration-review/v1',
    notes: 'Migratieregels en alle waarschuwingen. Raw bronrecords blijven afzonderlijk volledig behouden.',
    contentSha256: '', raw: {} };
  // Count this summary source too; never put a self-referential workspace digest inside it.
  context.workspace.sources.push(review);
  context.report.counts = Object.fromEntries(['scenarios', 'questions', 'answers', 'actions', 'incidents', 'sources', 'organisations', 'sites', 'departments', 'dossiers', 'evidence', 'observations', 'findings', 'topics', 'legalRecords', 'investigations', 'exposure', 'projectContexts', 'walkthroughs', 'basisRiskFactorRecords', 'modulePlans', 'riskLibraries', 'riskLibraryReviews', 'riskLibraryLayouts'].map(key => [key, context.workspace[key]?.length ?? 0]));
  if (context.workspace.contentRecords?.length) context.report.counts.contentRecords = context.workspace.contentRecords.length;
  review.raw = JSON.parse(canonicalMigrationReportJson(context.report));
  review.contentSha256 = hash(canonicalMigrationReportJson(review.raw));
  const serialized = context.api.exportWorkspace(context.workspace);
  // These file metadata fields belong only to the external report, after final export.
  context.report.workspaceSha256 = hash(serialized);
  context.report.outputBytes = Buffer.byteLength(serialized);
  return { workspace: context.workspace, report: context.report, serialized };
}

export async function writeMigrationOutput(result, output, { root = repositoryRoot } = {}) {
  const privateRoot = path.resolve(root, 'private-data');
  output = path.resolve(output);
  const relative = path.relative(privateRoot, output);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !output.endsWith('.json')) throw new Error('Migratie-uitvoer moet een JSON-bestand binnen private-data/ zijn.');
  const ignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
  if (!/^\/?private-data\/$/m.test(ignore)) throw new Error('private-data/ moet expliciet in .gitignore staan.');
  await fs.mkdir(privateRoot, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(privateRoot)).isSymbolicLink()) throw new Error('Private uitvoermap mag geen symlink zijn.');
  let parent = path.dirname(output);
  while (parent !== privateRoot) {
    try { if ((await fs.lstat(parent)).isSymbolicLink()) throw new Error('Uitvoerpad bevat een symlink.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    parent = path.dirname(parent);
  }
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const reportPath = output.replace(/\.json$/, '.migration-report.json');
  if (reportPath === output) throw new Error('Uitvoer en rapport mogen niet dezelfde naam hebben.');
  let created = false;
  try {
    await fs.writeFile(output, result.serialized, { flag: 'wx', mode: 0o600 }); created = true;
    await fs.writeFile(reportPath, `${JSON.stringify(result.report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (created) await fs.unlink(output).catch(() => {});
    throw error;
  }
  return { output, reportPath };
}

function argumentsFor(args) {
  const options = { out: path.join(repositoryRoot, 'private-data/migrated-workspace.json') };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--assume-utc') options.assumeUtc = true;
    else if (['--markdown', '--sqlite', '--project-id', '--name', '--out'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('Optiewaarde ontbreekt.');
      options[{ '--markdown': 'markdown', '--sqlite': 'sqlite', '--project-id': 'projectId', '--name': 'name', '--out': 'out' }[arg]] = value;
    } else throw new Error('Onbekende migratieoptie. Gebruik --help.');
  }
  if (options.projectId !== undefined && !/^\d+$/.test(options.projectId)) throw new Error('--project-id vereist een geheel getal.');
  return options;
}

async function main() {
  const options = argumentsFor(process.argv.slice(2));
  if (options.help) { process.stdout.write(usage); return; }
  if (Boolean(options.markdown) === Boolean(options.sqlite)) throw new Error('Kies precies één --markdown of --sqlite bron.');
  if (options.markdown && (options.projectId !== undefined || options.assumeUtc)) throw new Error('--project-id en --assume-utc zijn alleen voor SQLite.');
  const result = options.markdown ? await migrateMarkdown(options.markdown, options) : await migrateSqlite(options.sqlite, options);
  const output = await writeMigrationOutput(result, options.out);
  process.stdout.write(`Private migratie-export gereed: ${result.report.counts.sources} bronrecords, ${result.report.counts.dossiers} dossiers, ${result.report.counts.answers} antwoorden.\n`);
  process.stdout.write(`${result.report.warnings.length} waarschuwingen staan in de private werkruimte en het private migratierapport.\n`);
  process.stdout.write(`Uitvoer: ${path.relative(repositoryRoot, output.output)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Underlying filesystem/SQLite exceptions may contain personal paths/data.
    const message = error.code ? `Bestands-/databasebewerking mislukt (${error.code}).` : error.name === 'WorkspaceValidationError' ? 'Export voldoet niet aan het actuele browsermodel; controleer de geselecteerde bron en migratiemapping.' : error instanceof SyntaxError ? 'Bron bevat niet veilig leesbare syntaxis.' : error.message;
    process.stderr.write(`Migratie gestopt: ${message}\n`); process.exitCode = 1;
  });
}
