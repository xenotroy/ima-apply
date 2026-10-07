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
const hash = value => createHash('sha256').update(value).digest('hex');
const string = value => typeof value === 'string' ? value : '';
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
const stableId = (kind, value) => `legacy-${kind}:${hash(String(value)).slice(0, 24)}`;
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
    const code = stripTypeScriptTypes(await fs.readFile(filename, 'utf8'));
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
  return { ...model, ...validation };
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
    suggestedHierarchy: [], roles: [], ...(fields.legalReferences !== undefined ? { legalReferences: fields.legalReferences } : {}) };
}
function freezeQuestion(value, version) { return { ...value, version: version || 'legacy-import/1.0.0', sha256: hash(JSON.stringify(value)) }; }
function addFrozen(context, dossier, value, version) {
  const frozen = freezeQuestion(value, version);
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

export async function migrateMarkdown(root, options = {}) {
  root = path.resolve(root);
  const context = await contextFor(options.name || 'Gemigreerde IMA-werkruimte', options.now);
  const records = [];
  for (const filename of await selectedMarkdownFiles(root)) {
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
    records.push({ ...parsed, sourceId, targetId: stableId('md', `${m.schema}|${m.id}|${relative}`) });
  }
  const { workspace } = context;
  const bySchema = schema => records.filter(record => record.metadata.schema === schema);
  const unique = (schema, id) => { const candidates = bySchema(schema).filter(record => string(record.metadata.id).toLowerCase() === string(id).toLowerCase()); return id && candidates.length === 1 ? candidates[0] : null; };
  const originalQuestion = (id, version, sha256) => {
    const matches = bySchema('ima.rie-question-definition/v1').filter(record => string(record.metadata.id).toLowerCase() === string(id).toLowerCase() && record.metadata.version === version && record.legacySha256 === string(sha256).toLowerCase());
    return matches.length === 1 ? matches[0] : null;
  };
  const projectedQuestion = record => question({ id: record.targetId, title: string(record.metadata.title), prompt: record.sections.vraag,
    themeId: strings(record.metadata.topic_ids)[0], evidenceHints: record.sections['verwacht bewijs'] ? [record.sections['verwacht bewijs']] : [],
    assessmentGuidance: [record.sections.toelichting, record.sections.acceptatiecriteria].filter(Boolean).join('\n\n'), sourceIds: [record.sourceId],
    ...(record.sections.wetgeving !== undefined ? { legalReferences: record.sections.wetgeving } : {}) });
  const workspaceRecord = bySchema('ima.workspace/v1')[0];
  if (!options.name && string(workspaceRecord?.metadata.title)) workspace.name = workspaceRecord.metadata.title;
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
      addFrozen(context, dossier, projectedQuestion(original), ref[2]);
    }
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
        const bytes = await fs.readFile(filename);
        if (hash(bytes) !== string(m.sha256).toLowerCase()) warning(context, 'attachment_hash_mismatch', record.sourceId, 'Werkelijke bijlagehash wijkt af van de legacy bewijshash; projectie blijft unverified.');
      } catch { warning(context, 'attachment_unavailable', record.sourceId, 'Bijlage niet veilig beschikbaar; alleen verwijzing en originele metadata zijn behouden.'); }
    }
    workspace.evidence.push({ id: record.targetId, title: string(m.title), dossierId: dossier.id, kind: m.kind,
      reference, description: record.sections.beschrijving || '', recordedAt: time, status: 'unverified' });
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
      evidenceIds, note: record.sections.motivering || '', answeredAt: time, questionSnapshot: frozen.prompt, sourceIds: [record.sourceId], contentVersion: frozen.version, questionSha256: frozen.sha256 });
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
  for (const record of records.filter(item => ['ima.action/v1', 'ima.action/v2'].includes(item.metadata.schema))) {
    const m = record.metadata;
    if (!string(m.title) || m.status === 'cancelled') { warning(context, 'action_raw_only', record.sourceId, 'Geannuleerde of titelloze actie blijft raw, zodat zij niet opnieuw als open werk verschijnt.'); continue; }
    const known = ['proposed', 'planned', 'in_progress', 'implemented', 'verification_due', 'effective', 'ineffective', 'closed', 'reopened', 'open'];
    if (!known.includes(m.status)) { warning(context, 'action_raw_only', record.sourceId, 'Onbekende actiestatus: geen lifecycle gegokt.'); continue; }
    const status = ['proposed', 'planned', 'open'].includes(m.status) ? 'open' : 'in_progress';
    if (['closed', 'effective', 'implemented'].includes(m.status)) warning(context, 'action_verification_not_transferred', record.sourceId, 'Legacy uitvoering/effectstatus raw behouden. Het nieuwe done vereist afzonderlijke menselijke effectverificatie.');
    const linkedFindings = strings(m.source_ids).map(id => unique('ima.rie-finding/v2', id)).filter(item => item && findingProjected.has(item.targetId));
    const finding = linkedFindings.length === 1 ? workspace.findings.find(item => item.id === linkedFindings[0].targetId) : undefined;
    if (linkedFindings.length > 1) warning(context, 'action_multiple_findings', record.sourceId, 'Actie verwijst naar meerdere bevindingen; het nieuwe enkele findingId is niet willekeurig gekozen.');
    workspace.actions.push({ id: record.targetId, title: m.title, owner: string(m.owner), dueDate: calendarDate(m.target_date), status, notes: record.body,
      ...(finding ? { findingId: finding.id, dossierId: finding.dossierId } : {}) });
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
  for (const record of records) {
    if (record.metadata.scope_id) warning(context, 'scope_raw_only', record.sourceId, 'Oude scope-ID raw behouden; Markdown bevat geen bevestigde organisation/site/department-definitie voor deze ID.');
    for (const [key, value] of Object.entries(record.metadata)) if (/(?:_id|_ids)$/.test(key)) {
      for (const id of Array.isArray(value) ? strings(value) : string(value) ? [value] : []) {
        const candidates = records.filter(item => string(item.metadata.id).toLowerCase() === id.toLowerCase());
        if (candidates.length !== 1) warning(context, 'legacy_reference_unresolved', record.sourceId, `Oorspronkelijke ${key}-relatie ontbreekt of is dubbel; alleen raw bewaard.`);
      }
    }
    if (!['ima.workspace/v1', 'ima.topic/v1', 'ima.legal-update/v1', 'ima.rie-question-definition/v1', 'ima.rie-assessment/v1', 'ima.rie-evidence/v1', 'ima.rie-response/v1', 'ima.rie-observation/v1', 'ima.rie-finding/v2', 'ima.action/v1', 'ima.action/v2', 'ima.incident/v1', 'ima.exposure/v1', 'ima.rie-risk-assessment/v1', 'ima.analysis/v1'].includes(record.metadata.schema)) {
      warning(context, 'unsupported_record_raw_only', record.sourceId, 'Dit legacy schema is uitsluitend als compleet raw record overgedragen; geen typed functiepariteit geclaimd.');
    }
  }
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
  const moduleIds = new Set([...(rows.GeselecteerdeModules ?? []).map(row => row.ModuleId), ...rows.DepartmentModules.map(row => row.ModuleId)]);
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
  for (const department of rows.Departments) {
    // SQLite Departments has CompanyId, but no site entity/address. Do not invent a site.
    departmentMap.set(department.Id, null);
    warning(context, 'department_site_unknown', sourceFor('Departments', department), 'Legacy department/company-koppeling raw behouden. Geen nieuwe site verzonnen voor verplichte siteId.');
  }
  const dossiers = new Map();
  const getDossier = row => {
    const key = `${row.CompanyId ?? 'project'}:${row.DepartmentId ?? 'all'}`;
    if (!dossiers.has(key)) {
      const company = rows.Companies?.find(item => item.Id === row.CompanyId);
      const department = rows.Departments.find(item => item.Id === row.DepartmentId);
      const scope = [string(project.Organisatie), string(project.Locatie), string(company?.Name), string(department?.Name)].filter(Boolean).join(' / ');
      const organisationId = organisationByCompany.get(row.CompanyId) ?? (row.CompanyId == null && workspace.organisations.length === 1 ? workspace.organisations[0]?.id : undefined);
      const dossier = newDossier(context, stableId('sqlite-dossier', `${project.Id}|${key}`), [string(project.Naam), string(department?.Name)].filter(Boolean).join(' — ') || 'Legacy dossier', { scope, ...(organisationId ? { organisationId } : {}) });
      dossiers.set(key, dossier);
      if (row.CompanyId != null && !company || row.DepartmentId != null && !department) warning(context, 'sqlite_scope_unresolved', '', 'Antwoordscope verwijst naar ontbrekende company/department; bron-FKs blijven raw behouden.');
    }
    return dossiers.get(key);
  };
  const baseDossier = getDossier({});
  const answerPairs = new Map();
  const sqlitePair = answer => JSON.stringify([answer.CompanyId ?? null, answer.DepartmentId ?? null, answer.VraagId]);
  for (const answer of rows.Antwoorden ?? []) answerPairs.set(sqlitePair(answer), (answerPairs.get(sqlitePair(answer)) ?? 0) + 1);
  for (const answer of rows.Antwoorden ?? []) {
    const sourceId = sourceFor('Antwoorden', answer);
    if (answerPairs.get(sqlitePair(answer)) > 1) { warning(context, 'sqlite_answer_pair_ambiguous', sourceId, 'Meerdere antwoorden binnen dezelfde company/department/vraag-scope: alle raw behouden, geen keuze gegokt.'); continue; }
    const original = rows.Vragen.find(row => row.Id === answer.VraagId);
    const time = timestamp(answer.UpdatedAt, context, sourceId, options.assumeUtc === true);
    const choice = new Map([[0, 'yes'], [1, 'no'], [2, 'na'], [null, 'unknown']]).get(answer.Keuze);
    if (!original || !time || !choice || !string(original.Vraagtekst)) { warning(context, 'sqlite_answer_raw_only', sourceId, 'Antwoord mist leesbare vraag, exacte datumtijdzone of bekend enum; raw behouden.'); continue; }
    const dossier = getDossier(answer);
    const q = question({ id: targetFor('Vragen', original), title: string(original.Titel), prompt: original.Vraagtekst, themeId: string(original.ModuleCode) || String(original.ModuleId),
      assessmentGuidance: string(original.Toetscriteria), sourceIds: [sourceFor('Vragen', original)], legalReferences: string(original.Wetgeving) });
    const frozen = addFrozen(context, dossier, q, 'legacy-import/1.0.0');
    // SQLite did not freeze question text historically. This is the exported current
    // database definition, not a claim that it was exactly the definition at answer time.
    warning(context, 'sqlite_question_not_historically_frozen', sourceId, 'Vraag bij export bevroren; de legacy SQLite-antwoorden bevatten geen oorspronkelijke vraaghash/snapshot.');
    workspace.answers.push({ id: targetFor('Antwoorden', answer), questionId: q.id, dossierId: dossier.id, choice, evidence: '', evidenceIds: [], note: string(answer.Toelichting),
      answeredAt: time, questionSnapshot: q.prompt, questionSha256: frozen.sha256, contentVersion: frozen.version, sourceIds: [sourceId] });
  }
  // Preserve selected module questions even when there is no answer yet.
  for (const original of rows.Vragen) {
    if (!string(original.Vraagtekst)) continue;
    const q = question({ id: targetFor('Vragen', original), title: string(original.Titel), prompt: original.Vraagtekst, themeId: string(original.ModuleCode) || String(original.ModuleId), assessmentGuidance: string(original.Toetscriteria), sourceIds: [sourceFor('Vragen', original)], legalReferences: string(original.Wetgeving) });
    addFrozen(context, baseDossier, q, 'legacy-import/1.0.0');
  }
  for (const rating of rows.RisicofactorBeoordelingen ?? []) {
    const factor = (rows.Risicofactoren ?? []).find(row => row.Id === rating.RisicofactorItemId);
    const risk = factor && (rows.Risicos ?? []).find(row => row.Id === factor.RisicoItemId);
    const sourceId = sourceFor('RisicofactorBeoordelingen', rating);
    warning(context, 'legacy_rating_not_kinney', sourceId, '1–3 E/B/W- en relevantieratings zijn oorspronkelijke lokale prioritering, geen Kinney-factoren of gevalideerde percentagewerking.');
    if (!factor || !risk || !string(factor.Titel)) continue;
    const dossier = getDossier(rating);
    workspace.findings.push({ id: targetFor('RisicofactorBeoordelingen', rating), title: factor.Titel, dossierId: dossier.id,
      description: `Legacy risicofactor: ${string(factor.Omschrijving)}\nLegacy risico: ${string(risk.Titel)}\nOorspronkelijke beoordeling: ${string(rating.Toelichting)}\nNumerieke ratings staan uitsluitend in het raw bronrecord; herbeoordeling vereist.`,
      status: 'open', observationIds: [], evidenceIds: [], topicIds: [], legalIds: [], decisionBy: '', decisionNote: '' });
  }
  for (const rating of rows.MaatregelBeoordelingen ?? []) warning(context, 'legacy_control_raw_only', sourceFor('MaatregelBeoordelingen', rating), 'ReductieScore/KostenNiveau/IsInPlace raw behouden. Geen procenten, bewijsstatus, AHS-broncredit of nieuwe actie-inspanning uit ratings gegokt.');
  for (const walkthrough of rows.WalkthroughReports) {
    const sourceId = sourceFor('WalkthroughReports', walkthrough);
    warning(context, 'walkthrough_raw_only', sourceId, 'Rondgangrapport en modulekoppelingen raw behouden; samenvatting is niet automatisch een feitelijke waarneming of bevinding.');
  }
  return finish(context);
}

function finish(context) {
  const serialized = context.api.exportWorkspace(context.workspace);
  context.report.counts = Object.fromEntries(['scenarios', 'questions', 'answers', 'actions', 'incidents', 'sources', 'organisations', 'sites', 'departments', 'dossiers', 'evidence', 'observations', 'findings', 'topics', 'legalRecords', 'investigations', 'exposure'].map(key => [key, context.workspace[key]?.length ?? 0]));
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
  process.stdout.write(`${result.report.warnings.length} waarschuwingen staan uitsluitend in het private migratierapport.\n`);
  process.stdout.write(`Uitvoer: ${path.relative(repositoryRoot, output.output)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Underlying filesystem/SQLite exceptions may contain personal paths/data.
    const message = error.code ? `Bestands-/databasebewerking mislukt (${error.code}).` : error.name === 'WorkspaceValidationError' ? 'Export voldoet niet aan het actuele browsermodel; controleer de geselecteerde bron en migratiemapping.' : error instanceof SyntaxError ? 'Bron bevat niet veilig leesbare syntaxis.' : error.message;
    process.stderr.write(`Migratie gestopt: ${message}\n`); process.exitCode = 1;
  });
}
