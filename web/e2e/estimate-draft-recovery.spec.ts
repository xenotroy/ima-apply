import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { WorkspaceState } from '../src/data/model';
import type { Control, LopaScenario } from '../src/domain/types';

const workspaceKey = 'ima-apply.workspace.v1';
const controlId = 'fictitious-estimate-control';
const layerId = 'fictitious-estimate-layer-a';
const modifierId = 'fictitious-estimate-modifier-a';
type RawEstimate = { min: string; value: string; max: string };
type DraftValue = {
  rawEstimates?: Record<string, RawEstimate>;
  rawTargetFrequency?: string;
  control?: Control;
  estimates?: Record<string, RawEstimate>;
};
type StoredDraft = {
  storageKey: string;
  raw: string;
  draft: { key: string; writer: string; value: DraftValue };
};
const control: Control = {
  id: controlId,
  title: 'Fictieve intervalmaatregel Ω',
  ahs: 'collective',
  status: 'planned',
  evidence: 'unverified',
  evidenceNote: 'Fictieve bewijsgrond, nog te toetsen',
  rationale: 'Fictief werkingsmechanisme voor een softwareproef Ω',
  probabilityReduction: { min: 0.1, value: 0.2, max: 0.3 },
  exposureReduction: { min: 0.05, value: 0.1, max: 0.2 },
  effectReduction: { min: 0, value: 0.05, max: 0.1 },
  independent: false,
  feasibility: 'moderate',
  effort: 3,
  legalRequired: false,
};
function lopaFixture(): LopaScenario {
  return {
    initiatingEvent: 'Fictieve initiator Ω',
    initiatingFrequency: { min: 0.1, value: 0.2, max: 0.3 },
    frequencyEvidence: 'Fictieve frequentieonderbouwing, uitsluitend browserproef',
    consequence: 'Fictief eindpunt',
    targetFrequency: 0.01,
    assumptions: 'Fictief lokaal criterium en eigen aannames Ω',
    layers: [
      {
        id: layerId,
        title: 'Fictieve IPL A Ω',
        status: 'planned',
        evidence: 'unverified',
        evidenceNote: 'Fictieve IPL-grond A',
        pfd: { min: 0.05, value: 0.1, max: 0.2 },
        specific: false,
        independent: false,
        independentOfInitiator: false,
        auditable: false,
        effective: false,
        independenceNote: 'Fictieve onafhankelijkheid A',
      },
      {
        id: 'fictitious-estimate-layer-b',
        title: 'Fictieve IPL B Ψ',
        status: 'planned',
        evidence: 'unverified',
        evidenceNote: 'Fictieve IPL-grond B',
        pfd: { min: 0.15, value: 0.2, max: 0.25 },
        specific: false,
        independent: false,
        independentOfInitiator: false,
        auditable: false,
        effective: false,
        independenceNote: 'Fictieve onafhankelijkheid B',
      },
    ],
    modifiers: [
      {
        id: modifierId,
        title: 'Fictieve voorwaarde A Ω',
        kind: 'conditional',
        probability: { min: 0.2, value: 0.3, max: 0.5 },
        evidence: 'unverified',
        evidenceNote: 'Fictieve modifiergrond A',
        independent: false,
        rationale: 'Fictieve conditionele grond A',
      },
      {
        id: 'fictitious-estimate-modifier-b',
        title: 'Fictieve voorwaarde B Ψ',
        kind: 'enabling',
        probability: { min: 0.6, value: 0.7, max: 0.8 },
        evidence: 'unverified',
        evidenceNote: 'Fictieve modifiergrond B',
        independent: false,
        rationale: 'Fictieve conditionele grond B',
      },
    ],
  };
}
async function state(page: Page): Promise<WorkspaceState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workspace, workspaceKey);
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
async function markdown(page: Page) {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  return readFile((await (await download).path())!, 'utf8');
}
async function boot(page: Page) {
  await page.goto('/');
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
  await page.evaluate(
    ({ key, control, lopa }) => {
      const envelope = JSON.parse(localStorage.getItem(key)!);
      envelope.workspace.scenarios[0].controls = [control];
      envelope.workspace.scenarios[0].lopa = lopa;
      envelope.version = crypto.randomUUID();
      localStorage.setItem(key, JSON.stringify(envelope));
    },
    { key: workspaceKey, control, lopa: lopaFixture() },
  );
  await page.reload();
  return state(page);
}
async function openLopa(page: Page) {
  await page.getByRole('button', { name: 'Risicowerkbank', exact: true }).click();
  await page.getByRole('button', { name: 'LOPA', exact: true }).click();
}
function layer(page: Page) {
  return page
    .locator('.lopa-layer')
    .filter({ has: page.locator('input[value="Fictieve IPL A Ω"]') });
}
function modifier(page: Page) {
  return page
    .locator('.lopa-layer')
    .filter({ has: page.locator('input[value="Fictieve voorwaarde A Ω"]') });
}
async function setEstimate(scope: Page | Locator, label: string, raw: RawEstimate) {
  // The upper bound is entered first so ordinary widening of a range can become valid.
  for (const [key, suffix] of [
    ['max', 'bovengrens'],
    ['value', 'verwachting'],
    ['min', 'ondergrens'],
  ] as const)
    await scope.getByRole('textbox', { name: `${label} ${suffix}`, exact: true }).fill(raw[key]);
}
async function checkEstimate(scope: Page | Locator, label: string, raw: RawEstimate) {
  for (const [key, suffix] of [
    ['min', 'ondergrens'],
    ['value', 'verwachting'],
    ['max', 'bovengrens'],
  ] as const)
    await expect(
      scope.getByRole('textbox', { name: `${label} ${suffix}`, exact: true }),
    ).toHaveValue(raw[key]);
}
async function openControl(page: Page) {
  await page.getByRole('button', { name: 'Risicowerkbank', exact: true }).click();
  await page.getByRole('button', { name: 'Fine–Kinney / Wiruth', exact: true }).click();
  await page.locator('.control-row').filter({ hasText: control.title }).click();
  return page.getByRole('dialog', { name: 'Werking van de beheersmaatregel', exact: true });
}
const invalidLopa = {
  initiator: { min: '0.1', value: '1e-', max: '0.3' },
  pfd: { min: '-', value: '0.1', max: '0.2' },
  modifier: { min: '0.2', value: '0.3', max: '' },
};
const invalidControl = {
  probabilityReduction: { min: '1e-', value: '20', max: '30' },
  exposureReduction: { min: '5', value: '-', max: '20' },
  effectReduction: { min: '0', value: '5', max: '' },
};

test('all LOPA raw estimates and criterion survive navigation/reload/Markdown and save only corrected numbers without raw keys', async ({
  page,
}) => {
  const original = await boot(page);
  await openLopa(page);
  await setEstimate(page, 'Initiatorfrequentie per jaar', invalidLopa.initiator);
  await setEstimate(layer(page), 'PFD (faalkans op aanvraag)', invalidLopa.pfd);
  await setEstimate(modifier(page), 'Voorwaardelijke kans', invalidLopa.modifier);
  await page.getByRole('textbox', { name: /^Lokaal vastgesteld criterium/ }).fill('1e-');
  const before = (await drafts(page)).find((record) =>
    record.draft.key.includes('/lopa-workbench/'),
  )!;
  expect(before.draft.value.rawEstimates).toEqual({
    initiator: invalidLopa.initiator,
    [`layer/${layerId}`]: invalidLopa.pfd,
    [`modifier/${modifierId}`]: invalidLopa.modifier,
  });
  expect(before.draft.value.rawTargetFrequency).toBe('1e-');
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await expect(page.locator('.lopa-draft-bar')).toContainText(
    'Corrigeer de onvolledige of omgekeerde intervallen',
  );
  expect((await state(page)).scenarios).toEqual(original.scenarios);
  await page.getByRole('button', { name: 'Overzicht', exact: true }).click();
  await openLopa(page);
  await checkEstimate(page, 'Initiatorfrequentie per jaar', invalidLopa.initiator);
  await checkEstimate(layer(page), 'PFD (faalkans op aanvraag)', invalidLopa.pfd);
  await checkEstimate(modifier(page), 'Voorwaardelijke kans', invalidLopa.modifier);
  const report = await markdown(page);
  expect(report).toContain(`"layer/${layerId}"`);
  expect(report).toContain(`"modifier/${modifierId}"`);
  expect(report).toContain('"value": "1e-"');
  expect(report).toContain('"min": "-"');
  expect(report).toContain('"max": ""');
  expect(report).toContain('"rawTargetFrequency": "1e-"');
  await page.reload();
  await openLopa(page);
  await checkEstimate(page, 'Initiatorfrequentie per jaar', invalidLopa.initiator);
  await checkEstimate(layer(page), 'PFD (faalkans op aanvraag)', invalidLopa.pfd);
  await checkEstimate(modifier(page), 'Voorwaardelijke kans', invalidLopa.modifier);
  await expect(page.getByRole('textbox', { name: /^Lokaal vastgesteld criterium/ })).toHaveValue(
    '1e-',
  );
  expect((await state(page)).scenarios).toEqual(original.scenarios);
  await setEstimate(page, 'Initiatorfrequentie per jaar', {
    min: '0.0100',
    value: '2e-2',
    max: '0.0300',
  });
  await setEstimate(layer(page), 'PFD (faalkans op aanvraag)', {
    min: '0.0300',
    value: '4e-2',
    max: '0.0500',
  });
  await setEstimate(modifier(page), 'Voorwaardelijke kans', {
    min: '0.4000',
    value: '5e-1',
    max: '0.6000',
  });
  await page.getByRole('textbox', { name: /^Lokaal vastgesteld criterium/ }).fill('1e-5');
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).scenarios[0].lopa?.targetFrequency)
    .toBe(0.00001);
  const saved = (await state(page)).scenarios[0].lopa!;
  expect(saved.initiatingFrequency).toEqual({ min: 0.01, value: 0.02, max: 0.03 });
  expect(saved.layers[0].pfd).toEqual({ min: 0.03, value: 0.04, max: 0.05 });
  expect(saved.modifiers[0].probability).toEqual({ min: 0.4, value: 0.5, max: 0.6 });
  expect(saved.layers[1]).toEqual(original.scenarios[0].lopa!.layers[1]);
  expect(saved.modifiers[1]).toEqual(original.scenarios[0].lopa!.modifiers[1]);
  expect(saved.layers[0].evidence).toBe('unverified');
  expect(saved.layers[0].effective).toBe(false);
  expect(saved.modifiers[0].independent).toBe(false);
  expect(Object.keys(saved)).not.toContain('rawEstimates');
  expect(Object.keys(saved)).not.toContain('rawTargetFrequency');
  expect((await state(page)).scenarios[0].controls).toEqual(original.scenarios[0].controls);
  await page.reload();
  expect((await state(page)).scenarios[0].lopa).toEqual(saved);
});

test('inverted LOPA intervals and a blank criterion stay exact and cannot overwrite the prior assessment', async ({
  page,
}) => {
  const original = await boot(page);
  await openLopa(page);
  const inverted = { min: '0.8', value: '0.2', max: '0.3' };
  await setEstimate(page, 'Initiatorfrequentie per jaar', inverted);
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await expect(page.locator('.lopa-draft-bar')).toContainText('Corrigeer');
  expect((await state(page)).scenarios).toEqual(original.scenarios);
  await page.reload();
  await openLopa(page);
  await checkEstimate(page, 'Initiatorfrequentie per jaar', inverted);
  await setEstimate(page, 'Initiatorfrequentie per jaar', { min: '10', value: '20', max: '30' });
  // An initiator is a frequency per year and may exceed one; PFD/modifiers are probabilities.
  await page.getByRole('textbox', { name: /^Lokaal vastgesteld criterium/ }).fill('');
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await expect(page.locator('.lopa-draft-bar')).toContainText('Corrigeer');
  expect((await state(page)).scenarios).toEqual(original.scenarios);
  await page.reload();
  await openLopa(page);
  await checkEstimate(page, 'Initiatorfrequentie per jaar', { min: '10', value: '20', max: '30' });
  await expect(page.getByRole('textbox', { name: /^Lokaal vastgesteld criterium/ })).toHaveValue(
    '',
  );
  await page.getByRole('textbox', { name: /^Lokaal vastgesteld criterium/ }).fill('0.0200');
  await page.getByRole('button', { name: 'LOPA opslaan', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).scenarios[0].lopa?.initiatingFrequency.value)
    .toBe(20);
  expect((await state(page)).scenarios[0].lopa?.initiatingFrequency).toEqual({
    min: 10,
    value: 20,
    max: 30,
  });
});

test('all W/B/E raw factor strings survive closing/reload/Markdown and invalid save leaves the main control unchanged', async ({
  page,
}) => {
  const original = await boot(page);
  let dialog = await openControl(page);
  await setEstimate(dialog, 'Waarschijnlijkheid W', invalidControl.probabilityReduction);
  await setEstimate(dialog, 'Blootstelling B', invalidControl.exposureReduction);
  await setEstimate(dialog, 'Effect E', invalidControl.effectReduction);
  const before = (await drafts(page)).find(
    (record) => record.draft.value.control?.id === controlId,
  )!;
  expect(before.draft.value.estimates).toEqual(invalidControl);
  await dialog.getByRole('button', { name: 'Maatregel opslaan', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Corrigeer de onvolledige of omgekeerde factorintervallen',
  );
  expect((await state(page)).scenarios).toEqual(original.scenarios);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  const report = await markdown(page);
  expect(report).toContain('"value": "-"');
  expect(report).toContain('"min": "1e-"');
  expect(report).toContain('"max": ""');
  await page.reload();
  dialog = await openControl(page);
  await checkEstimate(dialog, 'Waarschijnlijkheid W', invalidControl.probabilityReduction);
  await checkEstimate(dialog, 'Blootstelling B', invalidControl.exposureReduction);
  await checkEstimate(dialog, 'Effect E', invalidControl.effectReduction);
  await dialog.getByRole('button', { name: 'Maatregel opslaan', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Corrigeer');
  expect((await state(page)).scenarios).toEqual(original.scenarios);
  expect(await page.evaluate((key) => localStorage.getItem(key), before.storageKey)).toBe(
    before.raw,
  );
  await setEstimate(dialog, 'Waarschijnlijkheid W', { min: '10,00', value: '2e1', max: '30,00' });
  await expect(dialog.getByLabel('Waarschijnlijkheid W ondergrens', { exact: true })).toHaveValue(
    '10,00',
  );
  await setEstimate(dialog, 'Blootstelling B', { min: '5.00', value: '1e1', max: '20.00' });
  await setEstimate(dialog, 'Effect E', { min: '0', value: '5.00', max: '10.00' });
  await dialog.getByRole('button', { name: 'Maatregel opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
  const saved = (await state(page)).scenarios[0].controls[0];
  expect(saved).toEqual(control);
  expect(Object.keys(saved)).not.toContain('estimates');
  expect(Object.keys(saved)).not.toContain('helper');
  await expect(page.locator('.score-summary').first().locator('.amber-text')).toHaveText('540');
});

test('helper Apply clears only the chosen W buffer and cannot bypass retained B/E invalid intervals', async ({
  page,
}) => {
  const original = await boot(page);
  let dialog = await openControl(page);
  const invertedE = { min: '75', value: '5', max: '10' };
  await setEstimate(dialog, 'Waarschijnlijkheid W', invalidControl.probabilityReduction);
  await setEstimate(dialog, 'Blootstelling B', invalidControl.exposureReduction);
  await setEstimate(dialog, 'Effect E', invertedE);
  await dialog.getByText('Inschalingshulp: van ontwerp naar praktijk', { exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Conditionele definities en controle op overlap', exact: true })
    .fill('Fictieve conditionele noemers en gecontroleerde overlap Ω');
  for (const [label, value] of [
    ['Maximale werking (%)', '73'],
    ['Bereik van scenario (%)', '81'],
    ['Beschikbaar indien nodig (%)', '62'],
    ['Correct gebruik indien beschikbaar (%)', '57'],
  ])
    await dialog.getByRole('spinbutton', { name: label, exact: true }).fill(value);
  await dialog
    .getByRole('checkbox', { name: 'Noemers en dubbeltelling gecontroleerd', exact: true })
    .check();
  await dialog.getByRole('button', { name: 'Toepassen op W', exact: true }).click();
  const concept = (await drafts(page)).find(
    (record) => record.draft.value.control?.id === controlId,
  )!;
  expect(concept.draft.value.estimates).toEqual({
    exposureReduction: invalidControl.exposureReduction,
    effectReduction: invertedE,
  });
  const expected = 0.73 * 0.81 * 0.62 * 0.57;
  expect(concept.draft.value.control!.probabilityReduction.min).toBe(0);
  expect(concept.draft.value.control!.probabilityReduction.value).toBeCloseTo(expected, 14);
  expect(concept.draft.value.control!.probabilityReduction.max).toBeCloseTo(expected, 14);
  await checkEstimate(dialog, 'Blootstelling B', invalidControl.exposureReduction);
  await checkEstimate(dialog, 'Effect E', invertedE);
  await dialog.getByRole('button', { name: 'Maatregel opslaan', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Corrigeer');
  expect((await state(page)).scenarios).toEqual(original.scenarios);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.reload();
  dialog = await openControl(page);
  await checkEstimate(dialog, 'Blootstelling B', invalidControl.exposureReduction);
  await checkEstimate(dialog, 'Effect E', invertedE);
  await expect(
    dialog.getByRole('textbox', { name: 'Waarschijnlijkheid W ondergrens', exact: true }),
  ).toHaveValue('0');
  await expect(
    dialog.getByRole('textbox', { name: 'Waarschijnlijkheid W verwachting', exact: true }),
  ).toHaveValue(String(concept.draft.value.control!.probabilityReduction.value * 100));
  await setEstimate(dialog, 'Blootstelling B', { min: '5', value: '10', max: '20' });
  await dialog.getByRole('button', { name: 'Maatregel opslaan', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Corrigeer');
  expect((await state(page)).scenarios).toEqual(original.scenarios);
  await setEstimate(dialog, 'Effect E', { min: '0', value: '5', max: '10' });
  await dialog.getByRole('button', { name: 'Maatregel opslaan', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () => (await state(page)).scenarios[0].controls[0].probabilityReduction.value)
    .toBeCloseTo(expected, 14);
  const saved = (await state(page)).scenarios[0].controls[0];
  expect(saved.exposureReduction).toEqual(control.exposureReduction);
  expect(saved.effectReduction).toEqual(control.effectReduction);
  expect(saved.evidence).toBe('unverified');
  expect(saved.status).toBe('planned');
  expect(Object.keys(saved)).not.toContain('estimates');
  await expect(page.locator('.score-summary').first().locator('.amber-text')).toHaveText('540');
});
