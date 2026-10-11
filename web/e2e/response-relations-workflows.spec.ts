import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
async function createDossier(page: Page, title: string, questionCount: number) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken', exact: true });
  await dialog.getByRole('textbox', { name: 'Dossiertitel', exact: true }).fill(title);
  await dialog
    .getByRole('textbox', { name: 'Afgebakende scope', exact: true })
    .fill('Fictieve response-relatieproef in één expliciet dossier.');
  await dialog
    .getByRole('textbox', { name: 'Beoordelaar', exact: true })
    .fill('Fictieve beoordelaar');
  const choices = dialog.locator('.link-choices').last().getByRole('checkbox');
  for (let index = 0; index < questionCount; index++) await choices.nth(index).check();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () =>
      (await state(page)).dossiers.some((record: { title: string }) => record.title === title),
    )
    .toBe(true);
  return (await state(page)).dossiers.find((record: { title: string }) => record.title === title);
}
async function createObservation(page: Page, title: string) {
  await page.getByRole('button', { name: 'Waarneming', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Waarneming vastleggen', exact: true });
  await dialog.getByRole('textbox', { name: 'Waarnemingstitel', exact: true }).fill(title);
  await dialog.getByRole('textbox', { name: 'Waarnemer', exact: true }).fill('Fictieve observator');
  await dialog
    .getByRole('textbox', { name: 'Waargenomen feiten', exact: true })
    .fill(`Fictieve afzonderlijke feiten: ${title}.`);
  await dialog.getByRole('button', { name: 'Waarneming opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () =>
      (await state(page)).observations.some((record: { title: string }) => record.title === title),
    )
    .toBe(true);
}
async function createFinding(page: Page, title: string, questionId: string) {
  await page.getByRole('button', { name: 'Bevinding', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Bevinding vastleggen en beoordelen',
    exact: true,
  });
  await dialog.getByRole('textbox', { name: 'Bevindingstitel', exact: true }).fill(title);
  await dialog
    .getByRole('textbox', { name: 'Bevinding en criterium', exact: true })
    .fill(`Fictief expliciet onderzoekscriterium: ${title}.`);
  await dialog
    .getByRole('combobox', { name: 'Dossiervraag', exact: true })
    .selectOption(questionId);
  await dialog.getByRole('button', { name: 'Bevinding opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () =>
      (await state(page)).findings.some((record: { title: string }) => record.title === title),
    )
    .toBe(true);
}

test('human response preserves its identity and multiple two-way dossier links across answer changes, reload and Markdown', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  const dossier = await createDossier(page, 'Fictief relatiedossier A', 2);
  const observationTitles = [
    'Fictieve waarneming A1 Ω',
    'Fictieve waarneming A2 Ω',
    'Fictieve niet-geselecteerde waarneming A3 Ω',
  ];
  const findingTitles = ['Fictieve bevinding A1 Ω', 'Fictieve bevinding A2 Ω'];
  for (const title of observationTitles) await createObservation(page, title);
  for (const title of findingTitles) await createFinding(page, title, dossier.questions[1].id);
  const other = await createDossier(page, 'Fictief afzonderlijk dossier B', 1);
  await createObservation(page, 'Fictieve waarneming buiten scope B');
  await createFinding(page, 'Fictieve bevinding buiten scope B', other.questions[0].id);
  await page.getByRole('button', { name: 'Inventarisatie', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Beoordelingsdossier', exact: true })
    .selectOption(dossier.id);
  await page
    .getByRole('textbox', { name: 'Respondent / actor voor deze invoer', exact: true })
    .fill('Fictieve respondent eerste invoer');
  await expect(page.locator('.question-card')).toHaveCount(2);
  let card = page.locator('.question-card').first();
  await card.getByRole('button', { name: 'Deels', exact: true }).click();
  await card
    .getByRole('textbox', { name: 'Toelichting / vervolg', exact: true })
    .fill('Fictieve interviewgrond met exact laatste teken Ω');
  await expect.poll(async () => (await state(page)).answers[0]?.note).toContain('Ω');
  const initial = (await state(page)).answers[0];
  await card.getByRole('button', { name: 'Response-relaties wijzigen', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Response-relaties wijzigen', exact: true });
  await expect(
    dialog.getByRole('checkbox', { name: 'Fictieve waarneming buiten scope B', exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole('checkbox', { name: 'Fictieve bevinding buiten scope B', exact: true }),
  ).toHaveCount(0);
  for (const title of [...observationTitles.slice(0, 2), ...findingTitles])
    await dialog.getByRole('checkbox', { name: title, exact: true }).check();
  await dialog.getByRole('button', { name: 'Relaties opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await state(page)).answers[0]?.observationIds?.length).toBe(2);
  const linked = await state(page);
  const answer = linked.answers[0];
  expect(answer.id).toBe(initial.id);
  expect(answer.findingIds).toHaveLength(2);
  for (const record of [...linked.observations, ...linked.findings].filter((record) =>
    [...answer.observationIds, ...answer.findingIds].includes(record.id),
  ))
    expect(record.responseIds).toEqual([answer.id]);
  expect(
    linked.findings
      .filter((record) => record.dossierId === dossier.id)
      .map((record) => record.questionId),
  ).toEqual([dossier.questions[1].id, dossier.questions[1].id]);
  expect(
    linked.observations.find((record) => record.title === observationTitles[2]).responseIds,
  ).toBeUndefined();
  await page
    .getByRole('textbox', { name: 'Respondent / actor voor deze invoer', exact: true })
    .fill('Fictieve respondent antwoordwijziging');
  await card.getByRole('button', { name: 'Nee', exact: true }).click();
  await expect.poll(async () => (await state(page)).answers[0]?.choice).toBe('no');
  const changed = (await state(page)).answers[0];
  expect(changed.id).toBe(initial.id);
  expect(changed.observationIds).toEqual(answer.observationIds);
  expect(changed.findingIds).toEqual(answer.findingIds);
  expect(changed.respondedBy).toBe('Fictieve respondent antwoordwijziging');
  await page.reload();
  await page.getByRole('button', { name: 'Inventarisatie', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Beoordelingsdossier', exact: true })
    .selectOption(dossier.id);
  card = page.locator('.question-card').first();
  await expect(card.getByRole('button', { name: 'Nee', exact: true })).toHaveClass(/chosen/);
  await expect(card.getByRole('region', { name: 'Response-relaties', exact: true })).toContainText(
    '2 waarnemingen · 2 bevindingen',
  );
  await page
    .getByRole('textbox', { name: 'Respondent / actor voor deze invoer', exact: true })
    .fill('Fictieve respondent relatiecorrectie');
  await card.getByRole('button', { name: 'Response-relaties wijzigen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Response-relaties wijzigen', exact: true });
  await expect(
    dialog.getByRole('checkbox', { name: observationTitles[0], exact: true }),
  ).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: findingTitles[0], exact: true })).toBeChecked();
  await dialog.getByRole('checkbox', { name: observationTitles[0], exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: findingTitles[0], exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Relaties opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).answers[0]?.findingIds?.length).toBe(1);
  const final = await state(page);
  expect(final.answers[0].id).toBe(initial.id);
  expect(
    final.observations.find((record) => record.title === observationTitles[0]).responseIds,
  ).toEqual([]);
  expect(final.findings.find((record) => record.title === findingTitles[0]).responseIds).toEqual(
    [],
  );
  expect(
    final.observations.find((record) => record.title === observationTitles[1]).responseIds,
  ).toEqual([initial.id]);
  expect(final.findings.find((record) => record.title === findingTitles[1]).responseIds).toEqual([
    initial.id,
  ]);
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const report = await readFile((await (await event).path())!, 'utf8');
  expect(report).toContain(`### Response ${initial.id}`);
  expect(report).toContain('- Respondent: Fictieve respondent relatiecorrectie');
  expect(report).toContain(
    `- Waarnemingen: ${observationTitles[1]} (${final.observations.find((record) => record.title === observationTitles[1]).id})`,
  );
  expect(report).toContain(
    `- Bevindingen: ${findingTitles[1]} (${final.findings.find((record) => record.title === findingTitles[1]).id})`,
  );
  expect(report).toContain('Fictieve interviewgrond met exact laatste teken Ω');
  expect(errors).toEqual([]);
});
