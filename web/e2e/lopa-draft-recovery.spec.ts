import { expect, test, type Page } from '@playwright/test';

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
async function openLopa(page: Page) {
  await page.getByRole('button', { name: 'Risicowerkbank', exact: true }).click();
  await page.getByRole('button', { name: 'LOPA', exact: true }).click();
}
async function start(page: Page, withLopa: boolean) {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  await page.evaluate((withLopa) => {
    const envelope = JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!);
    envelope.workspace.name = 'Fictieve LOPA-concepthersteltest';
    if (withLopa)
      envelope.workspace.scenarios[0].lopa = {
        initiatingEvent: 'Fictieve initiator',
        initiatingFrequency: { min: 0.1, value: 0.2, max: 0.3 },
        frequencyEvidence: 'Oorspronkelijke frequentiegrond.',
        consequence: 'Fictief ernstig letsel',
        layers: [
          {
            id: 'fictieve-ipl',
            title: 'Fictieve beschermlaag',
            status: 'planned',
            evidence: 'unverified',
            evidenceNote: 'Oorspronkelijke IPL-grond.',
            pfd: { min: 0.05, value: 0.1, max: 0.2 },
            specific: false,
            independent: false,
            independentOfInitiator: false,
            auditable: false,
            effective: false,
            independenceNote: 'Oorspronkelijke onafhankelijkheidsgrond.',
          },
        ],
        modifiers: [
          {
            id: 'fictieve-modifier',
            title: 'Fictieve voorwaarde',
            kind: 'conditional',
            probability: { min: 0.2, value: 0.3, max: 0.5 },
            evidence: 'unverified',
            evidenceNote: 'Oorspronkelijke modifiergrond.',
            independent: false,
            rationale: 'Oorspronkelijke conditionele grond.',
          },
        ],
        targetFrequency: 0.01,
        assumptions: 'Oorspronkelijke aannamesgrond.',
      };
    else delete envelope.workspace.scenarios[0].lopa;
    localStorage.setItem('ima-apply.workspace.v1', JSON.stringify(envelope));
  }, withLopa);
  await page.reload();
  await openLopa(page);
}
test('complete LOPA concept preserves exact interview ground, IPL notes and modifier notes across navigation/reload without credit', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page, true);
  const original = (await state(page)).scenarios[0].lopa;
  const frequency = 'Exacte frequentieonderbouwing\nLaatste interviewteken: Ω';
  const basis = 'Nieuwe nog niet vastgelegde aannames Ω';
  const ipl = 'Exacte nog te toetsen IPL-bewijsgrond Ω';
  const independence = 'Onafhankelijkheid nog niet vastgesteld Ω';
  const modifier = 'Exacte nog te toetsen modifiergrond Ω';
  await page
    .getByRole('textbox', { name: 'Bron en onderbouwing frequentie', exact: true })
    .fill(frequency);
  await page
    .getByRole('textbox', { name: 'Aannames en criteriumbesluit', exact: true })
    .fill(basis);
  await page.getByRole('textbox', { name: 'Bewijs (incl. PFD-basis)', exact: true }).fill(ipl);
  await page
    .getByRole('textbox', { name: 'Onafhankelijkheid onderbouwen', exact: true })
    .fill(independence);
  // Modifier evidence has its own field label, distinct from the IPL basis.
  await page.getByRole('textbox', { name: 'Bewijs', exact: true }).fill(modifier);
  expect((await state(page)).scenarios[0].lopa).toEqual(original);
  await page.getByRole('button', { name: 'Overzicht', exact: true }).click();
  await openLopa(page);
  await expect(
    page.getByRole('textbox', { name: 'Bron en onderbouwing frequentie', exact: true }),
  ).toHaveValue(frequency);
  await expect(
    page.getByRole('textbox', { name: 'Bewijs (incl. PFD-basis)', exact: true }),
  ).toHaveValue(ipl);
  await page.reload();
  await openLopa(page);
  await expect(
    page.getByRole('textbox', { name: 'Bron en onderbouwing frequentie', exact: true }),
  ).toHaveValue(frequency);
  await expect(
    page.getByRole('textbox', { name: 'Aannames en criteriumbesluit', exact: true }),
  ).toHaveValue(basis);
  await expect(
    page.getByRole('textbox', { name: 'Bewijs (incl. PFD-basis)', exact: true }),
  ).toHaveValue(ipl);
  await expect(
    page.getByRole('textbox', { name: 'Onafhankelijkheid onderbouwen', exact: true }),
  ).toHaveValue(independence);
  await expect(page.getByRole('textbox', { name: 'Bewijs', exact: true })).toHaveValue(modifier);
  await expect(page.locator('body')).toContainText('Nog te toetsen');
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).scenarios[0].lopa.frequencyEvidence)
    .toBe(frequency);
  const saved = (await state(page)).scenarios[0].lopa;
  expect(saved.layers[0].evidenceNote).toBe(ipl);
  expect(saved.layers[0].independenceNote).toBe(independence);
  expect(saved.layers[0].evidence).toBe('unverified');
  expect(saved.layers[0].independent).toBe(false);
  expect(saved.layers[0].effective).toBe(false);
  expect(saved.modifiers[0].evidenceNote).toBe(modifier);
  expect(saved.modifiers[0].evidence).toBe('unverified');
  expect(saved.modifiers[0].independent).toBe(false);
  expect(errors).toEqual([]);
});
test('unfinished LOPA setup is recoverable after closing/reload and remains a concept until valid save', async ({
  page,
}) => {
  await start(page, false);
  await page.getByRole('button', { name: 'LOPA opzetten', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'LOPA-scenario opzetten', exact: true });
  const frequency = 'Exacte bron voor initiatorfrequentie Ω';
  const basis = 'Exacte eigen criteriumgrond Ω';
  await dialog
    .getByRole('textbox', { name: 'Eén initiërende gebeurtenis', exact: true })
    .fill('Fictieve enkele initiator Ω');
  await dialog
    .getByRole('textbox', { name: 'Onderbouwing / bron initiatorfrequentie', exact: true })
    .fill(frequency);
  await dialog
    .getByRole('textbox', { name: 'Aannames en vaststelling criterium', exact: true })
    .fill(basis);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  expect((await state(page)).scenarios[0].lopa).toBeUndefined();
  await page.reload();
  await openLopa(page);
  await page.getByRole('button', { name: 'LOPA opzetten', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'LOPA-scenario opzetten', exact: true });
  await expect(
    dialog.getByRole('textbox', { name: 'Eén initiërende gebeurtenis', exact: true }),
  ).toHaveValue('Fictieve enkele initiator Ω');
  await expect(
    dialog.getByRole('textbox', { name: 'Onderbouwing / bron initiatorfrequentie', exact: true }),
  ).toHaveValue(frequency);
  await expect(
    dialog.getByRole('textbox', { name: 'Aannames en vaststelling criterium', exact: true }),
  ).toHaveValue(basis);
  await dialog.getByRole('button', { name: 'LOPA-scenario vastleggen', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).scenarios[0].lopa?.frequencyEvidence)
    .toBe(frequency);
  expect((await state(page)).scenarios[0].lopa.layers).toEqual([]);
  expect((await state(page)).scenarios[0].lopa.modifiers).toEqual([]);
});
