import { test, expect, type Page } from '@playwright/test';
async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
test('effectiveness inputs and conditional denominators survive before applying or recording', async ({
  page,
}) => {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  const original = JSON.stringify((await state(page)).scenarios);
  await page.getByRole('button', { name: 'Risicowerkbank', exact: true }).click();
  await page.getByRole('button', { name: 'Maatregel toevoegen', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Werking van de beheersmaatregel', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Maatregel', exact: true })
    .fill('Nog te beoordelen ontwerp');
  await dialog.getByText('Inschalingshulp: van ontwerp naar praktijk', { exact: true }).click();
  const basis =
    'Bereik is het deel van alle taaksituaties.\nBeschikbaarheid geldt alleen binnen dit bereik; correcte inzet alleen bij beschikbaarheid.\nGeen dubbel geteld verlies Ω';
  await dialog
    .getByRole('textbox', { name: 'Conditionele definities en controle op overlap', exact: true })
    .fill(basis);
  await dialog.getByRole('spinbutton', { name: 'Maximale werking (%)', exact: true }).fill('73');
  await dialog.getByRole('spinbutton', { name: 'Bereik van scenario (%)', exact: true }).fill('81');
  await dialog
    .getByRole('spinbutton', { name: 'Beschikbaar indien nodig (%)', exact: true })
    .fill('62');
  await dialog
    .getByRole('spinbutton', { name: 'Correct gebruik indien beschikbaar (%)', exact: true })
    .fill('57');
  await dialog
    .getByRole('checkbox', { name: 'Noemers en dubbeltelling gecontroleerd', exact: true })
    .check();
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  expect(JSON.stringify((await state(page)).scenarios)).toBe(original);
  await page.reload();
  await page.getByRole('button', { name: 'Risicowerkbank', exact: true }).click();
  await page.getByRole('button', { name: 'Maatregel toevoegen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Werking van de beheersmaatregel', exact: true });
  await dialog.getByText('Inschalingshulp: van ontwerp naar praktijk', { exact: true }).click();
  await expect(
    dialog.getByRole('textbox', {
      name: 'Conditionele definities en controle op overlap',
      exact: true,
    }),
  ).toHaveValue(basis);
  for (const [label, value] of [
    ['Maximale werking (%)', '73'],
    ['Bereik van scenario (%)', '81'],
    ['Beschikbaar indien nodig (%)', '62'],
    ['Correct gebruik indien beschikbaar (%)', '57'],
  ]) {
    await expect(dialog.getByRole('spinbutton', { name: label, exact: true })).toHaveValue(value);
  }
  await expect(
    dialog.getByRole('checkbox', { name: 'Noemers en dubbeltelling gecontroleerd', exact: true }),
  ).toBeChecked();
  expect(JSON.stringify((await state(page)).scenarios)).toBe(original);
  await dialog.getByRole('button', { name: 'Toepassen op W', exact: true }).click();
  await expect(
    dialog.getByRole('textbox', { name: 'Waarom werkt dit in dit scenario?', exact: true }),
  ).toHaveValue(/Noemers\/overlap:/);
});
