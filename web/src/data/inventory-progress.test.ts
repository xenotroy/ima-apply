import { describe, expect, it } from 'vitest';
import { inventoryProgress, matchesInventoryFilter } from './inventory-progress';
import type { WorkspaceAnswer } from './model';

const answer = (questionId: string, patch: Partial<WorkspaceAnswer> = {}): WorkspaceAnswer => ({
  id: `answer-${questionId}`,
  questionId,
  dossierId: 'unit9',
  choice: 'yes',
  evidence: '',
  note: '',
  answeredAt: '2026-11-11T09:00:00Z',
  ...patch,
});
const questions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('inventory progress', () => {
  it('excludes other dossiers, unscoped answers and removed questions', () => {
    const progress = inventoryProgress(
      questions,
      [
        answer('a'),
        answer('b', { dossierId: 'other' }),
        answer('c', { dossierId: undefined }),
        answer('removed'),
      ],
      'unit9',
    );
    expect(progress).toMatchObject({ total: 3, answered: 1, unanswered: 2, percent: 33 });
  });
  it('counts duplicate question IDs and duplicate legacy answers once using the latest record', () => {
    const latest = answer('a', { choice: 'partial', answeredAt: '2026-11-11T10:00:00Z' });
    const progress = inventoryProgress([...questions, { id: 'a' }], [latest, answer('a')], 'unit9');
    expect(progress).toMatchObject({ total: 3, answered: 1, followUp: 1 });
    expect(progress.byQuestion.get('a')).toEqual(latest);
  });
  it('distinguishes unanswered from recorded unknown or partial answers', () => {
    const progress = inventoryProgress(
      questions,
      [answer('a', { choice: 'unknown' }), answer('b', { choice: 'partial' })],
      'unit9',
    );
    expect(progress).toMatchObject({ answered: 2, unanswered: 1, followUp: 2 });
    expect(matchesInventoryFilter(undefined, 'unanswered')).toBe(true);
    expect(matchesInventoryFilter(undefined, 'follow-up')).toBe(false);
    expect(matchesInventoryFilter(answer('a', { choice: 'unknown' }), 'unanswered')).toBe(false);
  });
  it('does not treat a negative answer as an unanswered question', () => {
    expect(matchesInventoryFilter(answer('a', { choice: 'no' }), 'unanswered')).toBe(false);
    expect(matchesInventoryFilter(answer('a', { choice: 'no' }), 'all')).toBe(true);
  });
  it('keeps the general inventory separate', () => {
    expect(
      inventoryProgress(questions, [answer('a'), answer('b', { dossierId: undefined })]).answered,
    ).toBe(1);
  });
  it('handles an empty dossier without NaN or false completion', () => {
    expect(inventoryProgress([], [answer('a')], 'unit9')).toMatchObject({
      total: 0,
      answered: 0,
      percent: 0,
    });
  });
});
