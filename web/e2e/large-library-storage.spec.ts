import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createWorkspace } from '../src/data/model';
import { exportWorkspace } from '../src/data/validation';

test('a library above 2MB keeps interview input after reload and transfers through native JSON', async ({
  page,
  browser,
}) => {
  const records = Array.from({ length: 40 }, (_, index) => ({
    id: `fictieve-bron-${index}`,
    body: 'Ω'.repeat(40000),
  }));
  const workspace = createWorkspace('Fictieve grote bronbibliotheek', { contentRecords: records });
  const raw = exportWorkspace(workspace);
  expect(Buffer.byteLength(raw)).toBeGreaterThan(2000000);
  async function openImport(target: typeof page, input: string) {
    await target.goto('/');
    await target.locator('input[type=file]').setInputFiles({
      name: 'fictieve-bibliotheek.json',
      mimeType: 'application/json',
      buffer: Buffer.from(input),
    });
    await target
      .getByRole('dialog', { name: 'Werkruimte importeren', exact: true })
      .getByRole('button', { name: 'Import openen', exact: true })
      .click();
    await expect(
      target.getByRole('dialog', { name: 'Werkruimte importeren', exact: true }),
    ).toHaveCount(0);
  }
  await openImport(page, raw);
  await page.getByRole('button', { name: 'Inventarisatie', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Respondent / actor voor deze invoer', exact: true })
    .fill('Fictieve proefpersoon');
  const question = page.locator('.question-card').first();
  await question.getByRole('button', { name: 'Ja', exact: true }).click();
  await question
    .getByRole('textbox', { name: 'Toelichting / vervolg', exact: true })
    .fill('Laatste interviewtekst blijft behouden bij een grote bibliotheek.');
  await expect(page.getByText('Werkruimte lokaal bewaard', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator('.question-card')
      .first()
      .getByRole('textbox', { name: 'Toelichting / vervolg', exact: true }),
  ).toHaveValue('Laatste interviewtekst blijft behouden bij een grote bibliotheek.');
  await page.getByRole('button', { name: 'Werkruimte & synchronisatie', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Werkruimte exporteren', exact: true }).click();
  const exportedRaw = await readFile((await (await downloading).path())!, 'utf8');
  const exported = JSON.parse(exportedRaw);
  expect(exported.contentRecords).toEqual(records);
  expect(exported.answers).toHaveLength(1);
  expect(exported.answers[0].note).toBe(
    'Laatste interviewtekst blijft behouden bij een grote bibliotheek.',
  );
  expect(exported.answers[0].respondedBy).toBe('Fictieve proefpersoon');
  const separate = await browser.newContext();
  try {
    const transferred = await separate.newPage();
    await openImport(transferred, exportedRaw);
    await transferred.getByRole('button', { name: 'Inventarisatie', exact: true }).click();
    await expect(
      transferred
        .locator('.question-card')
        .first()
        .getByRole('textbox', { name: 'Toelichting / vervolg', exact: true }),
    ).toHaveValue(exported.answers[0].note);
  } finally {
    await separate.close();
  }
});

test('opt-in full private library retains saved module selections and freezes through reload and export', async ({
  page,
}) => {
  const path = process.env.IMA_PRIVATE_FULL_BANK_PROJECT;
  test.skip(!path, 'Private integrated workspace is not distributed with the app.');
  const raw = await readFile(path!, 'utf8');
  const original = JSON.parse(raw);
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'private-full-library.json',
      mimeType: 'application/json',
      buffer: Buffer.from(raw),
    });
  await page
    .getByRole('dialog', { name: 'Werkruimte importeren', exact: true })
    .getByRole('button', { name: 'Import openen', exact: true })
    .click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'RIEporter & afdelingen', exact: true })
    .click();
  await expect(page.getByText('1300 bronvragen', { exact: true })).toBeVisible();
  await expect(page.locator('.rie-bank-card').locator('summary')).toContainText('46 procesblokken');
  await expect(page.locator('.rie-bank-card').locator('summary')).toContainText('189 aspecten');
  await page.reload();
  await expect(page.getByText('1300 bronvragen', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Werkruimte & synchronisatie', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Werkruimte exporteren', exact: true }).click();
  const exported = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  expect(exported.modulePlans).toEqual(original.modulePlans);
  expect(exported.dossiers).toEqual(original.dossiers);
  expect(exported.answers).toEqual(original.answers);
  expect(exported.questions).toEqual(original.questions);
  expect(exported.contentRecords).toEqual(original.contentRecords);
});
