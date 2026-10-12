import { expect, test, type Page } from '@playwright/test';

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
async function drafts(page: Page, fragment: string) {
  return page.evaluate(
    (fragment) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('ima-apply.draft.v1.'))
        .map((key) => ({
          key,
          raw: localStorage.getItem(key)!,
          draft: JSON.parse(localStorage.getItem(key)!),
        }))
        .filter((item) => item.draft.key.includes(fragment)),
    fragment,
  );
}
async function modules(page: Page) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'Modules & scope', exact: true }).click();
}
async function learning(page: Page) {
  await page.getByRole('button', { name: 'Onderzoek & cijfers', exact: true }).click();
}
async function boot(page: Page) {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
}

test('module choices, order and dossier scope recover; failed durable save preserves all writer concepts', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await boot(page);
  await page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!);
    envelope.workspace.organisations = [
      {
        id: 'recovery-organisation',
        name: 'Herstelorganisatie',
        description: 'Fictieve scope voor hersteltest',
      },
    ];
    localStorage.setItem('ima-apply.workspace.v1', JSON.stringify(envelope));
  });
  await page.reload();
  await modules(page);
  await page.getByRole('button', { name: 'Moduleplan', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Moduleplan vastleggen', exact: true });
  await dialog.getByLabel('Plantitel', { exact: true }).fill('Herstelbare modulekeuze Ω');
  await dialog
    .getByRole('combobox', { name: 'Organisatie', exact: true })
    .selectOption('recovery-organisation');
  await dialog
    .getByRole('checkbox', { name: 'Module kiezen: Organisatie, taken en RI&E', exact: true })
    .check();
  await dialog
    .getByRole('checkbox', {
      name: 'Module kiezen: Agressie, dreiging en sociale interactie',
      exact: true,
    })
    .check();
  const rows = dialog.locator('.registry-item:has(input:checked)');
  await rows.nth(0).locator('textarea').fill('Afgebakende moduleactiviteit\nLaatste teken: Ω');
  await rows
    .nth(1)
    .getByRole('button', { name: /Module omhoog:/ })
    .click();
  const before = (await drafts(page, '/module-plan/new'))[0];
  expect(
    before.draft.value.modules.filter((item: { enabled: boolean }) => item.enabled),
  ).toHaveLength(2);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.getByRole('button', { name: 'Overzicht', exact: true }).click();
  await page.reload();
  await modules(page);
  await page.getByRole('button', { name: 'Moduleplan', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Moduleplan vastleggen', exact: true });
  await expect(dialog.getByLabel('Plantitel', { exact: true })).toHaveValue(
    'Herstelbare modulekeuze Ω',
  );
  await expect(dialog.locator('textarea').nth(1)).toHaveValue(
    'Afgebakende moduleactiviteit\nLaatste teken: Ω',
  );
  await expect(dialog.getByRole('status').filter({ hasText: 'Concept hersteld' })).toContainText(
    'Concept hersteld',
  );
  await dialog.getByRole('button', { name: 'Moduleplan opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).modulePlans?.length).toBe(1);
  expect((await state(page)).modulePlans[0].modules).toEqual(before.draft.value.modules);
  expect(
    (await drafts(page, '/module-plan/new')).find((item) => item.key === before.key)?.raw,
  ).toBe(before.raw);
  await page
    .getByRole('button', { name: 'Dossier uit moduleplan: Herstelbare modulekeuze Ω', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Dossier uit moduleplan', exact: true });
  await dialog.getByLabel('Dossiertitel', { exact: true }).fill('Herstelbaar modulescopedossier');
  await dialog
    .getByLabel('Afgebakende scope', { exact: true })
    .fill('Exacte scope\nAlleen benoemde activiteiten Ω');
  await dialog.getByLabel('Beoordelaar', { exact: true }).fill('Expliciete actor Ω');
  const dossierBefore = (await drafts(page, '/module-plan-dossier/'))[0];
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.reload();
  await modules(page);
  await page
    .getByRole('button', { name: 'Dossier uit moduleplan: Herstelbare modulekeuze Ω', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Dossier uit moduleplan', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Afgebakende scope', exact: true })).toHaveValue(
    'Exacte scope\nAlleen benoemde activiteiten Ω',
  );
  await expect(dialog.getByLabel('Beoordelaar', { exact: true })).toHaveValue('Expliciete actor Ω');
  await dialog
    .getByLabel('Dossiertitel', { exact: true })
    .fill('Herstelbaar modulescopedossier na opslagfout');
  const currentDraft = (await drafts(page, '/module-plan-dossier/')).find(
    (item) => item.key !== dossierBefore.key,
  )!;
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'ima-apply.workspace.v1')
        throw new DOMException('Simulated durable storage failure', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await dialog
    .getByRole('button', { name: 'Dossier met bevroren modulekeuze aanmaken', exact: true })
    .click();
  await expect(page.getByText(/Niet lokaal opgeslagen:/)).toBeVisible();
  expect((await state(page)).dossiers).toHaveLength(0);
  const remaining = await drafts(page, '/module-plan-dossier/');
  expect(remaining.find((item) => item.key === dossierBefore.key)?.raw).toBe(dossierBefore.raw);
  expect(remaining.find((item) => item.key === currentDraft.key)?.raw).toBe(currentDraft.raw);
  await page.reload();
  await expect.poll(async () => (await state(page)).dossiers.length).toBe(1);
  expect((await state(page)).dossiers[0].scope).toBe(
    'Exacte scope\nAlleen benoemde activiteiten Ω',
  );
  expect((await state(page)).dossiers[0].assessor).toBe('Expliciete actor Ω');
  expect(errors).toEqual([]);
});

test('complete investigation and exposure concepts retain original baselines and refuse changed source restoration', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!);
    envelope.workspace.investigations = [
      {
        id: 'recovery-investigation',
        title: 'Oorspronkelijk onderzoek',
        incidentId: envelope.workspace.incidents[0].id,
        method: 'five_whys',
        methodVersion: '1.0.0',
        status: 'draft',
        facts: 'Oorspronkelijke feiten',
        whyChain: ['Oorspronkelijk waarom'],
        topEvent: 'Oorspronkelijk top event',
        threats: ['Oorspronkelijke dreiging'],
        preventiveBarriers: ['Oorspronkelijke preventie'],
        recoveryBarriers: ['Oorspronkelijk herstel'],
        consequences: ['Oorspronkelijk gevolg'],
        basisRiskFactors: ['Eigen code met betekenis'],
        evidenceIds: [],
        actionIds: [],
        conclusion: 'Oorspronkelijke conclusie',
        reviewedBy: '',
        reviewNote: '',
      },
    ];
    envelope.workspace.exposure = [
      {
        id: 'recovery-exposure',
        period: '2026-09',
        departmentId: '',
        hoursWorked: 2000,
        source: 'Oorspronkelijke urenbron',
      },
    ];
    localStorage.setItem('ima-apply.workspace.v1', JSON.stringify(envelope));
  });
  await page.reload();
  await learning(page);
  const originalInvestigation = (await state(page)).investigations[0];
  const originalExposure = (await state(page)).exposure[0];
  await page
    .getByRole('button', { name: 'Oorspronkelijk onderzoek · Concept', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Feiten en afbakening', exact: false })
    .fill('Exact interviewfeit\nLaatste teken: Ω');
  await page.getByRole('textbox', { name: 'Waarom 1', exact: true }).fill('Exact waarom Ω');
  await page
    .getByRole('combobox', { name: 'Onderzoeksmethode', exact: true })
    .selectOption('bow_tie');
  await page
    .getByRole('textbox', { name: 'Dreigingen / oorzaken', exact: false })
    .fill('Exacte dreiging Ω');
  await page
    .getByRole('textbox', { name: 'Conclusie, bewijs en beperkingen', exact: false })
    .fill('Nog niet beoordeelde conclusie Ω');
  const investigationBefore = (await drafts(page, '/investigation/recovery-investigation'))[0];
  expect(investigationBefore.draft.value.loadedSource).toBe(JSON.stringify(originalInvestigation));
  expect(investigationBefore.draft.value.record.whyChain).toEqual(['Exact waarom Ω']);
  expect(investigationBefore.draft.value.record.preventiveBarriers).toEqual(
    originalInvestigation.preventiveBarriers,
  );
  await page.getByRole('button', { name: 'Concept sluiten', exact: true }).click();
  await page.getByRole('button', { name: 'Gewerkte uren', exact: true }).click();
  await page
    .locator('tr')
    .filter({ hasText: 'Oorspronkelijke urenbron' })
    .getByRole('button', { name: 'Bewerken', exact: true })
    .click();
  await page.getByLabel('Werkelijk gewerkte uren', { exact: true }).fill('2175.5');
  await page
    .getByRole('textbox', { name: 'Bron en afbakening', exact: false })
    .fill('Exacte urenbron\nLaatste teken: Ω');
  const exposureBefore = (await drafts(page, '/exposure/recovery-exposure'))[0];
  expect(exposureBefore.draft.value.loadedExposure).toBe(JSON.stringify(originalExposure));
  await page.getByRole('button', { name: 'Overzicht', exact: true }).click();
  await page.reload();
  await learning(page);
  await page
    .getByRole('button', { name: 'Oorspronkelijk onderzoek · Concept', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Feiten en afbakening', exact: false }),
  ).toHaveValue('Exact interviewfeit\nLaatste teken: Ω');
  await expect(page.getByRole('combobox', { name: 'Onderzoeksmethode', exact: true })).toHaveValue(
    'bow_tie',
  );
  await expect(
    page.getByRole('textbox', { name: 'Dreigingen / oorzaken', exact: false }),
  ).toHaveValue('Exacte dreiging Ω');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('reviewed');
  await page.getByRole('button', { name: 'Onderzoek opslaan', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('gekoppeld bewijs');
  expect((await state(page)).investigations[0]).toEqual(originalInvestigation);
  expect(
    (await drafts(page, '/investigation/recovery-investigation')).find(
      (item) => item.key === investigationBefore.key,
    )?.raw,
  ).toBe(investigationBefore.raw);
  await page.getByRole('button', { name: 'Concept sluiten', exact: true }).click();
  await page.getByRole('button', { name: 'Gewerkte uren', exact: true }).click();
  await page
    .locator('tr')
    .filter({ hasText: 'Oorspronkelijke urenbron' })
    .getByRole('button', { name: 'Bewerken', exact: true })
    .click();
  await expect(page.getByLabel('Werkelijk gewerkte uren', { exact: true })).toHaveValue('2175.5');
  await expect(page.getByRole('textbox', { name: 'Bron en afbakening', exact: false })).toHaveValue(
    'Exacte urenbron\nLaatste teken: Ω',
  );
  await page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!);
    envelope.workspace.investigations[0].facts = 'Andere opgeslagen feiten';
    envelope.workspace.exposure[0].source = 'Andere opgeslagen urenbron';
    localStorage.setItem('ima-apply.workspace.v1', JSON.stringify(envelope));
  });
  await page.reload();
  await learning(page);
  await page
    .getByRole('button', { name: 'Oorspronkelijk onderzoek · Concept', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Het bronrecord is veranderd');
  await expect(
    page.getByRole('textbox', { name: 'Feiten en afbakening', exact: false }),
  ).toHaveValue('Andere opgeslagen feiten');
  expect(
    (await drafts(page, '/investigation/recovery-investigation')).find(
      (item) => item.key === investigationBefore.key,
    )?.raw,
  ).toBe(investigationBefore.raw);
  await page.getByRole('button', { name: 'Concept sluiten', exact: true }).click();
  await page.getByRole('button', { name: 'Gewerkte uren', exact: true }).click();
  await page
    .locator('tr')
    .filter({ hasText: 'Andere opgeslagen urenbron' })
    .getByRole('button', { name: 'Bewerken', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Het bronrecord is veranderd');
  await expect(page.getByRole('textbox', { name: 'Bron en afbakening', exact: false })).toHaveValue(
    'Andere opgeslagen urenbron',
  );
  expect(
    (await drafts(page, '/exposure/recovery-exposure')).find(
      (item) => item.key === exposureBefore.key,
    )?.raw,
  ).toBe(exposureBefore.raw);
  expect(errors).toEqual([]);
});

test('a previously recovered and committed new investigation or exposure cannot silently reopen as another new record', async ({
  page,
}) => {
  await boot(page);
  await learning(page);
  await page.getByRole('button', { name: 'Onderzoek beginnen', exact: true }).click();
  await page.getByRole('textbox', { name: 'Titel', exact: true }).fill('Hersteld nieuw onderzoek');
  await page
    .getByRole('textbox', { name: 'Waarom 1', exact: true })
    .fill('Nieuwe onderzoeksvraag Ω');
  const investigationBefore = (await drafts(page, '/investigation/new'))[0];
  await page.getByRole('button', { name: 'Concept sluiten', exact: true }).click();
  await page.reload();
  await learning(page);
  await page.getByRole('button', { name: 'Onderzoek beginnen', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
    'Hersteld nieuw onderzoek',
  );
  await page.getByRole('button', { name: 'Onderzoek opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).investigations.length).toBe(1);
  expect((await state(page)).investigations[0].id).toBe(investigationBefore.draft.value.record.id);
  await page.getByRole('button', { name: 'Onderzoek beginnen', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('inmiddels is vastgelegd');
  expect(await page.getByRole('textbox', { name: 'Titel', exact: true }).inputValue()).not.toBe(
    'Hersteld nieuw onderzoek',
  );
  expect(
    (await drafts(page, '/investigation/new')).find((item) => item.key === investigationBefore.key)
      ?.raw,
  ).toBe(investigationBefore.raw);
  await page.getByRole('button', { name: 'Concept sluiten', exact: true }).click();
  await page.getByRole('button', { name: 'Gewerkte uren', exact: true }).click();
  await page.getByRole('button', { name: 'Maanduren vastleggen', exact: true }).click();
  await page.getByLabel('Hele kalendermaand', { exact: true }).fill('2026-08');
  await page.getByLabel('Werkelijk gewerkte uren', { exact: true }).fill('1875');
  await page
    .getByRole('textbox', { name: 'Bron en afbakening', exact: false })
    .fill('Herstelde nieuwe urenbron Ω');
  const exposureBefore = (await drafts(page, '/exposure/new'))[0];
  await page.getByRole('button', { name: 'Concept sluiten', exact: true }).click();
  await page.reload();
  await learning(page);
  await page.getByRole('button', { name: 'Gewerkte uren', exact: true }).click();
  await page.getByRole('button', { name: 'Maanduren vastleggen', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Bron en afbakening', exact: false })).toHaveValue(
    'Herstelde nieuwe urenbron Ω',
  );
  await page.getByRole('button', { name: 'Uren opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).exposure.length).toBe(1);
  expect((await state(page)).exposure[0].id).toBe(exposureBefore.draft.value.record.id);
  await page.getByRole('button', { name: 'Maanduren vastleggen', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('inmiddels is vastgelegd');
  await expect(page.getByRole('textbox', { name: 'Bron en afbakening', exact: false })).toHaveValue(
    '',
  );
  expect(
    (await drafts(page, '/exposure/new')).find((item) => item.key === exposureBefore.key)?.raw,
  ).toBe(exposureBefore.raw);
});
