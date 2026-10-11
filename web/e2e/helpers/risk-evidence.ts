import { expect, type Locator, type Page } from '@playwright/test';
import type { Evidence } from '../../src/data/dossier';
import { evidenceHash } from '../../src/data/frozen';

/** Deliberately fictitious evidence; a UI review still selects its exact version. */
export async function seedFictiveRiskEvidence(page: Page) {
  const record: Evidence = {
    id: 'e2e-explicit-risk-proof',
    title: 'E2E fictieve ontwerp- en functietestbasis',
    kind: 'measurement',
    reference: 'Fictieve softwarefixture; geen lokaal onderzoek',
    description:
      'Fictieve testbasis voor W-reductie in de softwareproeven; maatregelen zijn afzonderlijke mechanismen en de UI-beoordelaar selecteert hun bewijsversie bewust.',
    recordedAt: '2026-10-01T12:00:00Z',
    capturedBy: 'E2E fictieve vastlegger',
    status: 'verified',
    verifiedBy: 'E2E fictieve bronbeoordelaar',
    verifiedAt: '2026-10-01T12:00:00Z',
    verificationNote: 'Uitsluitend fictief bewijs voor geautomatiseerde softwaretests.',
  };
  record.verifiedContentSha256 = evidenceHash(record);
  await page.evaluate((record) => {
    const key = 'ima-apply.workspace.v1';
    const envelope = JSON.parse(localStorage.getItem(key)!);
    envelope.workspace.evidence = [
      ...(envelope.workspace.evidence ?? []).filter((e: { id: string }) => e.id !== record.id),
      record,
    ];
    localStorage.setItem(key, JSON.stringify(envelope));
  }, record);
  await page.reload();
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
}
export async function confirmFictiveRiskEvidence(form: Locator) {
  const panel = form.locator('.risk-evidence-review');
  await panel.getByRole('checkbox', { name: /E2E fictieve ontwerp- en functietestbasis/ }).check();
  await panel
    .getByRole('textbox', { name: 'Beoordelaar van de maatregelwerking', exact: true })
    .fill('E2E fictieve maatregelbeoordelaar');
  await panel
    .getByRole('textbox', { name: 'Onderbouwing bij deze bewijsversies', exact: true })
    .fill(
      'Fictieve bewijsversie onderbouwt deze afzonderlijke W-factor en scenarioafbakening; geen praktijkclaim.',
    );
  await panel
    .getByRole('button', { name: 'Bewijsversies bij deze werking bevestigen', exact: true })
    .click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
}
