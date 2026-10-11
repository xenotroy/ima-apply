import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
const privatePackage = path.resolve(
  import.meta.dirname,
  '../../private-data/pi-vught-2026-10-11/pi-content-package.json',
);
async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
async function router(page: Page) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'PI-bibliotheek & router', exact: true }).click();
}
async function organisation(page: Page) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page
    .locator('.dossier-tabs')
    .getByRole('button', { name: 'Organisatie', exact: true })
    .click();
  await page
    .locator('.registry-grid')
    .getByRole('button', { name: 'Organisatie', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Organisatie toevoegen', exact: true });
  await dialog.getByLabel('Naam', { exact: true }).fill('Fictieve browserorganisatie');
  await dialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function importJson(page: Page, buffer: Buffer) {
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'own-test.json', mimeType: 'application/json', buffer });
}
async function report(page: Page) {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  return readFile((await (await event).path())!, 'utf8');
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
});

test('router recovers draft keystrokes and incident priority before frozen Markdown export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await router(page);
  await page.getByLabel('Onderzoeksscope', { exact: true }).fill('Fictieve scope / dag en nacht');
  await page.getByLabel('Routeronderzoeker', { exact: true }).fill('Fictieve onderzoeker');
  const note = 'Interview nog niet vastgelegd.\nLokale maatregelwerking onbekend. Laatste teken Ω';
  await page.getByLabel('Routernotities en ontbrekende taken', { exact: true }).fill(note);
  await page
    .getByText('4. Incidenten, bijna-ongevallen, klachten en veranderingen', { exact: true })
    .click();
  await page
    .getByRole('checkbox', {
      name: 'Er zijn volgens de beschikbare invoer geen signalen. Dit bewijst geen afwezig risico.',
      exact: true,
    })
    .check();
  await page.getByLabel('Signaalernst', { exact: true }).selectOption('serious');
  await page.getByRole('button', { name: 'Signaal toevoegen', exact: true }).click();
  await page.getByLabel('Signaalnotitie 1', { exact: true }).fill('Gemeld, bron nog te ontvangen.');
  await expect(
    page.getByText(
      'Geen signalen verklaard, maar er zijn incidenten, klachten of veranderingen vastgelegd.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator('[data-router-topic=aggression]')).toContainText(
    'Urgente onderzoeksprioriteit',
  );
  await page.reload();
  await router(page);
  await expect(page.getByLabel('Routernotities en ontbrekende taken', { exact: true })).toHaveValue(
    note,
  );
  await expect(page.getByText(/Concept hersteld/).first()).toBeVisible();
  await page
    .getByText('4. Incidenten, bijna-ongevallen, klachten en veranderingen', { exact: true })
    .click();
  await expect(page.getByLabel('Signaalnotitie 1', { exact: true })).toHaveValue(
    'Gemeld, bron nog te ontvangen.',
  );
  expect(
    (await state(page)).contentRecords.filter(
      (r: { schema: string }) => r.schema === 'ima.pi-router/v1',
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Onderzoeksset vastleggen', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state(page)).contentRecords.filter(
          (r: { schema: string }) => r.schema === 'ima.pi-router/v1',
        ).length,
    )
    .toBe(1);
  const record = (await state(page)).contentRecords.find(
    (r: { schema: string }) => r.schema === 'ima.pi-router/v1',
  );
  expect(record.inputs.notes).toBe(note);
  expect(record.result.obligations).toHaveLength(5);
  expect(record.result.unknownTopicIds).toContain('medication');
  const md = await report(page);
  expect(md).toContain(note);
  expect(md).toContain(record.sha256);
  expect(md).toContain('Fictieve onderzoeker');
  expect(errors).toEqual([]);
});

test('explicit organisation is required and all selected source occurrences freeze in a separate project', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const questions = [1, 2, 3, 4].map((n) => ({
    id: 'fixture-q-' + n,
    title: n < 3 ? 'VISIBLE-COLLISION' : 'OWN-' + n,
    prompt: 'Eigen fictieve controlevraag ' + n + '?',
    themeId: 'agressie',
    route: 'kern',
    evidenceHints: [],
    assessmentGuidance: 'Fictieve vraag, geen externe bron.',
    sourceIds: ['fixture-source'],
    suggestedHierarchy: [],
    roles: [],
  }));
  const bank = {
    id: 'fixture-bank',
    schema: 'ima.pi-router-bindings/v1',
    status: 'proposal',
    sourceIds: ['fixture-source'],
    sourceSha256: 'a'.repeat(64),
    bankDate: '2026-10-11',
    questions: questions.map((q, i) => ({
      questionId: q.id,
      key: 'occurrence-' + i,
      code: q.title,
      aspect: 'Eigen aspect',
      process: 'Eigen proces',
      sourceId: 'fixture-source',
      page: 1,
      topicIds: i === 2 ? ['prevention'] : i === 3 ? ['noise'] : ['aggression'],
      mappingStatus: 'candidate',
      researchLevel: 'local',
    })),
  };
  await importJson(
    page,
    Buffer.from(
      JSON.stringify({
        schema: 'ima.content/v1',
        title: 'Independent fixture',
        questions,
        sources: [{ id: 'fixture-source', title: 'Eigen fictieve testbron' }],
        records: [bank],
      }),
    ),
  );
  await expect.poll(async () => (await state(page)).questions.length).toBe(4);
  await router(page);
  await page.getByLabel('Onderzoeksscope', { exact: true }).fill('Fictieve bronselectie');
  await page.getByLabel('Routeronderzoeker', { exact: true }).fill('Fictieve onderzoeker');
  await page
    .getByLabel('Contact, toezicht of begeleiding van gedetineerden', { exact: true })
    .selectOption('present');
  await page.getByRole('button', { name: 'Onderzoeksset vastleggen', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Gebruik exacte onderzoeksset', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Maak eerst een organisatie aan/)).toBeVisible();
  await organisation(page);
  await router(page);
  await page
    .getByLabel('Routerorganisatie', { exact: true })
    .selectOption({ label: 'Fictieve browserorganisatie' });
  await page.getByLabel('Onderzoeksscope', { exact: true }).fill('Fictieve bronselectie');
  await page.getByLabel('Routeronderzoeker', { exact: true }).fill('Fictieve onderzoeker');
  await page
    .getByLabel('Contact, toezicht of begeleiding van gedetineerden', { exact: true })
    .selectOption('present');
  await page.getByRole('button', { name: 'Onderzoeksset vastleggen', exact: true }).click();
  const event = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Projectwerkruimte exporteren', exact: true })
    .last()
    .click();
  const project = JSON.parse(await readFile((await (await event).path())!, 'utf8'));
  expect(project.questions).toHaveLength(3);
  expect(project.dossiers[0].questions).toHaveLength(3);
  expect(
    project.questions.filter((q: { title: string }) => q.title === 'VISIBLE-COLLISION'),
  ).toHaveLength(2);
  expect(
    project.contentRecords.find((r: { schema: string }) => r.schema === 'ima.pi-router-bindings/v1')
      .coverage,
  ).toBe('scoped_selection');
  expect(project.id).not.toBe((await state(page)).id);
  expect((await state(page)).questions).toHaveLength(4);
  expect((await state(page)).dossiers).toHaveLength(0);
  await page
    .getByRole('button', { name: 'Gebruik exacte onderzoeksset', exact: true })
    .last()
    .click();
  await expect.poll(async () => (await state(page)).dossiers.length).toBe(1);
  const frozen = (await state(page)).dossiers[0];
  expect(frozen.questions).toHaveLength(3);
  expect(frozen.organisationId).toBe((await state(page)).organisations[0].id);
  await page.reload();
  expect((await state(page)).dossiers[0]).toEqual(frozen);
  expect(errors).toEqual([]);
});

test('private 1300-bank selection, 243-question project export and interview recover within the real boundary', async ({
  page,
}) => {
  test.skip(
    !existsSync(privatePackage),
    'Licensed private bank is deliberately absent from public checkout/CI.',
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('input[type=file]').setInputFiles(privatePackage);
  await expect.poll(async () => (await state(page)).questions.length).toBe(1312);
  await organisation(page);
  await router(page);
  await page
    .getByLabel('Onderzoeksscope', { exact: true })
    .fill('Fictieve capaciteitsscope, geen lokaal oordeel');
  await page
    .getByLabel('Routeronderzoeker', { exact: true })
    .fill('Fictieve capaciteitonderzoeker');
  await page
    .getByLabel('Routerorganisatie', { exact: true })
    .selectOption({ label: 'Fictieve browserorganisatie' });
  for (const label of [
    'Binnenruimten en looproutes',
    'Contact, toezicht of begeleiding van gedetineerden',
    'Administratie en beeldschermwerk',
    'Tillen, duwen, trekken of fysiek ingrijpen',
  ])
    await page.getByLabel(label, { exact: true }).selectOption('present');
  await page
    .getByText('2. Risico’s — mogelijke, vastgestelde en lokaal verhoogde risico’s', {
      exact: true,
    })
    .click();
  await page
    .getByLabel('Risico: Beeldschermwerk en observatiepost', { exact: true })
    .selectOption('increased');
  await page.getByLabel('Risico: Fysieke belasting', { exact: true }).selectOption('increased');
  await page.getByRole('button', { name: 'Onderzoeksset vastleggen', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state(page)).contentRecords.find(
          (r: { schema: string }) => r.schema === 'ima.pi-router/v1',
        )?.result.questionIds.length,
    )
    .toBe(243);
  const parent = await state(page);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Projectwerkruimte exporteren', exact: true }).click();
  const raw = await readFile((await (await event).path())!, 'utf8');
  const project = JSON.parse(raw);
  expect(project.questions).toHaveLength(243);
  expect(project.dossiers[0].questions).toHaveLength(243);
  expect(Buffer.byteLength(raw)).toBeLessThan(2_000_000);
  expect((await state(page)).id).toBe(parent.id);
  expect((await state(page)).questions).toHaveLength(1312);
  await importJson(page, Buffer.from(raw));
  const dialog = page.getByRole('dialog', { name: 'Werkruimte importeren', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Import openen', exact: true }).click();
  await expect.poll(async () => (await state(page)).id).toBe(project.id);
  await page.getByRole('button', { name: 'Inventarisatie', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Beoordelingsdossier', exact: true })
    .selectOption(project.dossiers[0].id);
  await page
    .getByLabel('Respondent / actor voor deze invoer', { exact: true })
    .fill('Fictieve browserrespondent');
  const card = page.locator('.question-card').first();
  await card.getByRole('button', { name: 'Deels', exact: true }).click();
  const note = 'Bewijs nog te verifiëren. '.repeat(15).slice(0, 300);
  await card.getByLabel('Toelichting / vervolg', { exact: true }).fill(note);
  await expect.poll(async () => (await state(page)).answers[0]?.note).toBe(note);
  await page.reload();
  expect((await state(page)).answers[0].note).toBe(note);
  expect((await state(page)).answers[0].respondedBy).toBe('Fictieve browserrespondent');
  const md = await report(page);
  expect(md).toContain('Fictieve browserrespondent');
  expect(md).toContain(note);
  expect(errors).toEqual([]);
});
