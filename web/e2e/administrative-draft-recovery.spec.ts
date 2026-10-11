import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { WorkspaceState } from '../src/data/model';

type TestWorkspace = WorkspaceState & {
  organisations: NonNullable<WorkspaceState['organisations']>;
  sites: NonNullable<WorkspaceState['sites']>;
  departments: NonNullable<WorkspaceState['departments']>;
  topics: NonNullable<WorkspaceState['topics']>;
  legalRecords: NonNullable<WorkspaceState['legalRecords']>;
  dossiers: NonNullable<WorkspaceState['dossiers']>;
  evidence: NonNullable<WorkspaceState['evidence']>;
};
type StoredDraft = {
  storageKey: string;
  raw: string;
  draft: { key: string; base: string; writer: string; value: Record<string, unknown> };
};

async function state(page: Page): Promise<TestWorkspace> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
async function drafts(page: Page): Promise<StoredDraft[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('ima-apply.draft.v1.'))
      .map((storageKey) => {
        const raw = localStorage.getItem(storageKey)!;
        return { storageKey, raw, draft: JSON.parse(raw) };
      }),
  );
}
async function retained(page: Page, before: StoredDraft) {
  expect(await page.evaluate((key) => localStorage.getItem(key), before.storageKey)).toBe(
    before.raw,
  );
}
async function markdown(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  return readFile((await (await event).path())!, 'utf8');
}
async function administration(
  page: Page,
  tab: 'Organisatie' | 'Onderwerpen & regelgeving' | 'Dossiers & bewijs',
) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: tab, exact: true }).click();
}
async function boot(page: Page) {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  await page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!);
    envelope.workspace.organisations.push(
      {
        id: 'admin-organisation-a',
        name: 'Fictieve bronorganisatie A',
        description: 'Fictieve basisscope A',
      },
      {
        id: 'admin-organisation-b',
        name: 'Fictieve bronorganisatie B Ω',
        description: 'Fictieve basisscope B Ω',
      },
    );
    envelope.workspace.sites.push(
      {
        id: 'admin-site-a',
        organisationId: 'admin-organisation-a',
        name: 'Fictieve bronlocatie A',
        address: 'Fictieve locatie A',
      },
      {
        id: 'admin-site-b',
        organisationId: 'admin-organisation-b',
        name: 'Fictieve bronlocatie B Ω',
        address: 'Fictieve locatie B Ω',
      },
    );
    envelope.workspace.topics.push({
      id: 'admin-topic',
      title: 'Fictief gekoppeld onderwerp Ω',
      category: 'Browserproef',
      description: 'Fictieve broncontext',
      aliases: ['Fictief Ω'],
    });
    envelope.version = crypto.randomUUID();
    localStorage.setItem('ima-apply.workspace.v1', JSON.stringify(envelope));
  });
  await page.reload();
}
async function fillText(dialog: Locator, fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields))
    await dialog.getByRole('textbox', { name: label, exact: true }).fill(value);
}
async function expectText(dialog: Locator, fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields))
    await expect(dialog.getByRole('textbox', { name: label, exact: true })).toHaveValue(value);
}

for (const scope of [
  {
    kind: 'organisation',
    button: 'Organisatie',
    title: 'Organisatie toevoegen',
    descriptionLabel: 'Omschrijving',
    collection: 'organisations',
    descriptionKey: 'description',
  },
  {
    kind: 'site',
    button: 'Locatie',
    title: 'Locatie toevoegen',
    descriptionLabel: 'Adres / locatieomschrijving',
    collection: 'sites',
    descriptionKey: 'address',
    parentLabel: 'Organisatie',
    parentValue: 'admin-organisation-b',
    parentKey: 'organisationId',
    expectedParent: 'admin-organisation-b',
  },
  {
    kind: 'department-site',
    button: 'Afdeling',
    title: 'Afdeling toevoegen',
    descriptionLabel: 'Activiteiten',
    collection: 'departments',
    descriptionKey: 'activity',
    parentLabel: 'Locatie of organisatie',
    parentValue: 'site:admin-site-b',
    parentKey: 'siteId',
    expectedParent: 'admin-site-b',
  },
  {
    kind: 'department-organisation',
    button: 'Afdeling',
    title: 'Afdeling toevoegen',
    descriptionLabel: 'Activiteiten',
    collection: 'departments',
    descriptionKey: 'activity',
    parentLabel: 'Locatie of organisatie',
    parentValue: 'organisation:admin-organisation-b',
    parentKey: 'organisationId',
    expectedParent: 'admin-organisation-b',
  },
] as const) {
  test(`${scope.kind} restores all text and its parent choice, retains the prior writer and starts a distinct blank record`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await boot(page);
    await administration(page, 'Organisatie');
    // The organisation tab and its creation button share a label; the latter is inside the registry.
    await page
      .locator('.registry-grid')
      .getByRole('button', { name: scope.button, exact: true })
      .click();
    let dialog = page.getByRole('dialog', { name: scope.title, exact: true });
    const name = `Herstelbaar fictief ${scope.kind} Ω`;
    const description = `Exacte fictieve ${scope.kind} context\nTweede regel, laatste teken Ψ`;
    await fillText(dialog, { Naam: name, [scope.descriptionLabel]: description });
    if ('parentLabel' in scope)
      await dialog
        .getByRole('combobox', { name: scope.parentLabel, exact: true })
        .selectOption(scope.parentValue);
    const before = (await drafts(page)).find((item) => item.draft.value.name === name)!;
    expect(before).toBeDefined();
    await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
    await page.reload();
    await administration(page, 'Organisatie');
    await page
      .locator('.registry-grid')
      .getByRole('button', { name: scope.button, exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: scope.title, exact: true });
    await expectText(dialog, { Naam: name, [scope.descriptionLabel]: description });
    if ('parentLabel' in scope)
      await expect(
        dialog.getByRole('combobox', { name: scope.parentLabel, exact: true }),
      ).toHaveValue(scope.parentValue);
    await expect(dialog.getByRole('status')).toContainText('Concept hersteld');
    await dialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect
      .poll(async () => (await state(page))[scope.collection].some((item) => item.name === name))
      .toBe(true);
    const saved = (await state(page))[scope.collection].find((item) => item.name === name)!;
    expect(saved[scope.descriptionKey as keyof typeof saved]).toBe(description);
    if ('parentKey' in scope) {
      expect(saved[scope.parentKey as keyof typeof saved]).toBe(scope.expectedParent);
      if (scope.kind === 'department-organisation') expect('siteId' in saved).toBe(false);
    }
    await retained(page, before);
    await page
      .locator('.registry-grid')
      .getByRole('button', { name: scope.button, exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: scope.title, exact: true });
    await expectText(dialog, { Naam: '', [scope.descriptionLabel]: '' });
    const secondName = `Afzonderlijk nieuw ${scope.kind} Ψ`;
    await fillText(dialog, {
      Naam: secondName,
      [scope.descriptionLabel]: 'Afzonderlijke nieuwe scope Ω',
    });
    if ('parentLabel' in scope)
      await dialog
        .getByRole('combobox', { name: scope.parentLabel, exact: true })
        .selectOption(scope.parentValue);
    await dialog.getByRole('button', { name: 'Opslaan', exact: true }).click();
    await expect
      .poll(async () =>
        (await state(page))[scope.collection].some((item) => item.name === secondName),
      )
      .toBe(true);
    const after = (await state(page))[scope.collection];
    expect(after.find((item) => item.name === secondName)!.id).not.toBe(saved.id);
    expect(after.find((item) => item.id === saved.id)).toEqual(saved);
    await retained(page, before);
    expect(errors).toEqual([]);
  });
}

test('topic restores its complete Unicode content and aliases, retains the prior writer, and creates a distinct next record', async ({
  page,
}) => {
  await boot(page);
  await administration(page, 'Onderwerpen & regelgeving');
  await page.getByRole('button', { name: 'Onderwerp', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Onderwerp toevoegen', exact: true });
  const fields = {
    Onderwerptitel: 'Herstelbaar fictief onderwerp Ω',
    Categorie: 'Fictieve categorie Ψ',
    'Betekenis en afbakening': 'Exacte fictieve betekenis\nAfgebakende tweede regel Ω',
    'Synoniemen, gescheiden door komma': 'Alias Ω, Alias Ψ, afzonderlijk begrip Æ',
  };
  await fillText(dialog, fields);
  const before = (await drafts(page)).find(
    (item) => item.draft.value.title === fields.Onderwerptitel,
  )!;
  expect(before).toBeDefined();
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  const report = await markdown(page);
  expect(report).toContain('## Nog niet vastgelegde formulierconcepten');
  expect(report).toContain(fields.Onderwerptitel);
  expect(report).toContain('Afgebakende tweede regel Ω');
  await page.reload();
  await administration(page, 'Onderwerpen & regelgeving');
  await page.getByRole('button', { name: 'Onderwerp', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Onderwerp toevoegen', exact: true });
  await expectText(dialog, fields);
  await dialog.getByRole('button', { name: 'Onderwerp opslaan', exact: true }).click();
  await expect
    .poll(async () =>
      (await state(page)).topics.some((item) => item.title === fields.Onderwerptitel),
    )
    .toBe(true);
  const saved = (await state(page)).topics.find((item) => item.title === fields.Onderwerptitel)!;
  expect(saved).toMatchObject({
    title: fields.Onderwerptitel,
    category: fields.Categorie,
    description: fields['Betekenis en afbakening'],
    aliases: ['Alias Ω', 'Alias Ψ', 'afzonderlijk begrip Æ'],
  });
  await retained(page, before);
  await page.getByRole('button', { name: 'Onderwerp', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Onderwerp toevoegen', exact: true });
  await expectText(dialog, Object.fromEntries(Object.keys(fields).map((label) => [label, ''])));
  await dialog
    .getByRole('textbox', { name: 'Onderwerptitel', exact: true })
    .fill('Afzonderlijk volgend onderwerp Ψ');
  await dialog.getByRole('button', { name: 'Onderwerp opslaan', exact: true }).click();
  await expect
    .poll(async () =>
      (await state(page)).topics.some((item) => item.title === 'Afzonderlijk volgend onderwerp Ψ'),
    )
    .toBe(true);
  expect(
    (await state(page)).topics.find((item) => item.title === 'Afzonderlijk volgend onderwerp Ψ')!
      .id,
  ).not.toBe(saved.id);
  await retained(page, before);
});

test('legal signal keeps all text, dates and topic choices through validation rejection and reload, then starts a distinct blank record', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await administration(page, 'Onderwerpen & regelgeving');
  await page.getByRole('button', { name: 'Regelgevingssignaal', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Regelgevingssignaal vastleggen', exact: true });
  const oversized = `${'Ω'.repeat(100_000)}Ψ`;
  const fields = {
    Signaaltitel: 'Fictief volledig regelgevingsconcept Ω',
    'Officiële bron-URL': 'https://example.invalid/fictieve-bron-%CE%A9?test=concept',
    'Artikel / publicatieverwijzing': 'Fictieve publicatie § Ω / artikel Ψ',
    Jurisdictie: 'Fictieve jurisdictie Ω',
    'Wat is gepubliceerd of gesignaleerd?': oversized,
    'Toepassing op deze werkruimte':
      'Exacte fictieve toepassing\nNog te onderzoeken, laatste teken Ψ',
  };
  await fillText(dialog, fields);
  await dialog.getByRole('combobox', { name: 'Bronstatus', exact: true }).selectOption('published');
  await dialog.getByLabel('Ingangsdatum', { exact: true }).fill('2026-10-10');
  await dialog.getByLabel('Laatste broncontrole', { exact: true }).fill('2026-10-11');
  await dialog
    .getByRole('checkbox', { name: 'Fictief gekoppeld onderwerp Ω', exact: true })
    .check();
  const mainBefore = await state(page);
  await dialog.getByRole('button', { name: 'Signaal opslaan', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expectText(dialog, fields);
  expect((await state(page)).legalRecords).toEqual(mainBefore.legalRecords);
  const before = (await drafts(page)).find(
    (item) => item.draft.value.title === fields.Signaaltitel,
  )!;
  expect(before.draft.value.summary).toBe(oversized);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  const report = await markdown(page);
  expect(report).toContain(oversized);
  expect(report).toContain(fields['Toepassing op deze werkruimte'].split('\n')[1]);
  expect(report).toContain('nog geen vastgesteld dossierrecord');
  await page.reload();
  await administration(page, 'Onderwerpen & regelgeving');
  await page.getByRole('button', { name: 'Regelgevingssignaal', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Regelgevingssignaal vastleggen', exact: true });
  await expectText(dialog, fields);
  await expect(dialog.getByRole('combobox', { name: 'Bronstatus', exact: true })).toHaveValue(
    'published',
  );
  await expect(dialog.getByLabel('Ingangsdatum', { exact: true })).toHaveValue('2026-10-10');
  await expect(dialog.getByLabel('Laatste broncontrole', { exact: true })).toHaveValue(
    '2026-10-11',
  );
  await expect(
    dialog.getByRole('checkbox', { name: 'Fictief gekoppeld onderwerp Ω', exact: true }),
  ).toBeChecked();
  const validSummary =
    'Geldige fictieve samenvatting na geweigerde invoer Ω\nExact laatste teken Ψ';
  await dialog
    .getByRole('textbox', { name: 'Wat is gepubliceerd of gesignaleerd?', exact: true })
    .fill(validSummary);
  await dialog.getByRole('button', { name: 'Signaal opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () =>
      (await state(page)).legalRecords.some((item) => item.title === fields.Signaaltitel),
    )
    .toBe(true);
  const saved = (await state(page)).legalRecords.find(
    (item) => item.title === fields.Signaaltitel,
  )!;
  expect(saved).toMatchObject({
    title: fields.Signaaltitel,
    officialUrl: fields['Officiële bron-URL'],
    citation: fields['Artikel / publicatieverwijzing'],
    jurisdiction: fields.Jurisdictie,
    status: 'published',
    effectiveOn: '2026-10-10',
    lastVerifiedOn: '2026-10-11',
    summary: validSummary,
    impact: fields['Toepassing op deze werkruimte'],
    topicIds: ['admin-topic'],
  });
  expect(saved.id).toBe(before.draft.value.id);
  await retained(page, before);
  await page.getByRole('button', { name: 'Regelgevingssignaal', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Regelgevingssignaal vastleggen', exact: true });
  await expectText(dialog, {
    Signaaltitel: '',
    'Officiële bron-URL': '',
    'Artikel / publicatieverwijzing': '',
    Jurisdictie: 'NL',
    'Wat is gepubliceerd of gesignaleerd?': '',
    'Toepassing op deze werkruimte': '',
  });
  await expect(dialog.getByRole('combobox', { name: 'Bronstatus', exact: true })).toHaveValue(
    'signal',
  );
  await expect(dialog.getByLabel('Ingangsdatum', { exact: true })).toHaveValue('');
  await expect(
    dialog.getByRole('checkbox', { name: 'Fictief gekoppeld onderwerp Ω', exact: true }),
  ).not.toBeChecked();
  await fillText(dialog, {
    Signaaltitel: 'Afzonderlijk nieuw fictief signaal Ψ',
    'Officiële bron-URL': 'https://example.invalid/afzonderlijk',
    'Wat is gepubliceerd of gesignaleerd?': 'Afzonderlijke nieuwe samenvatting Ω',
  });
  await dialog.getByRole('button', { name: 'Signaal opslaan', exact: true }).click();
  await expect
    .poll(async () =>
      (await state(page)).legalRecords.some(
        (item) => item.title === 'Afzonderlijk nieuw fictief signaal Ψ',
      ),
    )
    .toBe(true);
  expect(
    (await state(page)).legalRecords.find(
      (item) => item.title === 'Afzonderlijk nieuw fictief signaal Ψ',
    )!.id,
  ).not.toBe(saved.id);
  await retained(page, before);
  expect(errors).toEqual([]);
});

async function createDossierWithEvidence(page: Page, title: string) {
  await administration(page, 'Dossiers & bewijs');
  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken', exact: true });
  await fillText(dialog, {
    Dossiertitel: title,
    'Afgebakende scope': 'Fictieve afgebakende beoordelingsscope Ω',
    Beoordelaar: 'Fictieve oorspronkelijke dossierbeoordelaar Ψ',
  });
  await dialog.locator('.link-choices').last().getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () => (await state(page)).dossiers.some((item) => item.title === title))
    .toBe(true);
  const dossier = (await state(page)).dossiers.find((item) => item.title === title)!;
  await page.getByRole('button', { name: 'Bewijs', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Bewijs vastleggen en beoordelen', exact: true });
  await fillText(dialog, {
    Bewijstitel: `Fictieve interviewbron bij ${title}`,
    'Inhoud en toepassingsbereik': 'Fictieve interviewclaim Ω\nWerking nog niet geverifieerd Ψ',
  });
  await dialog
    .getByRole('textbox', { name: /^Verwijzing naar bestand of bron/ })
    .fill('fictief/interview/Ω');
  await dialog
    .getByRole('combobox', { name: 'Bewijssoort', exact: true })
    .selectOption('interview');
  await dialog.getByRole('button', { name: 'Bewijs opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () => (await state(page)).evidence.some((item) => item.dossierId === dossier.id))
    .toBe(true);
  return {
    dossier,
    evidence: (await state(page)).evidence.find((item) => item.dossierId === dossier.id)!,
  };
}

test('dossier review restores reviewer, status and exact decision with evidence context, without changing evidence qualification', async ({
  page,
}) => {
  await boot(page);
  const { dossier, evidence } = await createDossierWithEvidence(
    page,
    'Fictief herstelbaar beoordelingsdossier Ω',
  );
  await page.getByRole('button', { name: 'Dossier beoordelen', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Dossier beoordelen', exact: true });
  const reviewer = 'Fictieve beoordelend verantwoordelijke Ω';
  const note = `Exact fictief besluit Ω\nInterviewbron ${evidence.id}: ${evidence.title}\nOpen bewijsverificatie blijft bestaan Ψ`;
  await fillText(dialog, {
    'Beoordelend verantwoordelijke': reviewer,
    'Beoordelingsbesluit en open punten': note,
  });
  await dialog
    .getByRole('combobox', { name: 'Dossierstatus', exact: true })
    .selectOption('completed');
  const before = (await drafts(page)).find((item) => item.draft.value.reviewNote === note)!;
  expect(before).toBeDefined();
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  expect((await state(page)).dossiers.find((item) => item.id === dossier.id)).toEqual(dossier);
  await page.reload();
  await administration(page, 'Dossiers & bewijs');
  await page.getByRole('button', { name: 'Dossier beoordelen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Dossier beoordelen', exact: true });
  await expectText(dialog, {
    'Beoordelend verantwoordelijke': reviewer,
    'Beoordelingsbesluit en open punten': note,
  });
  await expect(dialog.getByRole('combobox', { name: 'Dossierstatus', exact: true })).toHaveValue(
    'completed',
  );
  await dialog.getByRole('button', { name: 'Beoordeling vastleggen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(
      async () => (await state(page)).dossiers.find((item) => item.id === dossier.id)?.reviewNote,
    )
    .toBe(note);
  const after = await state(page);
  expect(after.dossiers.find((item) => item.id === dossier.id)).toMatchObject({
    status: 'completed',
    reviewedBy: reviewer,
    reviewNote: note,
    questions: dossier.questions,
  });
  expect(after.evidence.find((item) => item.id === evidence.id)).toEqual(evidence);
  expect(evidence.status).toBe('unverified');
  await retained(page, before);
  const report = await markdown(page);
  expect(report).toContain(reviewer);
  expect(report).toContain(evidence.id);
  expect(report).toContain('Open bewijsverificatie blijft bestaan Ψ');
});

test('a changed dossier source refuses automatic rebinding of the old review and preserves its reviewer and evidence context in Markdown', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  const { dossier, evidence } = await createDossierWithEvidence(
    page,
    'Fictief gewijzigd beoordelingsdossier Ω',
  );
  await page.getByRole('button', { name: 'Dossier beoordelen', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Dossier beoordelen', exact: true });
  const priorReviewer = 'Oude expliciete conceptbeoordelaar Ω';
  const priorNote = `Oud conceptbesluit vóór bronwijziging Ω\nOude bewijscontext: ${evidence.id} / ${evidence.title}\nExact laatste teken Ψ`;
  await fillText(dialog, {
    'Beoordelend verantwoordelijke': priorReviewer,
    'Beoordelingsbesluit en open punten': priorNote,
  });
  await dialog
    .getByRole('combobox', { name: 'Dossierstatus', exact: true })
    .selectOption('completed');
  const before = (await drafts(page)).find((item) => item.draft.value.reviewNote === priorNote)!;
  expect(before).toBeDefined();
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.evaluate(
    ({ dossierId }) => {
      const envelope = JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!);
      const source = envelope.workspace.dossiers.find(
        (item: { id: string }) => item.id === dossierId,
      );
      source.status = 'active';
      source.reviewedBy = 'Nieuwe opgeslagen dossierbeoordelaar Æ';
      source.reviewNote = 'Nieuw opgeslagen besluit op gewijzigde bron Æ';
      source.reviewedAt = new Date().toISOString();
      envelope.workspace.revision += 1;
      envelope.workspace.updatedAt = new Date().toISOString();
      envelope.version = crypto.randomUUID();
      localStorage.setItem('ima-apply.workspace.v1', JSON.stringify(envelope));
    },
    { dossierId: dossier.id },
  );
  await page.reload();
  const changed = (await state(page)).dossiers.find((item) => item.id === dossier.id)!;
  await administration(page, 'Dossiers & bewijs');
  await page.getByRole('button', { name: 'Dossier beoordelen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Dossier beoordelen', exact: true });
  await expectText(dialog, {
    'Beoordelend verantwoordelijke': changed.reviewedBy!,
    'Beoordelingsbesluit en open punten': changed.reviewNote!,
  });
  await expect(dialog.getByRole('combobox', { name: 'Dossierstatus', exact: true })).toHaveValue(
    'active',
  );
  await expect(dialog.getByRole('alert')).toContainText('bronrecord is veranderd');
  await expect(
    dialog.getByRole('combobox', { name: 'Kies een lokaal concept om te herstellen', exact: true }),
  ).toHaveCount(0);
  expect((await state(page)).dossiers.find((item) => item.id === dossier.id)).toEqual(changed);
  expect((await state(page)).evidence.find((item) => item.id === evidence.id)).toEqual(evidence);
  await retained(page, before);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  const report = await markdown(page);
  expect(report).toContain('## Nog niet vastgelegde formulierconcepten');
  expect(report).toContain(priorReviewer);
  expect(report).toContain(priorNote.split('\n')[0]);
  expect(report).toContain(evidence.id);
  expect(report).toContain('Exact laatste teken Ψ');
  expect(report).toContain(changed.reviewedBy!);
  expect(report).toContain(changed.reviewNote!);
  await retained(page, before);
  expect(errors).toEqual([]);
});
