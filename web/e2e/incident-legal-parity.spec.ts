import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createWorkspace, type WorkspaceState } from '../src/data/model';

const key = 'ima-apply.workspace.v1';
async function state(page: Page): Promise<WorkspaceState> {
  return page.evaluate(
    (storageKey) => JSON.parse(localStorage.getItem(storageKey)!).workspace,
    key,
  );
}
async function boot(page: Page) {
  const workspace = createWorkspace('Fictieve veldpariteit Chrome', {
    topics: [
      {
        id: 'parent',
        title: 'Fictief hoofdonderwerp Ω',
        category: '',
        description: '',
        aliases: [],
      },
    ],
    actions: [
      {
        id: 'action',
        title: 'Fictieve geraakte actie Ω',
        owner: '',
        dueDate: '',
        status: 'open',
        notes: '',
      },
    ],
    dossiers: [
      {
        id: 'dossier',
        title: 'Fictief veldendossier',
        departmentIds: [],
        scope: 'Fictieve scope',
        assessor: 'Fictieve onderzoeker',
        status: 'draft',
        createdAt: '2026-10-01T10:00:00Z',
        questions: [],
      },
    ],
  });
  await page.goto('/');
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
  await page.evaluate(
    ({ key, workspace }) => {
      const envelope = JSON.parse(localStorage.getItem(key)!);
      envelope.workspace = workspace;
      envelope.version = crypto.randomUUID();
      localStorage.setItem(key, JSON.stringify(envelope));
    },
    { key, workspace },
  );
  await page.reload();
}
async function markdown(page: Page) {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  return readFile((await (await downloaded).path())!, 'utf8');
}
test.beforeEach(async ({ page }) => boot(page));

test('incident exact source time and kind survive unsaved reload and committed report', async ({
  page,
}) => {
  const open = async () => {
    await page.getByRole('button', { name: 'Incidenten & leren', exact: true }).click();
    await page.getByRole('button', { name: 'Incident of signaal', exact: true }).click();
    return page.getByRole('dialog', { name: 'Incident of signaal vastleggen', exact: true });
  };
  let dialog = await open();
  await dialog.getByLabel('Titel', { exact: true }).fill('Fictief milieusignaal Ω');
  await dialog.getByLabel('Feiten', { exact: true }).fill('Fictieve feiten voor browserproef');
  await dialog
    .getByRole('combobox', { name: 'Incidentsoort', exact: true })
    .selectOption('environmental');
  const exactTime = '2026-10-01T00:30:00.1234567+02:00';
  await dialog.getByRole('textbox', { name: /^Tijdstip gebeurtenis/ }).fill(exactTime);
  await dialog.getByLabel('Locatie (brontekst)', { exact: true }).fill('Fictieve bronlocatie Ω');
  await dialog.getByRole('checkbox', { name: 'Fictief hoofdonderwerp Ω', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('Concept lokaal');
  await page.reload();
  dialog = await open();
  await expect(dialog.getByRole('textbox', { name: /^Tijdstip gebeurtenis/ })).toHaveValue(
    exactTime,
  );
  await expect(dialog.getByLabel('Datum', { exact: true })).toHaveValue('2026-10-01');
  await expect(dialog.getByRole('combobox', { name: 'Incidentsoort', exact: true })).toHaveValue(
    'environmental',
  );
  await dialog.getByRole('button', { name: 'Melding opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const incident = (await state(page)).incidents[0];
  expect(incident).toMatchObject({
    kind: 'environmental',
    occurredAt: exactTime,
    date: '2026-10-01',
    topicIds: ['parent'],
    location: 'Fictieve bronlocatie Ω',
  });
  expect(incident).not.toHaveProperty('recordable');
  expect(await markdown(page)).toContain(exactTime);
});

test('topic parent and legal publication and typed affected link survive draft reload', async ({
  page,
}) => {
  const knowledge = async () => {
    await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
    await page.getByRole('button', { name: 'Onderwerpen & regelgeving', exact: true }).click();
  };
  await knowledge();
  await page.getByRole('button', { name: 'Onderwerp', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Onderwerp toevoegen', exact: true });
  await dialog.getByLabel('Onderwerptitel', { exact: true }).fill('Fictief kindonderwerp Ω');
  await dialog
    .getByRole('combobox', { name: 'Bovenliggend onderwerp', exact: true })
    .selectOption('parent');
  await dialog.getByLabel('Onderwerpstatus (bronlabel)', { exact: true }).fill('Fictief bronlabel');
  await dialog.getByRole('button', { name: 'Onderwerp opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    (await state(page)).topics!.find((topic) => topic.title === 'Fictief kindonderwerp Ω'),
  ).toMatchObject({ parentId: 'parent', status: 'Fictief bronlabel' });
  await page.getByRole('button', { name: 'Regelgevingssignaal', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Regelgevingssignaal vastleggen', exact: true });
  await dialog.getByLabel('Signaaltitel', { exact: true }).fill('Fictief juridisch signaal Ω');
  await dialog
    .getByLabel('Officiële bron-URL', { exact: true })
    .fill('https://example.org/fictitious');
  await dialog
    .getByLabel('Wat is gepubliceerd of gesignaleerd?', { exact: true })
    .fill('Fictieve broninhoud');
  await dialog.getByLabel('Publicatiedatum', { exact: true }).fill('2026-09-01');
  await dialog.getByLabel('Ingangsdatum', { exact: true }).fill('2027-01-01');
  await dialog
    .getByRole('combobox', { name: 'Intern geraakt object toevoegen', exact: true })
    .selectOption(JSON.stringify({ kind: 'workspace', collection: 'actions', id: 'action' }));
  await expect(dialog.getByRole('status')).toContainText('Concept lokaal');
  await page.reload();
  await knowledge();
  await page.getByRole('button', { name: 'Regelgevingssignaal', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Regelgevingssignaal vastleggen', exact: true });
  await expect(dialog.getByLabel('Publicatiedatum', { exact: true })).toHaveValue('2026-09-01');
  await dialog.getByRole('button', { name: 'Signaal opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await state(page)).legalRecords![0]).toMatchObject({
    publishedOn: '2026-09-01',
    effectiveOn: '2027-01-01',
    affectedRefs: [{ kind: 'workspace', collection: 'actions', id: 'action' }],
  });
  const report = await markdown(page);
  expect(report).toContain('2026-09-01');
  expect(report).toContain('actions');
});

test('observation exact source time, separate context and topic survive unsaved reload', async ({
  page,
}) => {
  const open = async () => {
    await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
    await page.getByRole('button', { name: 'Dossiers & bewijs', exact: true }).click();
    await page.getByRole('button', { name: 'Waarneming', exact: true }).click();
    return page.getByRole('dialog', { name: 'Waarneming vastleggen', exact: true });
  };
  let dialog = await open();
  await dialog.getByLabel('Waarnemingstitel', { exact: true }).fill('Fictieve bronwaarneming Ω');
  await dialog.getByLabel('Waarnemer', { exact: true }).fill('Fictieve waarnemer');
  await dialog
    .getByLabel('Waargenomen feiten', { exact: true })
    .fill('Fictieve afzonderlijke feiten');
  const exactTime = '2026-10-01T00:15:00.7654321+02:00';
  await dialog.getByRole('textbox', { name: /^Waarnemingstijdstip/ }).fill(exactTime);
  await dialog
    .getByRole('textbox', { name: /^Waarnemingscontext/ })
    .fill('Fictieve afzonderlijke procescontext');
  await dialog.getByRole('checkbox', { name: /Fictief hoofdonderwerp Ω/ }).check();
  await expect(dialog.getByRole('status')).toContainText('Concept lokaal');
  await page.reload();
  dialog = await open();
  await expect(dialog.getByRole('textbox', { name: /^Waarnemingstijdstip/ })).toHaveValue(
    exactTime,
  );
  await expect(dialog.getByLabel('Waarnemingsdatum', { exact: true })).toHaveValue('2026-10-01');
  await dialog.getByRole('button', { name: 'Waarneming opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await state(page)).observations![0]).toMatchObject({
    observedAt: exactTime,
    date: '2026-10-01',
    topicIds: ['parent'],
    facts: 'Fictieve afzonderlijke feiten',
    context: 'Fictieve afzonderlijke procescontext',
  });
  const report = await markdown(page);
  expect(report).toContain(exactTime);
  expect(report).toContain('Fictieve afzonderlijke procescontext');
});

test('a vanished topic parent refuses save and keeps the complete recovered concept', async ({
  page,
}) => {
  const open = async () => {
    await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
    await page.getByRole('button', { name: 'Onderwerpen & regelgeving', exact: true }).click();
    await page.getByRole('button', { name: 'Onderwerp', exact: true }).click();
    return page.getByRole('dialog', { name: 'Onderwerp toevoegen', exact: true });
  };
  let dialog = await open();
  await dialog
    .getByLabel('Onderwerptitel', { exact: true })
    .fill('Fictief volledig bewaard kindconcept Ω');
  await dialog
    .getByRole('combobox', { name: 'Bovenliggend onderwerp', exact: true })
    .selectOption('parent');
  await dialog
    .getByLabel('Betekenis en afbakening', { exact: true })
    .fill('Fictieve tekst die ook na weigering moet blijven');
  await expect(dialog.getByRole('status')).toContainText('Concept lokaal');
  await page.evaluate((key) => {
    const envelope = JSON.parse(localStorage.getItem(key)!);
    envelope.workspace.topics = [];
    envelope.version = crypto.randomUUID();
    localStorage.setItem(key, JSON.stringify(envelope));
  }, key);
  await page.reload();
  dialog = await open();
  await dialog.getByRole('button', { name: 'Onderwerp opslaan', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'volledige onderwerpconcept blijft behouden',
  );
  expect((await state(page)).topics).toEqual([]);
  await page.reload();
  dialog = await open();
  await expect(dialog.getByLabel('Onderwerptitel', { exact: true })).toHaveValue(
    'Fictief volledig bewaard kindconcept Ω',
  );
  await expect(dialog.getByRole('textbox', { name: /^Betekenis en afbakening/ })).toHaveValue(
    'Fictieve tekst die ook na weigering moet blijven',
  );
  await expect(
    dialog.getByRole('combobox', { name: 'Bovenliggend onderwerp', exact: true }),
  ).toHaveValue('parent');
  await dialog
    .getByRole('combobox', { name: 'Bovenliggend onderwerp', exact: true })
    .selectOption('');
  await dialog.getByRole('button', { name: 'Onderwerp opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
