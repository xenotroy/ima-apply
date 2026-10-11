import { expect, test, type Page } from '@playwright/test';
async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
async function definitions(page: Page) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'Beheerde vragen', exact: true }).click();
}
async function create(page: Page, title: string, prompt: string) {
  await page.getByRole('button', { name: 'Vraagdefinitie', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Vraagdefinitie vastleggen', exact: true });
  await dialog.getByLabel('Vraagdefinitietitel', { exact: true }).fill(title);
  await dialog.getByLabel('Contentpakketidentiteit', { exact: true }).fill('managed-e2e');
  await dialog
    .getByRole('textbox', { name: 'Controleerbare vraagtekst', exact: true })
    .fill(prompt);
  await dialog
    .getByRole('textbox', { name: 'Afzonderlijke toelichting', exact: true })
    .fill('Toelichting blijft apart.');
  await dialog
    .getByRole('textbox', { name: 'Acceptatiecriteria', exact: true })
    .fill('Eigen exact toetscriterium.');
  await dialog
    .getByRole('textbox', { name: 'Verwacht bewijs', exact: true })
    .fill('Werkelijke specifieke bewijsbron.');
  await dialog.getByRole('button', { name: 'Vraagdefinitie opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () =>
      (await state(page)).questions.some((q: { title: string }) => q.title === title),
    )
    .toBe(true);
}
async function activate(page: Page, title: string) {
  await page.getByRole('button', { name: `Vraagstatus wijzigen: ${title}`, exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Vraagstatus wijzigen', exact: true })
    .getByRole('button', { name: 'Vraagstatus opslaan', exact: true })
    .click();
}
test('complete managed package freeze survives successors, JSON and reports while late additions are refused', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  await definitions(page);
  await create(
    page,
    'Geselecteerde eerste versie',
    'Wordt de eigen gecontroleerde faalconditie onderzocht?',
  );
  await activate(page, 'Geselecteerde eerste versie');
  await create(
    page,
    'Niet geselecteerd concept',
    'Is het afzonderlijke concept nog niet vastgesteld?',
  );
  const before = (await state(page)).questions;
  expect(before[0].definition.status).toBe('active');
  expect(before[1].definition.status).toBe('draft');
  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken', exact: true });
  await dialog.getByLabel('Dossiertitel', { exact: true }).fill('Bevroren beheerd dossier');
  await dialog
    .getByLabel('Afgebakende scope', { exact: true })
    .fill('Eén expliciete versie, werkplaats.');
  await dialog.getByLabel('Beoordelaar', { exact: true }).fill('Fictieve beoordelaar');
  await expect(
    dialog.getByRole('checkbox', {
      name: 'Is het afzonderlijke concept nog niet vastgesteld?',
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog
    .getByRole('checkbox', {
      name: 'Wordt de eigen gecontroleerde faalconditie onderzocht?',
      exact: true,
    })
    .check();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect.poll(async () => (await state(page)).dossiers?.length).toBe(1);
  const frozen = (await state(page)).dossiers[0];
  expect(frozen.questions).toHaveLength(1);
  expect(frozen.contentPackageSnapshots[0].questions).toHaveLength(2);
  expect(frozen.questions[0].acceptanceCriteria).toBe('Eigen exact toetscriterium.');
  await definitions(page);
  await expect(
    page.getByRole('button', {
      name: 'Vraagstatus wijzigen: Niet geselecteerd concept',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Vraagdefinitie', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Vraagdefinitie vastleggen', exact: true });
  await dialog.getByLabel('Vraagdefinitietitel', { exact: true }).fill('Late definitie');
  await dialog.getByLabel('Contentpakketidentiteit', { exact: true }).fill('managed-e2e');
  await dialog
    .getByRole('textbox', { name: 'Controleerbare vraagtekst', exact: true })
    .fill('Mag dit late pakketlid worden toegevoegd?');
  await dialog.getByRole('button', { name: 'Vraagdefinitie opslaan', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('pakketversie is bevroren');
  expect((await state(page)).questions).toEqual(before);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page
    .getByRole('button', { name: 'Opvolger maken: Geselecteerde eerste versie', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Vraagdefinitie vastleggen', exact: true });
  await dialog.getByLabel('Vraagdefinitietitel', { exact: true }).fill('Opvolgende versie');
  await dialog
    .getByRole('textbox', { name: 'Controleerbare vraagtekst', exact: true })
    .fill('Heeft de nieuwe vraag aanvullende verificatie?');
  await dialog.getByLabel('Vraagversie', { exact: true }).fill('2.0.0');
  await dialog.getByLabel('Contentpakketversie', { exact: true }).fill('2.0.0');
  await dialog.getByRole('button', { name: 'Vraagdefinitie opslaan', exact: true }).click();
  await activate(page, 'Opvolgende versie');
  await page.reload();
  const after = await state(page);
  expect(after.dossiers[0]).toEqual(frozen);
  expect(after.questions[2].definition.supersedesId).toBe(before[0].id);
  expect(after.questions[2].definition.contentPackageVersion).toBe('2.0.0');
  await definitions(page);
  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken', exact: true });
  await dialog
    .getByLabel('Dossiertitel', { exact: true })
    .fill('Uitsluitend opvolgende pakketversie');
  await dialog
    .getByRole('textbox', { name: 'Afgebakende scope', exact: true })
    .fill('Tweede expliciete versie.');
  await dialog.getByLabel('Beoordelaar', { exact: true }).fill('Fictieve beoordelaar');
  const oldChoice = dialog.getByRole('checkbox', {
    name: 'Wordt de eigen gecontroleerde faalconditie onderzocht?',
    exact: true,
  });
  await oldChoice.check();
  await dialog
    .getByRole('checkbox', { name: 'Heeft de nieuwe vraag aanvullende verificatie?', exact: true })
    .check();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('meerdere versies');
  await expect(dialog.getByLabel('Dossiertitel', { exact: true })).toHaveValue(
    'Uitsluitend opvolgende pakketversie',
  );
  expect((await state(page)).dossiers).toHaveLength(1);
  await oldChoice.uncheck();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect.poll(async () => (await state(page)).dossiers.length).toBe(2);
  const latest = await state(page);
  expect(latest.dossiers[0]).toEqual(frozen);
  expect(latest.dossiers[1].contentPackageSnapshots[0].version).toBe('2.0.0');
  expect(latest.dossiers[1].questions).toHaveLength(1);
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const markdown = Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain('Bevroren contentpakketten');
  expect(markdown).toContain('2 volledige definities');
  expect(markdown).toContain('Eigen exact toetscriterium.');
  expect(markdown).toContain('Niet geselecteerd concept');
  expect(markdown).toContain(frozen.contentPackageSnapshots[0].sha256);
  expect(errors).toEqual([]);
});
test('unsaved question content survives closing and reloading, and clears only after successful recording', async ({
  page,
}) => {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  await definitions(page);
  await page.getByRole('button', { name: 'Vraagdefinitie', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Vraagdefinitie vastleggen', exact: true });
  await dialog.getByLabel('Vraagdefinitietitel', { exact: true }).fill('Herstelbaar vraagconcept');
  await dialog.getByLabel('Contentpakketidentiteit', { exact: true }).fill('draft-recovery');
  await dialog
    .getByRole('textbox', { name: 'Controleerbare vraagtekst', exact: true })
    .fill('Een lang onderzoeksgesprek blijft bewaard.');
  await dialog
    .getByRole('textbox', { name: 'Acceptatiecriteria', exact: true })
    .fill('Eerste regel\nTweede regel met behouden tekst.');
  await expect(dialog.getByRole('status')).toContainText('Concept lokaal bewaard');
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.reload();
  await definitions(page);
  await page.getByRole('button', { name: 'Vraagdefinitie', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Vraagdefinitie vastleggen', exact: true });
  await expect(dialog.getByLabel('Vraagdefinitietitel', { exact: true })).toHaveValue(
    'Herstelbaar vraagconcept',
  );
  await expect(
    dialog.getByRole('textbox', { name: 'Acceptatiecriteria', exact: true }),
  ).toHaveValue('Eerste regel\nTweede regel met behouden tekst.');
  await expect(dialog.getByRole('status')).toContainText('Concept hersteld');
  expect((await state(page)).questions).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Vraagdefinitie opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).questions.length).toBe(1);
  expect((await state(page)).questions[0].title).toBe('Herstelbaar vraagconcept');
  const retained = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('ima-apply.draft.v1.'))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  );
  expect(retained).toHaveLength(1);
  expect(retained[0].value.title).toBe('Herstelbaar vraagconcept');
  expect(retained[0].value.acceptanceCriteria).toBe(
    'Eerste regel\nTweede regel met behouden tekst.',
  );
});
