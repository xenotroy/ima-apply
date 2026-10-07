import { test, expect, type Page } from '@playwright/test';

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
async function createDossier(page: Page, title: string) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken' });
  await dialog.getByLabel('Dossiertitel', { exact: true }).fill(title);
  await dialog
    .getByLabel('Afgebakende scope', { exact: true })
    .fill('E2E: uitsluitend de werkzaamheden van deze beoordeling.');
  await dialog.getByLabel('Beoordelaar', { exact: true }).fill('E2E beoordelaar');
  await dialog.locator('.link-choices').last().getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.dossier-context')).toContainText(title);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
});

test('separate dossiers freeze questions and retain distinct answers across reload', async ({
  page,
}) => {
  await createDossier(page, 'E2E dossier A');
  await page.getByRole('button', { name: 'Inventariseren', exact: true }).click();
  await expect(page.locator('.question-card')).toHaveCount(1);
  await page.locator('.question-card').getByRole('button', { name: 'Ja', exact: true }).click();
  await createDossier(page, 'E2E dossier B');
  await page.getByRole('button', { name: 'Inventariseren', exact: true }).click();
  await page.locator('.question-card').getByRole('button', { name: 'Nee', exact: true }).click();
  await expect.poll(async () => (await state(page)).answers.length).toBe(2);
  const w = await state(page);
  expect(w.dossiers[0].questions[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(w.answers.map((a: { choice: string }) => a.choice)).toEqual(['yes', 'no']);
  await page.reload();
  await page.getByRole('button', { name: 'Inventarisatie', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Beoordelingsdossier', exact: true })
    .selectOption(w.dossiers[0].id);
  await expect(
    page.locator('.question-card').getByRole('button', { name: 'Ja', exact: true }),
  ).toHaveClass(/chosen/);
  await page
    .getByRole('combobox', { name: 'Beoordelingsdossier', exact: true })
    .selectOption(w.dossiers[1].id);
  await expect(
    page.locator('.question-card').getByRole('button', { name: 'Nee', exact: true }),
  ).toHaveClass(/chosen/);
});

test('finding closure needs verified evidence and reporting preserves traceability', async ({
  page,
}) => {
  await createDossier(page, 'E2E controleerbaar dossier');
  await page.getByRole('button', { name: 'Bewijs', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Bewijs vastleggen en beoordelen' });
  await dialog.getByLabel('Bewijstitel', { exact: true }).fill('E2E functietest');
  await dialog
    .getByLabel('Inhoud en toepassingsbereik', { exact: true })
    .fill('Herhaalde beproeving van de beveiliging op deze werkplek.');
  await dialog.getByRole('button', { name: 'Bewijs opslaan', exact: true }).click();
  await page.getByRole('button', { name: 'Bevinding', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Bevinding vastleggen en beoordelen' });
  await dialog.getByLabel('Bevindingstitel', { exact: true }).fill('E2E beveiliging');
  await dialog
    .getByLabel('Bevinding en criterium', { exact: true })
    .fill('Werking vereist toetsing.');
  await dialog.getByRole('checkbox', { name: 'E2E functietest', exact: true }).check();
  await dialog
    .getByRole('combobox', { name: 'Bevindingstatus', exact: true })
    .selectOption('closed');
  await dialog.getByLabel('Besluitnemer', { exact: true }).fill('E2E verantwoordelijke');
  await dialog.getByLabel('Besluit en onderbouwing', { exact: true }).fill('Verificatie positief.');
  await dialog.getByRole('button', { name: 'Bevinding opslaan', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('geverifieerd bewijs');
  expect((await state(page)).findings).toEqual([]);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.getByRole('button', { name: 'Bewijs beoordelen / wijzigen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Bewijs vastleggen en beoordelen' });
  await dialog
    .getByRole('combobox', { name: 'Verificatiestatus', exact: true })
    .selectOption('verified');
  await dialog.getByLabel('Verificateur', { exact: true }).fill('E2E verificateur');
  await dialog
    .getByLabel('Verificatiebevinding', { exact: true })
    .fill('Herhaling bij relevante storingscondities; werking aangetoond.');
  await dialog.getByRole('button', { name: 'Bewijs opslaan', exact: true }).click();
  await page.getByRole('button', { name: 'Bevinding', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Bevinding vastleggen en beoordelen' });
  await dialog.getByLabel('Bevindingstitel', { exact: true }).fill('E2E beveiliging');
  await dialog.getByLabel('Bevinding en criterium', { exact: true }).fill('Werking getoetst.');
  await dialog.getByRole('checkbox', { name: 'E2E functietest', exact: true }).check();
  await dialog
    .getByRole('combobox', { name: 'Bevindingstatus', exact: true })
    .selectOption('closed');
  await dialog.getByLabel('Besluitnemer', { exact: true }).fill('E2E verantwoordelijke');
  await dialog.getByLabel('Besluit en onderbouwing', { exact: true }).fill('Verificatie positief.');
  await dialog.getByRole('button', { name: 'Bevinding opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await state(page)).findings[0]?.status).toBe('closed');
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  await expect(page.locator('.dossier-report')).toContainText('E2E verificateur');
  await expect(page.locator('.dossier-report')).toContainText('SHA256');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const report = Buffer.concat(chunks).toString();
  expect(report).toContain('E2E controleerbaar dossier');
  expect(report).toContain('Verificatie positief');
  expect(report).toContain('SHA256');
});

test('an investigation persists separately and incomplete review cannot be saved', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Onderzoek & cijfers', exact: true }).click();
  await page.getByRole('button', { name: 'Onderzoek beginnen', exact: true }).click();
  await page.getByRole('textbox', { name: 'Titel', exact: true }).fill('E2E verklaringsonderzoek');
  await page
    .getByRole('textbox', { name: 'Waarom 1', exact: true })
    .fill('Een handmatige interventie was nodig; nader te onderzoeken.');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('reviewed');
  await page.getByRole('button', { name: 'Onderzoek opslaan', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('gekoppeld bewijs');
  expect((await state(page)).investigations).toEqual([]);
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('draft');
  await page.getByRole('button', { name: 'Onderzoek opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).investigations.length).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Onderzoek & cijfers', exact: true }).click();
  await page
    .getByRole('button', { name: 'E2E verklaringsonderzoek · Concept', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Waarom 1', exact: true })).toHaveValue(
    'Een handmatige interventie was nodig; nader te onderzoeken.',
  );
});

test('classified incidents get a frequency only after matching whole-month hours exist', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Incidenten & leren', exact: true }).click();
  await page.getByRole('button', { name: 'Incident of signaal', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Incident of signaal vastleggen' });
  await dialog
    .getByRole('textbox', { name: 'Titel', exact: true })
    .fill('E2E geregistreerd incident');
  await dialog.getByRole('combobox', { name: 'Type', exact: true }).selectOption('incident');
  await dialog.getByLabel('Datum', { exact: true }).fill('2026-09-15');
  await dialog
    .getByRole('textbox', { name: 'Feiten', exact: true })
    .fill('E2E: alleen vastgelegde feiten.');
  await dialog
    .locator('summary')
    .filter({ hasText: 'Classificatie, context en direct handelen' })
    .click();
  await dialog
    .getByRole('combobox', { name: 'Recordable volgens gekozen registratieafspraak', exact: true })
    .selectOption('true');
  await dialog
    .getByRole('combobox', { name: 'Lost-time-incident', exact: true })
    .selectOption('false');
  await dialog.getByRole('button', { name: 'Melding opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Onderzoek & cijfers', exact: true }).click();
  await page.getByRole('button', { name: 'Trends & frequenties', exact: true }).click();
  await page.getByLabel('Van maand', { exact: true }).fill('2026-09');
  await page.getByLabel('Tot en met maand', { exact: true }).fill('2026-09');
  await page.getByLabel('Peildatum', { exact: true }).fill('2026-10-07');
  let result = page
    .locator('.panel')
    .filter({ has: page.getByRole('heading', { name: 'Geselecteerde periode', exact: true }) });
  await expect(result).toContainText('Niet berekenbaar');
  await page.getByRole('button', { name: 'Gewerkte uren', exact: true }).click();
  await page.getByRole('button', { name: 'Maanduren vastleggen', exact: true }).click();
  await page.getByLabel('Hele kalendermaand', { exact: true }).fill('2026-09');
  await page.getByLabel('Werkelijk gewerkte uren', { exact: true }).fill('2000');
  await page
    .getByRole('textbox', { name: 'Bron en afbakening', exact: false })
    .fill('E2E: volledige urenadministratie voor dezelfde werkruimte in september.');
  await page.getByRole('button', { name: 'Uren opslaan', exact: true }).click();
  await page.getByRole('button', { name: 'Trends & frequenties', exact: true }).click();
  result = page
    .locator('.panel')
    .filter({ has: page.getByRole('heading', { name: 'Geselecteerde periode', exact: true }) });
  await expect(result.getByRole('heading', { name: '500', exact: true })).toBeVisible();
  await expect.poll(async () => (await state(page)).exposure[0]?.hoursWorked).toBe(2000);
});
