import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { WorkspaceState } from '../src/data/model';
import type { ModulePlan } from '../src/data/module-plan';

const workspaceKey = 'ima-apply.workspace.v1';
const organisationName = 'Fictieve modulekeuzeorganisatie';

async function state(page: Page): Promise<WorkspaceState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workspace, workspaceKey);
}

function chosenIds(plan: ModulePlan): string[] {
  return [
    ...new Set(
      plan.modules
        .filter((module) => module.enabled)
        .flatMap((module) => {
          const exclusions =
            (module as typeof module & { excludedQuestionIds?: string[] }).excludedQuestionIds ??
            [];
          return module.questionIds.filter((id) => !exclusions.includes(id));
        }),
    ),
  ];
}

const organisationModule = 'Organisatie, taken en RI&E';
const organisationIds = [
  'organisatie-01',
  'organisatie-02',
  'organisatie-03',
  'organisatie-04',
  'organisatie-05',
  'organisatie-06',
];

function moduleCheckbox(scope: Page | Locator, title: string) {
  return scope.getByRole('checkbox', { name: `Module kiezen: ${title}`, exact: true });
}

function questionCheckbox(scope: Page | Locator, id: string) {
  return scope.getByRole('checkbox', { name: new RegExp(`^Vraag kiezen: ${id} `) });
}

async function expandModule(scope: Page | Locator, title: string) {
  const toggle = scope.getByRole('button', { name: `Vragen bekijken: ${title}`, exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

function selectionSummary(scope: Page | Locator) {
  return scope.getByRole('status').filter({ hasText: /\d+ vragen geselecteerd/ });
}

async function drafts(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('ima-apply.draft.v1.'))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
      .filter((draft) => draft.key.includes('/module-plan/new')),
  );
}

async function openNewPlan(page: Page) {
  await page.getByRole('button', { name: 'Modulekeuze', exact: true }).click();
  await page.getByRole('button', { name: 'Moduleplan', exact: true }).click();
  return page.getByRole('dialog', { name: 'Moduleplan vastleggen', exact: true });
}

async function downloadText(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  return readFile((await (await pending).path())!, 'utf8');
}

async function exportedJson(page: Page): Promise<WorkspaceState> {
  await page.getByRole('button', { name: 'Werkruimte & synchronisatie', exact: true }).click();
  return JSON.parse(await downloadText(page, 'Werkruimte exporteren'));
}

async function exportedMarkdown(page: Page) {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  return downloadText(page, 'Markdown');
}

async function savePlan(page: Page, dialog: Locator, title: string) {
  await dialog.getByLabel('Plantitel', { exact: true }).fill(title);
  await dialog
    .getByRole('combobox', { name: 'Organisatie', exact: true })
    .selectOption({ label: organisationName });
  await dialog.getByRole('button', { name: 'Moduleplan opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await state(page)).modulePlans?.find((plan) => plan.title === title))
    .toBeTruthy();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  // Only a fictitious organisation is seeded; all choices, saving and freezing use the real UI.
  await page.evaluate(
    ({ key, name }) => {
      const envelope = JSON.parse(localStorage.getItem(key)!);
      envelope.workspace.organisations = [
        { id: 'module-selection-org', name, description: 'E2E fixture' },
      ];
      localStorage.setItem(key, JSON.stringify(envelope));
    },
    { key: workspaceKey, name: organisationName },
  );
  await page.reload();
});

test('top-level module choice exposes real questions and matching without making choices', async ({
  page,
}, testInfo) => {
  await page.goto('/#modules');
  await expect(page.getByRole('button', { name: 'Modulekeuze', exact: true })).toBeVisible();
  await expect(moduleCheckbox(page, organisationModule)).not.toBeChecked();
  await expect(selectionSummary(page)).toContainText('0 vragen geselecteerd');
  await expandModule(page, organisationModule);
  await expect(questionCheckbox(page, 'organisatie-01')).not.toBeChecked();
  await page
    .locator('.mse-question')
    .filter({ has: questionCheckbox(page, 'organisatie-01') })
    .locator('summary')
    .click();
  await expect(
    page.getByText(
      'Welke taken, locaties, diensten en afwijkende werkzaamheden vallen binnen deze inventarisatie?',
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Zoek modules en vragen', exact: true })
    .fill('brand-01');
  await expect(moduleCheckbox(page, organisationModule)).toHaveCount(0);
  await expandModule(page, 'Brand, BHV en evacuatie');
  await expect(questionCheckbox(page, 'brand-01')).toBeVisible();
  await expect(questionCheckbox(page, 'brand-01')).not.toBeChecked();
  await expect(selectionSummary(page)).toContainText('0 vragen geselecteerd');
  expect((await state(page)).modulePlans ?? []).toEqual([]);
  expect((await state(page)).answers).toEqual([]);
  // Selecting a single question from an inactive theme must not select its siblings.
  await questionCheckbox(page, 'brand-01').check();
  await expect(selectionSummary(page)).toContainText('1 vragen geselecteerd');
  await page.getByRole('searchbox', { name: 'Zoek modules en vragen', exact: true }).fill('');
  await page.getByRole('button', { name: 'Mindmapweergave', exact: true }).click();
  await page
    .getByRole('button', { name: 'Module in mindmap: Brand, BHV en evacuatie', exact: true })
    .click();
  await expect(questionCheckbox(page, 'brand-01')).toBeChecked();
  await expect(questionCheckbox(page, 'brand-02')).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('module-choice-mindmap.png'), fullPage: true });
  await page.getByRole('button', { name: 'Boomweergave', exact: true }).click();
  await page.getByRole('button', { name: 'Moduleplan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Moduleplan vastleggen', exact: true });
  await dialog.getByRole('searchbox', { name: 'Zoek modules en vragen', exact: true }).fill('');
  await expandModule(dialog, 'Brand, BHV en evacuatie');
  await expect(questionCheckbox(dialog, 'brand-01')).toBeChecked();
  await expect(questionCheckbox(dialog, 'brand-02')).not.toBeChecked();
  await expect(selectionSummary(dialog)).toContainText('1 vragen geselecteerd');
});

test('individual exclusions remain exact in saved plan, dossier, reload and both real exports', async ({
  page,
  browser,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const dialog = await openNewPlan(page);
  await moduleCheckbox(dialog, organisationModule).check();
  await expandModule(dialog, organisationModule);
  await questionCheckbox(dialog, 'organisatie-02').uncheck();
  await expect(selectionSummary(dialog)).toContainText('5 vragen geselecteerd');
  await dialog
    .getByLabel(`Scopenotities ${organisationModule}`, { exact: true })
    .fill('Uitsluitend de expliciet gekozen vijf vragen Ω');
  await savePlan(page, dialog, 'Exacte individuele keuze Ω');
  const expectedIds = organisationIds.filter((id) => id !== 'organisatie-02');
  const plan = (await state(page)).modulePlans!.find(
    (item) => item.title === 'Exacte individuele keuze Ω',
  )!;
  expect(chosenIds(plan)).toEqual(expectedIds);
  await page
    .getByRole('button', {
      name: 'Dossier uit moduleplan: Exacte individuele keuze Ω',
      exact: true,
    })
    .click();
  const dossierDialog = page.getByRole('dialog', { name: 'Dossier uit moduleplan', exact: true });
  await dossierDialog
    .getByLabel('Dossiertitel', { exact: true })
    .fill('Exact bevroren vragenset Ω');
  await dossierDialog
    .getByLabel('Afgebakende scope', { exact: true })
    .fill('Fictieve projectscope voor de gekozen organisatievragen.');
  await dossierDialog.getByLabel('Beoordelaar', { exact: true }).fill('Fictieve E2E-beoordelaar');
  await dossierDialog
    .getByRole('button', { name: 'Dossier met bevroren modulekeuze aanmaken', exact: true })
    .click();
  await expect(dossierDialog).toHaveCount(0);
  await expect.poll(async () => (await state(page)).dossiers?.length).toBe(1);
  const frozen = (await state(page)).dossiers![0];
  expect(frozen.questions.map((question) => question.id)).toEqual(expectedIds);
  expect(chosenIds(frozen.modulePlanSnapshot!)).toEqual(expectedIds);
  expect((await state(page)).answers).toEqual([]);
  await page.getByRole('button', { name: 'Modulekeuze', exact: true }).click();
  await page
    .getByRole('button', { name: 'Moduleplan bewerken: Exacte individuele keuze Ω', exact: true })
    .click();
  const edit = page.getByRole('dialog', { name: 'Moduleplan vastleggen', exact: true });
  await expandModule(edit, organisationModule);
  await expect(questionCheckbox(edit, 'organisatie-02')).not.toBeChecked();
  await questionCheckbox(edit, 'organisatie-01').uncheck();
  await edit.getByRole('button', { name: 'Moduleplan opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).modulePlans![0].revision).toBe(1);
  expect(chosenIds((await state(page)).modulePlans![0])).toEqual(
    expectedIds.filter((id) => id !== 'organisatie-01'),
  );
  expect((await state(page)).dossiers![0]).toEqual(frozen);
  await page.reload();
  expect((await state(page)).dossiers![0]).toEqual(frozen);
  const markdown = await exportedMarkdown(page);
  expect(markdown).toContain('Bevroren modulekeuze — Exact bevroren vragenset Ω');
  expect(markdown).toContain(frozen.modulePlanSnapshotSha256);
  expect(markdown).toContain('Uitsluitend de expliciet gekozen vijf vragen Ω');
  for (const id of expectedIds) expect(markdown).toContain(id);
  expect(markdown).toContain('organisatie-02'); // The explicitly excluded original ID remains traceable.
  const exported = await exportedJson(page);
  expect(exported.dossiers![0]).toEqual(frozen);
  expect(exported.modulePlans).toEqual((await state(page)).modulePlans);
  const second = await browser.newContext({ acceptDownloads: true });
  try {
    const restoredPage = await second.newPage();
    await restoredPage.goto(baseURL!);
    await expect.poll(async () => Boolean((await state(restoredPage))?.id)).toBe(true);
    await restoredPage.locator('input[type=file]').setInputFiles({
      name: 'fictieve-modulekeuze.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await restoredPage
      .getByRole('dialog', { name: 'Werkruimte importeren', exact: true })
      .getByRole('button', { name: 'Import openen', exact: true })
      .click();
    await expect.poll(async () => (await state(restoredPage)).dossiers?.[0]?.id).toBe(frozen.id);
    expect((await state(restoredPage)).dossiers![0]).toEqual(frozen);
    await restoredPage.getByRole('button', { name: 'Modulekeuze', exact: true }).click();
    await restoredPage
      .getByRole('button', { name: 'Moduleplan bewerken: Exacte individuele keuze Ω', exact: true })
      .click();
    const restoredDialog = restoredPage.getByRole('dialog', {
      name: 'Moduleplan vastleggen',
      exact: true,
    });
    await expandModule(restoredDialog, organisationModule);
    await expect(questionCheckbox(restoredDialog, 'organisatie-01')).not.toBeChecked();
    await expect(questionCheckbox(restoredDialog, 'organisatie-02')).not.toBeChecked();
    await expect(questionCheckbox(restoredDialog, 'organisatie-03')).toBeChecked();
  } finally {
    await second.close();
  }
  expect(errors).toEqual([]);
});

test('hazard advice is explicit and recovered concepts keep profiles and individually excluded questions', async ({
  page,
}) => {
  const dialog = await openNewPlan(page);
  await dialog.getByLabel('Plantitel', { exact: true }).fill('Herstelbare profielkeuze Ω');
  await moduleCheckbox(dialog, organisationModule).check();
  await expandModule(dialog, organisationModule);
  await questionCheckbox(dialog, 'organisatie-02').uncheck();
  const chemical = dialog.getByRole('checkbox', {
    name: 'Gevaarprofiel: Gevaarlijke stoffen',
    exact: true,
  });
  await chemical.check();
  await expect(moduleCheckbox(dialog, 'Gevaarlijke stoffen en blootstelling')).not.toBeChecked();
  await expect(selectionSummary(dialog)).toContainText('5 vragen geselecteerd');
  const before = (await drafts(page)).find(
    (draft) => draft.value.title === 'Herstelbare profielkeuze Ω',
  );
  expect(before).toBeTruthy();
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  const draftMarkdown = await exportedMarkdown(page);
  expect(draftMarkdown).toContain('Herstelbare profielkeuze Ω');
  expect(draftMarkdown).toContain('chemical');
  expect(draftMarkdown).toContain('organisatie-02');
  await page.reload();
  const restored = await openNewPlan(page);
  await expect(restored.getByLabel('Plantitel', { exact: true })).toHaveValue(
    'Herstelbare profielkeuze Ω',
  );
  await expect(
    restored.getByRole('checkbox', { name: 'Gevaarprofiel: Gevaarlijke stoffen', exact: true }),
  ).toBeChecked();
  await expandModule(restored, organisationModule);
  await expect(questionCheckbox(restored, 'organisatie-02')).not.toBeChecked();
  await expect(selectionSummary(restored)).toContainText('5 vragen geselecteerd');
  await restored.getByRole('button', { name: 'Aanbevolen modules toevoegen', exact: true }).click();
  await expect(moduleCheckbox(restored, 'Gevaarlijke stoffen en blootstelling')).toBeChecked();
  await expect(questionCheckbox(restored, 'organisatie-02')).not.toBeChecked();
  await restored.getByRole('button', { name: 'Aanbevolen modules toevoegen', exact: true }).click();
  await expect(questionCheckbox(restored, 'organisatie-02')).not.toBeChecked();
  await savePlan(page, restored, 'Herstelbare profielkeuze Ω');
  const selected = chosenIds((await state(page)).modulePlans![0]);
  expect(selected).not.toContain('organisatie-02');
  expect(selected.filter((id) => id.startsWith('stoffen-'))).toEqual([
    'stoffen-01',
    'stoffen-02',
    'stoffen-03',
    'stoffen-04',
    'stoffen-05',
  ]);
  expect((await state(page)).answers).toEqual([]);
  expect((await state(page)).dossiers).toEqual([]);
});
