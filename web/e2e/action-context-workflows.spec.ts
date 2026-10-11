import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createWorkspace, type WorkspaceAction, type WorkspaceState } from '../src/data/model';
import type { Scenario } from '../src/domain/types';
import type { Evidence } from '../src/data/dossier';
import { range } from '../src/domain/risk';
import { evidenceHash } from '../src/data/frozen';
import { captureRiskTargetReference } from '../src/data/risk-evidence';
import { createAction } from '../src/domain/action-context';
import { reviseAction } from '../src/domain/action-lifecycle';

const workspaceKey = 'ima-apply.workspace.v1';
const scenarioId = 'fictitious-context-scenario';
const sourceId = 'fictitious-actual-source';
const actionTitle = 'Fictieve volledige actie Ω';
const start = Date.now() - 5 * 86400000;
const at = (minutes: number) => new Date(start + minutes * 60000).toISOString();
function scenario(): Scenario {
  return {
    id: scenarioId,
    title: 'Fictief scenario Ω',
    description: 'Fictieve blootstelling aan knelzone',
    department: 'Fictieve werkplaats',
    hazard: 'Fictieve bewegende delen',
    consequence: 'Fictief ernstig letsel',
    probability: 6,
    exposure: 6,
    effect: 15,
    controls: [
      {
        id: 'fictitious-guard',
        title: 'Fictieve afscherming',
        ahs: 'collective',
        status: 'planned',
        evidence: 'unverified',
        evidenceNote: '',
        rationale: 'Fictieve toegang voorkomen',
        probabilityReduction: range(0.5),
        exposureReduction: range(0),
        effectReduction: range(0),
        independent: true,
        feasibility: 'easy',
        effort: 2,
        legalRequired: false,
      },
    ],
    lopa: {
      initiatingEvent: 'Fictieve toegang',
      initiatingFrequency: range(0.1),
      frequencyEvidence: 'Fictieve frequentiebron',
      consequence: 'Fictief letsel',
      targetFrequency: 0.001,
      assumptions: 'Uitsluitend fictieve browserproef',
      layers: [
        {
          id: 'fictitious-ipl',
          title: 'Fictieve IPL',
          status: 'planned',
          evidence: 'unverified',
          evidenceNote: '',
          pfd: range(0.1),
          specific: true,
          independent: true,
          independentOfInitiator: true,
          auditable: true,
          effective: true,
          independenceNote: 'Fictieve zelfstandigheid',
        },
      ],
      modifiers: [
        {
          id: 'fictitious-modifier',
          title: 'Fictieve aanwezigheidsfactor',
          kind: 'conditional',
          probability: range(0.2),
          evidence: 'unverified',
          evidenceNote: '',
          independent: true,
          rationale: 'Fictieve specifieke blootstelling',
        },
      ],
    },
  };
}
function proof(): Evidence {
  const evidence: Evidence = {
    id: 'fictitious-context-proof',
    title: 'Fictieve effectmeting Ω',
    kind: 'measurement',
    reference: 'Fictieve testreferentie',
    description: 'Fictief testresultaat',
    recordedAt: at(0),
    status: 'verified',
    verifiedBy: 'Fictieve bewijsbeoordelaar',
    verifiedAt: at(1),
    verificationNote: 'Fictieve inhoudelijke beoordeling',
  };
  evidence.verifiedContentSha256 = evidenceHash(evidence);
  return evidence;
}
function fixture(): WorkspaceState {
  return createWorkspace('Fictieve actiecontextproef', {
    sources: [{ id: sourceId, title: 'Fictieve werkelijke bron Ω', publication: 'private' }],
    scenarios: [scenario()],
    evidence: [proof()],
    topics: [
      {
        id: 'fictitious-topic',
        title: 'Fictief machineonderwerp',
        category: 'Fictieve categorie',
        description: '',
        aliases: [],
      },
    ],
    incidents: [
      {
        id: 'fictitious-context-incident',
        title: 'Fictief bronsignaal',
        type: 'near_miss',
        date: '2026-10-01',
        department: 'Fictieve werkplaats',
        description: 'Fictieve aanleiding voor gerichte verbetering',
        scenarioId,
        actionIds: [],
      },
    ],
  });
}
async function state(page: Page): Promise<WorkspaceState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workspace, workspaceKey);
}
async function boot(page: Page, workspace = fixture()) {
  await page.goto('/');
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
  await page.evaluate(
    ({ key, workspace }) => {
      const envelope = JSON.parse(localStorage.getItem(key)!);
      envelope.workspace = workspace;
      envelope.version = crypto.randomUUID();
      localStorage.setItem(key, JSON.stringify(envelope));
    },
    { key: workspaceKey, workspace },
  );
  await page.reload();
  await expect.poll(async () => (await state(page)).id).toBe(workspace.id);
  return workspace;
}
async function creation(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /Plan van aanpak/ }).click();
  await page.getByRole('button', { name: 'Verbeteractie', exact: true }).click();
  return page.getByRole('dialog', { name: 'Nieuwe verbeteractie', exact: true });
}
const fields = {
  Actie: actionTitle,
  Eigenaar: 'Fictieve eigenaar José Ψ',
  'Afwijkingsreden / motivering van de AHS-keuze':
    'Fictieve bronaanpak overwogen Ω\nAfzonderlijke motivering Ψ',
  'Beoogd resultaat': 'Fictieve toegang volledig voorkomen Ω',
  Uitvoering: 'Fictieve plaatsing volgens ontwerp Ψ',
  'Afzonderlijke verificatiemethode': 'Fictieve functionele proef tegen exact criterium Ω',
  'Aanvullende notities': 'Fictieve aanvullende informatie Ψ',
};
async function fill(dialog: Locator) {
  for (const [name, value] of Object.entries(fields))
    await dialog.getByRole('textbox', { name, exact: true }).fill(value);
  await dialog.getByRole('combobox', { name: 'Aanmaakfase', exact: true }).selectOption('planned');
  await dialog.getByRole('combobox', { name: 'Gerelateerd scenario', exact: true }).selectOption(scenarioId);
  await dialog
    .getByRole('combobox', { name: 'AHS-keuze van de actie', exact: true })
    .selectOption('technical_collective');
  await dialog.getByRole('combobox', { name: 'Actieprioriteit', exact: true }).selectOption('critical');
  await dialog.getByRole('checkbox', { name: 'Eliminatie / bronaanpak', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Substitutie', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Fictief machineonderwerp', exact: true }).check();
  await dialog.getByRole('combobox', { name: 'Bestaande bron', exact: true }).selectOption(sourceId);
  await dialog.getByRole('button', { name: 'Gekozen bron toevoegen', exact: true }).click();
  await dialog.locator('details').getByText('Fictief scenario Ω', { exact: true }).click();
  for (const name of [
    'Fictieve afscherming · control',
    'Fictieve IPL · lopa-layer',
    'Fictieve aanwezigheidsfactor · lopa-modifier',
  ])
    await dialog.getByRole('checkbox', { name, exact: true }).check();
}
async function report(page: Page) {
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  return readFile((await (await pending).path())!, 'utf8');
}
async function editor(page: Page) {
  await page.getByRole('button', { name: /Plan van aanpak/ }).click();
  const card = page.locator('.action-card').first();
  const details = card.locator('.action-revision-editor');
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await details.locator(':scope > summary').click();
  return card;
}

test('the shared new-action editor recovers all separate context and pending source fields, then exports real typed target versions', async ({
  page,
}) => {
  const workspace = await boot(page);
  let dialog = await creation(page);
  await fill(dialog);
  await dialog
    .getByLabel('Onopgeloste oorspronkelijke bron-ID', { exact: true })
    .fill('fictitious:unresolved Ω');
  await dialog.getByRole('button', { name: 'Actie vastleggen', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('nog niet aan deze actie toegevoegd');
  expect((await state(page)).actions).toEqual([]);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).last().click();
  await page.getByRole('button', { name: 'Overzicht', exact: true }).click();
  await page.reload();
  dialog = await creation(page);
  for (const [name, value] of Object.entries(fields))
    await expect(dialog.getByRole('textbox', { name, exact: true })).toHaveValue(value);
  await expect(
    dialog.getByLabel('Onopgeloste oorspronkelijke bron-ID', { exact: true }),
  ).toHaveValue('fictitious:unresolved Ω');
  await dialog.locator('details > summary').click();
  for (const name of [
    'Fictieve afscherming · control',
    'Fictieve IPL · lopa-layer',
    'Fictieve aanwezigheidsfactor · lopa-modifier',
  ])
    await expect(dialog.getByRole('checkbox', { name, exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Onopgeloste bron vastleggen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Actie vastleggen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await state(page)).actions.length).toBe(1);
  const action = (await state(page)).actions[0];
  expect(action).toMatchObject({
    title: actionTitle,
    priority: 'critical',
    ahsLevel: 'technical_collective',
    higherLevelsConsidered: ['elimination_or_source', 'substitution'],
    topicIds: ['fictitious-topic'],
    sourceRefs: [
      { kind: 'workspace', collection: 'sources', id: sourceId },
      { kind: 'unresolved', originalId: 'fictitious:unresolved Ω' },
    ],
    lifecycle: { revision: 0, stage: 'planned', history: [], effectiveness: 'pending' },
  });
  expect(action.riskTargets?.map((ref) => [ref.kind, ref.targetId])).toEqual([
    ['control', 'fictitious-guard'],
    ['lopa-layer', 'fictitious-ipl'],
    ['lopa-modifier', 'fictitious-modifier'],
  ]);
  expect((await state(page)).scenarios).toEqual(workspace.scenarios);
  const markdown = await report(page);
  for (const value of [
    sourceId,
    'fictitious:unresolved Ω',
    ...Object.values(fields),
    ...action.riskTargets!.map((ref) => ref.targetSha256),
  ])
    expect(markdown).toContain(value);
  expect(markdown).toContain('huidige doelversie current');
  await page.reload();
  expect((await state(page)).actions[0]).toEqual(action);
});

test('a changed actual source and target block a recovered creation until the exact target is chosen and the source basis explicitly reconfirmed', async ({
  page,
}) => {
  await boot(page);
  let dialog = await creation(page);
  await fill(dialog);
  const previousTarget = captureRiskTargetReference(
    (await state(page)).scenarios[0],
    'control',
    'fictitious-guard',
  );
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).last().click();
  await page.evaluate((key) => {
    const envelope = JSON.parse(localStorage.getItem(key)!);
    envelope.workspace.sources[0].title = 'Fictieve gewijzigde bron';
    envelope.workspace.scenarios[0].controls[0].rationale = 'Fictief gewijzigd mechanisme';
    envelope.version = crypto.randomUUID();
    localStorage.setItem(key, JSON.stringify(envelope));
  }, workspaceKey);
  await page.reload();
  dialog = await creation(page);
  await expect(dialog.getByRole('textbox', { name: 'Beoogd resultaat', exact: true })).toHaveValue(
    fields['Beoogd resultaat'],
  );
  await expect(dialog.getByRole('alert')).toContainText('bron- of doelbasis is gewijzigd');
  await expect(
    dialog.getByRole('button', { name: 'Actie vastleggen', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Actuele doelversie kiezen', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Actie vastleggen', exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole('button', { name: 'Concept bij actuele bronbasis herbevestigen', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Actie vastleggen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await state(page)).actions.length).toBe(1);
  const action = (await state(page)).actions[0];
  expect(action.riskTargets![0].targetSha256).not.toBe(previousTarget.targetSha256);
  expect(action.riskTargets![0].snapshot.target).toMatchObject({
    rationale: 'Fictief gewijzigd mechanisme',
    evidence: 'unverified',
  });
});

test('revoked current evidence leaves the historical chain exportable while a new close is refused and the actor draft survives reload', async ({
  page,
}) => {
  const workspace = fixture();
  let action: WorkspaceAction = createAction(
    {
      id: 'fictitious-assessed-action',
      title: actionTitle,
      owner: 'Fictieve eigenaar',
      dueDate: '',
      notes: '',
      stage: 'planned',
      scenarioId,
      sourceRefs: [{ kind: 'workspace', collection: 'sources', id: sourceId }],
      intendedResult: 'Fictief resultaat',
      verificationMethod: 'Fictief exact toetscriterium',
      evidenceIds: [workspace.evidence![0].id],
      riskTargets: [
        captureRiskTargetReference(workspace.scenarios[0], 'control', 'fictitious-guard'),
      ],
    },
    workspace,
  );
  for (const [index, stage] of [
    'in_progress',
    'implemented',
    'verification_due',
    'effective',
  ].entries()) {
    action = reviseAction(
      action,
      {
        expectedRevision: action.lifecycle!.revision,
        actor: 'Fictieve historische actor',
        reason: `Fictieve overgang ${stage}`,
        targetStage: stage as 'in_progress',
        verificationDueAt: at(8),
        verifier: 'Fictieve historische verificateur',
        evaluation: 'Fictief gemeten resultaat',
      },
      workspace.evidence,
      at(index + 3),
      workspace.scenarios,
    );
  }
  workspace.actions = [action];
  workspace.evidence![0].status = 'unverified';
  await boot(page, workspace);
  let card = await editor(page);
  await expect(card.getByRole('status').filter({ hasText: 'Historische beoordeling bewaard' })).toContainText(
    'Historische beoordeling bewaard; actuele basis niet meer bevestigd',
  );
  await card
    .getByRole('textbox', { name: 'Actor van deze wijziging', exact: true })
    .fill('Fictieve actuele actor Ψ');
  await card
    .getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true })
    .fill('Fictieve sluitingsreden Ω');
  await card.getByRole('combobox', { name: 'Volgende actiestap', exact: true }).selectOption('closed');
  await card.getByRole('button', { name: 'Revisie vastleggen', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('gewijzigd of ingetrokken');
  expect((await state(page)).actions[0]).toEqual(action);
  const markdown = await report(page);
  expect(markdown).toContain(action.lifecycle!.history[3].sha256);
  expect(markdown).toContain('Fictieve historische actor');
  expect(markdown).toContain('Fictieve actuele actor Ψ');
  await page.reload();
  card = await editor(page);
  await expect(
    card.getByRole('textbox', { name: 'Actor van deze wijziging', exact: true }),
  ).toHaveValue('Fictieve actuele actor Ψ');
  await expect(
    card.getByRole('textbox', { name: 'Redenering bij deze revisie', exact: true }),
  ).toHaveValue('Fictieve sluitingsreden Ω');
  await expect(card.getByRole('combobox', { name: 'Volgende actiestap', exact: true })).toHaveValue('closed');
  await card.getByRole('combobox', { name: 'Volgende actiestap', exact: true }).selectOption('reopened');
  await card.getByRole('button', { name: 'Revisie vastleggen', exact: true }).click();
  await expect.poll(async () => (await state(page)).actions[0].lifecycle?.stage).toBe('reopened');
  expect((await state(page)).actions[0].lifecycle?.history.slice(0, 4)).toEqual(
    action.lifecycle?.history,
  );
  expect((await state(page)).scenarios).toEqual(workspace.scenarios);
});

test('incident creation uses the same explicit planned-owner/result form and records the real incident ID in both relationships', async ({
  page,
}) => {
  await boot(page);
  await page.getByRole('button', { name: /Incidenten/ }).click();
  await page
    .locator('.incident-card')
    .getByRole('button', { name: 'Verbeteractie koppelen', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Nieuwe verbeteractie', exact: true });
  await expect(dialog).toContainText('fictitious-context-incident');
  await dialog
    .getByRole('textbox', { name: 'Beoogd resultaat', exact: true })
    .fill('Fictief voorkomen van herhaling');
  await dialog
    .getByRole('textbox', { name: 'Eigenaar', exact: true })
    .fill('Fictieve aangewezen uitvoerder');
  await dialog.getByRole('button', { name: 'Actie vastleggen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await state(page)).actions.length).toBe(1);
  const workspace = await state(page),
    action = workspace.actions[0];
  expect(action.sourceRefs).toEqual([
    { kind: 'workspace', collection: 'incidents', id: 'fictitious-context-incident' },
  ]);
  expect(workspace.incidents[0].actionIds).toEqual([action.id]);
  expect(action.lifecycle).toMatchObject({ stage: 'planned', history: [], revision: 0 });
});
