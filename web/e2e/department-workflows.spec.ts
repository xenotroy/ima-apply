import { expect, test, type Page } from '@playwright/test';

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}

test('a department with a known organisation and unknown location stays usable in dossiers, observations and hours', async ({
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
  await dialog.getByLabel('Naam', { exact: true }).fill('E2E organisatie zonder bekende locatie');
  await dialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await state(page)).organisations[0]?.name)
    .toBe('E2E organisatie zonder bekende locatie');
  const organisation = (await state(page)).organisations[0];

  await page.getByRole('button', { name: 'Afdeling', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Afdeling toevoegen', exact: true });
  await dialog.getByLabel('Naam', { exact: true }).fill('E2E afdeling');
  await dialog
    .getByRole('combobox', { name: 'Locatie of organisatie', exact: true })
    .selectOption({ label: 'E2E organisatie zonder bekende locatie · locatie niet vastgelegd' });
  await dialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await state(page)).departments[0]?.organisationId)
    .toBe(organisation.id);
  const department = (await state(page)).departments[0];
  expect(department.organisationId).toBe(organisation.id);
  expect(department.siteId).toBeUndefined();
  expect((await state(page)).sites).toEqual([]);
  const departmentContext =
    'E2E afdeling · E2E organisatie zonder bekende locatie · Locatie niet vastgelegd';

  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken', exact: true });
  await dialog.getByLabel('Dossiertitel', { exact: true }).fill('E2E direct afdelingsdossier');
  await dialog
    .getByLabel('Afgebakende scope', { exact: true })
    .fill('De bekende afdeling; locatie nog niet vastgesteld.');
  await dialog.getByLabel('Beoordelaar', { exact: true }).fill('E2E beoordelaar');
  await dialog
    .getByRole('combobox', { name: 'Organisatie', exact: true })
    .selectOption(organisation.id);
  await dialog.getByRole('checkbox', { name: departmentContext, exact: true }).check();
  await dialog.locator('.link-choices').last().getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await state(page)).dossiers[0]?.departmentIds)
    .toEqual([department.id]);
  expect((await state(page)).dossiers[0].departmentIds).toEqual([department.id]);

  await page.getByRole('button', { name: 'Waarneming', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Waarneming vastleggen', exact: true });
  await dialog.getByLabel('Waarnemingstitel', { exact: true }).fill('E2E afdelingfeit');
  await dialog.getByLabel('Waarnemer', { exact: true }).fill('E2E waarnemer');
  await dialog.getByRole('combobox', { name: 'Afdeling', exact: true }).selectOption(department.id);
  await dialog
    .getByLabel('Waargenomen feiten', { exact: true })
    .fill('Een expliciet geregistreerd feit binnen de afdelingsscope.');
  await dialog.getByRole('button', { name: 'Waarneming opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await state(page)).observations[0]?.departmentId)
    .toBe(department.id);
  expect((await state(page)).observations[0].departmentId).toBe(department.id);

  await page.getByRole('button', { name: 'Onderzoek & cijfers', exact: true }).click();
  await page.getByRole('button', { name: 'Gewerkte uren', exact: true }).click();
  await page.getByRole('button', { name: 'Maanduren vastleggen', exact: true }).click();
  await page.getByLabel('Hele kalendermaand', { exact: true }).fill('2026-09');
  await page
    .getByRole('combobox', { name: 'Scope', exact: true })
    .selectOption({ label: departmentContext });
  await page.getByLabel('Werkelijk gewerkte uren', { exact: true }).fill('200');
  await page
    .getByRole('textbox', { name: /^Bron en afbakening/ })
    .fill('E2E complete maanduren van deze afdeling.');
  await page.getByRole('button', { name: 'Uren opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).exposure[0]?.departmentId).toBe(department.id);
  await page.reload();
  const reloaded = await state(page);
  expect(reloaded.departments[0].organisationId).toBe(organisation.id);
  expect(reloaded.sites).toEqual([]);
  expect(reloaded.observations[0].departmentId).toBe(department.id);
  expect(reloaded.exposure[0].departmentId).toBe(department.id);
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  await expect(page.locator('.dossier-report')).toContainText('locatie niet vastgelegd');
  await expect(page.locator('.dossier-report')).not.toContainText('locatie undefined');
});
