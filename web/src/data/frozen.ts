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
