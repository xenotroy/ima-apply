import type { WorkspaceAnswer, WorkspacePatch, WorkspaceState } from './model';
import type { Finding, Observation } from './dossier';

/** Optional fields distinguish an unknown historical relation/author from a recorded empty list. */
export type RelatedResponse = WorkspaceAnswer & {
  respondedBy?: string;
  observationIds?: string[];
  findingIds?: string[];
};
type ResponseObservation = Observation & { responseIds?: string[] };
type ResponseFinding = Finding & { responseIds?: string[] };

export interface ResponseUpdate {
  answer: WorkspaceAnswer;
  respondedBy: string;
  observationIds?: readonly string[];
  findingIds?: readonly string[];
  evidenceIds?: readonly string[];
  /** Defaults to the time of this actual human edit; never backfill an imported response. */
  answeredAt?: string;
}

function fail(message: string): never {
  throw new Error(`Response-relaties: ${message}`);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 160;
}

function ids(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 5_000)
    fail(`${label} moet een lijst met unieke verwijzingen zijn.`);
  const seen = new Set<string>();
  for (const valueId of value) {
    if (!validId(valueId)) fail(`${label} bevat een ongeldige verwijzing.`);
    if (seen.has(valueId)) fail(`${label} bevat een dubbele verwijzing: ${valueId}.`);
    seen.add(valueId);
  }
  return [...value] as string[];
}

function uniqueRecords<T extends { id: string }>(
  records: readonly T[],
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const record of records) {
    if (!record || !validId(record.id)) fail(`${label} bevat een ongeldige ID.`);
    if (result.has(record.id)) fail(`${label} bevat een dubbele ID: ${record.id}.`);
    result.set(record.id, record);
  }
  return result;
}

function sameDossier(
  response: RelatedResponse,
  target: { dossierId?: string },
  label: string,
): void {
  if (response.dossierId !== target.dossierId)
    fail(`${label} hoort bij een ander dossier of heeft geen vastgelegde dossierscope.`);
}

/** Run after normal JSON shape validation, and before atomically saving the full workspace. */
export function assertResponseRelations(workspace: WorkspaceState): void {
  const responses = uniqueRecords(workspace.answers as RelatedResponse[], 'Responses');
  const observations = uniqueRecords(
    (workspace.observations ?? []) as ResponseObservation[],
    'Waarnemingen',
  );
  const findings = uniqueRecords((workspace.findings ?? []) as ResponseFinding[], 'Bevindingen');
  const evidence = uniqueRecords(workspace.evidence ?? [], 'Bewijs');
  const pairs = new Set<string>();

  for (const response of responses.values()) {
    if (!validId(response.questionId)) fail('Response bevat een ongeldige vraag-ID.');
    if (response.dossierId !== undefined && !validId(response.dossierId))
      fail('Response bevat een ongeldige dossier-ID.');
    const pair = JSON.stringify([response.dossierId ?? null, response.questionId]);
    if (pairs.has(pair))
      fail('Dezelfde vraag heeft meerdere antwoorden (responses) binnen één dossier.');
    pairs.add(pair);
    if (
      response.respondedBy !== undefined &&
      (typeof response.respondedBy !== 'string' ||
        !response.respondedBy.trim() ||
        response.respondedBy.length > 1_000)
    )
      fail('Vastgelegde respondent moet een niet-lege naam of actorcode zijn.');

    for (const observationId of ids(response.observationIds, 'Response.waarnemingen') ?? []) {
      const target = observations.get(observationId);
      if (!target) fail(`Waarneming ${observationId} bestaat niet.`);
      sameDossier(response, target, 'Waarneming');
      if (!(ids(target.responseIds, 'Waarneming.responses') ?? []).includes(response.id))
        fail(`Waarneming ${observationId} verwijst niet terug naar response ${response.id}.`);
    }
    for (const findingId of ids(response.findingIds, 'Response.bevindingen') ?? []) {
      const target = findings.get(findingId);
      if (!target) fail(`Bevinding ${findingId} bestaat niet.`);
      sameDossier(response, target, 'Bevinding');
      if (!(ids(target.responseIds, 'Bevinding.responses') ?? []).includes(response.id))
        fail(`Bevinding ${findingId} verwijst niet terug naar response ${response.id}.`);
    }
    for (const evidenceId of ids(response.evidenceIds, 'Response.bewijs') ?? []) {
      const target = evidence.get(evidenceId);
      if (!target) fail(`Bewijs ${evidenceId} bestaat niet.`);
      // Earlier exports allowed unscoped evidence. Unknown scope stays unknown.
      if (
        target.dossierId !== undefined &&
        response.dossierId !== undefined &&
        target.dossierId !== response.dossierId
      )
        fail(`Bewijs ${evidenceId} hoort bij een ander dossier.`);
    }
  }

  for (const [records, label, key] of [
    [observations, 'Waarneming', 'observationIds'],
    [findings, 'Bevinding', 'findingIds'],
  ] as const) {
    for (const target of records.values()) {
      for (const responseId of ids(target.responseIds, `${label}.responses`) ?? []) {
        const response = responses.get(responseId);
        if (!response) fail(`Response ${responseId} bestaat niet.`);
        sameDossier(response, target, label);
        if (!(ids(response[key], `Response.${key}`) ?? []).includes(target.id))
          fail(
            `Response ${responseId} verwijst niet terug naar ${label.toLowerCase()} ${target.id}.`,
          );
      }
    }
  }
}

function inverseLinks<T extends { id: string; responseIds?: string[] }>(
  records: readonly T[],
  responseId: string,
  selected: readonly string[] | undefined,
): T[] {
  const chosen = new Set(selected);
  return records.map((record) => {
    const linked = record.responseIds?.includes(responseId) ?? false;
    const shouldLink = chosen.has(record.id);
    if (linked === shouldLink) return record;
    return {
      ...record,
      responseIds: shouldLink
        ? [...(record.responseIds ?? []), responseId]
        : (record.responseIds ?? []).filter((id) => id !== responseId),
    };
  });
}

/** A human edit, preserving the existing response identity and updating both relation directions. */
export function upsertResponse(workspace: WorkspaceState, draft: ResponseUpdate): WorkspacePatch {
  assertResponseRelations(workspace);
  if (
    typeof draft.respondedBy !== 'string' ||
    !draft.respondedBy.trim() ||
    draft.respondedBy.length > 1_000
  )
    fail('Vul de respondent in vóór het vastleggen of wijzigen van een antwoord.');
  const incoming = draft.answer as RelatedResponse;
  if (!incoming || !validId(incoming.id) || !validId(incoming.questionId))
    fail('Een antwoord vereist een geldige response- en vraag-ID.');
  if (incoming.dossierId !== undefined) {
    const dossier = workspace.dossiers?.find((record) => record.id === incoming.dossierId);
    if (!dossier) fail('Het dossier voor dit antwoord bestaat niet.');
    if (!dossier.questions.some((question) => question.id === incoming.questionId))
      fail('De vraag is niet bevroren in dit dossier.');
  }
  const current = (workspace.answers as RelatedResponse[]).find(
    (answer) =>
      answer.dossierId === incoming.dossierId && answer.questionId === incoming.questionId,
  );
  const claimedId = workspace.answers.find((answer) => answer.id === incoming.id);
  if (claimedId && claimedId.id !== current?.id)
    fail('De aangeleverde response-ID hoort al bij een andere vraag of dossier.');
  const answeredAt = draft.answeredAt ?? new Date().toISOString();
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(answeredAt) ||
    !Number.isFinite(Date.parse(answeredAt))
  )
    fail('De wijzigingstijd vereist een geldige ISO-datum met tijdzone.');

  const observationIds = ids(
    draft.observationIds ?? incoming.observationIds ?? current?.observationIds,
    'Response.waarnemingen',
  );
  const findingIds = ids(
    draft.findingIds ?? incoming.findingIds ?? current?.findingIds,
    'Response.bevindingen',
  );
  const evidenceIds = ids(
    draft.evidenceIds ?? incoming.evidenceIds ?? current?.evidenceIds,
    'Response.bewijs',
  );
  const response: RelatedResponse = {
    ...current,
    ...incoming,
    id: current?.id ?? incoming.id,
    respondedBy: draft.respondedBy.trim(),
    answeredAt,
  };
  for (const [key, values] of [
    ['observationIds', observationIds],
    ['findingIds', findingIds],
    ['evidenceIds', evidenceIds],
  ] as const) {
    if (values === undefined) delete response[key];
    else response[key] = values;
  }
  for (const [selected, records, label] of [
    [observationIds, workspace.observations ?? [], 'Waarneming'],
    [findingIds, workspace.findings ?? [], 'Bevinding'],
  ] as const) {
    for (const targetId of selected ?? []) {
      const target = records.find((record) => record.id === targetId);
      if (!target) fail(`${label} ${targetId} bestaat niet.`);
      sameDossier(response, target, label);
    }
  }
  if (draft.evidenceIds !== undefined || (!current && incoming.evidenceIds !== undefined)) {
    for (const evidenceId of evidenceIds ?? []) {
      const target = workspace.evidence?.find((record) => record.id === evidenceId);
      if (!target) fail(`Bewijs ${evidenceId} bestaat niet.`);
      sameDossier(response, target, 'Nieuw geselecteerd bewijs');
    }
  }
  const patch: WorkspacePatch = {
    answers: current
      ? workspace.answers.map((answer) => (answer.id === current.id ? response : answer))
      : [...workspace.answers, response],
  };
  if (workspace.observations !== undefined || observationIds?.length)
    patch.observations = inverseLinks(workspace.observations ?? [], response.id, observationIds);
  if (workspace.findings !== undefined || findingIds?.length)
    patch.findings = inverseLinks(workspace.findings ?? [], response.id, findingIds);
  assertResponseRelations({ ...workspace, ...patch });
  return patch;
}

function md(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]<>#|])/g, '\\$1')
    .replace(/\r?\n/g, ' ');
}

/** Report projection, without inferring a respondent from the assessor or logged-in GitHub account. */
export function responseRelationsMarkdown(workspace: WorkspaceState, dossierId?: string): string[] {
  const responses = (workspace.answers as RelatedResponse[]).filter(
    (answer) => dossierId === undefined || answer.dossierId === dossierId,
  );
  if (!responses.length) return [];
  const relation = (
    values: string[] | undefined,
    records: readonly { id: string; title: string }[],
  ) =>
    values === undefined
      ? 'Historisch niet vastgelegd'
      : values.length
        ? values
            .map(
              (id) => `${md(records.find((record) => record.id === id)?.title ?? id)} (${md(id)})`,
            )
            .join('; ')
        : 'Geen gekoppeld';
  return [
    '## Respondenten en response-relaties',
    '',
    ...responses.flatMap((answer) => [
      `### Response ${md(answer.id)}`,
      '',
      `- Dossier: ${md(answer.dossierId ?? 'Niet vastgelegd')}`,
      `- Vraag: ${md(answer.questionId)}`,
      `- Respondent: ${md(answer.respondedBy ?? 'Historisch niet vastgelegd')}`,
      `- Antwoord/wijziging vastgelegd op: ${md(answer.answeredAt)}`,
      `- Waarnemingen: ${relation(answer.observationIds, workspace.observations ?? [])}`,
      `- Bevindingen: ${relation(answer.findingIds, workspace.findings ?? [])}`,
      `- Bewijs: ${relation(answer.evidenceIds, workspace.evidence ?? [])}`,
      '',
    ]),
  ];
}
