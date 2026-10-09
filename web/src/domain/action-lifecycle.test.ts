import { describe, expect, it } from 'vitest';
import { createWorkspace, type WorkspaceAction } from '../data/model';
import type { Evidence } from '../data/dossier';
import { evidenceHash } from '../data/frozen';
import { exportWorkspace, importWorkspace } from '../data/validation';
import {
  actionEventHash,
  actionRevision,
  actionStage,
  assertActionHistory,
  initialActionLifecycle,
  reviseAction,
} from './action-lifecycle';

const at = (hour: number) => `2026-10-07T${String(hour).padStart(2, '0')}:00:00.000Z`;
function initial(): WorkspaceAction {
  return {
    id: 'action-1',
    title: 'Bronafzuiging aanbrengen',
    owner: 'Ada',
    dueDate: '2026-10-08',
    status: 'open',
    notes: 'Meet debiet en toets aan het vastgelegde ontwerpcriterium.',
    evidenceIds: ['measurement-1'],
  };
}
function proof(): Evidence {
  const item: Evidence = {
    id: 'measurement-1',
    title: 'Controlemeting',
    kind: 'measurement',
    reference: 'https://example.com/measurement',
    description: 'Debiet gemeten en gecontroleerd tegen het ontwerpcriterium.',
    recordedAt: at(10),
    status: 'verified',
    verifiedBy: 'Bert',
    verifiedAt: at(11),
    verificationNote: 'Bron en meetmethode beoordeeld.',
  };
  item.verifiedContentSha256 = evidenceHash(item);
  return item;
}
function change(
  action: WorkspaceAction,
  targetStage: Parameters<typeof reviseAction>[1]['targetStage'],
  hour: number,
  extra: Partial<Parameters<typeof reviseAction>[1]> = {},
) {
  return reviseAction(
    action,
    {
      expectedRevision: actionRevision(action),
      actor: 'Ada',
      reason: 'Uitvoering en afspraken gecontroleerd.',
      targetStage,
      ...extra,
    },
    [proof()],
    at(hour),
  );
}
function ready(): WorkspaceAction {
  let action = change(initial(), 'in_progress', 8);
  action = change(action, 'implemented', 9);
  return change(action, 'verification_due', 10, { verificationDueAt: at(12) });
}
function assessed(stage: 'effective' | 'ineffective' = 'effective'): WorkspaceAction {
  return change(ready(), stage, 12, {
    verifier: 'Bert',
    evaluation:
      stage === 'effective'
        ? 'Het gemeten debiet voldoet aan het vastgelegde criterium.'
        : 'Het debiet blijft onder het criterium; werking is onvoldoende.',
  });
}
function roundtrip(action: WorkspaceAction, evidence: Evidence[] = [proof()]) {
  return importWorkspace(
    exportWorkspace(createWorkspace('Actietest', { actions: [action], evidence })),
  );
}

describe('action implementation, evaluation and reopening', () => {
  it('can explicitly register a new proposal without inventing previous events and then plan it', () => {
    const proposal = { ...initial(), owner: '', lifecycle: initialActionLifecycle('proposed') };
    expect(roundtrip(proposal).actions[0].lifecycle?.history).toEqual([]);
    const planned = change(proposal, 'planned', 8, {
      patch: { owner: 'Bert' },
      reason: 'Voorstel besproken en eigenaar aangewezen.',
    });
    expect(planned.lifecycle?.history[0].before.lifecycle?.stage).toBe('proposed');
    expect(roundtrip(planned).actions[0]).toEqual(planned);
    const forged = {
      ...proposal,
      status: 'in_progress' as const,
      lifecycle: { ...proposal.lifecycle, stage: 'implemented' as const, implementedAt: at(9) },
    };
    expect(() => roundtrip(forged)).toThrow();
  });
  it('keeps implementation separate from effect assessment and preserves complete human revisions in export', () => {
    const pending = ready();
    expect(pending.status).toBe('in_progress');
    expect(pending.lifecycle?.stage).toBe('verification_due');
    expect(pending.lifecycle?.effectiveness).toBe('pending');
    expect(pending.verifiedAt).toBeUndefined();
    const effective = assessed();
    const closed = change(effective, 'closed', 13);
    const imported = roundtrip(closed).actions[0];
    expect(imported.lifecycle?.history).toHaveLength(5);
    expect(imported.lifecycle?.history[0].before).toEqual(initial());
    expect(imported.lifecycle?.history[3].after.lifecycle?.evidenceSnapshots[0]).toEqual(proof());
    expect(imported.lifecycle?.history[3]).toMatchObject({
      actor: 'Ada',
      at: at(12),
      reason: 'Uitvoering en afspraken gecontroleerd.',
    });
    expect(imported.lifecycle?.effectiveness).toBe('effective');
    expect(imported.lifecycle?.verifier).toBe('Bert');
    expect(imported.verifiedAt).toBe(at(12)); // Closing does not invent a new test date.
  });
  it('keeps a failed check ineffective and resets current cycle on reopening without losing the failed result', () => {
    const failed = assessed('ineffective');
    expect(failed.status).toBe('in_progress');
    expect(() => change(failed, 'closed', 13)).toThrow(/overgang/);
    const reopened = change(failed, 'reopened', 13, {
      reason: 'Debiet onvoldoende; ontwerp en montage opnieuw onderzoeken.',
    });
    expect(reopened).toMatchObject({
      status: 'open',
      lifecycle: { stage: 'reopened', effectiveness: 'pending', evidenceSnapshots: [] },
    });
    expect(reopened.lifecycle?.implementedAt).toBeUndefined();
    expect(reopened.lifecycle?.verificationDueAt).toBeUndefined();
    expect(reopened.lifecycle?.verifier).toBeUndefined();
    expect(reopened.effectCheck).toBeUndefined();
    expect(reopened.verifiedAt).toBeUndefined();
    expect(reopened.lifecycle?.history.at(-1)?.before.effectCheck).toContain('onvoldoende');
    expect(roundtrip(reopened).actions[0]).toEqual(reopened);
  });
  it('requires a real actor and reason, and refuses illegal status shortcuts and stale revisions', () => {
    expect(() => change(initial(), 'effective', 12)).toThrow(/overgang/);
    expect(() => change(initial(), 'in_progress', 8, { actor: ' ' })).toThrow(/Actor/);
    expect(() => change(initial(), 'in_progress', 8, { reason: '' })).toThrow(/Redenering/);
    expect(() => change(ready(), 'effective', 12, { expectedRevision: 0 })).toThrow(/intussen/);
    expect(() =>
      change(ready(), 'effective', 9, { verifier: 'Bert', evaluation: 'Testresultaat' }),
    ).toThrow(/tijdstip/);
  });
  it('requires a dated implementation and control plan, with chronological timestamps', () => {
    expect(() => change(change(initial(), 'in_progress', 8), 'verification_due', 9)).toThrow(
      /overgang/,
    );
    const implemented = change(change(initial(), 'in_progress', 8), 'implemented', 9);
    expect(() => change(implemented, 'verification_due', 10)).toThrow(/controledatum/);
    expect(() => change(implemented, 'verification_due', 10, { verificationDueAt: at(8) })).toThrow(
      /vóór/,
    );
    expect(() =>
      reviseAction(
        initial(),
        { expectedRevision: 0, actor: 'Ada', reason: 'Start', targetStage: 'in_progress' },
        [],
        '2026-02-30T08:00:00Z',
      ),
    ).toThrow(/kalenderdatum/);
  });
  it('requires an explicit result, verifier and currently verified same-dossier evidence for both outcomes', () => {
    const args = {
      expectedRevision: 3,
      actor: 'Ada',
      reason: 'Controle',
      targetStage: 'effective' as const,
      verifier: 'Bert',
      evaluation: 'Resultaat voldoet.',
    };
    expect(() => reviseAction(ready(), { ...args, verifier: '' }, [proof()], at(12))).toThrow(
      /Verificateur/,
    );
    expect(() => reviseAction(ready(), { ...args, evaluation: '' }, [proof()], at(12))).toThrow(
      /Resultaat/,
    );
    expect(() => reviseAction(ready(), args, [], at(12))).toThrow(/bestaat niet/);
    expect(() =>
      reviseAction(ready(), args, [{ ...proof(), status: 'unverified' }], at(12)),
    ).toThrow(/onbevestigd/);
    const foreign = { ...proof(), dossierId: 'another-dossier' };
    foreign.verifiedContentSha256 = evidenceHash(foreign);
    expect(() => reviseAction(ready(), args, [foreign], at(12))).toThrow(/dossiervreemd/);
    expect(() => reviseAction(ready(), args, [{ ...proof(), verifiedAt: at(13) }], at(12))).toThrow(
      /ná/,
    );
  });
  it('records content changes as actual revisions and protects evaluated content until reopening', () => {
    const running = change(initial(), 'in_progress', 8);
    const revised = change(running, undefined, 9, {
      patch: { notes: 'Toets ook de afvangsnelheid.', dueDate: '2026-10-09' },
      reason: 'Controleplan uitgebreid na werkplekbezoek.',
    });
    expect(revised.lifecycle?.history.at(-1)).toMatchObject({
      kind: 'edit',
      before: { notes: initial().notes, dueDate: '2026-10-08' },
      after: { notes: 'Toets ook de afvangsnelheid.', dueDate: '2026-10-09' },
    });
    expect(roundtrip(revised).actions[0]).toEqual(revised);
    expect(() =>
      change(assessed(), undefined, 13, { patch: { notes: 'Nieuw criterium' } }),
    ).toThrow(/Heropen/);
    expect(() =>
      change(assessed(), 'closed', 13, { patch: { title: 'Andere maatregel' } }),
    ).toThrow(/Heropen/);
    expect(() => change(running, undefined, 9)).toThrow(/geen wijzigingen/);
    const adopted = change(initial(), undefined, 9, { patch: { owner: 'Bert' } });
    expect(adopted.lifecycle?.history[0]).toMatchObject({
      kind: 'edit',
      before: { owner: 'Ada' },
      after: { owner: 'Bert', lifecycle: { stage: 'planned', effectiveness: 'pending' } },
    });
    expect(roundtrip(adopted).actions[0]).toEqual(adopted);
  });
  it('retains old v1 labels without fabricating effectiveness or a historical chain', () => {
    const done: WorkspaceAction = {
      ...initial(),
      status: 'done',
      effectCheck: 'Oude vrije controletekst',
      verifiedAt: at(12),
    };
    expect(actionStage(done)).toBe('legacy_done');
    expect(roundtrip(done).actions[0].lifecycle).toBeUndefined();
    expect(() => change(done, 'effective', 13)).toThrow(/overgang/);
    expect(() => change(done, undefined, 13, { patch: { notes: 'Nieuw controleplan' } })).toThrow(
      /Heropen/,
    );
    const reopened = change(done, 'reopened', 13, {
      reason: 'De oude controle moet opnieuw aantoonbaar worden beoordeeld.',
    });
    expect(reopened.lifecycle?.history[0].before).toEqual(done);
    expect(reopened.effectCheck).toBeUndefined();
    expect(roundtrip(reopened).actions[0]).toEqual(reopened);
  });
  it('allows documented cancellation without presenting an effectiveness result', () => {
    const cancelled = change({ ...initial(), owner: '' }, 'cancelled', 8, {
      reason: 'Maatregel vervalt omdat de machine definitief wordt verwijderd.',
    });
    expect(cancelled.status).toBe('done');
    expect(cancelled.lifecycle?.stage).toBe('cancelled');
    expect(cancelled.lifecycle?.effectiveness).toBe('pending');
    expect(cancelled.verifiedAt).toBeUndefined();
    expect(roundtrip(cancelled).actions[0]).toEqual(cancelled);
  });
  it('blocks stale or revoked current proof but preserves its historical snapshot after reopening', () => {
    const effective = assessed();
    const changed = {
      ...proof(),
      description: 'Deze meetbron is inhoudelijk aangepast.',
      status: 'unverified' as const,
    };
    expect(() => roundtrip(effective, [changed])).toThrow(/gewijzigd of ingetrokken/);
    const reopened = reviseAction(
      effective,
      {
        expectedRevision: 4,
        actor: 'Ada',
        reason: 'Bewijsbron gewijzigd; opnieuw meten.',
        targetStage: 'reopened',
      },
      [changed],
      at(13),
    );
    expect(
      roundtrip(reopened, [changed]).actions[0].lifecycle?.history[3].after.lifecycle
        ?.evidenceSnapshots[0].description,
    ).toBe(proof().description);
  });
});

describe('action history import boundary', () => {
  it('rejects altered current content, missing revisions and changed past snapshots', () => {
    const action = assessed();
    expect(() => roundtrip({ ...action, notes: 'Stil gewijzigd' })).toThrow(
      /laatste bewaarde revisie/,
    );
    const missing = structuredClone(action);
    missing.lifecycle!.history.splice(1, 1);
    expect(() => roundtrip(missing)).toThrow(/historie/);
    const tampered = structuredClone(action);
    tampered.lifecycle!.history[0].before.notes = 'Vervangen oude inhoud';
    expect(() => roundtrip(tampered)).toThrow(/revisierecord/);
  });
  it('checks semantic transitions even when a record hash was recalculated', () => {
    const action = change(initial(), 'in_progress', 8);
    const forged = structuredClone(action);
    const event = forged.lifecycle!.history[0];
    event.after.lifecycle!.stage = 'reopened';
    event.after.status = 'open';
    event.sha256 = actionEventHash(event);
    forged.status = 'open';
    forged.lifecycle!.stage = 'reopened';
    expect(() => assertActionHistory(forged)).toThrow(/ongeldige statusovergang/);
  });
  it('rejects unknown fields and recursive histories in historical snapshots', () => {
    const action = change(initial(), 'in_progress', 8);
    const unknown = structuredClone(action) as WorkspaceAction & { extra?: string };
    (unknown.lifecycle!.history[0].after as unknown as Record<string, unknown>).unknownField =
      'unsupported';
    expect(() => roundtrip(unknown)).toThrow(/onbekend veld/);
    const recursive = structuredClone(action);
    (
      recursive.lifecycle!.history[0].after.lifecycle as unknown as Record<string, unknown>
    ).history = [];
    expect(() => roundtrip(recursive)).toThrow(/onbekend veld/);
  });
});
