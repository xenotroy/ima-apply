import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { WorkspaceState } from '../src/data/model';

const workspaceKey = 'ima-apply.workspace.v1';
const machineTitle = 'Beknelling bij de rollenbaan';
const processTitle = 'Overvullen van een procesvat';
const controlTitle = 'Vaste afscherming van de knelzone';
const layerTitle = 'Onafhankelijke hoog-hoog niveautrip';
const proofTitle = `Fictief demonstratiebewijs: ${controlTitle}`;
const alternateProofTitle = `Fictief demonstratiebewijs: ${layerTitle}`;

async function state(page: Page): Promise<WorkspaceState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workspace, workspaceKey);
}
async function saved(page: Page) {
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
}
async function openRisk(page: Page, title = machineTitle) {
  await page.getByRole('button', { name: 'Risicowerkbank', exact: true }).click();
  await page.locator('.scenario-tabs').getByRole('button', { name: title, exact: true }).click();
}
async function openControl(page: Page) {
  await openRisk(page);
  await page.getByRole('button', { name: 'Fine–Kinney / Wiruth', exact: true }).click();
  await page.locator('.control-row').filter({ hasText: controlTitle }).click();
  return page.getByRole('dialog', { name: 'Werking van de beheersmaatregel', exact: true });
}
function currentScore(page: Page) {
  return page.locator('.score-summary').first().locator('.amber-text');
}
async function confirmReview(scope: Locator, actor: string, rationale: string) {
  await scope
    .getByRole('textbox', { name: 'Beoordelaar van de maatregelwerking', exact: true })
    .fill(actor);
  await scope
    .getByRole('textbox', { name: 'Onderbouwing bij deze bewijsversies', exact: true })
    .fill(rationale);
  await scope
    .getByRole('button', { name: 'Bewijsversies bij deze werking bevestigen', exact: true })
    .click();
  await expect(scope.getByRole('alert')).toHaveCount(0);
}
async function saveControl(page: Page, dialog: Locator) {
  await dialog.getByRole('button', { name: 'Maatregel opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await saved(page);
}
async function editProof(page: Page) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'Dossiers & bewijs', exact: true }).click();
  const record = page
    .locator('.registry-item')
    .filter({ has: page.getByRole('heading', { name: proofTitle, exact: true }) });
  await record.getByRole('button', { name: 'Bewijs beoordelen / wijzigen', exact: true }).click();
  return page.getByRole('dialog', { name: 'Bewijs vastleggen en beoordelen', exact: true });
}
async function saveProof(page: Page, dialog: Locator) {
  await dialog.getByRole('button', { name: 'Bewijs opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await saved(page);
}
async function setEstimate(scope: Locator, label: string, value: string) {
  for (const suffix of ['bovengrens', 'verwachting', 'ondergrens'])
    await scope.getByRole('textbox', { name: `${label} ${suffix}`, exact: true }).fill(value);
}
async function markdown(page: Page) {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  return readFile((await (await pending).path())!, 'utf8');
}
async function exportJson(page: Page) {
  await page.getByRole('button', { name: 'Werkruimte & synchronisatie', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Werkruimte exporteren', exact: true }).click();
  return readFile((await (await pending).path())!, 'utf8');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await saved(page);
  // This real dossier only exposes the two explicitly fictitious, global demo records.
  // Proof content, human reviews, scenario changes and exports are all made through the UI.
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Dossiertitel', exact: true })
    .fill('Fictief E01 bewijsdossier Ω');
  await dialog
    .getByRole('textbox', { name: 'Afgebakende scope', exact: true })
    .fill('Uitsluitend fictieve softwareproef van bewijsversies Ω.');
  await dialog
    .getByRole('textbox', { name: 'Beoordelaar', exact: true })
    .fill('Fictieve E01 beoordelaar');
  await dialog.locator('.link-choices').last().getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await saved(page);
  await openRisk(page);
  await expect(currentScore(page)).toHaveText('270');
});

test('changed human proof version, reduction and scenario scope each require a new explicit target review', async ({
  page,
}) => {
  const before = (await state(page)).scenarios
    .find((s) => s.id === 'demo-machine')!
    .controls.find((c) => c.id === 'demo-guard')!;
  let dialog = await editProof(page);
  await dialog
    .getByRole('textbox', { name: 'Inhoud en toepassingsbereik', exact: true })
    .fill('Fictieve gewijzigde inspectiegrond Ω: tweede menselijke verificatie.');
  await dialog
    .getByRole('combobox', { name: 'Verificatiestatus', exact: true })
    .selectOption('verified');
  await dialog
    .getByRole('textbox', { name: 'Verificateur', exact: true })
    .fill('Fictieve bronreviewer Ω');
  await dialog
    .getByRole('textbox', { name: 'Verificatiebevinding', exact: true })
    .fill('Fictieve gewijzigde metadata bewust inhoudelijk bevestigd.');
  await saveProof(page, dialog);
  await openRisk(page);
  await expect(currentScore(page)).toHaveText('540');
  expect(
    (await state(page)).scenarios[0].controls.find((c) => c.id === 'demo-guard')!.evidenceReview,
  ).toEqual(before.evidenceReview);

  dialog = await openControl(page);
  await confirmReview(
    dialog,
    'Fictieve werkingsreviewer Ω',
    'Gewijzigde bewijsversie bewust gekoppeld aan deze afscherming Ω.',
  );
  await saveControl(page, dialog);
  await expect(currentScore(page)).toHaveText('270');
  const proofVersion = (await state(page)).scenarios[0].controls.find((c) => c.id === 'demo-guard')!
    .evidenceReview!.bindings[0].versionSha256;
  expect(proofVersion).not.toBe(before.evidenceReview!.bindings[0].versionSha256);

  dialog = await openControl(page);
  await setEstimate(dialog, 'Waarschijnlijkheid W', '40');
  await saveControl(page, dialog);
  await expect(currentScore(page)).toHaveText('540');
  dialog = await openControl(page);
  await confirmReview(
    dialog,
    'Fictieve reductiereviewer Ω',
    'Veertig procent werking apart en expliciet beoordeeld.',
  );
  await saveControl(page, dialog);
  await expect(currentScore(page)).toHaveText('324');

  await page.getByRole('button', { name: 'Scenario bewerken', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Risicoscenario', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Scenario', exact: true })
    .fill('Fictieve nieuwe lokale handeling Ω; gewijzigde scenarioafbakening.');
  await dialog.getByRole('button', { name: 'Scenario opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(currentScore(page)).toHaveText('540');
  dialog = await openControl(page);
  await confirmReview(
    dialog,
    'Fictieve scopereviewer Ω',
    'Nieuwe lokale afbakening expliciet opnieuw beoordeeld.',
  );
  await saveControl(page, dialog);
  await expect(currentScore(page)).toHaveText('324');
  await page.reload();
  await openRisk(page);
  await expect(currentScore(page)).toHaveText('324');
});

test('an IPL loses current credit after PFD or initiating-context changes and regains it only after explicit review', async ({
  page,
}) => {
  await openRisk(page, processTitle);
  await page.getByRole('button', { name: 'LOPA', exact: true }).click();
  const layer = page
    .locator('.lopa-layer')
    .filter({ has: page.locator(`input[value="${layerTitle}"]`) });
  const frequency = page.locator('.lopa-summary .green-text');
  const initial = await frequency.textContent();
  await setEstimate(layer, 'PFD (faalkans op aanvraag)', '0.2');
  await expect(layer).toContainText('gewijzigd');
  const uncredited = await frequency.textContent();
  expect(uncredited).not.toBe(initial);
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await saved(page);
  await confirmReview(
    layer,
    'Fictieve IPL-reviewer Ω',
    'PFD 0,2 expliciet beoordeeld voor deze initiator en gevolg.',
  );
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await saved(page);
  const credited = await frequency.textContent();
  expect(credited).not.toBe(uncredited);
  const lopa = (await state(page)).scenarios.find((s) => s.id === 'demo-process')!.lopa!;
  expect(lopa.layers.find((l) => l.id === 'demo-ipl-trip')!.pfd.value).toBe(0.2);
  expect(lopa.layers.find((l) => l.id === 'demo-ipl-trip')!.evidenceReview!.reviewedBy).toBe(
    'Fictieve IPL-reviewer Ω',
  );

  await page
    .getByRole('textbox', { name: 'Initiërende gebeurtenis', exact: true })
    .fill('Fictieve gewijzigde initiator Ψ');
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await saved(page);
  await expect(frequency).toHaveText(uncredited!);
  await confirmReview(
    layer,
    'Fictieve initiatorreviewer Ψ',
    'Dezelfde IPL bewust voor de gewijzigde initiator bevestigd.',
  );
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await saved(page);
  await expect(frequency).toHaveText(credited!);
  await page.reload();
  await openRisk(page, processTitle);
  await page.getByRole('button', { name: 'LOPA', exact: true }).click();
  await expect(frequency).toHaveText(credited!);
});

test('uncommitted evidence choices and human review text remain an exact recoverable parent concept', async ({
  page,
}) => {
  const before = (await state(page)).scenarios[0].controls.find((c) => c.id === 'demo-guard')!;
  let dialog = await openControl(page);
  const fieldset = dialog.locator('.risk-evidence-review');
  await fieldset
    .getByRole('checkbox', { name: `${proofTitle} · inhoudelijk beoordeeld`, exact: true })
    .uncheck();
  await fieldset
    .getByRole('checkbox', { name: `${alternateProofTitle} · inhoudelijk beoordeeld`, exact: true })
    .check();
  const actor = 'Fictieve onafgeronde reviewer Ω/漢字';
  const rationale = 'Onvastgelegd werkingsconcept Ω\nTweede regel met Ψ en 漢字.';
  await fieldset
    .getByRole('textbox', { name: 'Beoordelaar van de maatregelwerking', exact: true })
    .fill(actor);
  await fieldset
    .getByRole('textbox', { name: 'Onderbouwing bij deze bewijsversies', exact: true })
    .fill(rationale);
  await dialog.getByRole('button', { name: 'Annuleren', exact: true }).click();
  const report = await markdown(page);
  expect(report).toContain(actor);
  expect(report).toContain('Onvastgelegd werkingsconcept Ω');
  expect(report).toContain('demo-evidence-demo-ipl-trip');
  await page.reload();
  dialog = await openControl(page);
  await expect(
    dialog.getByRole('checkbox', { name: `${proofTitle} · inhoudelijk beoordeeld`, exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole('checkbox', {
      name: `${alternateProofTitle} · inhoudelijk beoordeeld`,
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    dialog.getByRole('textbox', { name: 'Beoordelaar van de maatregelwerking', exact: true }),
  ).toHaveValue(actor);
  await expect(
    dialog.getByRole('textbox', { name: 'Onderbouwing bij deze bewijsversies', exact: true }),
  ).toHaveValue(rationale);
  expect((await state(page)).scenarios[0].controls.find((c) => c.id === 'demo-guard')).toEqual(
    before,
  );
  await dialog.getByRole('button', { name: 'Annuleren', exact: true }).click();
  await expect(currentScore(page)).toHaveText('270');
});

test('a native frozen checkpoint retains its exact proof and result after withdrawal and real JSON export/import', async ({
  page,
  browser,
  baseURL,
}) => {
  const panel = page.locator('.risk-assessment-history');
  await panel
    .getByRole('textbox', { name: 'Beoordelaar van dit moment', exact: true })
    .fill('Fictieve historische reviewer Ω');
  await panel
    .getByRole('textbox', { name: 'Onderbouwing van deze vastlegging', exact: true })
    .fill('Bewuste fictieve vastlegging vóór intrekking van het bronbewijs Ω.');
  await panel.getByRole('button', { name: 'Beoordelingsmoment vastleggen', exact: true }).click();
  await saved(page);
  await expect.poll(async () => (await state(page)).riskAssessments!.length).toBe(1);
  const frozen = (await state(page)).riskAssessments![0];
  expect(frozen.methodVersion).toBe('ima-risk/2.1.0');
  expect(frozen.result.current.value).toBe(270);
  expect(frozen.evidenceBasis!.currentRecords.map((e) => e.id)).toEqual([
    'demo-evidence-demo-guard',
  ]);

  const dialog = await editProof(page);
  await dialog
    .getByRole('combobox', { name: 'Verificatiestatus', exact: true })
    .selectOption('unverified');
  await saveProof(page, dialog);
  await openRisk(page);
  await expect(currentScore(page)).toHaveText('540');
  await expect(panel.getByText(/huidige score 270/)).toBeVisible();
  expect((await state(page)).riskAssessments![0]).toEqual(frozen);
  const report = await markdown(page);
  expect(report).toContain(frozen.sha256);
  expect(report).toContain('methode ima-risk/2.1.0');
  expect(report).toContain('Huidige score: 270');
  expect(report).toContain(
    frozen.input.controls.find((c) => c.id === 'demo-guard')!.evidenceReview!.bindings[0]
      .versionSha256,
  );
  const exported = await exportJson(page);
  const nextContext = await browser.newContext({ acceptDownloads: true });
  try {
    const importedPage = await nextContext.newPage();
    await importedPage.goto(baseURL!);
    await saved(importedPage);
    await importedPage.locator('input[type=file]').setInputFiles({
      name: 'fictief-e01-herstel.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exported),
    });
    await importedPage
      .getByRole('dialog', { name: 'Werkruimte importeren', exact: true })
      .getByRole('button', { name: 'Import openen', exact: true })
      .click();
    await saved(importedPage);
    await expect.poll(async () => (await state(importedPage)).riskAssessments!.length).toBe(1);
    expect((await state(importedPage)).riskAssessments![0]).toEqual(frozen);
    expect(
      (await state(importedPage)).evidence!.find((e) => e.id === 'demo-evidence-demo-guard')!
        .status,
    ).toBe('unverified');
    await openRisk(importedPage);
    await expect(currentScore(importedPage)).toHaveText('540');
    await expect(
      importedPage.locator('.risk-assessment-history').getByText(/huidige score 270/),
    ).toBeVisible();
    await importedPage.reload();
    await openRisk(importedPage);
    expect((await state(importedPage)).riskAssessments![0]).toEqual(frozen);
  } finally {
    await nextContext.close();
  }
});

test('saving only a fresh operational byte recheck preserves the human proof version and existing target review', async ({
  page,
}) => {
  let dialog = await editProof(page);
  await dialog
    .getByRole('textbox', { name: 'Controleur van bestandsbytes', exact: true })
    .fill('Fictieve bytecontroleur Ω');
  await dialog
    .locator('input[type=file]')
    .setInputFiles({
      name: 'fictieve-afscherming.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('Fictieve bytes Ω\0\x01'),
    });
  await expect(dialog).toContainText('Bestandsbytes duurzaam lokaal opgeslagen');
  await dialog
    .getByRole('combobox', { name: 'Verificatiestatus', exact: true })
    .selectOption('verified');
  await dialog
    .getByRole('textbox', { name: 'Verificateur', exact: true })
    .fill('Fictieve inhoudelijke bestandsreviewer');
  await dialog
    .getByRole('textbox', { name: 'Verificatiebevinding', exact: true })
    .fill('Fictieve bestandinhoud expliciet beoordeeld; geen praktijkbewijs.');
  await saveProof(page, dialog);
  dialog = await openControl(page);
  await confirmReview(
    dialog,
    'Fictieve bestandswerkingsreviewer',
    'Deze fictieve bestandversie expliciet aan de werking verbonden.',
  );
  await saveControl(page, dialog);
  await expect(currentScore(page)).toHaveText('270');
  const before = (await state(page)).evidence!.find(
    (record) => record.id === 'demo-evidence-demo-guard',
  )!;
  const review = (await state(page)).scenarios[0].controls.find(
    (record) => record.id === 'demo-guard',
  )!.evidenceReview;
  await page.reload();
  await openRisk(page);
  await expect(currentScore(page)).toHaveText('540');
  dialog = await editProof(page);
  await dialog
    .getByRole('textbox', { name: 'Verificateur', exact: true })
    .fill('Fictieve nieuwe inhoudelijke reviewer');
  await dialog.getByRole('button', { name: 'Bewijs opslaan', exact: true }).click();
  await expect(dialog).toContainText('Controleer het bewijsbestand in deze sessie');
  expect(
    (await state(page)).evidence!.find((record) => record.id === 'demo-evidence-demo-guard'),
  ).toEqual(before);
  await dialog.getByRole('textbox', { name: 'Verificateur', exact: true }).fill(before.verifiedBy!);
  await dialog.getByRole('button', { name: 'Lokale bytes controleren', exact: true }).click();
  await expect(dialog).toContainText('Controle bruikbaar in deze sessie');
  await saveProof(page, dialog);
  const after = (await state(page)).evidence!.find(
    (record) => record.id === 'demo-evidence-demo-guard',
  )!;
  expect(after.verifiedAt).toBe(before.verifiedAt);
  expect(after.verifiedBy).toBe(before.verifiedBy);
  expect(after.verificationNote).toBe(before.verificationNote);
  expect(after.verifiedContentSha256).toBe(before.verifiedContentSha256);
  expect(after.verifiedFileBindingSha256).toBe(before.verifiedFileBindingSha256);
  expect(
    (await state(page)).scenarios[0].controls.find((record) => record.id === 'demo-guard')!
      .evidenceReview,
  ).toEqual(review);
  await openRisk(page);
  await expect(currentScore(page)).toHaveText('270');
  dialog = await editProof(page);
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'fictieve-afscherming.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('Afwijkende fictieve bytes Ψ'),
  });
  await expect(dialog.getByRole('alert')).toContainText('De gekozen bytes wijken af');
  await saveProof(page, dialog);
  const negative = (await state(page)).evidence!.find(
    (record) => record.id === 'demo-evidence-demo-guard',
  )!;
  expect(negative.status).toBe('verified');
  expect(negative.verifiedAt).toBe(before.verifiedAt);
  expect(negative.file).toEqual(before.file);
  expect(negative.verifiedFileBindingSha256).toBe(before.verifiedFileBindingSha256);
  expect(negative.fileCheck!.state).toBe('mismatch');
  expect(
    (await state(page)).scenarios[0].controls.find((record) => record.id === 'demo-guard')!
      .evidenceReview,
  ).toEqual(review);
  await openRisk(page);
  await expect(currentScore(page)).toHaveText('540');
  await page.reload();
  await openRisk(page);
  await expect(currentScore(page)).toHaveText('540');
  dialog = await editProof(page);
  await dialog.getByRole('button', { name: 'Lokale bytes controleren', exact: true }).click();
  await expect(dialog).toContainText('Controle bruikbaar in deze sessie');
  await saveProof(page, dialog);
  expect(
    (await state(page)).evidence!.find((record) => record.id === 'demo-evidence-demo-guard')!
      .verifiedAt,
  ).toBe(before.verifiedAt);
  await openRisk(page);
  await expect(currentScore(page)).toHaveText('270');
});
