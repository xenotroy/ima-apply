import { expect, test, type Page } from '@playwright/test';
async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
test('department module selection stays scoped, ordered and frozen across later plan edits and reports', async ({
  page,
}) => {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page
    .locator('.dossier-tabs')
    .getByRole('button', { name: 'Organisatie', exact: true })
    .click();
  await page
    .locator('.registry-grid')
    .getByRole('button', { name: 'Organisatie', exact: true })
    .click();
  let dialog = page.getByRole('dialog', { name: 'Organisatie toevoegen', exact: true });
  await dialog.getByLabel('Naam', { exact: true }).fill('Moduleorganisatie');
  await dialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await page.getByRole('button', { name: 'Afdeling', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Afdeling toevoegen', exact: true });
  await dialog.getByLabel('Naam', { exact: true }).fill('Moduleafdeling');
  await dialog
    .getByRole('combobox', { name: 'Locatie of organisatie', exact: true })
    .selectOption({ label: 'Moduleorganisatie · locatie niet vastgelegd' });
  await dialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await page.getByRole('button', { name: 'Modules & scope', exact: true }).click();
  await page.getByRole('button', { name: 'Moduleplan', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Moduleplan vastleggen', exact: true });
  await dialog.getByLabel('Plantitel', { exact: true }).fill('Afdelingskeuze');
  await dialog.getByRole('combobox', { name: 'Planscope', exact: true }).selectOption('department');
  await dialog
    .getByRole('combobox', { name: 'Organisatie', exact: true })
    .selectOption({ label: 'Moduleorganisatie' });
  await dialog
    .getByRole('combobox', { name: 'Afdeling', exact: true })
    .selectOption({ label: 'Moduleafdeling · Moduleorganisatie · Locatie niet vastgelegd' });
  const boxes = dialog.getByRole('checkbox');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  // The actual module labels remain meaningful and are used for notes/order controls.
  const selectedRows = dialog.locator('.registry-item:has(input:checked)');
  const firstTitle = await selectedRows.nth(0).locator('small').innerText();
  await selectedRows
    .nth(0)
    .locator('textarea')
    .fill('Alleen deze afdeling, bevroren scopenotitie.');
  await selectedRows.nth(1).locator('button', { hasText: 'Omhoog' }).click();
  await dialog.getByRole('button', { name: 'Moduleplan opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).modulePlans?.[0]?.title).toBe('Afdelingskeuze');
  const plan = (await state(page)).modulePlans[0];
  expect(plan.scope).toBe('department');
  expect(plan.departmentId).toBe((await state(page)).departments[0].id);
  const originalIds = [
    ...new Set(
      plan.modules
        .filter((module: { enabled: boolean }) => module.enabled)
        .flatMap((module: { questionIds: string[] }) => module.questionIds),
    ),
  ];
  await page
    .getByRole('button', { name: 'Dossier uit moduleplan: Afdelingskeuze', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Dossier uit moduleplan', exact: true });
  await dialog.getByLabel('Dossiertitel', { exact: true }).fill('Bevroren afdelingsdossier');
  await dialog
    .getByLabel('Afgebakende scope', { exact: true })
    .fill('De eigen moduleafdeling binnen de beschreven processen.');
  await dialog.getByLabel('Beoordelaar', { exact: true }).fill('Fictieve beoordelaar');
  await dialog
    .getByRole('button', { name: 'Dossier met bevroren modulekeuze aanmaken', exact: true })
    .click();
  await expect
    .poll(async () => (await state(page)).dossiers?.[0]?.title)
    .toBe('Bevroren afdelingsdossier');
  const before = (await state(page)).dossiers[0];
  expect(before.questions.map((question: { id: string }) => question.id)).toEqual(originalIds);
  expect(before.departmentIds).toEqual([plan.departmentId]);
  expect((await state(page)).answers).toEqual([]);
  await page
    .getByRole('button', { name: 'Moduleplan bewerken: Afdelingskeuze', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Moduleplan vastleggen', exact: true });
  await dialog.locator('input:checked').first().uncheck();
  await dialog.locator('textarea').first().fill('Gewijzigde actuele plannotitie.');
  await dialog.getByRole('button', { name: 'Moduleplan opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).modulePlans[0].revision).toBe(1);
  expect((await state(page)).dossiers[0]).toEqual(before);
  await page.reload();
  expect((await state(page)).dossiers[0]).toEqual(before);
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  await expect(page.locator('.dossier-report')).toContainText(
    'Alleen deze afdeling, bevroren scopenotitie.',
  );
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const markdown = Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain('Bevroren modulekeuze');
  expect(markdown).toContain('Alleen deze afdeling, bevroren scopenotitie.');
  expect(markdown).toContain('Gewijzigde actuele plannotitie.');
  expect(markdown).toContain(before.modulePlanSnapshotSha256);
  expect(firstTitle).toContain('IMA-catalogusthema');
});
