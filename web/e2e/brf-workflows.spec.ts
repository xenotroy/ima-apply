import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}

test('local BRF version management preserves reviewed meaning, free legacy codes and full export across reload', async ({
  page,
}) => {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  // Fictitious unscoped source records; normal browser loading still validates the full fixture.
  await page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!);
    envelope.version = 'brf-e2e-fixture';
    envelope.workspace.incidents = [
      {
        id: 'e2e-brf-incident',
        title: 'E2E onderzoek systeemcondities',
        date: '2026-10-08',
        department: 'Fictieve werkplek',
        type: 'near_miss',
        description: 'Fictieve vastgelegde feiten voor de browserworkflow.',
        actionIds: [],
      },
    ];
    envelope.workspace.evidence = [
      {
        id: 'e2e-brf-evidence',
        title: 'E2E bron voor hypothesetoetsing',
        kind: 'record',
        reference: 'https://example.com/brf-fixture',
        description: 'Fictieve bronregistratie; nog geen causaal oordeel.',
        recordedAt: '2026-10-08T06:00:00.000Z',
        status: 'unverified',
      },
    ];
    localStorage.setItem('ima-apply.workspace.v1', JSON.stringify(envelope));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Onderzoek & cijfers', exact: true }).click();
  await page.getByRole('button', { name: 'BRF-register', exact: true }).click();
  await page.getByRole('button', { name: 'Nieuwe basisrisicofactor', exact: true }).click();
  await page.getByLabel('BRF-code', { exact: true }).fill('P-01');
  await page.getByLabel('Titel basisrisicofactor', { exact: true }).fill('E2E onderhoudshypothese');
  await page
    .getByRole('textbox', { name: 'Betekenis en toepassingsgrenzen', exact: true })
    .fill(
      'Onderliggende condities waardoor technische degradatie niet tijdig wordt gesignaleerd; dit is nog geen oorzaakvaststelling.',
    );
  await page
    .getByLabel('Bron of lokale afspraak', { exact: true })
    .fill('E2E fictieve lokale afspraak, versie 1.');
  await page.getByLabel('Inhoudelijk eigenaar', { exact: true }).fill('E2E eigenaar');
  await page.getByLabel('Vastlegger van deze versie', { exact: true }).fill('E2E vastlegger');
  await page
    .getByLabel('Redenering bij deze definitieversie', { exact: true })
    .fill('Eerste expliciete lokale betekenis vastgelegd.');
  await page.getByRole('button', { name: 'BRF-versie vastleggen', exact: true }).click();
  await expect.poll(async () => (await state(page)).basisRiskFactorRecords.length).toBe(1);
  const before = (await state(page)).basisRiskFactorRecords[0];
  await page.getByRole('button', { name: 'Status wijzigen', exact: true }).click();
  await page.getByLabel('Actor BRF-statuswijziging', { exact: true }).fill('E2E eigenaar');
  await page
    .getByLabel('Reden BRF-statuswijziging', { exact: true })
    .fill('Lokale begripsafspraak beoordeeld; geen automatische causaalverklaring.');
  await page.getByRole('button', { name: 'BRF-status vastleggen', exact: true }).click();
  await expect.poll(async () => (await state(page)).basisRiskFactorRecords[0].status).toBe('local');

  await page.getByRole('button', { name: 'Onderzoeken', exact: true }).click();
  await page.getByRole('button', { name: 'Onderzoek beginnen', exact: true }).click();
  await page
    .getByLabel('Waarom 1', { exact: true })
    .fill('Onderhoudsregistratie moet de hypothese nog ondersteunen of weerleggen.');
  await page
    .getByLabel('Onderliggende systeemcondities / basisrisicofactoren')
    .fill('LEGACY-P01: oorspronkelijke vrije betekenis blijft behouden');
  await page
    .getByRole('checkbox', {
      name: 'P-01 · E2E onderhoudshypothese @1.0.0 · Lokaal vastgesteld',
      exact: true,
    })
    .check();
  await page
    .getByRole('checkbox', {
      name: 'E2E bron voor hypothesetoetsing · Niet geverifieerd',
      exact: true,
    })
    .check();
  await page
    .getByLabel('Conclusie, bewijs en beperkingen', { exact: true })
    .fill(
      'Dit is een expliciete hypothesekoppeling; de causale verbinding is nog geen vastgesteld feit.',
    );
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('reviewed');
  await page.getByLabel('Beoordelaar', { exact: true }).fill('E2E reviewer');
  await page
    .getByLabel('Reviewtoelichting', { exact: true })
    .fill('Versie, broncontext en hypothesestatus inhoudelijk beoordeeld.');
  await page.getByRole('button', { name: 'Onderzoek opslaan', exact: true }).click();
  await expect.poll(async () => (await state(page)).investigations?.[0]?.status).toBe('reviewed');
  const historical = (await state(page)).investigations[0].basisRiskFactorSnapshots[0];
  expect(historical.record.id).toBe(before.id);
  expect(historical.sha256).toMatch(/^[a-f0-9]{64}$/);

  await page.getByRole('button', { name: 'BRF-register', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'P-01 · E2E onderhoudshypothese @1.0.0 · Lokaal vastgesteld',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Nieuwe definitieversie', exact: true }).click();
  await page.getByLabel('Definitieversie', { exact: true }).fill('2.0.0');
  await page
    .getByLabel('Titel basisrisicofactor', { exact: true })
    .fill('E2E aangescherpte definitie');
  await page
    .getByRole('textbox', { name: 'Betekenis en toepassingsgrenzen', exact: true })
    .fill('Tweede expliciete toepassingsgrens, zonder wijziging van de eerdere onderzoeksversie.');
  await page.getByLabel('Vastlegger van deze versie', { exact: true }).fill('E2E vastlegger');
  await page
    .getByLabel('Redenering bij deze definitieversie', { exact: true })
    .fill('Gebruik begrensd na inhoudelijke bespreking.');
  await page.getByRole('button', { name: 'BRF-versie vastleggen', exact: true }).click();
  await expect.poll(async () => (await state(page)).basisRiskFactorRecords.length).toBe(2);
  await page
    .getByRole('button', {
      name: 'P-01 · E2E onderhoudshypothese @1.0.0 · Lokaal vastgesteld',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Status wijzigen', exact: true }).click();
  await page.getByLabel('Actor BRF-statuswijziging', { exact: true }).fill('E2E eigenaar');
  await page
    .getByLabel('Reden BRF-statuswijziging', { exact: true })
    .fill(
      'Nieuwe versie beschikbaar; historische review blijft onder de gebruikte definitie staan.',
    );
  await page.getByRole('button', { name: 'BRF-status vastleggen', exact: true }).click();
  await expect
    .poll(async () => (await state(page)).basisRiskFactorRecords[0].status)
    .toBe('retired');
  await page.reload();
  const saved = await state(page);
  expect(
    saved.basisRiskFactorRecords.map((record: { factorId: string }) => record.factorId),
  ).toEqual([before.factorId, before.factorId]);
  expect(saved.investigations[0].basisRiskFactorSnapshots[0]).toEqual(historical);
  expect(saved.investigations[0].basisRiskFactors).toEqual([
    'LEGACY-P01: oorspronkelijke vrije betekenis blijft behouden',
  ]);
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const downloaded = await downloadPromise;
  const markdown = await readFile((await downloaded.path())!, 'utf8');
  expect(markdown).toContain('E2E aangescherpte definitie @2.0.0');
  expect(markdown).toContain('LEGACY-P01: oorspronkelijke vrije betekenis blijft behouden');
  expect(markdown).toContain('Gebruikte definitiestatus: Lokaal vastgesteld');
  expect(markdown).toContain(historical.sha256);

  // A conscious research amendment must freeze the newly selected version, rather
  // than keeping the old review snapshot attached to different references.
  await page.getByRole('button', { name: 'Onderzoek & cijfers', exact: true }).click();
  await page.getByRole('button', { name: 'BRF-register', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'P-01 · E2E aangescherpte definitie @2.0.0 · Concept',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Status wijzigen', exact: true }).click();
  await page.getByLabel('Actor BRF-statuswijziging', { exact: true }).fill('E2E eigenaar');
  await page
    .getByLabel('Reden BRF-statuswijziging', { exact: true })
    .fill('De tweede expliciete betekenis lokaal afgesproken.');
  await page.getByRole('button', { name: 'BRF-status vastleggen', exact: true }).click();
  await expect.poll(async () => (await state(page)).basisRiskFactorRecords[1].status).toBe('local');
  await page.getByRole('button', { name: 'Onderzoeken', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Onderzoek — E2E onderzoek systeemcondities · Beoordeeld',
      exact: true,
    })
    .click();
  await page
    .getByRole('checkbox', {
      name: 'P-01 · E2E onderhoudshypothese @1.0.0 · Teruggetrokken',
      exact: true,
    })
    .uncheck();
  await page
    .getByRole('checkbox', {
      name: 'P-01 · E2E aangescherpte definitie @2.0.0 · Lokaal vastgesteld',
      exact: true,
    })
    .check();
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('draft');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('reviewed');
  await page.getByLabel('Beoordelaar', { exact: true }).fill('E2E tweede reviewer');
  await page
    .getByLabel('Reviewtoelichting', { exact: true })
    .fill('Nieuwe definitieversie bewust gekozen en opnieuw beoordeeld.');
  await page.getByRole('button', { name: 'Onderzoek opslaan', exact: true }).click();
  await expect
    .poll(
      async () => (await state(page)).investigations[0].basisRiskFactorSnapshots[0].record.version,
    )
    .toBe('2.0.0');
  expect((await state(page)).basisRiskFactorRecords[0].description).toBe(
    historical.record.description,
  );
});
