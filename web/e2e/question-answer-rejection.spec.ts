import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { WorkspaceState } from '../src/data/model';

const workspaceKey = 'ima-apply.workspace.v1';

type TestWorkspace = WorkspaceState & {
  dossiers: NonNullable<WorkspaceState['dossiers']>;
  observations: NonNullable<WorkspaceState['observations']>;
  findings: NonNullable<WorkspaceState['findings']>;
};

async function state(page: Page): Promise<TestWorkspace> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workspace, workspaceKey);
}

async function draftValues(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('ima-apply.draft.v1.'))
      .map((key) => JSON.parse(localStorage.getItem(key)!).value),
  );
}

async function markdown(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  return readFile((await (await event).path())!, 'utf8');
}

async function createLinkedAnswer(page: Page, suffix: string) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken', exact: true });
  const dossierTitle = `Fictief validatieweigeringsdossier ${suffix}`;
  await dialog.getByRole('textbox', { name: 'Dossiertitel', exact: true }).fill(dossierTitle);
  await dialog
    .getByRole('textbox', { name: 'Afgebakende scope', exact: true })
    .fill('Fictieve browserproef: exacte concepttekst en bestaande responserelaties behouden.');
  await dialog
    .getByRole('textbox', { name: 'Beoordelaar', exact: true })
    .fill('Fictieve beoordelaar');
  await dialog.locator('.link-choices').last().getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () => (await state(page)).dossiers.some((item) => item.title === dossierTitle))
    .toBe(true);
  const dossier = (await state(page)).dossiers.find((item) => item.title === dossierTitle)!;

  const observationTitle = `Fictieve gekoppelde waarneming ${suffix}`;
  await page.getByRole('button', { name: 'Waarneming', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Waarneming vastleggen', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Waarnemingstitel', exact: true })
    .fill(observationTitle);
  await dialog.getByRole('textbox', { name: 'Waarnemer', exact: true }).fill('Fictieve observator');
  await dialog
    .getByRole('textbox', { name: 'Waargenomen feiten', exact: true })
    .fill('Fictief waargenomen feit voor een bewaarde tweezijdige responserelatie.');
  await dialog.getByRole('button', { name: 'Waarneming opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  const findingTitle = `Fictieve gekoppelde bevinding ${suffix}`;
  await page.getByRole('button', { name: 'Bevinding', exact: true }).click();
  dialog = page.getByRole('dialog', {
    name: 'Bevinding vastleggen en beoordelen',
    exact: true,
  });
  await dialog.getByRole('textbox', { name: 'Bevindingstitel', exact: true }).fill(findingTitle);
  await dialog
    .getByRole('textbox', { name: 'Bevinding en criterium', exact: true })
    .fill('Fictieve bevinding met expliciete relatie naar hetzelfde antwoord.');
  await dialog
    .getByRole('combobox', { name: 'Dossiervraag', exact: true })
    .selectOption(dossier.questions[0].id);
  await dialog.getByRole('button', { name: 'Bevinding opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await inventory(page, dossier.id);
  await page
    .getByRole('textbox', { name: 'Respondent / actor voor deze invoer', exact: true })
    .fill('Fictieve respondent oorspronkelijke invoer');
  const card = page.locator('.question-card').first();
  await card.getByRole('button', { name: 'Deels', exact: true }).click();
  await card
    .getByRole('textbox', { name: 'Toelichting / vervolg', exact: true })
    .fill('Oorspronkelijke vastgelegde toelichting Ω');
  await card
    .getByRole('textbox', { name: 'Bewijs / waarneming', exact: true })
    .fill('Oorspronkelijk vastgelegd bewijs Ψ');
  await expect
    .poll(async () => (await state(page)).answers[0]?.evidence)
    .toBe('Oorspronkelijk vastgelegd bewijs Ψ');
  await card.getByRole('button', { name: 'Response-relaties wijzigen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Response-relaties wijzigen', exact: true });
  await dialog.getByRole('checkbox', { name: observationTitle, exact: true }).check();
  await dialog.getByRole('checkbox', { name: findingTitle, exact: true }).check();
  await dialog.getByRole('button', { name: 'Relaties opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await state(page)).answers[0]?.observationIds?.length).toBe(1);
  await expect.poll(async () => (await state(page)).answers[0]?.findingIds?.length).toBe(1);
  return { dossier, answer: (await state(page)).answers[0] };
}

async function inventory(page: Page, dossierId: string) {
  await page.getByRole('button', { name: 'Inventarisatie', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Beoordelingsdossier', exact: true })
    .selectOption(dossierId);
  await expect(page.locator('.question-card')).toHaveCount(1);
}

for (const field of [
  { key: 'note', label: 'Toelichting / vervolg' },
  { key: 'evidence', label: 'Bewijs / waarneming' },
] as const) {
  test(`${field.key} validation rejection retains all 100001 Unicode characters, then commits with the same response identity and links`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
    const { dossier, answer: before } = await createLinkedAnswer(page, field.key);
    const oversized = `${'Ω'.repeat(100_000)}Ψ`;
    expect(oversized.length).toBe(100_001);
    expect(Array.from(oversized)).toHaveLength(100_001);
    let card = page.locator('.question-card').first();
    await card.getByRole('textbox', { name: field.label, exact: true }).fill(oversized);

    await expect(card.getByRole('alert')).toContainText('Vastleggen geweigerd');
    await expect(card.getByRole('textbox', { name: field.label, exact: true })).toHaveValue(
      oversized,
    );
    expect((await state(page)).answers[0]).toEqual(before);
    await expect
      .poll(async () => (await draftValues(page)).some((value) => value[field.key] === oversized))
      .toBe(true);
    const report = await markdown(page);
    expect(report).toContain('## Nog niet vastgelegde formulierconcepten');
    expect(report).toContain('nog geen vastgesteld dossierrecord');
    expect(report).toContain(oversized);
    expect(report).toContain(before[field.key]);
    expect((await state(page)).answers[0]).toEqual(before);

    await page.reload();
    await inventory(page, dossier.id);
    card = page.locator('.question-card').first();
    await expect(card.getByRole('textbox', { name: field.label, exact: true })).toHaveValue(
      oversized,
    );
    expect((await state(page)).answers[0]).toEqual(before);
    await expect(
      card.getByRole('region', { name: 'Response-relaties', exact: true }),
    ).toContainText('1 waarneming');
    await page
      .getByRole('textbox', { name: 'Respondent / actor voor deze invoer', exact: true })
      .fill('Fictieve respondent geldige correctie');
    const shortened = `Geldige verkorte ${field.key} na geweigerde invoer Ω\nExact laatste teken Ψ`;
    await card.getByRole('textbox', { name: field.label, exact: true }).fill(shortened);
    await expect.poll(async () => (await state(page)).answers[0]?.[field.key]).toBe(shortened);
    const final = await state(page);
    const saved = final.answers[0];
    expect(saved.id).toBe(before.id);
    expect(saved.questionId).toBe(before.questionId);
    expect(saved.dossierId).toBe(before.dossierId);
    expect(saved.questionSha256).toBe(before.questionSha256);
    expect(saved.observationIds).toEqual(before.observationIds);
    expect(saved.findingIds).toEqual(before.findingIds);
    expect(saved.choice).toBe(before.choice);
    expect(saved.respondedBy).toBe('Fictieve respondent geldige correctie');
    expect(saved[field.key === 'note' ? 'evidence' : 'note']).toBe(
      before[field.key === 'note' ? 'evidence' : 'note'],
    );
    for (const record of [...final.observations, ...final.findings].filter((item) =>
      [...(before.observationIds ?? []), ...(before.findingIds ?? [])].includes(item.id),
    )) {
      expect(record.responseIds).toEqual([before.id]);
    }
    await expect(card.getByRole('alert')).toHaveCount(0);
    await expect(card.getByRole('textbox', { name: field.label, exact: true })).toHaveValue(
      shortened,
    );
    expect(errors).toEqual([]);
  });
}
