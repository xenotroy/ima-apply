import { expect, test, type Page } from '@playwright/test';

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}

test('project context and a complete walkthrough stay editable, linked and reportable after reload', async ({
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
  await dialog.getByLabel('Naam', { exact: true }).fill('Contextorganisatie');
  await dialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).organisations[0]?.name)
    .toBe('Contextorganisatie');
  await page.getByRole('button', { name: 'Projectcontext & rondgangen', exact: true }).click();
  await page.getByRole('button', { name: 'Projectcontext', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Projectcontext vastleggen', exact: true });
  await dialog.getByLabel('Projectnaam', { exact: true }).fill('Volledige projectcontext');
  await dialog
    .getByLabel('Organisatiebeschrijving', { exact: true })
    .fill('Oorspronkelijke organisatiebeschrijving');
  await dialog
    .getByLabel('Locatiebeschrijving', { exact: true })
    .fill('Een beschreven werkgebied, geen verzonnen site');
  await dialog.getByLabel('Contactpersoon', { exact: true }).fill('Fictieve contactpersoon');
  await dialog.getByLabel('Contact e-mail', { exact: true }).fill('context@example.invalid');
  await dialog.getByRole('checkbox', { name: 'Contextorganisatie', exact: true }).check();
  const labels = [
    'Activiteiten en processen',
    'Werkplekken en situaties',
    'Personeelsopbouw',
    'Werk- en roostersystematiek',
    'Arbeidsmiddelen en installaties',
    'Gevaarlijke stoffen en biologische agentia',
    'Fysieke belasting',
    'Psychosociale arbeidsbelasting',
    'Verzuimgegevens',
    'Ongevallen en incidentgegevens',
    'Eerdere RI&E en openstaande acties',
    'BHV en noodorganisatie',
    'Toegepaste wet- en regelgeving',
  ];
  for (const label of labels)
    await dialog.getByLabel(label, { exact: true }).fill(`${label}\nVolledige inhoud.`);
  await dialog.getByRole('button', { name: 'Projectcontext opslaan', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).projectContexts[0]?.title)
    .toBe('Volledige projectcontext');
  const context = (await state(page)).projectContexts[0];

  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken', exact: true });
  await dialog.getByLabel('Dossiertitel', { exact: true }).fill('Dossier met projectcontext');
  await dialog
    .getByLabel('Afgebakende scope', { exact: true })
    .fill('De benoemde organisatie binnen de vastgelegde context.');
  await dialog.getByLabel('Beoordelaar', { exact: true }).fill('Fictieve beoordelaar');
  await dialog
    .getByRole('combobox', { name: 'Organisatie', exact: true })
    .selectOption({ label: 'Contextorganisatie' });
  await dialog
    .getByRole('combobox', { name: 'Projectcontext', exact: true })
    .selectOption(context.id);
  await dialog.locator('.link-choices').last().getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect.poll(async () => (await state(page)).dossiers[0]?.projectContextId).toBe(context.id);
  const dossier = (await state(page)).dossiers[0];

  await page.getByRole('button', { name: 'Projectcontext & rondgangen', exact: true }).click();
  await page.getByRole('button', { name: 'Rondgangverslag', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Rondgangverslag vastleggen', exact: true });
  await dialog.getByLabel('Verslagtitel', { exact: true }).fill('Volledig rondgangverslag');
  await dialog.getByLabel('Rondgangdatum', { exact: true }).fill('2026-10-07');
  await dialog.getByLabel('Auteur', { exact: true }).fill('Fictieve inspecteur');
  await dialog.getByLabel('Samenvatting', { exact: true }).fill('Samenvatting van de rondgang.');
  await dialog
    .getByLabel('Volledig rondgangverslag', { exact: true })
    .fill('Eerste verslagregel.\nTweede verslagregel.');
  await dialog.getByRole('button', { name: 'Module toevoegen', exact: true }).click();
  await dialog.getByLabel('Modulecode', { exact: true }).fill('M1');
  await dialog.getByLabel('Modulenaam', { exact: true }).fill('Machineveiligheid');
  await dialog.getByRole('button', { name: 'Rondgangverslag opslaan', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).walkthroughs[0]?.title)
    .toBe('Volledig rondgangverslag');
  const report = (await state(page)).walkthroughs[0];
  expect(report.dossierId).toBe(dossier.id);
  expect(report.projectContextId).toBe(context.id);
  expect((await state(page)).observations).toEqual([]);

  await page
    .getByRole('button', { name: 'Projectcontext bewerken: Volledige projectcontext', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Projectcontext vastleggen', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Fysieke belasting', exact: true })
    .fill('Bijgewerkte fysieke belasting.');
  await dialog.getByRole('button', { name: 'Projectcontext opslaan', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).projectContexts[0]?.details.physicalLoad)
    .toBe('Bijgewerkte fysieke belasting.');
  await page
    .getByRole('button', { name: 'Rondgang bewerken: Volledig rondgangverslag', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Rondgangverslag vastleggen', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Samenvatting', exact: true })
    .fill('Aangevulde samenvatting.');
  await dialog.getByRole('button', { name: 'Rondgangverslag opslaan', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).walkthroughs[0]?.summary)
    .toBe('Aangevulde samenvatting.');

  await page.getByRole('button', { name: 'Dossiers & bewijs', exact: true }).click();
  await page.getByRole('button', { name: 'Waarneming', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Waarneming vastleggen', exact: true });
  await dialog
    .getByLabel('Waarnemingstitel', { exact: true })
    .fill('Afzonderlijk vastgesteld feit');
  await dialog.getByLabel('Waarnemer', { exact: true }).fill('Fictieve waarnemer');
  await dialog
    .getByRole('combobox', { name: 'Afkomstig uit rondgangverslag', exact: true })
    .selectOption(report.id);
  await dialog
    .getByLabel('Waargenomen feiten', { exact: true })
    .fill('Een expliciet vastgesteld feit; niet automatisch uit de samenvatting afgeleid.');
  await dialog.getByRole('button', { name: 'Waarneming opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).observations[0]?.walkthroughId).toBe(report.id);
  await page.reload();
  const reloaded = await state(page);
  expect(reloaded.projectContexts[0].createdAt).toBe(context.createdAt);
  expect(reloaded.projectContexts[0].details.activities).toBe(
    'Activiteiten en processen\nVolledige inhoud.',
  );
  expect(Object.keys(reloaded.projectContexts[0].details)).toHaveLength(13);
  expect(reloaded.walkthroughs[0].modules[0].id).toBe(report.modules[0].id);
  expect(reloaded.walkthroughs[0].body).toBe('Eerste verslagregel.\nTweede verslagregel.');
  expect(reloaded.observations[0].walkthroughId).toBe(report.id);
  expect(reloaded.sites).toEqual([]);
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  await expect(page.locator('.dossier-report')).toContainText('Bijgewerkte fysieke belasting.');
  await expect(page.locator('.dossier-report')).toContainText('Tweede verslagregel.');
  await expect(page.locator('.dossier-report')).toContainText('Machineveiligheid');
  await expect(page.locator('.dossier-report')).toContainText(`Rondgangverslag: ${report.id}`);
});
