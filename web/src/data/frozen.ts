import { sha256 } from '@noble/hashes/sha2.js';
import type { Question } from '../content/catalog';
import type { FrozenQuestion, Evidence } from './dossier';

/** Stable field order shared by the migration exporter. Array order is meaningful. */
export function questionArtifact(question: Question): string {
  return JSON.stringify({
    id: question.id,
    themeId: question.themeId,
    title: question.title,
    prompt: question.prompt,
    route: question.route,
    evidenceHints: question.evidenceHints,
    assessmentGuidance: question.assessmentGuidance,
    sourceIds: question.sourceIds,
    suggestedHierarchy: question.suggestedHierarchy,
    roles: question.roles,
    ...(question.acceptanceCriteria !== undefined
      ? { acceptanceCriteria: question.acceptanceCriteria }
      : {}),
    ...(question.expectedEvidence !== undefined
      ? { expectedEvidence: question.expectedEvidence }
      : {}),
    ...(question.richFields !== undefined
      ? {
          richFields: {
            ...(question.richFields.number !== undefined
              ? { number: question.richFields.number }
              : {}),
            ...(question.richFields.hazard !== undefined
              ? { hazard: question.richFields.hazard }
              : {}),
            ...(question.richFields.risk !== undefined ? { risk: question.richFields.risk } : {}),
            ...(question.richFields.riskFactor !== undefined
              ? { riskFactor: question.richFields.riskFactor }
              : {}),
            ...(question.richFields.technicalControls !== undefined
              ? { technicalControls: question.richFields.technicalControls }
              : {}),
            ...(question.richFields.organisationalControls !== undefined
              ? { organisationalControls: question.richFields.organisationalControls }
              : {}),
            ...(question.richFields.rootCauses !== undefined
              ? { rootCauses: question.richFields.rootCauses }
              : {}),
            ...(question.richFields.culture !== undefined
              ? { culture: question.richFields.culture }
              : {}),
            ...(question.richFields.sortOrder !== undefined
              ? { sortOrder: question.richFields.sortOrder }
              : {}),
          },
        }
      : {}),
    ...(question.definition !== undefined
      ? {
          definition: {
            schema: question.definition.schema,
            version: question.definition.version,
            status: question.definition.status,
            contentPackageId: question.definition.contentPackageId,
            contentPackageVersion: question.definition.contentPackageVersion,
            ...(question.definition.supersedesId !== undefined
              ? { supersedesId: question.definition.supersedesId }
              : {}),
            topicIds: question.definition.topicIds,
            legalIds: question.definition.legalIds,
            tags: question.definition.tags,
            ...(question.definition.createdAt !== undefined
              ? { createdAt: question.definition.createdAt }
              : {}),
            ...(question.definition.updatedAt !== undefined
              ? { updatedAt: question.definition.updatedAt }
              : {}),
            ...(question.definition.sourcePath !== undefined
              ? { sourcePath: question.definition.sourcePath }
              : {}),
            ...(question.definition.sourceSha256 !== undefined
              ? { sourceSha256: question.definition.sourceSha256 }
              : {}),
          },
        }
      : {}),
    ...(question.legalReferences !== undefined
      ? { legalReferences: question.legalReferences }
      : {}),
  });
}
export function questionHash(question: Question): string {
  return Array.from(sha256(new TextEncoder().encode(questionArtifact(question))))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
export function freezeQuestion(question: Question, version = '2.0.0'): FrozenQuestion {
  const copy = JSON.parse(questionArtifact(question)) as Question;
  return { ...copy, version, sha256: questionHash(copy) };
}
export function evidenceHash(evidence: Evidence): string {
  const artifact = JSON.stringify({
    id: evidence.id,
    title: evidence.title,
    dossierId: evidence.dossierId ?? null,
    kind: evidence.kind,
    reference: evidence.reference,
    description: evidence.description,
  });
  return Array.from(sha256(new TextEncoder().encode(artifact)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
