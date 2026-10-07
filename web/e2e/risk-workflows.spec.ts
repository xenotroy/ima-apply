import { expect, test, type Page } from '@playwright/test';

const storageKey = 'ima-apply.workspace.v1';
async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workspace, storageKey);
}
async function saved(page: Page) {
  await expect
    .poll(async () => page.evaluate((key) => Boolean(localStorage.getItem(key)), storageKey))
    .toBe(true);
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
}
async function createScenario(page: Page, title = 'E2E: fataal machinecontact') {
  await page.getByRole('button', { name: 'Nieuw risicoscenario', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Risicoscenario', exact: true });
  await form.getByLabel('Titel', { exact: true }).fill(title);
  await form.getByLabel('Gevaar', { exact: true }).fill('Onverwacht starten van een pers');
  await form.getByLabel('Concreet gevolg', { exact: true }).fill('Fataal letsel');
  await form
    .getByLabel('Scenario', { exact: true })
    .fill('Medewerker komt tijdens een handmatige interventie in de pers terecht.');
  await form.getByRole('button', { name: 'Scenario opslaan' }).click();
  await expect(page.locator('.scenario-context h2')).toHaveText(title);
  // The fixture specifies fatal injury, so deliberately choose the E=15 scale category.
  await page.getByRole('combobox', { name: 'Effect E', exact: true }).selectOption('15');
  await saved(page);
}
function currentScore(page: Page) {
  return page.locator('.score-summary').first().locator('.amber-text');
}
function projectedScore(page: Page) {
  return page.locator('.score-summary').first().locator('.green-text');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await saved(page);
});

test('new scenario survives reload with its scope and baseline', async ({ page }) => {
  await createScenario(page);
  await expect(currentScore(page)).toHaveText('270');
  const workspace = await stored(page);
  const scenario = workspace.scenarios.find(
    (item: { title: string }) => item.title === 'E2E: fataal machinecontact',
  );
  expect(scenario.hazard).toBe('Onverwacht starten van een pers');
  expect(scenario.probability * scenario.exposure * scenario.effect).toBe(270);
  await page.reload();
  await page.getByRole('button', { name: 'Risicowerkbank', exact: true }).click();
  await page
    .locator('.scenario-tabs')
    .getByRole('button', { name: 'E2E: fataal machinecontact', exact: true })
    .click();
  await expect(currentScore(page)).toHaveText('270');
});

test('planned and unverified controls never reduce current risk; evidence is required', async ({
  page,
}) => {
  await createScenario(page);
  await page.getByRole('button', { name: 'Maatregel toevoegen' }).click();
  let dialog = page.getByRole('dialog', { name: 'Werking van de beheersmaatregel' });
  await dialog.getByLabel('Maatregel', { exact: true }).fill('E2E: onafhankelijke afscherming');
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('existing');
  await dialog
    .getByRole('combobox', { name: 'Bewijsstatus', exact: true })
    .selectOption('verified');
  await dialog
    .getByLabel('Bewijs / verificatie', { exact: true })
    .fill('Inspectie en functionele beproeving op 7 oktober 2026.');
  await dialog
    .getByRole('textbox', { name: 'Waarom werkt dit in dit scenario?', exact: true })
    .fill('Afscherming voorkomt toegang; ernst bij doorbreken blijft fataal.');
  await dialog.getByLabel('Waarschijnlijkheid W bovengrens', { exact: true }).fill('50');
  await dialog.getByLabel('Waarschijnlijkheid W verwachting', { exact: true }).fill('50');
  await dialog.getByLabel('Waarschijnlijkheid W ondergrens', { exact: true }).fill('50');
  await dialog.getByLabel('Onafhankelijkheid beoordeeld en onderbouwd', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Maatregel opslaan' }).click();
  await expect(currentScore(page)).toHaveText('135');
  await page.locator('.control-row').filter({ hasText: 'E2E: onafhankelijke afscherming' }).click();
  dialog = page.getByRole('dialog', { name: 'Werking van de beheersmaatregel' });
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('planned');
  await dialog.getByRole('button', { name: 'Maatregel opslaan' }).click();
  await expect(currentScore(page)).toHaveText('270');
  await expect(projectedScore(page)).toHaveText('135');
  await page.locator('.control-row').filter({ hasText: 'E2E: onafhankelijke afscherming' }).click();
  dialog = page.getByRole('dialog', { name: 'Werking van de beheersmaatregel' });
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('existing');
  await dialog
    .getByRole('combobox', { name: 'Bewijsstatus', exact: true })
    .selectOption('unverified');
  await dialog.getByRole('button', { name: 'Maatregel opslaan' }).click();
  await expect(currentScore(page)).toHaveText('270');
  await expect(projectedScore(page)).toHaveText('270');
  await page.locator('.control-row').filter({ hasText: 'E2E: onafhankelijke afscherming' }).click();
  dialog = page.getByRole('dialog', { name: 'Werking van de beheersmaatregel' });
  await dialog
    .getByRole('combobox', { name: 'Bewijsstatus', exact: true })
    .selectOption('verified');
  await dialog.getByLabel('Bewijs / verificatie', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Maatregel opslaan' }).click();
  // Saving an incomplete evidence declaration is allowed as a record, never as risk credit.
  if (await dialog.isVisible())
    await dialog.getByRole('button', { name: 'Annuleren', exact: true }).click();
  await expect(currentScore(page)).toHaveText('270');
  await saved(page);
});

test('inventory answer, supporting evidence and note survive a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Inventarisatie', exact: true }).click();
  let card = page.locator('.question-card').first();
  const question = await card.getByRole('heading', { level: 3 }).textContent();
  await card.getByRole('button', { name: 'Deels', exact: true }).click();
  await card
    .getByRole('textbox', { name: 'Bewijs / waarneming', exact: true })
    .fill('E2E: werkplekobservatie en interview met medewerker.');
  await card
    .getByRole('textbox', { name: 'Toelichting / vervolg', exact: true })
    .fill('E2E: ontbrekend onderdeel op locatie beoordelen.');
  await saved(page);
  await page.reload();
  await page.getByRole('button', { name: 'Inventarisatie', exact: true }).click();
  card = page
    .locator('.question-card')
    .filter({ has: page.getByRole('heading', { name: question!, exact: true }) });
  await expect(card.getByRole('button', { name: 'Deels', exact: true })).toHaveClass(/chosen/);
  await expect(card.getByRole('textbox', { name: 'Bewijs / waarneming', exact: true })).toHaveValue(
    'E2E: werkplekobservatie en interview met medewerker.',
  );
  await expect(
    card.getByRole('textbox', { name: 'Toelichting / vervolg', exact: true }),
  ).toHaveValue('E2E: ontbrekend onderdeel op locatie beoordelen.');
});

test('finishing an action requires effect-check text and does not automatically credit a control', async ({
  page,
}) => {
  const baseline = (await stored(page)).scenarios[0];
  await page.getByRole('button', { name: /Plan van aanpak/ }).click();
  const card = page.locator('.action-card').first();
  await card
    .getByRole('textbox', { name: 'Voortgang / effectcheck', exact: true })
    .fill('E2E: ontwerpcontrole staat gepland; er is nog geen effectresultaat.');
  page.once('dialog', (dialog) => dialog.accept());
  await card.getByRole('combobox', { name: 'Actiestatus', exact: true }).selectOption('done');
  await expect(card.getByRole('combobox', { name: 'Actiestatus', exact: true })).toHaveValue(
    'open',
  );
  await card
    .getByRole('textbox', { name: 'Resultaat van de effectcontrole', exact: true })
    .fill('E2E: functionele test afgerond; resultaat gecontroleerd en vastgelegd.');
  await card.getByRole('textbox', { name: 'Eigenaar', exact: true }).fill('');
  page.once('dialog', (dialog) => dialog.accept());
  await card.getByRole('combobox', { name: 'Actiestatus', exact: true }).selectOption('done');
  await expect(card.getByRole('combobox', { name: 'Actiestatus', exact: true })).toHaveValue(
    'open',
  );
  await card
    .getByRole('textbox', { name: 'Eigenaar', exact: true })
    .fill('E2E: beoordelaar werking');
  await card.getByRole('combobox', { name: 'Actiestatus', exact: true }).selectOption('done');
  await saved(page);
  await expect(
    page
      .locator('.kanban-column')
      .filter({ has: page.getByRole('heading', { name: 'Effect gecontroleerd', exact: true }) }),
  ).toContainText('Isolatievoorziening ontwerpen en verifiëren');
  expect((await stored(page)).scenarios[0].controls).toEqual(baseline.controls);
  const action = (await stored(page)).actions.find(
    (item: { title: string }) => item.title === 'Isolatievoorziening ontwerpen en verifiëren',
  );
  expect(action.effectCheck).toContain('functionele test afgerond');
  expect(Number.isFinite(Date.parse(action.verifiedAt))).toBe(true);
  expect(action.owner).toBe('E2E: beoordelaar werking');
});

test('malformed import leaves the existing persisted dossier intact', async ({ page }) => {
  await createScenario(page, 'E2E: dossier behouden bij ongeldige import');
  const before = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"schemaVersion":1,"scenarios":"broken"}'),
    });
  await expect(page.getByRole('status')).toContainText('Import gestopt');
  const after = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  expect(after).toBe(before);
  await expect(page.locator('.scenario-context h2')).toHaveText(
    'E2E: dossier behouden bij ongeldige import',
  );
});

test('creating an incomplete LOPA draft does not crash or invent a qualified result', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await createScenario(page, 'E2E: LOPA-invoer');
  await page.getByRole('button', { name: 'LOPA', exact: true }).click();
  await page.getByRole('button', { name: 'LOPA opzetten', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'LOPA-scenario opzetten' });
  await setup.getByRole('button', { name: 'LOPA-scenario vastleggen' }).click();
  await expect(setup).toBeVisible();
  await expect(page.locator('.lopa-summary')).toHaveCount(0);
  await setup
    .getByRole('textbox', { name: 'Eén initiërende gebeurtenis', exact: true })
    .fill('E2E: onafhankelijke regelkring faalt');
  await setup
    .getByRole('textbox', { name: 'Onderbouwing / bron initiatorfrequentie', exact: true })
    .fill('E2E: lokaal faalregister met tijdsbasis per jaar.');
  await setup
    .getByRole('textbox', { name: 'Aannames en vaststelling criterium', exact: true })
    .fill('E2E: afgebakend gevolg met illustratief projectcriterium.');
  await setup.getByRole('button', { name: 'LOPA-scenario vastleggen' }).click();
  await expect(setup).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Initiërende gebeurtenis', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Bron en onderbouwing frequentie', exact: true }),
  ).toBeVisible();
  await saved(page);
  const before = (await stored(page)).scenarios.find(
    (item: { title: string }) => item.title === 'E2E: LOPA-invoer',
  ).lopa;
  await page.getByRole('spinbutton', { name: /Lokaal vastgesteld criterium/ }).fill('0.00001');
  await page.getByRole('textbox', { name: 'Initiërende gebeurtenis', exact: true }).fill('');
  await expect(page.locator('.lopa-draft-bar')).toContainText(/Onvolledig/);
  await expect(page.locator('.lopa-draft-bar')).toContainText('laatst opgeslagen');
  await expect(page.locator('.lopa-summary .amber-text')).toHaveText(
    before.targetFrequency.toExponential(2),
  );
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  expect(
    (await stored(page)).scenarios.find(
      (item: { title: string }) => item.title === 'E2E: LOPA-invoer',
    ).lopa,
  ).toEqual(before);
  expect(errors).toEqual([]);
});

test('effectiveness rubric requires conditional definitions and persists the proposed basis', async ({
  page,
}) => {
  await createScenario(page, 'E2E: onderbouwde inschaling');
  await page.getByRole('button', { name: 'Maatregel toevoegen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Werking van de beheersmaatregel' });
  await dialog.getByLabel('Maatregel', { exact: true }).fill('E2E: ontwerpmaatregel met rubric');
  await dialog
    .getByLabel('Bewijs / verificatie', { exact: true })
    .fill('Ontwerpaanname; werking op de werkplek nog te toetsen.');
  await dialog.locator('summary').filter({ hasText: 'Inschalingshulp' }).click();
  const apply = dialog.getByRole('button', { name: 'Toepassen op W', exact: true });
  await expect(apply).toBeDisabled();
  await dialog.getByRole('spinbutton', { name: 'Maximale werking (%)', exact: true }).fill('80');
  await dialog
    .getByRole('spinbutton', { name: 'Bereik van scenario (%)', exact: true })
    .fill('100');
  await dialog
    .getByRole('spinbutton', { name: 'Beschikbaar indien nodig (%)', exact: true })
    .fill('50');
  await dialog
    .getByRole('spinbutton', { name: 'Correct gebruik indien beschikbaar (%)', exact: true })
    .fill('50');
  await dialog
    .getByRole('textbox', { name: 'Conditionele definities en controle op overlap', exact: true })
    .fill(
      'E2E: beschikbaarheid binnen gedekte situaties; gebruik bij beschikbare bescherming; intrinsieke werking na correct gebruik.',
    );
  await expect(apply).toBeDisabled();
  await dialog
    .getByRole('checkbox', { name: 'Noemers en dubbeltelling gecontroleerd', exact: true })
    .check();
  await apply.click();
  await expect(
    dialog.getByRole('textbox', { name: 'Waarom werkt dit in dit scenario?', exact: true }),
  ).toHaveValue(/E2E: beschikbaarheid binnen gedekte situaties/);
  await dialog.getByRole('button', { name: 'Maatregel opslaan' }).click();
  await expect(currentScore(page)).toHaveText('270');
  await expect(projectedScore(page)).toHaveText('216');
  await saved(page);
  const control = (await stored(page)).scenarios.find(
    (item: { title: string }) => item.title === 'E2E: onderbouwde inschaling',
  ).controls[0];
  expect(control.probabilityReduction.value).toBeCloseTo(0.2);
  expect(control.probabilityReduction.min).toBe(0);
  expect(control.rationale).toContain('Noemers/overlap: E2E: beschikbaarheid');
});
