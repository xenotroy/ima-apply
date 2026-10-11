import { expect, test, type Page } from '@playwright/test';

const storageKey = 'ima-apply.workspace.v1';
async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workspace, storageKey);
}
async function saved(page: Page) {
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
}
async function scenario(page: Page) {
  await page.getByRole('button', { name: 'Nieuw risicoscenario', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Risicoscenario', exact: true });
  await dialog.getByLabel('Titel', { exact: true }).fill('E2E gekozen justificatie');
  await dialog.getByLabel('Gevaar', { exact: true }).fill('Fictieve bewegende machine');
  await dialog.getByLabel('Concreet gevolg', { exact: true }).fill('Fataal letsel');
  await dialog
    .getByLabel('Scenario', { exact: true })
    .fill('Fictieve softwarefixture voor maatregelkeuze.');
  await dialog.getByRole('button', { name: 'Scenario opslaan', exact: true }).click();
  await page.getByRole('combobox', { name: 'Effect E', exact: true }).selectOption('15');
  await saved(page);
}
async function plan(page: Page, title: string, reduction: number) {
  await page.getByRole('button', { name: 'Maatregel toevoegen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Werking van de beheersmaatregel', exact: true });
  await dialog.getByLabel('Maatregel', { exact: true }).fill(title);
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('planned');
  await dialog
    .getByRole('combobox', { name: 'Bewijsstatus', exact: true })
    .selectOption('verified');
  await dialog
    .getByRole('textbox', { name: 'Bewijs / verificatie', exact: true })
    .fill('Fictieve ontwerpcontrole, geen gerealiseerde maatregel.');
  await dialog
    .getByRole('textbox', { name: 'Waarom werkt dit in dit scenario?', exact: true })
    .fill('Fictief afzonderlijk preventief mechanisme op W.');
  for (const bound of ['bovengrens', 'verwachting', 'ondergrens'])
    await dialog
      .getByLabel(`Waarschijnlijkheid W ${bound}`, { exact: true })
      .fill(String(reduction));
  await dialog.getByLabel('Onafhankelijkheid beoordeeld en onderbouwd', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Maatregel opslaan', exact: true }).click();
  await saved(page);
}
async function sourceAssessment(page: Page) {
  const history = page.locator('.risk-assessment-history');
  await history
    .getByLabel('Beoordelaar van dit moment', { exact: true })
    .fill('E2E bronbeoordelaar');
  await history
    .getByLabel('Onderbouwing van deze vastlegging', { exact: true })
    .fill('E2E vaste bron met twee afzonderlijke geplande ingrepen.');
  await history.getByRole('button', { name: 'Beoordelingsmoment vastleggen', exact: true }).click();
  await expect.poll(async () => (await stored(page)).riskAssessments.length).toBe(1);
}
async function downloadedText(page: Page, button: string) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await saved(page);
});

test('a workspace without an assessment explains the frozen source instead of inventing a decision', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Risicowerkbank', exact: true }).click();
  await expect(page.locator('.justification-workspace')).toContainText(
    'Bewaar eerst een beoordelingsmoment',
  );
  await expect(
    page
      .locator('.justification-workspace')
      .getByRole('button', { name: 'Justificatiebesluit vastleggen', exact: true }),
  ).toHaveCount(0);
  expect((await stored(page)).justifications ?? []).toEqual([]);
});

test('selected justification survives active changes, reload, a later decision and both exports', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await scenario(page);
  await plan(page, 'E2E gekozen halve W', 50);
  await plan(page, 'E2E ander plan tachtig procent', 80);
  await sourceAssessment(page);
  const panel = page.locator('.justification-workspace');
  const before = await stored(page);
  const assessment = before.riskAssessments[0];
  const chosen = assessment.input.controls.find(
    (item: { title: string }) => item.title === 'E2E gekozen halve W',
  );
  const other = assessment.input.controls.find(
    (item: { title: string }) => item.title === 'E2E ander plan tachtig procent',
  );
  await panel
    .getByRole('combobox', { name: 'Gekozen geplande maatregel', exact: true })
    .selectOption(chosen.id);
  await panel.getByRole('spinbutton', { name: /^Fine-kostenfactor CF/ }).fill('2');
  await panel.getByRole('spinbutton', { name: /^Fine-correctierating DC/ }).fill('4');
  await panel.getByRole('spinbutton', { name: /^Kinney-kostendeler/ }).fill('3');
  await panel
    .getByRole('textbox', { name: /^Kostenbasis en ratingkalibratie/ })
    .fill('E2E: fictief EUR-bedrag en één jaar onderhoud; lokale CF2/DC4/kostendeler3.');
  await panel
    .getByRole('textbox', { name: 'Beoordelaar van de justificatie', exact: true })
    .fill('E2E besluitbeoordelaar');
  await panel
    .getByRole('textbox', { name: 'Onderbouwing van het justificatiebesluit', exact: true })
    .fill('E2E eerste besluit uitsluitend voor de halve W-ingreep.');
  await panel
    .getByRole('combobox', { name: 'Besluit over deze maatregelkeuze', exact: true })
    .selectOption('implement');
  await expect(panel.locator('.justification-preview')).toContainText(
    'Huidige score 270 → gekozen prognose 135',
  );
  await panel.getByRole('button', { name: 'Justificatiebesluit vastleggen', exact: true }).click();
  await expect.poll(async () => (await stored(page)).justifications.length).toBe(1);
  const first = (await stored(page)).justifications[0];
  expect(first.assessmentSha256).toBe(assessment.sha256);
  expect(first.controlIds).toEqual([chosen.id]);
  expect(first.result.current.value).toBe(270);
  expect(first.result.selectedTarget.value).toBe(135);
  expect(first.result.kinneyExpected).toBe(45);
  expect(first.result.fine).toBe(33.75);
  expect(first.result.selectedCreditedControlIds).not.toContain(other.id);
  await page.getByRole('combobox', { name: 'Waarschijnlijkheid W', exact: true }).selectOption('1');
  await saved(page);
  await page.reload();
  await page.getByRole('button', { name: 'Risicowerkbank', exact: true }).click();
  await page
    .locator('.scenario-tabs')
    .getByRole('button', { name: 'E2E gekozen justificatie', exact: true })
    .click();
  expect((await stored(page)).justifications[0]).toEqual(first);
  await panel.locator('.justification-record > summary').click();
  await expect(panel.locator('.justification-record')).toContainText(
    'Huidige score 270 → gekozen prognose 135',
  );
  await expect(panel.locator('.justification-record')).toContainText(first.sha256);
  await panel
    .getByRole('combobox', { name: 'Gekozen geplande maatregel', exact: true })
    .selectOption(other.id);
  await panel.getByRole('spinbutton', { name: /^Fine-kostenfactor CF/ }).fill('4');
  await panel
    .getByRole('textbox', { name: /^Kostenbasis en ratingkalibratie/ })
    .fill('E2E tweede expliciete lokale ratings; ander plan, CF4/DC1/kostendeler1.');
  await panel
    .getByRole('textbox', { name: 'Beoordelaar van de justificatie', exact: true })
    .fill('E2E tweede beoordelaar');
  await panel
    .getByRole('textbox', { name: 'Onderbouwing van het justificatiebesluit', exact: true })
    .fill('E2E tweede besluit onderzoekt het andere plan afzonderlijk.');
  await panel.getByRole('button', { name: 'Justificatiebesluit vastleggen', exact: true }).click();
  await expect.poll(async () => (await stored(page)).justifications.length).toBe(2);
  const current = await stored(page);
  expect(current.justifications[0]).toEqual(first);
  expect(current.justifications[1].result.current.value).toBe(270);
  expect(current.justifications[1].result.selectedTarget.value).toBeCloseTo(54);
  expect(current.justifications[1].costFactor).toBe(4);
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  await expect(page.locator('.dossier-report')).toContainText(first.sha256);
  await expect(page.locator('.dossier-report')).toContainText('E2E eerste besluit uitsluitend');
  const markdown = await downloadedText(page, 'Markdown');
  expect(markdown).toContain(assessment.sha256);
  expect(markdown).toContain(first.sha256);
  expect(markdown).toContain('CF=2, DC=4');
  expect(markdown).toContain('E2E tweede besluit onderzoekt');
  await page.getByRole('button', { name: 'Werkruimte & synchronisatie', exact: true }).click();
  const json = JSON.parse(await downloadedText(page, 'Werkruimte exporteren'));
  expect(json.justifications).toEqual(current.justifications);
  expect(json.riskAssessments).toEqual(current.riskAssessments);
  expect(errors).toEqual([]);
});

test('an explicit portfolio requires a nonempty selection and retains the exact chosen package', async ({
  page,
}) => {
  await scenario(page);
  await plan(page, 'E2E pakket halve W', 50);
  await plan(page, 'E2E pakket tachtig procent', 80);
  await sourceAssessment(page);
  const panel = page.locator('.justification-workspace');
  await panel
    .getByRole('combobox', { name: 'Soort maatregelkeuze', exact: true })
    .selectOption('portfolio');
  await panel
    .getByRole('textbox', { name: /^Kostenbasis en ratingkalibratie/ })
    .fill('E2E fictieve pakketschatting met lokale ratings 1.');
  await panel
    .getByRole('textbox', { name: 'Beoordelaar van de justificatie', exact: true })
    .fill('E2E pakketbeoordelaar');
  await panel
    .getByRole('textbox', { name: 'Onderbouwing van het justificatiebesluit', exact: true })
    .fill('E2E expliciet pakket eerst nader onderzoeken.');
  await expect(
    panel.getByRole('button', { name: 'Justificatiebesluit vastleggen', exact: true }),
  ).toBeDisabled();
  await panel.getByRole('checkbox', { name: 'E2E pakket halve W', exact: true }).check();
  await panel.getByRole('checkbox', { name: 'E2E pakket tachtig procent', exact: true }).check();
  await expect(panel.locator('.justification-preview')).toContainText(
    'Huidige score 270 → gekozen prognose 27',
  );
  await panel.getByRole('checkbox', { name: 'E2E pakket halve W', exact: true }).uncheck();
  await expect(panel.locator('.justification-preview')).toContainText(
    'Huidige score 270 → gekozen prognose 54',
  );
  await panel.getByRole('checkbox', { name: 'E2E pakket halve W', exact: true }).check();
  await panel.getByRole('button', { name: 'Justificatiebesluit vastleggen', exact: true }).click();
  await expect.poll(async () => (await stored(page)).justifications.length).toBe(1);
  const workspace = await stored(page);
  const record = workspace.justifications[0];
  expect(record.selectionKind).toBe('portfolio');
  expect(record.decision).toBe('review_required');
  expect(record.controlIds).toHaveLength(2);
  expect(record.result.selectedTarget.value).toBeCloseTo(27);
  expect(record.result.improvement.value).toBeCloseTo(243);
  expect(record.result.localPriorities).toHaveLength(2);
  await page.reload();
  expect((await stored(page)).justifications[0]).toEqual(record);
});
