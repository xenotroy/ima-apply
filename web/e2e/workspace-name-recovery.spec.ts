import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const workspaceKey = 'ima-apply.workspace.v1';
async function state(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workspace, workspaceKey);
}
async function boot(page: Page) {
  await page.goto('/');
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
}
async function nameDrafts(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('ima-apply.draft.v1.'))
      .map((storageKey) => ({
        storageKey,
        raw: localStorage.getItem(storageKey)!,
        draft: JSON.parse(localStorage.getItem(storageKey)!),
      }))
      .filter((record) => /\/(new|rename)-workspace-name\//.test(record.draft.key)),
  );
}
test('a workspace rename survives closing/reload/Markdown and is only cleared after recording', async ({
  page,
}) => {
  await boot(page);
  const original = await state(page);
  const name = 'Fictieve nog niet vastgelegde dossiernaam Ω';
  await page.locator('.workspace-switch').click();
  let dialog = page.getByRole('dialog', { name: 'Naam van je werkruimte', exact: true });
  await dialog.getByLabel('Naam van de werkruimte', { exact: true }).fill(name);
  const prior = (await nameDrafts(page))[0];
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  expect((await state(page)).name).toBe(original.name);
  await page.getByRole('button', { name: 'Rapportage', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  expect(await readFile((await (await pending).path())!, 'utf8')).toContain(name);
  await page.reload();
  await page.locator('.workspace-switch').click();
  dialog = page.getByRole('dialog', { name: 'Naam van je werkruimte', exact: true });
  await expect(dialog.getByLabel('Naam van de werkruimte', { exact: true })).toHaveValue(name);
  await dialog.getByLabel('Naam van de werkruimte', { exact: true }).fill(name + ' Ψ');
  const own = (await nameDrafts(page)).find(
    (record) => record.draft.writer !== prior.draft.writer,
  )!;
  await dialog.getByRole('button', { name: 'Werkruimte openen', exact: true }).click();
  await expect.poll(async () => (await state(page)).name).toBe(name + ' Ψ');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), own.storageKey))
    .toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), prior.storageKey)).toBe(prior.raw);
  expect((await state(page)).id).toBe(original.id);
});

test('a new workspace name waits for the new workspace durable write and preserves other writer concepts', async ({
  page,
}) => {
  await boot(page);
  const original = await state(page);
  const name = 'Fictieve nieuwe werkruimte Ω';
  await page.getByRole('button', { name: 'Begin een eigen werkruimte', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Begin een eigen werkruimte', exact: true });
  await dialog.getByLabel('Naam van de werkruimte', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Begin een eigen werkruimte', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Begin een eigen werkruimte', exact: true });
  await expect(dialog.getByLabel('Naam van de werkruimte', { exact: true })).toHaveValue(name);
  // Stamp this tab's own slot after the reload. The recovered prior writer is retained.
  const prior = (await nameDrafts(page))[0];
  await dialog.getByLabel('Naam van de werkruimte', { exact: true }).fill(name + ' Ψ');
  const own = (await nameDrafts(page)).find(
    (record) => record.draft.writer !== prior.draft.writer,
  )!;
  // An accepted write in the old workspace has already completed; it must not clear this concept.
  const other = {
    ...own.draft,
    writer: 'fictitious-other-writer',
    value: { ...own.draft.value, name: 'Ander bewaard concept Ψ' },
  };
  const otherKey = `ima-apply.draft.v1.${encodeURIComponent(other.key)}.${encodeURIComponent(other.writer)}`;
  const otherRaw = JSON.stringify(other);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: otherKey,
    raw: otherRaw,
  });
  await page.evaluate((key) => {
    const holder = window as typeof window & {
      nameLockReady?: boolean;
      releaseNameLock?: () => void;
    };
    void navigator.locks.request(key, async () => {
      holder.nameLockReady = true;
      await new Promise<void>((resolve) => {
        holder.releaseNameLock = resolve;
      });
    });
  }, workspaceKey);
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { nameLockReady?: boolean }).nameLockReady),
    )
    .toBe(true);
  try {
    await dialog.getByRole('button', { name: 'Werkruimte openen', exact: true }).click();
    await expect(page.locator('.workspace-switch')).toContainText(name + ' Ψ');
    expect((await state(page)).id).toBe(original.id);
    expect(await page.evaluate((key) => localStorage.getItem(key), own.storageKey)).toBe(own.raw);
    expect(await page.evaluate((key) => localStorage.getItem(key), otherKey)).toBe(otherRaw);
    await page.evaluate(() =>
      (window as typeof window & { releaseNameLock?: () => void }).releaseNameLock?.(),
    );
    await expect.poll(async () => (await state(page)).name).toBe(name + ' Ψ');
    expect((await state(page)).id).not.toBe(original.id);
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), own.storageKey))
      .toBeNull();
    expect(await page.evaluate((key) => localStorage.getItem(key), otherKey)).toBe(otherRaw);
    expect(await page.evaluate((key) => localStorage.getItem(key), prior.storageKey)).toBe(
      prior.raw,
    );
    await page.reload();
    await expect(page.locator('.workspace-switch')).toContainText(name + ' Ψ');
  } finally {
    await page.evaluate(() =>
      (window as typeof window & { releaseNameLock?: () => void }).releaseNameLock?.(),
    );
  }
});
