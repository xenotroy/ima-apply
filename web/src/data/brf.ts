import { sha256 } from '@noble/hashes/sha2.js';
import type { Investigation } from './dossier';
import type { WorkspaceState } from './model';

export type BasisRiskFactorStatus = 'draft' | 'local' | 'retired';
export interface BasisRiskFactorStatusChange {
  from: BasisRiskFactorStatus;
  to: BasisRiskFactorStatus;
  actor: string;
  at: string;
  reason: string;
}
/** A local taxonomy definition version, not a canonical Tripod term or established cause. */
export interface BasisRiskFactorRecord {
  id: string;
  factorId: string;
  taxonomy: string;
  code: string;
  title: string;
  version: string;
  status: BasisRiskFactorStatus;
  description: string;
  sourceReference: string;
  owner: string;
  createdBy: string;
  createdAt: string;
  changeNote: string;
  supersedesId?: string;
  parentRecordId?: string;
  statusHistory: BasisRiskFactorStatusChange[];
}
export interface BasisRiskFactorSnapshot {
  record: BasisRiskFactorRecord;
  sha256: string;
}
export const basisRiskFactorStatusLabels: Record<BasisRiskFactorStatus, string> = {
  draft: 'Concept',
  local: 'Lokaal vastgesteld',
  retired: 'Teruggetrokken',
};
function artifact(record: BasisRiskFactorRecord, definitionOnly: boolean): string {
  return JSON.stringify({
    id: record.id,
    factorId: record.factorId,
    taxonomy: record.taxonomy,
    code: record.code,
    title: record.title,
    version: record.version,
    description: record.description,
    sourceReference: record.sourceReference,
    owner: record.owner,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    changeNote: record.changeNote,
    ...(record.supersedesId !== undefined ? { supersedesId: record.supersedesId } : {}),
    ...(record.parentRecordId !== undefined ? { parentRecordId: record.parentRecordId } : {}),
    ...(!definitionOnly
      ? {
          status: record.status,
          statusHistory: record.statusHistory.map((item) => ({
            from: item.from,
            to: item.to,
            actor: item.actor,
            at: item.at,
            reason: item.reason,
          })),
        }
      : {}),
  });
}
function digest(value: string): string {
  return Array.from(sha256(new TextEncoder().encode(value)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
export function basisRiskFactorHash(record: BasisRiskFactorRecord): string {
  return digest(artifact(record, false));
}
export function basisRiskFactorDefinitionHash(record: BasisRiskFactorRecord): string {
  return digest(artifact(record, true));
}
export function freezeBasisRiskFactor(record: BasisRiskFactorRecord): BasisRiskFactorSnapshot {
  return {
    record: JSON.parse(artifact(record, false)) as BasisRiskFactorRecord,
    sha256: basisRiskFactorHash(record),
  };
}
export function freezeInvestigationBasisRiskFactors(
  investigation: Investigation,
  records: BasisRiskFactorRecord[],
): Investigation {
  const ids = investigation.basisRiskFactorIds ?? [];
  return {
    ...investigation,
    basisRiskFactorSnapshots: ids.map((id) => {
      const record = records.find((item) => item.id === id);
      if (!record) throw new Error('De gekozen BRF-versie bestaat niet meer.');
      return freezeBasisRiskFactor(record);
    }),
  };
}
export function assertBasisRiskFactorHistory(record: BasisRiskFactorRecord): void {
  if (record.statusHistory.length > 250) throw new Error('Te veel BRF-statuswijzigingen.');
  let stage: BasisRiskFactorStatus = 'draft';
  let time = Date.parse(record.createdAt);
  if (!Number.isFinite(time)) throw new Error('BRF-versie vraagt een geldig vastleggingstijdstip.');
  for (const event of record.statusHistory) {
    if (
      event.from !== stage ||
      !(
        (stage === 'draft' && ['local', 'retired'].includes(event.to)) ||
        (stage === 'local' && event.to === 'retired')
      )
    )
      throw new Error('Ongeldige BRF-statusovergang.');
    if (
      !event.actor.trim() ||
      !event.reason.trim() ||
      !Number.isFinite(Date.parse(event.at)) ||
      Date.parse(event.at) < time
    )
      throw new Error('BRF-status vraagt actor, redenering en chronologische tijdstippen.');
    stage = event.to;
    time = Date.parse(event.at);
  }
  if (record.status !== stage)
    throw new Error('BRF-status en statusgeschiedenis komen niet overeen.');
  if (
    (record.status === 'local' || record.statusHistory.some((event) => event.to === 'local')) &&
    (!record.owner.trim() || !record.sourceReference.trim())
  )
    throw new Error('Een lokale definitie vraagt eigenaarschap en een bron-/afspraakverwijzing.');
}
export function changeBasisRiskFactorStatus(
  record: BasisRiskFactorRecord,
  status: BasisRiskFactorStatus,
  actor: string,
  reason: string,
  at = new Date().toISOString(),
): BasisRiskFactorRecord {
  const next = {
    ...record,
    status,
    statusHistory: [
      ...record.statusHistory,
      { from: record.status, to: status, actor: actor.trim(), reason: reason.trim(), at },
    ],
  };
  assertBasisRiskFactorHistory(next);
  return next;
}
export function assertBasisRiskFactorRelations(workspace: WorkspaceState): void {
  const records = workspace.basisRiskFactorRecords ?? [];
  const lookup = new Map(records.map((record) => [record.id, record]));
  const pairs = new Set<string>();
  const taxonomies = new Map<string, string>();
  for (const record of records) {
    const pair = JSON.stringify([record.factorId, record.version]);
    if (pairs.has(pair)) throw new Error('Dezelfde BRF-identiteit en versie komen dubbel voor.');
    pairs.add(pair);
    if (taxonomies.has(record.factorId) && taxonomies.get(record.factorId) !== record.taxonomy)
      throw new Error('Versies van één BRF-identiteit horen bij dezelfde lokale taxonomie.');
    taxonomies.set(record.factorId, record.taxonomy);
    if (record.supersedesId) {
      const before = lookup.get(record.supersedesId);
      if (
        !before ||
        before.id === record.id ||
        before.factorId !== record.factorId ||
        before.taxonomy !== record.taxonomy ||
        Date.parse(before.createdAt) > Date.parse(record.createdAt)
      )
        throw new Error(
          'BRF-voorganger ontbreekt of hoort bij een andere identiteit/taxonomie/tijdvolgorde.',
        );
    }
    if (record.parentRecordId) {
      const parent = lookup.get(record.parentRecordId);
      if (!parent || parent.factorId === record.factorId || parent.taxonomy !== record.taxonomy)
        throw new Error(
          'BRF-bovenliggende versie ontbreekt, is dezelfde identiteit of hoort bij een andere taxonomie.',
        );
    }
    for (const link of ['supersedesId', 'parentRecordId'] as const) {
      const seen = new Set([record.id]);
      let current = record;
      while (current[link]) {
        const id = current[link]!;
        if (seen.has(id)) throw new Error('BRF-register bevat een cyclische relatie.');
        seen.add(id);
        const next = lookup.get(id);
        if (!next) break;
        current = next;
      }
    }
  }
  for (const investigation of workspace.investigations ?? []) {
    const ids = investigation.basisRiskFactorIds ?? [];
    if (new Set(ids).size !== ids.length)
      throw new Error('Onderzoek bevat dubbele BRF-versiekoppelingen.');
    if (ids.some((id) => !lookup.has(id)))
      throw new Error('Onderzoek verwijst naar een ontbrekende BRF-versie.');
    const snapshots = investigation.basisRiskFactorSnapshots;
    if (investigation.status === 'reviewed' && ids.length && !snapshots)
      throw new Error(
        'Een beoordeeld onderzoek vraagt de daadwerkelijk gebruikte BRF-versies als snapshots.',
      );
    if (snapshots) {
      if (
        snapshots.length !== ids.length ||
        new Set(snapshots.map((item) => item.record.id)).size !== snapshots.length
      )
        throw new Error('BRF-snapshots en onderzoeksverwijzingen komen niet overeen.');
      for (const snapshot of snapshots) {
        const record = lookup.get(snapshot.record.id);
        if (
          !record ||
          !ids.includes(record.id) ||
          snapshot.sha256 !== basisRiskFactorHash(snapshot.record) ||
          basisRiskFactorDefinitionHash(snapshot.record) !== basisRiskFactorDefinitionHash(record)
        )
          throw new Error(
            'BRF-snapshot is gewijzigd of hoort niet bij de gekoppelde definitieversie.',
          );
        if (
          investigation.status === 'reviewed' &&
          (snapshot.record.status === 'draft' ||
            record.status === 'draft' ||
            !snapshot.record.statusHistory.some((event) => event.to === 'local'))
        )
          throw new Error(
            'Stel de BRF-definitie lokaal vast voordat je haar als versie in een beoordeeld onderzoek gebruikt.',
          );
      }
    }
  }
}

export function basisRiskFactorMarkdown(workspace: WorkspaceState): string[] {
  const records = workspace.basisRiskFactorRecords ?? [];
  const lines: string[] = [];
  if (records.length)
    lines.push(
      '',
      '## Lokaal BRF-register',
      '',
      'Projectdefinities; koppeling is geen automatische oorzaakvaststelling of canonieke Tripod-codering.',
      '',
    );
  for (const record of records) {
    lines.push(
      `### ${record.code} — ${record.title} @${record.version}`,
      `Versie-ID: ${record.id} | identiteit ${record.factorId} | taxonomie ${record.taxonomy} | ${basisRiskFactorStatusLabels[record.status]}`,
      `Betekenis: ${record.description}`,
      `Bron/afspraak: ${record.sourceReference || 'Nog niet vastgelegd'}`,
      `Eigenaar: ${record.owner || 'Nog niet vastgelegd'} | vastlegger ${record.createdBy || 'Onbekend'} | ${record.createdAt}`,
      `Versieredenering: ${record.changeNote}`,
      `Voorganger: ${record.supersedesId ?? 'Geen'} | bovenliggende versie ${record.parentRecordId ?? 'Geen'}`,
      `Definitie-SHA256: ${basisRiskFactorDefinitionHash(record)}`,
    );
    for (const event of record.statusHistory)
      lines.push(
        `Status: ${event.from} → ${event.to} | ${event.actor} | ${event.at} | ${event.reason}`,
      );
    lines.push('');
  }
  for (const investigation of workspace.investigations ?? []) {
    if (!investigation.basisRiskFactorIds?.length) continue;
    lines.push(`### BRF-versies gebruikt in ${investigation.title} [${investigation.id}]`);
    for (const id of investigation.basisRiskFactorIds) {
      const snapshot = investigation.basisRiskFactorSnapshots?.find(
        (item) => item.record.id === id,
      );
      const record = snapshot?.record ?? records.find((item) => item.id === id);
      if (record)
        lines.push(
          `- ${record.code} @${record.version} [${record.id}] | ${record.title} | ${record.description} | bron ${record.sourceReference} | ${snapshot ? `Bevroren SHA256 ${snapshot.sha256}` : 'Huidige definitie; nog geen review-snapshot'}`,
          `Gebruikte definitiestatus: ${basisRiskFactorStatusLabels[record.status]} | eigenaar ${record.owner || 'Onbekend'} | vastlegger ${record.createdBy || 'Onbekend'} | ${record.createdAt} | versieredenering ${record.changeNote}`,
        );
    }
    lines.push('');
  }
  return lines;
}
