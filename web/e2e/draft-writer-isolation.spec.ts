import { expect, test, type BrowserContext, type Page } from '@playwright/test';

type DraftRecord = { writer: string; value: { title: string; facts: string; id: string } };

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
async function drafts(page: Page): Promise<DraftRecord[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('ima-apply.draft.v1.'))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
      .filter((record) => record.key.includes('/observation/')),
  );
}
async function start(page: Page) {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  await page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!);
    envelope.workspace.name = 'Fictieve onafhankelijke opslagreview';
    envelope.workspace.dossiers = [
      {
        id: 'review-dossier',
        title: 'Fictief reviewdossier',
        departmentIds: [],
        scope: 'Fictieve opslagreview.',
        assessor: 'Testpersoon',
        status: 'draft',
        createdAt: new Date().toISOString(),
        questions: [],
      },
    ];
    localStorage.setItem('ima-apply.workspace.v1', JSON.stringify(envelope));
  });
  await page.reload();
}
async function openObservation(page: Page) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'Waarneming', exact: true }).click();
  return page.getByRole('dialog', { name: 'Waarneming vastleggen', exact: true });
}
async function duplicate(context: BrowserContext, page: Page) {
  // A real same-origin popup clones the opener's sessionStorage, as duplicated tabs do.
  const opened = context.waitForEvent('page');
  await page.evaluate(() => {
    window.open('/', '_blank');
  });
  const duplicated = await opened;
  await duplicated.waitForLoadState();
  return duplicated;
}
async function preparePair(page: Page, context: BrowserContext) {
  await start(page);
  const dialogA = await openObservation(page);
  await dialogA
    .getByRole('textbox', { name: 'Waarnemingstitel', exact: true })
    .fill('Exact oorspronkelijk concept A Ω');
  await dialogA
    .getByRole('textbox', { name: 'Waargenomen feiten', exact: true })
    .fill('Exacte oorspronkelijke feiten A Ω.');
  await dialogA.getByRole('textbox', { name: 'Waarnemer', exact: true }).fill('Waarnemer A');
  const original = (await drafts(page))[0];
  const b = await duplicate(context, page);
  const dialogB = await openObservation(b);
  await expect(dialogB.getByRole('textbox', { name: 'Waarnemingstitel', exact: true })).toHaveValue(
    original.value.title,
  );
  await dialogB
    .getByRole('textbox', { name: 'Waarnemingstitel', exact: true })
    .fill('Verschillend afgeleid concept B Ω');
  await dialogB
    .getByRole('textbox', { name: 'Waargenomen feiten', exact: true })
    .fill('Exacte afwijkende feiten B Ω.');
  await dialogB.getByRole('textbox', { name: 'Waarnemer', exact: true }).fill('Waarnemer B');
  const records = await drafts(page);
  expect(records).toHaveLength(2);
  expect(records.find((record) => record.writer === original.writer)).toEqual(original);
  const derived = records.find((record) => record.writer !== original.writer)!;
  expect(derived.writer).not.toBe(original.writer);
  return { b, dialogB, original, derived };
}

test('a cloned tab writes its own slot and each tab recovers its own prior concept', async ({
  page,
  context,
}) => {
  const { b, original, derived } = await preparePair(page, context);
  await page.reload();
  const aRestored = await openObservation(page);
  await expect(
    aRestored.getByRole('textbox', { name: 'Waarnemingstitel', exact: true }),
  ).toHaveValue(original.value.title);
  await expect(
    aRestored.getByRole('textbox', { name: 'Waargenomen feiten', exact: true }),
  ).toHaveValue(original.value.facts);
  await b.reload();
  const bRestored = await openObservation(b);
  await expect(
    bRestored.getByRole('textbox', { name: 'Waarnemingstitel', exact: true }),
  ).toHaveValue(derived.value.title);
  await expect(
    bRestored.getByRole('textbox', { name: 'Waargenomen feiten', exact: true }),
  ).toHaveValue(derived.value.facts);
  expect(await drafts(page)).toEqual(expect.arrayContaining([original, derived]));
});

test('committing B clears only B while A survives and cannot silently reuse a committed new-record identity', async ({
  page,
  context,
}) => {
  const { b, dialogB, original } = await preparePair(page, context);
  await dialogB.getByRole('button', { name: 'Waarneming opslaan', exact: true }).click();
  await expect
    .poll(async () => (await state(b)).observations[0]?.title)
    .toBe('Verschillend afgeleid concept B Ω');
  await expect.poll(async () => (await drafts(b)).length).toBe(1);
  expect(await drafts(b)).toEqual([original]);
  await page.reload();
  const restored = await openObservation(page);
  await expect(
    restored.getByRole('textbox', { name: 'Waarnemingstitel', exact: true }),
  ).toHaveValue('');
  await expect(
    restored.getByRole('textbox', { name: 'Waargenomen feiten', exact: true }),
  ).toHaveValue('');
  expect((await state(page)).observations[0].title).toBe('Verschillend afgeleid concept B Ω');
  expect(await drafts(page)).toEqual([original]);
  // The preserved source is available for deliberate reuse without colliding with B's ID.
  await restored
    .getByRole('textbox', { name: 'Waarnemingstitel', exact: true })
    .fill(original.value.title);
  await restored
    .getByRole('textbox', { name: 'Waargenomen feiten', exact: true })
    .fill(original.value.facts);
  await restored
    .getByRole('textbox', { name: 'Waarnemer', exact: true })
    .fill('Waarnemer A afzonderlijk');
  await restored.getByRole('button', { name: 'Waarneming opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).observations.length).toBe(2);
  const observations = (await state(page)).observations;
  expect(observations[1].id).not.toBe(observations[0].id);
  expect(observations[1].title).toBe(original.value.title);
  expect(await drafts(page)).toEqual([original]);
});

test('reopening a form in the cloned tab prefers its current writer over the opener recovery hint', async ({
  page,
  context,
}) => {
  const { b, dialogB, original, derived } = await preparePair(page, context);
  await dialogB.getByRole('button', { name: 'Sluiten', exact: true }).click();
  const reopened = await openObservation(b);
  await expect(
    reopened.getByRole('textbox', { name: 'Waarnemingstitel', exact: true }),
  ).toHaveValue(derived.value.title);
  await expect(
    reopened.getByRole('textbox', { name: 'Waargenomen feiten', exact: true }),
  ).toHaveValue(derived.value.facts);
  expect(await drafts(b)).toEqual(expect.arrayContaining([original, derived]));
});

test('a fresh third tab requires a deliberate choice and preserves both source concepts', async ({
  page,
  context,
}) => {
  const { original, derived } = await preparePair(page, context);
  const c = await context.newPage();
  await c.goto('/');
  const dialog = await openObservation(c);
  await expect(dialog.getByRole('textbox', { name: 'Waarnemingstitel', exact: true })).toHaveValue(
    '',
  );
  const chooser = dialog.getByRole('combobox', {
    name: 'Kies een lokaal concept om te herstellen',
    exact: true,
  });
  await expect(chooser).toBeVisible();
  await chooser.selectOption(original.writer);
  await expect(dialog.getByRole('textbox', { name: 'Waarnemingstitel', exact: true })).toHaveValue(
    original.value.title,
  );
  await expect(
    dialog.getByRole('textbox', { name: 'Waargenomen feiten', exact: true }),
  ).toHaveValue(original.value.facts);
  const records = await drafts(c);
  expect(records).toHaveLength(3);
  expect(records).toEqual(expect.arrayContaining([original, derived]));
  expect(
    records.find((record) => record.writer !== original.writer && record.writer !== derived.writer)
      ?.value,
  ).toEqual(original.value);
});

test('a new observation remains creatable after an older writer concept was recovered and committed', async ({
  page,
}) => {
  await start(page);
  let dialog = await openObservation(page);
  await dialog
    .getByRole('textbox', { name: 'Waarnemingstitel', exact: true })
    .fill('Eerste waarneming uit hersteld concept Ω');
  await dialog
    .getByRole('textbox', { name: 'Waargenomen feiten', exact: true })
    .fill('Exacte eerste waargenomen feiten Ω.');
  await dialog.getByRole('textbox', { name: 'Waarnemer', exact: true }).fill('Waarnemer herstel');
  const original = (await drafts(page))[0];
  await page.reload();
  dialog = await openObservation(page);
  await dialog.getByRole('button', { name: 'Waarneming opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).observations.length).toBe(1);
  expect(await drafts(page)).toEqual([original]);
  dialog = await openObservation(page);
  await dialog
    .getByRole('textbox', { name: 'Waarnemingstitel', exact: true })
    .fill('Tweede afzonderlijke waarneming Ω');
  await dialog
    .getByRole('textbox', { name: 'Waargenomen feiten', exact: true })
    .fill('Exacte tweede waargenomen feiten Ω.');
  await dialog.getByRole('textbox', { name: 'Waarnemer', exact: true }).fill('Waarnemer tweede');
  await dialog.getByRole('button', { name: 'Waarneming opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).observations.length).toBe(2);
  const observations = (await state(page)).observations;
  expect(observations[0].title).toBe('Eerste waarneming uit hersteld concept Ω');
  expect(observations[1].title).toBe('Tweede afzonderlijke waarneming Ω');
  expect(observations[0].id).not.toBe(observations[1].id);
  expect(await drafts(page)).toContainEqual(original);
});
