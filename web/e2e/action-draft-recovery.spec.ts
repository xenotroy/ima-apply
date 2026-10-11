import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { WorkspaceAction, WorkspaceState } from '../src/data/model';
import type { Evidence } from '../src/data/dossier';
import { evidenceHash } from '../src/data/frozen';
import { initialActionLifecycle, reviseAction } from '../src/domain/action-lifecycle';

const workspaceKey = 'ima-apply.workspace.v1';
const actionId = 'fictitious-action-draft';
const proofId = 'fictitious-action-proof';
const proofTitle = 'Fictief bewijs voor actierevisie Ω';
type RevisionDraft = {
  actionId: string;
  sourceRevision: number;
  fields: { title: string; owner: string; dueDate: string; notes: string; evidenceIds?: string[] };
  actor: string;
  reason: string;
  target: string;
  verificationDue: string;
  verifier: string;
  evaluation: string;
};
type StoredDraft = {
  storageKey: string;
  raw: string;
  draft: { key: string; base: string; writer: string; value: RevisionDraft };
};
async function state(page: Page): Promise<WorkspaceState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workspace, workspaceKey);
}
async function action(page: Page): Promise<WorkspaceAction> {
  return (await state(page)).actions.find((item) => item.id === actionId)!;
}
async function drafts(page: Page): Promise<StoredDraft[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('ima-apply.draft.v1.'))
      .map((storageKey) => {
        const raw = localStorage.getItem(storageKey)!;
        return { storageKey, raw, draft: JSON.parse(raw) };
      })
      .filter((record) => record.draft.value.actionId === 'fictitious-action-draft'),
  );
}
async function retained(page: Page, record: StoredDraft) {
  expect(await page.evaluate((key) => localStorage.getItem(key), record.storageKey)).toBe(
    record.raw,
  );
}
async function markdown(page: Page) {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  return readFile((await (await download).path())!, 'utf8');
}
async function editor(page: Page) {
  await page.getByRole('button', { name: /Plan van aanpak/ }).click();
  const card = page.locator('.action-card').first();
  const details = card.locator('.action-revision-editor');
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await details.locator('summary').click();
  return card;
}
async function boot(page: Page, stage: 'implemented' | 'verification_due' = 'implemented') {
  await page.goto('/');
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
  const workspace = await state(page);
  const start = Date.now() - 5 * 86400000;
  const proof: Evidence = {
    id: proofId,
    title: proofTitle,
    kind: 'measurement',
    reference: 'Fictieve browserproef',
    description: 'Uitsluitend fictief testbewijs Ω',
    recordedAt: new Date(start).toISOString(),
    status: 'verified',
    verifiedBy: 'Fictieve bewijsbeoordelaar',
    verifiedAt: new Date(start + 60000).toISOString(),
    verificationNote: 'Fictieve controle Ψ',
  };
  proof.verifiedContentSha256 = evidenceHash(proof);
  let fixture: WorkspaceAction = {
    id: actionId,
    title: 'Fictieve herstelbare actie',
    owner: 'Fictieve eigenaar',
    dueDate: '2026-12-01',
    notes: 'Fictief controleplan',
    status: 'open',
    scenarioId: workspace.scenarios[0].id,
    evidenceIds: [],
    lifecycle: initialActionLifecycle(),
  };
  for (const [index, targetStage] of [
    'in_progress',
    'implemented',
    ...(stage === 'verification_due' ? ['verification_due'] : []),
  ].entries())
    fixture = reviseAction(
      fixture,
      {
        expectedRevision: fixture.lifecycle!.revision,
        actor: 'Fictieve bronactor',
        reason: `Fictieve bronovergang ${targetStage}`,
        targetStage: targetStage as 'in_progress' | 'implemented' | 'verification_due',
        verificationDueAt: new Date(start + 86400000).toISOString(),
      },
      [proof],
      new Date(start + (index + 2) * 60000).toISOString(),
    );
  await page.evaluate(
    ({ key, fixture, proof }) => {
      const envelope = JSON.parse(localStorage.getItem(key)!);
      envelope.workspace.actions = [fixture];
      envelope.workspace.evidence = [proof];
      envelope.version = crypto.randomUUID();
      localStorage.setItem(key, JSON.stringify(envelope));
    },
    { key: workspaceKey, fixture, proof },
  );
  await page.reload();
  return { fixture, proof, workspace: await state(page) };
}
const textFields = {
  Actieomschrijving: 'Fictieve gewijzigde actie Ω',
  Eigenaar: 'Fictieve eigenaar José Ψ',
  'Verificatieplan / voortgang': 'Fictief controleplan Ω\nTweede regel met exact laatste teken Ψ',
  'Actor van deze wijziging': 'Fictieve revisieactor Ω',
  'Redenering bij deze revisie': 'Fictieve eigen afweging Ω\nTweede regel Ψ',
};
async function fill(card: Locator, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values))
    await card.getByRole('textbox', { name, exact: true }).fill(value);
}
async function check(card: Locator, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values))
    await expect(card.getByRole('textbox', { name, exact: true })).toHaveValue(value);
}
async function effectDraft(page: Page) {
  const card = await editor(page);
  await fill(card, {
    ...textFields,
    Verificateur: 'Fictieve effectverificateur Ω',
    'Resultaat van de effectcontrole':
      'Fictief onvoldoende resultaat Ω\nMeetcriterium en waarneming Ψ',
  });
  return card;
}

test('all control-planning revision fields survive navigation, reload and Markdown export', async ({
  page,
}) => {
  const { fixture } = await boot(page);
  let card = await editor(page);
  await fill(card, textFields);
  await card.getByLabel('Streefdatum', { exact: true }).fill('2026-12-19');
  await card.getByRole('checkbox', { name: new RegExp(proofTitle) }).check();
  await card
    .getByRole('combobox', { name: 'Volgende actiestap', exact: true })
    .selectOption('verification_due');
  const date = '2026-12-20T14:37';
  await card.getByLabel('Geplande effectcontrole', { exact: true }).fill(date);
  const before = (await drafts(page))[0];
  expect(before.draft.value.verificationDue).toBe(date);
  expect(before.draft.value.fields.evidenceIds).toEqual([proofId]);
  await page.getByRole('button', { name: 'Overzicht', exact: true }).click();
  card = await editor(page);
  await check(card, textFields);
  await expect(card.getByLabel('Geplande effectcontrole', { exact: true })).toHaveValue(date);
  await page.reload();
  card = await editor(page);
  await check(card, textFields);
  await expect(card.getByLabel('Streefdatum', { exact: true })).toHaveValue('2026-12-19');
  await expect(card.getByRole('checkbox', { name: new RegExp(proofTitle) })).toBeChecked();
  await expect(card.getByRole('combobox', { name: 'Volgende actiestap', exact: true })).toHaveValue(
    'verification_due',
  );
  await expect(card.getByLabel('Geplande effectcontrole', { exact: true })).toHaveValue(date);
  expect(await action(page)).toEqual(fixture);
  const report = await markdown(page);
  for (const value of Object.values(textFields))
    expect(report).toContain(value.replaceAll('\n', '\\n'));
  expect(report).toContain(date);
  expect(report).toContain(proofId);
  await retained(page, before);
});

test('rejected effect assessment retains 100001 Unicode characters, actor and proof choice through reload', async ({
  page,
}) => {
  const { fixture } = await boot(page, 'verification_due');
  let card = await editor(page);
  await card
    .getByRole('combobox', { name: 'Volgende actiestap', exact: true })
    .selectOption('ineffective');
  await effectDraft(page);
  await card.getByRole('button', { name: 'Revisie vastleggen', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('geverifieerd bewijs');
  await card.getByRole('checkbox', { name: new RegExp(proofTitle) }).check();
  const longReason = 'Ω'.repeat(100001);
  await card
    .getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true })
    .fill(longReason);
  await card.getByRole('button', { name: 'Revisie vastleggen', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('een tekstveld is te groot');
  expect(await action(page)).toEqual(fixture);
  await expect(
    card.getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true }),
  ).toHaveValue(longReason);
  expect(await markdown(page)).toContain(longReason);
  await page.reload();
  card = await editor(page);
  await check(card, {
    ...textFields,
    'Redenering bij deze revisie': longReason,
    Verificateur: 'Fictieve effectverificateur Ω',
    'Resultaat van de effectcontrole':
      'Fictief onvoldoende resultaat Ω\nMeetcriterium en waarneming Ψ',
  });
  await expect(card.getByRole('checkbox', { name: new RegExp(proofTitle) })).toBeChecked();
  await expect(card.getByRole('combobox', { name: 'Volgende actiestap', exact: true })).toHaveValue(
    'ineffective',
  );
  expect(await action(page)).toEqual(fixture);
  await card
    .getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true })
    .fill(textFields['Redenering bij deze revisie']);
  await card.getByRole('button', { name: 'Revisie vastleggen', exact: true }).click();
  await expect.poll(async () => (await action(page)).lifecycle?.revision).toBe(4);
  const saved = await action(page);
  expect(saved.lifecycle?.stage).toBe('ineffective');
  expect(saved.lifecycle?.history.slice(0, 3)).toEqual(fixture.lifecycle?.history);
  expect(saved.lifecycle?.history.at(-1)?.actor).toBe(textFields['Actor van deze wijziging']);
  card = await editor(page);
  await expect(
    card.getByRole('textbox', { name: 'Actor van deze wijziging', exact: true }),
  ).toHaveValue('');
  await expect(
    card.getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true }),
  ).toHaveValue('');
  await expect(card.getByRole('combobox', { name: 'Volgende actiestap', exact: true })).toHaveValue(
    '',
  );
});

test('changed selected proof blocks the recovered assessment until explicit reconfirmation and preserves physical risk controls', async ({
  page,
}) => {
  const { fixture, proof, workspace } = await boot(page, 'verification_due');
  let card = await editor(page);
  await card
    .getByRole('combobox', { name: 'Volgende actiestap', exact: true })
    .selectOption('effective');
  await effectDraft(page);
  await card.getByRole('checkbox', { name: new RegExp(proofTitle) }).check();
  const previous = (await drafts(page))[0];
  const changedProof = {
    ...proof,
    description: 'Fictief opnieuw onderzocht bewijs Ψ',
    verificationNote: 'Fictieve herziene bewijsafweging Ω',
  };
  changedProof.verifiedContentSha256 = evidenceHash(changedProof);
  await page.evaluate(
    ({ key, changedProof }) => {
      const envelope = JSON.parse(localStorage.getItem(key)!);
      envelope.workspace.evidence = [changedProof];
      envelope.version = crypto.randomUUID();
      localStorage.setItem(key, JSON.stringify(envelope));
    },
    { key: workspaceKey, changedProof },
  );
  await page.reload();
  card = await editor(page);
  await check(card, textFields);
  await expect(card.getByRole('alert')).toContainText('bewijs is gewijzigd');
  await expect(
    card.getByRole('button', { name: 'Revisie vastleggen', exact: true }),
  ).toBeDisabled();
  expect(await action(page)).toEqual(fixture);
  await retained(page, previous);
  await card
    .getByRole('button', { name: 'Concept bij actueel bewijs herbevestigen', exact: true })
    .click();
  await expect(card.getByRole('button', { name: 'Revisie vastleggen', exact: true })).toBeEnabled();
  expect(await action(page)).toEqual(fixture);
  expect((await state(page)).scenarios).toEqual(workspace.scenarios);
  await card.getByRole('button', { name: 'Revisie vastleggen', exact: true }).click();
  await expect.poll(async () => (await action(page)).lifecycle?.revision).toBe(4);
  expect((await action(page)).lifecycle?.evidenceSnapshots).toEqual([changedProof]);
  expect((await state(page)).scenarios).toEqual(workspace.scenarios);
  await retained(page, previous);
});

test('only the exact committed writer draft clears after the real Web Lock releases; the next revision starts fresh', async ({
  page,
}) => {
  const { fixture, workspace } = await boot(page, 'verification_due');
  let card = await editor(page);
  await card
    .getByRole('combobox', { name: 'Volgende actiestap', exact: true })
    .selectOption('ineffective');
  await effectDraft(page);
  await card.getByRole('checkbox', { name: new RegExp(proofTitle) }).check();
  const priorWriter = (await drafts(page))[0];
  await page.reload();
  card = await editor(page);
  await card
    .getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true })
    .fill('Fictieve definitieve afweging Ω');
  const ownWriter = (await drafts(page)).find(
    (record) => record.draft.writer !== priorWriter.draft.writer,
  )!;
  expect(ownWriter).toBeDefined();
  await page.evaluate((key) => {
    const holder = window as typeof window & {
      actionLockReady?: boolean;
      releaseActionLock?: () => void;
    };
    void navigator.locks.request(key, async () => {
      holder.actionLockReady = true;
      await new Promise<void>((resolve) => {
        holder.releaseActionLock = resolve;
      });
    });
  }, workspaceKey);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { actionLockReady?: boolean }).actionLockReady,
      ),
    )
    .toBe(true);
  try {
    await card.getByRole('button', { name: 'Revisie vastleggen', exact: true }).click();
    // Parent already shows the accepted revision, but durable storage is still the old version.
    card = await editor(page);
    await expect(card).toContainText('Onvoldoende effectief');
    expect(await action(page)).toEqual(fixture);
    await retained(page, ownWriter);
    await retained(page, priorWriter);
    await expect(
      card.getByRole('textbox', { name: 'Actor van deze wijziging', exact: true }),
    ).toHaveValue('');
    await expect(
      card.getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true }),
    ).toHaveValue('');
    await card
      .getByRole('textbox', { name: 'Actor van deze wijziging', exact: true })
      .fill('Nieuwe fictieve actor Ψ');
    await card
      .getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true })
      .fill('Fictief nieuw vervolgconcept Ψ');
    const nextConcept = (await drafts(page)).find(
      (record) => record.draft.value.sourceRevision === 4,
    )!;
    expect(nextConcept).toBeDefined();
    await page.evaluate(() =>
      (window as typeof window & { releaseActionLock?: () => void }).releaseActionLock?.(),
    );
    await expect.poll(async () => (await action(page)).lifecycle?.revision).toBe(4);
    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), ownWriter.storageKey))
      .toBeNull();
    await retained(page, priorWriter);
    await retained(page, nextConcept);
    expect((await action(page)).lifecycle?.history.slice(0, 3)).toEqual(fixture.lifecycle?.history);
    expect((await state(page)).scenarios).toEqual(workspace.scenarios);
    const report = await markdown(page);
    expect(report).toContain('Fictieve definitieve afweging Ω');
    expect(report).toContain('Fictief nieuw vervolgconcept Ψ');
    await page.reload();
    card = await editor(page);
    await expect(
      card.getByRole('textbox', { name: 'Actor van deze wijziging', exact: true }),
    ).toHaveValue('Nieuwe fictieve actor Ψ');
    await expect(
      card.getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true }),
    ).toHaveValue('Fictief nieuw vervolgconcept Ψ');
  } finally {
    await page.evaluate(() =>
      (window as typeof window & { releaseActionLock?: () => void }).releaseActionLock?.(),
    );
  }
});

test('opening another workspace with an identical action never reuses the former workspace revision draft', async ({
  page,
}) => {
  const { workspace, fixture } = await boot(page);
  let card = await editor(page);
  await fill(card, textFields);
  const prior = (await drafts(page))[0];
  const imported = {
    ...workspace,
    id: 'fictitious-separate-workspace',
    name: 'Fictieve afzonderlijke werkruimte',
  };
  // The global file picker may finish reading while the action view is open.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'fictitious-workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page
    .getByRole('dialog', { name: 'Werkruimte importeren', exact: true })
    .getByRole('button', { name: 'Import openen', exact: true })
    .click();
  await expect.poll(async () => (await state(page)).id).toBe(imported.id);
  card = await editor(page);
  await expect(card.getByRole('textbox', { name: 'Actieomschrijving', exact: true })).toHaveValue(
    fixture.title,
  );
  await expect(
    card.getByRole('textbox', { name: 'Actor van deze wijziging', exact: true }),
  ).toHaveValue('');
  await expect(
    card.getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true }),
  ).toHaveValue('');
  await retained(page, prior);
  await card
    .getByRole('textbox', { name: 'Actor van deze wijziging', exact: true })
    .fill('Fictieve afzonderlijke actor Ψ');
  const other = (await drafts(page)).find((record) =>
    record.draft.key.startsWith(`${imported.id}/`),
  )!;
  expect(other.draft.value.fields.title).toBe(fixture.title);
  expect(other.draft.value.reason).toBe('');
  expect(other.draft.writer).toBe(prior.draft.writer);
  await retained(page, prior);
});
