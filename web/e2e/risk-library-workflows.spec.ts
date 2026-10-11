import { expect, test, type Page } from '@playwright/test';
import { createWorkspace } from '../src/data/model';
import { sealRiskLibrary } from '../src/data/risk-library';
import { exportWorkspace, importWorkspace } from '../src/data/validation';

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
function fixture() {
  const node = (id: string, title: string) => ({
    id,
    code: id,
    title,
    description: `${title}, fictieve testinhoud.`,
    sortOrder: 1,
    sourceIds: [] as string[],
  });
  const library = sealRiskLibrary({
    id: 'library-test-v1',
    libraryId: 'library-test',
    version: '1.0.0',
    title: 'Fictieve herbruikbare bibliotheek',
    origin: 'native',
    sourceIds: [],
    modules: [node('module-1', 'Fictieve module')],
    hazards: [{ ...node('hazard-1', 'Fictief gevaar'), moduleId: 'module-1' }],
    risks: [{ ...node('risk-1', 'Fictief risico'), hazardId: 'hazard-1', effectRating: 3 }],
    factors: [
      {
        ...node('factor-1', 'Fictieve factor één'),
        riskId: 'risk-1',
        lodDescription: 'Eigen factor één grond.',
        defaultLikelihoodRating: 2,
      },
      {
        ...node('factor-2', 'Fictieve factor twee'),
        riskId: 'risk-1',
        lodDescription: 'Eigen factor twee grond.',
        defaultLikelihoodRating: 1,
      },
    ],
    controls: [{ ...node('control-1', 'Gedeelde fictieve maatregel'), type: 'technical' }],
    links: [
      {
        id: 'link-1',
        factorId: 'factor-1',
        controlId: 'control-1',
        reductionRating: 2,
        costLevel: 'medium',
        sortOrder: 1,
        sourceIds: [],
      },
      {
        id: 'link-2',
        factorId: 'factor-2',
        controlId: 'control-1',
        reductionRating: 1,
        costLevel: 'high',
        sortOrder: 2,
        sourceIds: [],
      },
    ],
    questions: [
      {
        id: 'question-1',
        factorId: 'factor-1',
        prompt: 'Welke waarneming ondersteunt deze factor?',
        explanation: 'Fictieve eigen bewijstoelichting.',
        sortOrder: 1,
        sourceIds: [],
      },
    ],
  });
  const workspace = createWorkspace('Fictieve library-workflow', {
    organisations: [{ id: 'org-1', name: 'Fictieve organisatie', description: '' }],
    departments: [
      { id: 'department-1', organisationId: 'org-1', name: 'Afdeling één', activity: '' },
      { id: 'department-2', organisationId: 'org-1', name: 'Afdeling twee', activity: '' },
    ],
    dossiers: [
      {
        id: 'dossier-1',
        title: 'Dossier één',
        organisationId: 'org-1',
        departmentIds: ['department-1'],
        scope: 'Fictieve afdeling één.',
        assessor: 'Fictieve beoordelaar',
        status: 'draft',
        createdAt: '2026-10-11T08:00:00Z',
        questions: [],
      },
      {
        id: 'dossier-2',
        title: 'Dossier twee',
        organisationId: 'org-1',
        departmentIds: ['department-2'],
        scope: 'Fictieve afdeling twee.',
        assessor: 'Fictieve beoordelaar',
        status: 'draft',
        createdAt: '2026-10-11T08:00:00Z',
        questions: [],
      },
    ],
    riskLibraries: [library],
    riskLibraryReviews: [],
    riskLibraryLayouts: [],
  });
  importWorkspace(exportWorkspace(workspace));
  return workspace;
}
async function openLibrary(page: Page, scopeLabel = 'Dossier één · Afdeling één') {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'Risicobibliotheek', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Bibliotheekscope', exact: true })
    .selectOption({ label: scopeLabel });
}
async function factor(page: Page) {
  await page
    .getByRole('button', { name: 'Selecteer factor: Fictieve factor één', exact: true })
    .click();
}
test('shared reusable graph, persistent drafts, distinct scoped reviews, layout and fresh scenario survive reload/export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  const input = fixture();
  await page.evaluate(
    (workspace) =>
      localStorage.setItem(
        'ima-apply.workspace.v1',
        JSON.stringify({ format: 1, version: crypto.randomUUID(), workspace }),
      ),
    input,
  );
  await page.reload();
  await openLibrary(page);
  const panel = page.locator('.risk-library-workspace');
  await expect(panel).toContainText('1 gedeelde maatregelen / 2 koppelingen');
  await page
    .getByRole('combobox', { name: 'Bibliotheekmodule', exact: true })
    .selectOption('module-1');
  await factor(page);
  await expect(panel).toContainText('Fictieve eigen bewijstoelichting.');
  await page.getByRole('button', { name: 'Factorreview vastleggen', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Factorreview vastleggen', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Beoordelaar', exact: true })
    .fill('Fictieve beoordelaar A');
  await dialog
    .getByRole('textbox', { name: 'Beoordelingsgrond', exact: true })
    .fill('Eigen afdeling één: aantoonbare fictieve observatie.');
  await dialog
    .getByRole('combobox', { name: 'Lokale blootstellingsrating', exact: true })
    .selectOption('3');
  await dialog
    .getByRole('combobox', { name: 'Factorrelevantie', exact: true })
    .selectOption('relevant');
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.reload();
  await openLibrary(page);
  await factor(page);
  await page.getByRole('button', { name: 'Factorreview vastleggen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Factorreview vastleggen', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Beoordelingsgrond', exact: true })).toHaveValue(
    'Eigen afdeling één: aantoonbare fictieve observatie.',
  );
  await expect(dialog).toContainText('Concept hersteld.');
  await dialog.getByRole('button', { name: 'Lokale review opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).riskLibraryReviews.length).toBe(1);
  const firstReview = (await state(page)).riskLibraryReviews[0];
  expect(firstReview.scope.departmentId).toBe('department-1');
  expect(firstReview.exposureRating).toBe(3);
  expect(firstReview.librarySha256).toBe(input.riskLibraries![0].sha256);
  await page
    .getByRole('combobox', { name: 'Bibliotheekscope', exact: true })
    .selectOption({ label: 'Dossier twee · Afdeling twee' });
  await page.getByRole('button', { name: 'Factorreview vastleggen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Factorreview vastleggen', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Beoordelaar', exact: true })
    .fill('Fictieve beoordelaar B');
  await dialog
    .getByRole('textbox', { name: 'Beoordelingsgrond', exact: true })
    .fill('Eigen afdeling twee: andere lokale situatie.');
  await dialog
    .getByRole('combobox', { name: 'Factorrelevantie', exact: true })
    .selectOption('not_relevant');
  await dialog
    .getByRole('combobox', { name: 'Lokale waarschijnlijkheidsrating', exact: true })
    .selectOption('1');
  await dialog.getByRole('button', { name: 'Lokale review opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).riskLibraryReviews.length).toBe(2);
  expect((await state(page)).riskLibraryReviews[0]).toEqual(firstReview);
  expect((await state(page)).riskLibraryReviews[1].scope.departmentId).toBe('department-2');
  await panel
    .getByRole('button', { name: 'Gedeelde fictieve maatregel', exact: true })
    .first()
    .click();
  await expect(panel).toContainText('Alle factorrelaties van deze maatregel');
  await page.getByRole('button', { name: 'Maatregelreview vastleggen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Maatregelreview vastleggen', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Beoordelaar', exact: true })
    .fill('Fictieve beoordelaar B');
  await dialog
    .getByRole('textbox', { name: 'Beoordelingsgrond', exact: true })
    .fill('Aanwezigheid apart gemeld; geen werking bewezen.');
  await dialog.getByLabel('Maatregel lokaal aanwezig gemeld').check();
  await dialog.getByRole('button', { name: 'Lokale review opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).riskLibraryReviews.length).toBe(3);
  expect((await state(page)).riskLibraries[0]).toEqual(input.riskLibraries![0]);
  await factor(page);
  await page.getByRole('button', { name: 'Kaartpositie vastleggen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Kaartpositie vastleggen', exact: true });
  await dialog.getByLabel('Kaartpositie X', { exact: true }).fill('485.125');
  await dialog.getByLabel('Kaartpositie Y', { exact: true }).fill('225.5');
  await dialog
    .getByRole('textbox', { name: 'Vastlegger', exact: true })
    .fill('Fictieve vastlegger');
  await dialog
    .getByRole('textbox', { name: 'Positietoelichting', exact: true })
    .fill('Positie voor de eigen afdelingsscope.');
  await dialog.getByRole('button', { name: 'Kaartpositie opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).riskLibraryLayouts.length).toBe(1);
  await page
    .getByRole('button', { name: 'Nieuw Kinney-scenario vanuit factor', exact: true })
    .click();
  dialog = page.getByRole('dialog', {
    name: 'Nieuw scenario vanuit bibliotheekfactor',
    exact: true,
  });
  await expect(
    dialog.getByRole('combobox', { name: 'Nieuwe Kinney-waarschijnlijkheid', exact: true }),
  ).toHaveValue('');
  await dialog
    .getByRole('textbox', { name: 'Specifieke consequentie', exact: true })
    .fill('Fictief ernstig letsel');
  await dialog
    .getByRole('combobox', { name: 'Nieuwe Kinney-waarschijnlijkheid', exact: true })
    .selectOption('0.5');
  await dialog
    .getByRole('combobox', { name: 'Nieuwe Kinney-blootstelling', exact: true })
    .selectOption('6');
  await dialog
    .getByRole('combobox', { name: 'Nieuw Kinney-effect', exact: true })
    .selectOption('7');
  await dialog
    .getByRole('textbox', { name: 'Grond van de nieuwe risicobeoordeling', exact: true })
    .fill('Nieuwe menselijke beoordeling; oude lokale 1–3-ratings niet overgenomen.');
  await dialog.getByRole('button', { name: 'Nieuw scenario vastleggen', exact: true }).click();
  await expect.poll(async () => (await state(page)).scenarios.length).toBe(1);
  const after = await state(page);
  expect(after.scenarios[0].controls).toEqual([]);
  expect(after.scenarios[0].lopa).toBeUndefined();
  expect(after.scenarios[0].probability).toBe(0.5);
  expect(after.scenarios[0].effect).toBe(7);
  expect(after.scenarios[0].dossierId).toBe('dossier-2');
  const restored = importWorkspace(exportWorkspace(after));
  expect(restored.riskLibraries).toEqual(after.riskLibraries);
  expect(restored.riskLibraryReviews).toEqual(after.riskLibraryReviews);
  expect(restored.riskLibraryLayouts).toEqual(after.riskLibraryLayouts);
  await page.reload();
  await openLibrary(page, 'Dossier twee · Afdeling twee');
  await factor(page);
  await expect(panel).toContainText('Eigen afdeling twee: andere lokale situatie.');
  expect((await state(page)).riskLibraryReviews).toEqual(after.riskLibraryReviews);
  expect((await state(page)).riskLibraryLayouts).toEqual(after.riskLibraryLayouts);
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const download = await downloadEvent,
    stream = await download.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const markdown = Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain('Herbruikbare risicobibliotheken');
  expect(markdown).toContain(firstReview.librarySha256);
  expect(markdown).toContain('Eigen afdeling één: aantoonbare fictieve observatie.');
  expect(markdown).toContain('Eigen afdeling twee: andere lokale situatie.');
  expect(markdown).toContain('x=485.125');
  expect(markdown).toContain('Fictieve eigen bewijstoelichting.');
  expect(errors).toEqual([]);
});
