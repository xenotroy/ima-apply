import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
async function markdown(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const download = await event;
  return readFile((await download.path())!, 'utf8');
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
});

test('an interrupted interview save recovers the exact last keystroke and respondent', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Inventarisatie', exact: true }).click();
  const card = page.locator('.question-card').first();
  await expect(card.getByRole('button', { name: 'Deels', exact: true })).toBeDisabled();
  await page
    .getByLabel('Respondent / actor voor deze invoer', { exact: true })
    .fill('Interviewactor hersteltest');
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'ima-apply.workspace.v1')
        throw new DOMException('Simulated unavailable main storage', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  const note =
    'Laatste interviewregel\nEen maatregel is genoemd; toepassing nog verifiëren.\nLaatste teken: Ω';
  await card.getByRole('button', { name: 'Deels', exact: true }).click();
  await card.getByLabel('Toelichting / vervolg', { exact: true }).fill(note);
  await expect(page.getByText(/Niet lokaal opgeslagen:/)).toBeVisible();
  expect((await state(page)).answers).toHaveLength(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((key) =>
          key.startsWith('ima-apply.pending-workspace.v1.'),
        );
        return key ? JSON.parse(localStorage.getItem(key)!).workspace.answers[0]?.note : '';
      }),
    )
    .toBe(note);
  await page.reload();
  await expect.poll(async () => (await state(page)).answers[0]?.note).toBe(note);
  const restored = (await state(page)).answers[0];
  expect(restored.choice).toBe('partial');
  expect(restored.respondedBy).toBe('Interviewactor hersteltest');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith('ima-apply.pending-workspace.v1.'),
          ).length,
      ),
    )
    .toBe(0);
  const report = await markdown(page);
  expect(report).toContain(note);
  expect(report).toContain('Interviewactor hersteltest');
  expect(errors).toEqual([]);
});

test('an unfinished observation survives closing and reload and is included in Markdown', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  const dossier = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken' });
  await dossier.getByLabel('Dossiertitel', { exact: true }).fill('Interviewherstel dossier');
  await dossier
    .getByLabel('Afgebakende scope', { exact: true })
    .fill('Waarneming tijdens interview, nog te beoordelen');
  await dossier.getByLabel('Beoordelaar', { exact: true }).fill('Hersteltest beoordelaar');
  await dossier.locator('.link-choices').last().getByRole('checkbox').first().check();
  await dossier.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect(dossier).toHaveCount(0);
  await page.getByRole('button', { name: 'Waarneming', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Waarneming vastleggen' });
  await dialog
    .getByLabel('Waarnemingstitel', { exact: true })
    .fill('Nog niet vastgelegde interviewwaarneming');
  await dialog.getByLabel('Waarnemer', { exact: true }).fill('Interviewactor');
  const facts =
    'Medewerker noemt een knelpunt.\nDit is een interviewclaim, geen geverifieerde bevinding.';
  await dialog.getByRole('textbox', { name: 'Waargenomen feiten', exact: true }).fill(facts);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  expect((await state(page)).observations).toHaveLength(0);
  const draftReport = await markdown(page);
  expect(draftReport).toContain('Nog niet vastgelegde interviewwaarneming');
  expect(draftReport).toContain('nog geen vastgesteld dossierrecord');
  expect(draftReport).toContain('geen geverifieerde bevinding');
  await page.reload();
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'Waarneming', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Waarneming vastleggen' });
  await expect(
    dialog.getByRole('textbox', { name: 'Waargenomen feiten', exact: true }),
  ).toHaveValue(facts);
  await expect(dialog.getByLabel('Waarnemingstitel', { exact: true })).toHaveValue(
    'Nog niet vastgelegde interviewwaarneming',
  );
  await dialog.getByRole('button', { name: 'Waarneming opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).observations.length).toBe(1);
  expect((await state(page)).observations[0].facts).toBe(facts);
  const retained = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('ima-apply.draft.v1.'))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  );
  expect(retained).toHaveLength(1);
  expect(retained[0].value.facts).toBe(facts);
  // A reload creates a new writer. Saving its recovered copy never deletes the prior writer's slot.
});
