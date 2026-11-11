import type { WorkspaceAnswer } from './model';

export type InventoryFilter = 'all' | 'unanswered' | 'follow-up';

/** Counts only the selected question set and exact dossier; never borrows another interview. */
export function inventoryProgress(
  questions: readonly { id: string }[],
  answers: readonly WorkspaceAnswer[],
  dossierId?: string,
) {
  const ids = new Set(questions.map((question) => question.id));
  const byQuestion = new Map<string, WorkspaceAnswer>();
  for (const answer of answers) {
    if (!ids.has(answer.questionId) || answer.dossierId !== dossierId) continue;
    const previous = byQuestion.get(answer.questionId);
    // Legacy duplicate records count once. Use the latest dated entry consistently in the UI.
    if (!previous || answer.answeredAt >= previous.answeredAt)
      byQuestion.set(answer.questionId, answer);
  }
  const total = ids.size;
  const answered = byQuestion.size;
  const followUp = [...byQuestion.values()].filter((answer) =>
    matchesInventoryFilter(answer, 'follow-up'),
  ).length;
  return {
    total,
    answered,
    unanswered: total - answered,
    followUp,
    percent: total ? Math.round((answered / total) * 100) : 0,
    byQuestion,
  };
}

export function matchesInventoryFilter(
  answer: WorkspaceAnswer | undefined,
  filter: InventoryFilter,
): boolean {
  if (filter === 'unanswered') return !answer;
  if (filter === 'follow-up') return answer?.choice === 'unknown' || answer?.choice === 'partial';
  return true;
}
