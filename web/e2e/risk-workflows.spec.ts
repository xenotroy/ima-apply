import { expect, test, type Page } from '@playwright/test';
import { evidenceHash } from '../src/data/frozen';
import type { Evidence } from '../src/data/dossier';

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

test('implementation, negative effect check and reopening preserve history without automatic control credit', async ({
  page,
}) => {
  const before = await stored(page);
  const baseline = before.scenarios[0];
  const now = new Date().toISOString();
  const proof: Evidence = {
    id: 'e2e-effect-proof',
    title: 'E2E fictief controlebewijs',
    kind: 'measurement',
    reference: 'Fictieve softwaretest',
    description: 'Alleen een softwarefixture',
    recordedAt: now,
    status: 'verified',
    verifiedBy: 'E2E test',
    verifiedAt: now,
    verificationNote: 'Fictieve bewijsbeoordeling',
  };
  proof.verifiedContentSha256 = evidenceHash(proof);
  await page.evaluate(
    ({ key, proof }) => {
      const envelope = JSON.parse(localStorage.getItem(key)!);
      envelope.workspace.evidence = [proof];
      localStorage.setItem(key, JSON.stringify(envelope));
    },
    { key: storageKey, proof },
  );
  await page.reload();
  await page.getByRole('button', { name: /Plan van aanpak/ }).click();
  const card = page
    .locator('.action-card')
    .filter({
      has: page.getByRole('heading', {
        name: 'Isolatievoorziening ontwerpen en verifiëren',
        exact: true,
      }),
    });
  async function editor() {
    const details = card.locator('.action-revision-editor');
    if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
      await details.locator('summary').click();
  }
  async function step(stage: string) {
    await editor();
    await card
      .getByRole('combobox', { name: 'Volgende actiestap', exact: true })
      .selectOption(stage);
    await card
      .getByRole('textbox', { name: 'Actor van deze wijziging', exact: true })
      .fill('E2E actiebeheerder');
    await card
      .getByRole('textbox', { name: /Redenering bij deze revisie|Reden voor heropening/ })
      .fill(`E2E onderbouwing: ${stage}`);
  }
  async function save() {
    await card.getByRole('button', { name: 'Revisie vastleggen', exact: true }).click();
    await saved(page);
  }
  await editor();
  await expect(
    card
      .getByRole('combobox', { name: 'Volgende actiestap', exact: true })
      .locator('option[value=effective]'),
  ).toHaveCount(0);
  await card
    .getByRole('textbox', { name: 'Verificatieplan / voortgang', exact: true })
    .fill('E2E functietest onder afwijkende bedrijfscondities.');
  await step('in_progress');
  await save();
  await step('implemented');
  await save();
  let action = (await stored(page)).actions.find(
    (a: { id: string }) => a.id === before.actions[0].id,
  );
  expect(action.lifecycle.stage).toBe('implemented');
  expect(action.verifiedAt).toBeUndefined();
  expect(action.lifecycle.effectiveness).toBe('pending');
  await step('verification_due');
  await card
    .getByLabel('Geplande effectcontrole', { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await save();
  await step('ineffective');
  await card.getByLabel('Verificateur', { exact: true }).fill('E2E effectbeoordelaar');
  await card
    .getByLabel('Resultaat van de effectcontrole', { exact: true })
    .fill('E2E onvoldoende: foutconditie blijft mogelijk.');
  await save();
  await expect(card.getByRole('alert')).toContainText('geverifieerd bewijs');
  await card.getByRole('checkbox', { name: /E2E fictief controlebewijs/ }).check();
  await save();
  action = (await stored(page)).actions.find((a: { id: string }) => a.id === before.actions[0].id);
  expect(action.lifecycle.stage).toBe('ineffective');
  expect(action.status).toBe('in_progress');
  expect(action.lifecycle.history).toHaveLength(4);
  await step('reopened');
  await save();
  action = (await stored(page)).actions.find((a: { id: string }) => a.id === before.actions[0].id);
  expect(action.effectCheck).toBeUndefined();
  expect(action.verifiedAt).toBeUndefined();
  expect(action.lifecycle.history.at(-1).before.effectCheck).toContain('E2E onvoldoende');
  expect((await stored(page)).scenarios[0].controls).toEqual(baseline.controls);
  await page.reload();
  await page.getByRole('button', { name: /Plan van aanpak/ }).click();
  await expect(card).toContainText('Heropend');
  await card.locator('.action-history > summary').click();
  await expect(card.locator('.action-history')).toContainText('E2E actiebeheerder');
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  await expect(page.locator('.dossier-report')).toContainText('E2E onvoldoende');
  await expect(page.locator('.dossier-report')).toContainText('Revisie-SHA256');
});

test('a deliberate assessment checkpoint keeps its historical inputs after later edits', async ({
  page,
}) => {
  await createScenario(page, 'E2E historische beoordeling');
  const history = page.locator('.risk-assessment-history');
  await history.getByLabel('Beoordelaar van dit moment', { exact: true }).fill('E2E beoordelaar');
  await history
    .getByLabel('Onderbouwing van deze vastlegging', { exact: true })
    .fill('E2E uitgangssituatie vóór wijziging.');
  await history.getByRole('button', { name: 'Beoordelingsmoment vastleggen', exact: true }).click();
  await expect.poll(async () => (await stored(page)).riskAssessments.length).toBe(1);
  const recorded = (await stored(page)).riskAssessments[0];
  await page.getByRole('combobox', { name: 'Waarschijnlijkheid W', exact: true }).selectOption('1');
  await saved(page);
  await page.reload();
  expect((await stored(page)).riskAssessments[0]).toEqual(recorded);
  expect(
    (await stored(page)).scenarios.find((s: { id: string }) => s.id === recorded.scenarioId)
      .probability,
  ).toBe(1);
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  await expect(page.locator('.dossier-report')).toContainText(
    'E2E uitgangssituatie vóór wijziging.',
  );
  await expect(page.locator('.dossier-report')).toContainText(recorded.sha256);
});

test('clearing the LOPA criterion basis removes confirmation and cannot replace the saved assessment', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Risicowerkbank', exact: true }).click();
  await page
    .locator('.scenario-tabs')
    .getByRole('button', { name: 'Overvullen van een procesvat', exact: true })
    .click();
  await page.getByRole('button', { name: 'LOPA', exact: true }).click();
  const basis = page.getByRole('textbox', { name: 'Aannames en criteriumbesluit', exact: true });
  const savedBasis = await basis.inputValue();
  await basis.fill('');
  await expect(page.locator('.lopa-summary')).toContainText('Criteriumbasis niet vastgelegd');
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await expect(page.locator('.lopa-draft-bar')).toContainText(
    'Leg de aannames en het criteriumbesluit vast',
  );
  expect(
    (await stored(page)).scenarios.find(
      (s: { title: string }) => s.title === 'Overvullen van een procesvat',
    ).lopa.assumptions,
  ).toBe(savedBasis);
});

test('malformed import leaves the existing persisted dossier intact', async ({ page }) => {
  await createScenario(page, 'E2E: dossier behouden bij ongeldige import');
  const before = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  await page.locator('input[type=file]').setInputFiles({
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
