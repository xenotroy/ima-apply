import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createWorkspace, type WorkspaceRecord, type WorkspaceState } from '../src/data/model';
import { exportWorkspace } from '../src/data/validation';
import type { Question } from '../src/content/catalog';
import type { ModulePlan } from '../src/data/module-plan';
import type { PiRouterBindings } from '../src/data/pi-router';

const workspaceKey = 'ima-apply.workspace.v1';
const organisationName = 'Fictieve bronprocesorganisatie';
const departmentOne = 'Fictieve afdeling Noord';
const departmentTwo = 'Fictieve afdeling Zuid';
const buildingProcess = '2.3AE Gebouw - Noodvoorzieningen';
const machineProcess = '3.3LK Arbeidsmiddelen';
const alarmAspect = '2.3AE.01 Alarmeren';
const escapeAspect = '2.3AE.02 Evacueren';
const machineAspect = '3.3LK.01 Afschermen';
const bankSourceId = 'fictieve-bronprocessen-snapshot';
const duplicateCode = '2.3AE.01-01';

const fiction = [
  {
    id: 'fictief-occurrence-01',
    code: duplicateCode,
    process: buildingProcess,
    aspect: alarmAspect,
    prompt: 'Welke alarmbron waarschuwt medewerkers in deze fictieve noodsituatie?',
  },
  {
    id: 'fictief-occurrence-02',
    code: duplicateCode,
    process: buildingProcess,
    aspect: alarmAspect,
    prompt: 'Wat gebeurt er bij uitval van het alarm in deze fictieve noodsituatie?',
  },
  {
    id: 'fictief-occurrence-03',
    code: '2.3AE.02-01',
    process: buildingProcess,
    aspect: escapeAspect,
    prompt: 'Hoe wordt de fictieve vluchtdeur ontgrendeld bij rook?',
  },
  {
    id: 'fictief-occurrence-04',
    code: '2.3AE.02-02',
    process: buildingProcess,
    aspect: escapeAspect,
    prompt: 'Wie controleert dat de fictieve vluchtroute vrij blijft?',
  },
  {
    id: 'fictief-occurrence-05',
    code: '3.3LK.01-01',
    process: machineProcess,
    aspect: machineAspect,
    prompt: 'Welke vaste afscherming voorkomt toegang tot de fictieve machineknelzone?',
  },
  {
    id: 'fictief-occurrence-06',
    code: '3.3LK.01-02',
    process: machineProcess,
    aspect: machineAspect,
    prompt: 'Hoe wordt de fictieve machine veiliggesteld voor onderhoud?',
  },
];

function fixture(): WorkspaceState {
  const sourceSha256 = createHash('sha256').update(JSON.stringify(fiction)).digest('hex');
  const questions: Question[] = fiction.map((question) => ({
    id: question.id,
    themeId: 'fictief-afgeleid-thema',
    title: question.code,
    prompt: question.prompt,
    route: 'kern',
    evidenceHints: ['Uitsluitend fictief browserbewijs'],
    assessmentGuidance:
      'Zelfgeschreven fictieve vraag voor de acceptatieproef; geen feitelijke PI-bevinding.',
    sourceIds: [bankSourceId],
    suggestedHierarchy: ['collective'],
    roles: ['fictieve medewerker'],
  }));
  const bindings: PiRouterBindings = {
    id: 'fictieve-bronbindings-v1',
    schema: 'ima.pi-router-bindings/v1',
    sourceIds: [bankSourceId],
    sourceSha256,
    bankDate: '2026-10-12',
    status: 'proposal',
    coverage: 'full_source',
    originalQuestionCount: 6,
    questions: fiction.map((question, index) => ({
      questionId: question.id,
      key: `FICTIEF-${String(index + 1).padStart(3, '0')}`,
      code: question.code,
      aspect: question.aspect,
      process: question.process,
      sourceId: bankSourceId,
      page: index + 1,
      topicIds: [question.process === buildingProcess ? 'fire' : 'equipment'],
      mappingStatus: 'candidate',
      researchLevel: 'local',
    })),
  };
  return createWorkspace('Fictieve bronproces- en afdelingsproef', {
    questions: questions as unknown as WorkspaceRecord[],
    sources: [
      {
        id: bankSourceId,
        title: 'Zelfgemaakte fictieve bronmomentopname met zes vragen',
        kind: 'questionnaire',
        status: 'read',
        publication: 'private',
        readScope:
          'Zes zelfgeschreven fictieve vraagvoorkomens; geen oorspronkelijke PI Vught-vraagtekst.',
        notes: 'De SHA-256 hoort uitsluitend bij de canonieke fictieve JSON-vragen in deze test.',
        sourceSha256,
      },
    ],
    organisations: [
      { id: 'fictief-org', name: organisationName, description: 'Fictieve acceptatieproef' },
    ],
    departments: [
      {
        id: 'fictief-noord',
        organisationId: 'fictief-org',
        name: departmentOne,
        activity: 'Fictieve alarm- en vluchtactiviteiten',
      },
      {
        id: 'fictief-zuid',
        organisationId: 'fictief-org',
        name: departmentTwo,
        activity: 'Fictieve machinewerkzaamheden',
      },
    ],
    contentRecords: [bindings as unknown as WorkspaceRecord],
  });
}

async function state(page: Page): Promise<WorkspaceState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workspace, workspaceKey);
}

async function importJson(page: Page, raw: string, name = 'fictieve-bronprocessen.json') {
  if (page.url() === 'about:blank') await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  await page
    .locator('input[type=file]')
    .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(raw) });
  const dialog = page.getByRole('dialog', { name: 'Werkruimte importeren', exact: true });
  await dialog.getByRole('button', { name: 'Import openen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const expectedId = JSON.parse(raw).id;
  await expect.poll(async () => (await state(page)).id).toBe(expectedId);
}

function chosenIds(plan: ModulePlan) {
  return [
    ...new Set(
      plan.modules
        .filter((module) => module.enabled)
        .flatMap((module) =>
          module.questionIds.filter((id) => !module.excludedQuestionIds?.includes(id)),
        ),
    ),
  ];
}

async function downloadText(page: Page, buttonName: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  return readFile((await (await pending).path())!, 'utf8');
}

async function exportedJson(page: Page): Promise<WorkspaceState> {
  await page.getByRole('button', { name: 'Werkruimte & synchronisatie', exact: true }).click();
  return JSON.parse(await downloadText(page, 'Werkruimte exporteren'));
}

async function markdown(page: Page) {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  return downloadText(page, 'Markdown');
}

async function openRieporter(page: Page) {
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'RIEporter & afdelingen', exact: true })
    .click();
}

function moduleCheckbox(scope: Page | Locator, title: string) {
  return scope.getByRole('checkbox', { name: `Module kiezen: ${title}`, exact: true });
}

function questionCheckbox(scope: Page | Locator, id: string) {
  return scope.getByRole('checkbox', { name: new RegExp(`^Vraag kiezen: ${id} `) });
}

async function expandProcess(scope: Page | Locator, title: string) {
  const button = scope.getByRole('button', { name: `Vragen bekijken: ${title}`, exact: true });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

async function expandAspect(scope: Page | Locator, title: string) {
  const summary = scope.getByLabel(`Aspect bekijken: ${title}`, { exact: true });
  const open = await summary.evaluate(
    (node) => (node.closest('details') as HTMLDetailsElement)?.open,
  );
  if (!open) await summary.click();
}

async function openDetails(details: Locator) {
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await details.locator('summary').first().click();
}

async function departmentTree(page: Page, name: string) {
  const department = page
    .locator('.rie-tree-department')
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(department).toHaveCount(1);
  await openDetails(department);
  return department;
}

async function planTree(page: Page, departmentName: string, title: string) {
  const department = await departmentTree(page, departmentName);
  const plan = department
    .locator('.rie-tree-plan')
    .filter({ has: page.getByText(title, { exact: true }) });
  await expect(plan).toHaveCount(1);
  await openDetails(plan);
  return plan;
}

async function saveCurrentDepartmentPlan(page: Page, title: string) {
  const dialog = page.getByRole('dialog', { name: 'Moduleplan vastleggen', exact: true });
  if (!(await dialog.isVisible()))
    await page.getByRole('button', { name: 'Keuze vastleggen', exact: true }).click();
  await dialog.getByLabel('Plantitel', { exact: true }).fill(title);
  await dialog.getByRole('button', { name: 'Moduleplan opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await state(page)).modulePlans?.find((plan) => plan.title === title))
    .toBeTruthy();
}

test('private source processes and occurrences remain separate across two real department plans, frozen dossier and exports', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const original = fixture();
  await importJson(page, exportWorkspace(original));
  await page.goto('/#rieporter');
  await expect(
    page.getByRole('heading', { name: 'Van afdeling naar bronvragen.', exact: true }),
  ).toBeVisible();
  const bank = page.getByRole('region', { name: 'RIEporter-bronbank', exact: true });
  await expect(bank).toBeVisible();
  await expect(bank).toContainText('2 procesblokken · 3 aspecten · 6 vraagdefinities');
  await expect(page.getByRole('checkbox', { name: /^Module kiezen:/ })).toHaveCount(2);
  await page
    .getByRole('combobox', { name: 'Afdeling voor deze keuze', exact: true })
    .selectOption('fictief-noord');
  await page
    .getByRole('combobox', { name: 'Onderzoekslaag RIEporter', exact: true })
    .selectOption('local');
  await page
    .getByRole('checkbox', {
      name: 'Porterprofiel: Brandrespons, ontgrendeling of evacuatie',
      exact: true,
    })
    .check();
  await expect(moduleCheckbox(page, buildingProcess)).not.toBeChecked();
  await expect(moduleCheckbox(page, machineProcess)).not.toBeChecked();
  await page.getByRole('button', { name: 'Routervoorstel toevoegen', exact: true }).click();
  await expect(moduleCheckbox(page, buildingProcess)).toBeChecked();
  await expect(moduleCheckbox(page, machineProcess)).not.toBeChecked();
  await expandProcess(page, buildingProcess);
  await expandAspect(page, alarmAspect);
  await expandAspect(page, escapeAspect);
  await expect(questionCheckbox(page, 'fictief-occurrence-01')).toBeChecked();
  await expect(questionCheckbox(page, 'fictief-occurrence-02')).toBeChecked();
  await expect(
    page.getByRole('checkbox', {
      name: `Vraag kiezen: fictief-occurrence-01 ${duplicateCode}`,
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', {
      name: `Vraag kiezen: fictief-occurrence-02 ${duplicateCode}`,
      exact: true,
    }),
  ).toBeChecked();
  const firstQuestion = page
    .locator('.mse-question')
    .filter({ has: questionCheckbox(page, 'fictief-occurrence-01') });
  await firstQuestion.locator('summary').click();
  await expect(firstQuestion).toContainText(fiction[0].prompt);
  await expect(firstQuestion).toContainText('FICTIEF-001');
  await expect(firstQuestion).toContainText(bankSourceId);
  await questionCheckbox(page, 'fictief-occurrence-02').uncheck();
  await page.getByRole('button', { name: 'Routervoorstel toevoegen', exact: true }).click();
  await expect(questionCheckbox(page, 'fictief-occurrence-02')).not.toBeChecked();
  await saveCurrentDepartmentPlan(page, 'Fictieve Noordselectie Ω');
  const north = (await state(page)).modulePlans!.find(
    (plan) => plan.title === 'Fictieve Noordselectie Ω',
  )!;
  expect(north.scope).toBe('department');
  expect(north.departmentId).toBe('fictief-noord');
  expect(north.organisationId).toBe('fictief-org');
  expect(chosenIds(north)).toEqual([
    'fictief-occurrence-01',
    'fictief-occurrence-03',
    'fictief-occurrence-04',
  ]);
  expect(north.modules.flatMap((module) => module.questionIds)).toContain('fictief-occurrence-02');
  const northTree = await planTree(page, departmentOne, north.title);
  const northModule = northTree.locator('.rie-tree-module').first();
  await openDetails(northModule);
  await expect(northModule.locator('.rie-tree-question')).toHaveCount(3);
  await expect(northModule.getByText('fictief-occurrence-02', { exact: true })).toHaveCount(0);
  const treeQuestion = northModule
    .locator('.rie-tree-question')
    .filter({ has: page.getByText('fictief-occurrence-01', { exact: true }) });
  await openDetails(treeQuestion);
  await expect(treeQuestion).toContainText(fiction[0].prompt);
  await northTree
    .getByRole('button', { name: 'Dossier uit moduleplan: Fictieve Noordselectie Ω', exact: true })
    .click();
  const dossierDialog = page.getByRole('dialog', { name: 'Dossier uit moduleplan', exact: true });
  await dossierDialog
    .getByLabel('Dossiertitel', { exact: true })
    .fill('Fictief bevroren Noorddossier Ω');
  await dossierDialog
    .getByLabel('Afgebakende scope', { exact: true })
    .fill('Uitsluitend de expliciet geselecteerde Noordvragen in deze fictieve proef.');
  await dossierDialog
    .getByLabel('Beoordelaar', { exact: true })
    .fill('Fictieve bronprocesbeoordelaar');
  await dossierDialog
    .getByRole('button', { name: 'Dossier met bevroren modulekeuze aanmaken', exact: true })
    .click();
  await expect.poll(async () => (await state(page)).dossiers?.length).toBe(1);
  const frozen = (await state(page)).dossiers![0];
  expect(frozen.departmentIds).toEqual(['fictief-noord']);
  expect(frozen.questions.map((question) => question.id)).toEqual(chosenIds(north));
  await openRieporter(page);
  const southTree = await departmentTree(page, departmentTwo);
  await southTree
    .getByRole('button', { name: `Afdelingskeuze maken: ${departmentTwo}`, exact: true })
    .click();
  await expect(moduleCheckbox(page, buildingProcess)).not.toBeChecked();
  await expect(moduleCheckbox(page, machineProcess)).not.toBeChecked();
  await moduleCheckbox(page, machineProcess).check();
  await expandProcess(page, machineProcess);
  await expandAspect(page, machineAspect);
  await questionCheckbox(page, 'fictief-occurrence-06').uncheck();
  await saveCurrentDepartmentPlan(page, 'Fictieve Zuidselectie Ω');
  const south = (await state(page)).modulePlans!.find(
    (plan) => plan.title === 'Fictieve Zuidselectie Ω',
  )!;
  expect(south.departmentId).toBe('fictief-zuid');
  expect(chosenIds(south)).toEqual(['fictief-occurrence-05']);
  expect((await state(page)).modulePlans!.find((plan) => plan.id === north.id)).toEqual(north);
  const updatedNorthTree = await planTree(page, departmentOne, north.title);
  await updatedNorthTree
    .getByRole('button', { name: 'Aanpassen: Fictieve Noordselectie Ω', exact: true })
    .click();
  const edit = page.getByRole('dialog', { name: 'Moduleplan vastleggen', exact: true });
  await expandProcess(edit, buildingProcess);
  await expandAspect(edit, alarmAspect);
  await expect(questionCheckbox(edit, 'fictief-occurrence-02')).not.toBeChecked();
  await questionCheckbox(edit, 'fictief-occurrence-01').uncheck();
  // Editing a source plan must expose the other source processes, not only its old selection.
  await moduleCheckbox(edit, machineProcess).check();
  await edit.getByRole('button', { name: 'Moduleplan opslaan', exact: true }).click();
  await expect
    .poll(
      async () => (await state(page)).modulePlans!.find((plan) => plan.id === north.id)?.revision,
    )
    .toBe(north.revision + 1);
  expect(chosenIds((await state(page)).modulePlans!.find((plan) => plan.id === north.id)!)).toEqual(
    [
      'fictief-occurrence-03',
      'fictief-occurrence-04',
      'fictief-occurrence-05',
      'fictief-occurrence-06',
    ],
  );
  expect((await state(page)).dossiers![0]).toEqual(frozen);
  expect((await state(page)).modulePlans!.find((plan) => plan.id === south.id)).toEqual(south);
  await page.reload();
  expect((await state(page)).dossiers![0]).toEqual(frozen);
  const reloadedNorth = await planTree(page, departmentOne, north.title);
  const reloadedSouth = await planTree(page, departmentTwo, south.title);
  await expect(
    reloadedNorth.getByRole('button', { name: `Aanpassen: ${north.title}`, exact: true }),
  ).toBeVisible();
  await expect(
    reloadedSouth.getByRole('button', { name: `Aanpassen: ${south.title}`, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('fictieve-afdelingsboom.png'),
    fullPage: true,
  });
  const report = await markdown(page);
  expect(report).toContain('Fictieve Noordselectie Ω');
  expect(report).toContain('Fictieve Zuidselectie Ω');
  expect(report).toContain(frozen.modulePlanSnapshotSha256);
  expect(report).toContain('fictief-occurrence-02');
  const exported = await exportedJson(page);
  expect(exported.modulePlans).toEqual((await state(page)).modulePlans);
  expect(exported.dossiers![0]).toEqual(frozen);
  expect(exported.questions).toEqual(original.questions);
  expect(exported.contentRecords).toEqual(original.contentRecords);
  const second = await browser.newContext({ acceptDownloads: true });
  try {
    const restored = await second.newPage();
    await restored.goto(baseURL!);
    await importJson(restored, JSON.stringify(exported), 'fictieve-afdelingskeuzes-herstel.json');
    await openRieporter(restored);
    expect((await state(restored)).modulePlans).toEqual(exported.modulePlans);
    expect((await state(restored)).dossiers![0]).toEqual(frozen);
    const importedSouth = await planTree(restored, departmentTwo, south.title);
    await expect(
      importedSouth.getByRole('button', { name: `Aanpassen: ${south.title}`, exact: true }),
    ).toBeVisible();
    await importedSouth
      .getByRole('button', { name: 'Aanpassen: Fictieve Zuidselectie Ω', exact: true })
      .click();
    const restoredDialog = restored.getByRole('dialog', {
      name: 'Moduleplan vastleggen',
      exact: true,
    });
    await expandProcess(restoredDialog, machineProcess);
    await expandAspect(restoredDialog, machineAspect);
    await expect(questionCheckbox(restoredDialog, 'fictief-occurrence-05')).toBeChecked();
    await expect(questionCheckbox(restoredDialog, 'fictief-occurrence-06')).not.toBeChecked();
  } finally {
    await second.close();
  }
});

test('an empty source bank links to real settings and department creation without inventing an organisation', async ({
  page,
}) => {
  const empty = createWorkspace('Fictieve lege bronwerkruimte');
  await importJson(page, exportWorkspace(empty));
  await openRieporter(page);
  expect((await state(page)).organisations).toEqual([]);
  expect((await state(page)).departments).toEqual([]);
  await page.getByRole('button', { name: 'Bronbank openen', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Werkruimte exporteren', exact: true }),
  ).toBeVisible();
  expect((await state(page)).organisations).toEqual([]);
  await openRieporter(page);
  await page.getByRole('button', { name: 'Afdeling toevoegen', exact: true }).click();
  const organisationDialog = page.getByRole('dialog', {
    name: 'Organisatie toevoegen',
    exact: true,
  });
  await expect(organisationDialog).toBeVisible();
  expect((await state(page)).organisations).toEqual([]);
  await organisationDialog.getByLabel('Naam', { exact: true }).fill(organisationName);
  await organisationDialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).organisations?.length).toBe(1);
  await openRieporter(page);
  await page.getByRole('button', { name: 'Afdeling toevoegen', exact: true }).click();
  const departmentDialog = page.getByRole('dialog', { name: 'Afdeling toevoegen', exact: true });
  await expect(departmentDialog).toBeVisible();
  await departmentDialog
    .getByLabel('Naam', { exact: true })
    .fill('Fictieve expliciet toegevoegde afdeling');
  await departmentDialog
    .getByRole('combobox', { name: 'Locatie of organisatie', exact: true })
    .selectOption({ label: `${organisationName} · locatie niet vastgelegd` });
  await departmentDialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).departments?.length).toBe(1);
  const current = await state(page);
  expect(current.organisations![0].name).toBe(organisationName);
  expect(current.departments![0].name).toBe('Fictieve expliciet toegevoegde afdeling');
  expect(current.departments![0].organisationId).toBe(current.organisations![0].id);
  expect(current.modulePlans).toEqual([]);
  expect(current.dossiers).toEqual([]);
  expect(current.contentRecords).toEqual([]);
});

test('opt-in original private snapshot exposes all 46 processes, 189 aspects and 1300 distinct occurrences', async ({
  page,
}) => {
  const privatePath = process.env.IMA_PRIVATE_PI_BANK;
  test.skip(
    !privatePath,
    'Private source bank is only read when its local path is explicitly supplied.',
  );
  const raw = await readFile(privatePath!, 'utf8');
  const original = JSON.parse(raw) as WorkspaceState;
  expect(
    original.questions.filter((question) => String(question.id).startsWith('pi-oe14-')),
  ).toHaveLength(1300);
  await importJson(page, raw, 'private-bronmomentopname.json');
  await openRieporter(page);
  await expect(page.getByRole('region', { name: 'RIEporter-bronbank', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Module kiezen:/ })).toHaveCount(46);
  const bank = page.getByRole('region', { name: 'RIEporter-bronbank', exact: true });
  await expect(bank).toContainText(/\b189\s*aspect/i);
  await expect(bank).toContainText(/\b1300\b/);
  expect((await state(page)).questions).toEqual(original.questions);
  expect((await state(page)).contentRecords).toEqual(original.contentRecords);
  expect((await state(page)).departments).toEqual([]);
  expect((await state(page)).modulePlans).toEqual([]);
});
