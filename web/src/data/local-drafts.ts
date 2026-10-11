import { sha256 } from '@noble/hashes/sha2.js';

export const LOCAL_DRAFT_PREFIX = 'ima-apply.draft.v1.';
export const DRAFT_CHANGE_EVENT = 'ima-apply:drafts-changed';
const MAX_DRAFT_BYTES = 512_000;
const unstoredDrafts = new Map<string, LocalDraft>();
const unsafeDraftKeys = new Set<string>();
export function rememberUnstoredDraft(draft: LocalDraft): void {
  const key = storageKey(draft.key, draft.writer);
  unsafeDraftKeys.add(key);
  try {
    assertJson(draft);
    unstoredDrafts.set(key, JSON.parse(JSON.stringify(draft)) as LocalDraft);
  } catch {
    /* Invalid values remain in the form, never in an export. */
  }
}
export function forgetUnstoredDraft(key: string, writer: string): void {
  const target = storageKey(key, writer);
  unstoredDrafts.delete(target);
  unsafeDraftKeys.delete(target);
}
export function hasUnstoredDrafts(): boolean {
  return unsafeDraftKeys.size > 0;
}
export function browserDrafts(workspaceId: string): LocalDraft[] {
  const values = new Map(
    new LocalDraftStore(localStorage)
      .list()
      .map((draft) => [storageKey(draft.key, draft.writer), draft]),
  );
  for (const [key, draft] of unstoredDrafts) values.set(key, draft);
  return [...values.values()].filter((draft) => draft.key.startsWith(`${workspaceId}/`));
}
let acceptedSequence = 0;
const accepted = new Map<string, number>();
const completed = new Set<number>();
const clearCallbacks = new Map<number, (() => void)[]>();
export function announceWorkspaceAccepted(workspaceId: string): number {
  const sequence = ++acceptedSequence;
  accepted.set(workspaceId, sequence);
  return sequence;
}
export function announceWorkspaceSaved(sequence: number): void {
  completed.add(sequence);
  for (const callback of clearCallbacks.get(sequence) ?? []) callback();
  clearCallbacks.delete(sequence);
}
/** Accepted by validation is not yet durable. Retain the concept until its exact write succeeds. */
export function afterWorkspaceSaved(workspaceId: string, callback: () => void): void {
  const sequence = accepted.get(workspaceId);
  if (!sequence) return;
  if (completed.has(sequence)) callback();
  else clearCallbacks.set(sequence, [...(clearCallbacks.get(sequence) ?? []), callback]);
}
export interface LocalDraft<T = unknown> {
  schema: 'ima.local-draft/v1';
  key: string;
  base: string;
  writer: string;
  savedAt: string;
  value: T;
}

export function draftBase(value: unknown): string {
  return Array.from(sha256(new TextEncoder().encode(JSON.stringify(value))))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function assertJson(value: unknown, depth = 0): void {
  if (depth > 40) throw new Error('Het concept bevat te veel geneste gegevens.');
  if (typeof value === 'string') {
    if (/\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/.test(value))
      throw new Error('Een toegangstoken mag niet in conceptopslag worden bewaard.');
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach((item) => assertJson(item, depth + 1));
    return;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      if (
        ['__proto__', 'prototype', 'constructor', 'token', 'accessToken', 'password'].includes(key)
      )
        throw new Error('Dit veld mag niet in conceptopslag worden bewaard.');
      if (item !== undefined) assertJson(item, depth + 1);
    }
    return;
  }
  throw new Error('Het concept bevat ongeldige gegevens.');
}

function readDraft(raw: string): LocalDraft {
  if (new TextEncoder().encode(raw).byteLength > MAX_DRAFT_BYTES)
    throw new Error('Het bestaande concept is te groot; het blijft bewaard.');
  const value = JSON.parse(raw) as LocalDraft;
  assertJson(value);
  if (
    value.schema !== 'ima.local-draft/v1' ||
    ![value.key, value.base, value.writer].every(
      (item) => typeof item === 'string' && item.trim() && item.length <= 1000,
    ) ||
    typeof value.savedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.savedAt)) ||
    !Object.hasOwn(value, 'value') ||
    Object.keys(value).some(
      (key) => !['schema', 'key', 'base', 'writer', 'savedAt', 'value'].includes(key),
    )
  )
    throw new Error('Onbekend conceptformaat; de bestaande gegevens blijven bewaard.');
  return value;
}

function storageKey(key: string, writer: string): string {
  return `${LOCAL_DRAFT_PREFIX}${encodeURIComponent(key)}.${encodeURIComponent(writer)}`;
}

/** Every tab writes its own slot. One tab can never overwrite another tab's concept. */
export class LocalDraftStore {
  constructor(readonly storage: Storage) {}

  list(formKey?: string): LocalDraft[] {
    const result: LocalDraft[] = [];
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index);
      if (!key?.startsWith(LOCAL_DRAFT_PREFIX)) continue;
      if (formKey && !key.startsWith(`${LOCAL_DRAFT_PREFIX}${encodeURIComponent(formKey)}.`))
        continue;
      const raw = this.storage.getItem(key);
      if (raw !== null) {
        const draft = readDraft(raw);
        if (storageKey(draft.key, draft.writer) !== key)
          throw new Error('Conceptidentiteit klopt niet.');
        result.push(draft);
      }
    }
    return result.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  recover<T>(key: string, base: string, writer: string): LocalDraft<T> | null {
    const drafts = this.list(key);
    const own = drafts.find((draft) => draft.writer === writer && draft.base === base);
    if (own) return own as LocalDraft<T>;
    const matching = drafts.filter((draft) => draft.base === base);
    if (matching.length > 1)
      throw new Error(
        'Meerdere concepten gevonden. Exporteer ze via Rapportage voordat je een versie kiest.',
      );
    if (matching[0]) return matching[0] as LocalDraft<T>;
    if (drafts.length)
      throw new Error(
        'Het bronrecord is veranderd. Het eerdere concept blijft beschikbaar via Rapportage.',
      );
    return null;
  }

  save<T>(
    key: string,
    base: string,
    writer: string,
    value: T,
    now = new Date().toISOString(),
  ): LocalDraft<T> {
    assertJson(value);
    const draft: LocalDraft<T> = {
      schema: 'ima.local-draft/v1',
      key,
      base,
      writer,
      savedAt: now,
      value,
    };
    const raw = JSON.stringify(draft);
    readDraft(raw);
    const target = storageKey(key, writer);
    const existing = this.storage.getItem(target);
    if (existing !== null) {
      const prior = readDraft(existing); // Preserve corrupt data, never replace it silently.
      if (prior.base !== base)
        throw new Error('Het eerdere concept heeft een andere bronversie en blijft bewaard.');
    }
    this.storage.setItem(target, raw);
    if (this.storage.getItem(target) !== raw)
      throw new Error('Conceptopslag kon niet worden bevestigd.');
    return draft;
  }

  remove(draft: Pick<LocalDraft, 'key' | 'writer'>): void {
    this.storage.removeItem(storageKey(draft.key, draft.writer));
  }
}

export function localDraftsMarkdown(drafts: LocalDraft[]): string[] {
  if (!drafts.length) return [];
  const fence = (text: string) =>
    '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((match) => match[0].length + 1)));
  return [
    '',
    '## Nog niet vastgelegde formulierconcepten',
    '',
    'Deze invoer is lokaal bewaard en nog geen vastgesteld dossierrecord. Concepten synchroniseren niet automatisch naar een andere pc.',
    '',
    ...drafts.flatMap((draft) => {
      const content = JSON.stringify(draft.value, null, 2),
        mark = fence(content);
      return [
        `### ${draft.key}`,
        `Lokaal bewaard: ${draft.savedAt} | bronvingerafdruk: ${draft.base}`,
        '',
        `${mark}json`,
        content,
        mark,
        '',
      ];
    }),
  ];
}
