import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const binary = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
const TOKEN = 'github_pat_' + 'x'.repeat(60);

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ima-apply.workspace.v1')!).workspace);
}
async function ownEvidence(page: Page) {
  return (await state(page)).evidence.find(
    (item: { title: string }) => item.title === 'Fictief inspectiebestand',
  );
}
async function createDossier(page: Page) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'RI&E-dossier', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'RI&E-dossier aanmaken' });
  await dialog.getByLabel('Dossiertitel', { exact: true }).fill('Fictief bijlagendossier');
  await dialog
    .getByLabel('Afgebakende scope', { exact: true })
    .fill('Uitsluitend fictieve byte-overdracht; geen praktijkbewijs.');
  await dialog.getByLabel('Beoordelaar', { exact: true }).fill('Fictieve beoordelaar');
  await dialog.locator('.link-choices').last().getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Dossier aanmaken', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Closing the form confirms acceptance; the queued durable write can still be pending.
  await expect
    .poll(async () =>
      (await state(page)).dossiers.find(
        (dossier: { id: string; title: string }) => dossier.title === 'Fictief bijlagendossier',
      ),
    )
    .toMatchObject({ id: expect.any(String), title: 'Fictief bijlagendossier' });
  await expect(page.locator('.workspace-health')).toContainText('Werkruimte lokaal bewaard');
}
async function newEvidence(page: Page) {
  await page.getByRole('button', { name: 'Bewijs', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Bewijs vastleggen en beoordelen' });
  await dialog.getByLabel('Bewijstitel', { exact: true }).fill('Fictief inspectiebestand');
  await dialog
    .getByRole('textbox', { name: 'Inhoud en toepassingsbereik', exact: true })
    .fill('Fictieve inhoud; uitsluitend integriteitsproef.');
  await dialog
    .getByLabel('Oorspronkelijke vastlegger', { exact: true })
    .fill('Fictieve oorspronkelijke inspecteur');
  await dialog
    .getByLabel('Controleur van bestandsbytes', { exact: true })
    .fill('Fictieve huidige controleur');
  return dialog;
}
async function editEvidence(page: Page) {
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page
    .locator('.registry-item')
    .filter({ hasText: 'Fictief inspectiebestand' })
    .getByRole('button', { name: 'Bewijs beoordelen / wijzigen', exact: true })
    .click();
  return page.getByRole('dialog', { name: 'Bewijs vastleggen en beoordelen' });
}
async function saveEvidence(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Bewijs vastleggen en beoordelen' });
  await dialog.getByRole('button', { name: 'Bewijs opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => Boolean(await ownEvidence(page))).toBe(true);
}

/** Valid single-page PDF with a large comment; bytes are entirely fictitious. */
function fictitiousPdf() {
  let text = '%PDF-1.4\n%' + 'F'.repeat(3_000_000) + '\n';
  const offsets = [0];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\nendstream',
  ];
  objects.forEach((value, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${value}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += 'xref\n0 5\n0000000000 65535 f \n';
  text += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  return Buffer.from(text + `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => Boolean((await state(page))?.id)).toBe(true);
  await createDossier(page);
});

test('binary bytes survive save/reload but session certainty requires a fresh recheck', async ({
  page,
}) => {
  let dialog = await newEvidence(page);
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'fictief-inspectie.bin',
    mimeType: 'application/octet-stream',
    buffer: binary,
  });
  await expect(dialog).toContainText('Bestandsbytes duurzaam lokaal opgeslagen');
  await dialog
    .getByRole('combobox', { name: 'Verificatiestatus', exact: true })
    .selectOption('verified');
  await dialog.getByLabel('Verificateur', { exact: true }).fill('Fictieve inhoudelijke reviewer');
  await dialog
    .getByRole('textbox', { name: 'Verificatiebevinding', exact: true })
    .fill('Fictieve inhoud expliciet beoordeeld na bytecontrole.');
  await saveEvidence(page);
  const original = await ownEvidence(page);
  expect(original.file.expectedSha256).toBe(hash(binary));
  expect(original.capturedBy).toBe('Fictieve oorspronkelijke inspecteur');
  expect(original.file.declaredMimeType).toBe('application/octet-stream');
  expect(original.file.mimeTypeOrigin).toBe('browser');
  expect(original.verifiedFileBindingSha256).toMatch(/^[a-f0-9]{64}$/);
  await page.reload();
  dialog = await editEvidence(page);
  await expect(dialog).toContainText('Bestandsbytes nog niet gecontroleerd in deze sessie');
  await expect(dialog.getByLabel('Controleur van bestandsbytes', { exact: true })).toHaveValue(
    'Fictieve huidige controleur',
  );
  await dialog.getByRole('button', { name: 'Lokale bytes controleren', exact: true }).click();
  await expect(dialog).toContainText('Controle bruikbaar in deze sessie');
  expect((await ownEvidence(page)).verifiedFileBindingSha256).toBe(
    original.verifiedFileBindingSha256,
  );
  expect((await ownEvidence(page)).verifiedAt).toBe(original.verifiedAt);
  const event = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Gebonden bestand downloaden', exact: true }).click();
  const download = await event;
  const stream = await download.createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream!) parts.push(part);
  expect(Buffer.concat(parts)).toEqual(binary);
});

test('changed bytes at the same filename are negative, intentional replacement resets human verification', async ({
  page,
}) => {
  let dialog = await newEvidence(page);
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'same-name.bin', mimeType: '', buffer: binary });
  await expect(dialog).toContainText('Bestandsbytes duurzaam lokaal opgeslagen');
  await dialog
    .getByRole('combobox', { name: 'Verificatiestatus', exact: true })
    .selectOption('verified');
  await dialog.getByLabel('Verificateur', { exact: true }).fill('Fictieve reviewer');
  await dialog
    .getByRole('textbox', { name: 'Verificatiebevinding', exact: true })
    .fill('Fictief inhoudelijk oordeel.');
  await saveEvidence(page);
  const original = await ownEvidence(page);
  dialog = await editEvidence(page);
  const changed = Buffer.from(binary);
  changed[128] = 0;
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'same-name.bin', mimeType: '', buffer: changed });
  await expect(dialog.getByRole('alert')).toContainText('oorspronkelijke verwachting is behouden');
  await expect(dialog).toContainText('Bestand gewijzigd / bytes wijken af');
  expect((await ownEvidence(page)).file.expectedSha256).toBe(original.file.expectedSha256);
  await dialog
    .getByRole('textbox', { name: 'Verificatiebevinding', exact: true })
    .fill('Fictieve nieuwe beoordeling zonder passende bytes');
  await dialog.getByRole('button', { name: 'Bewijs opslaan', exact: true }).click();
  await expect(
    dialog.getByRole('alert').filter({ hasText: 'Controleer het bewijsbestand in deze sessie' }),
  ).toBeVisible();
  await dialog
    .getByRole('textbox', { name: 'Verificatiebevinding', exact: true })
    .fill(original.verificationNote);
  await saveEvidence(page);
  const historicallyReviewed = await ownEvidence(page);
  expect(historicallyReviewed.verifiedAt).toBe(original.verifiedAt);
  expect(historicallyReviewed.verifiedContentSha256).toBe(original.verifiedContentSha256);
  expect(historicallyReviewed.verifiedFileBindingSha256).toBe(original.verifiedFileBindingSha256);
  expect(historicallyReviewed.fileCheck.state).toBe('mismatch');
  dialog = await editEvidence(page);
  await dialog
    .getByRole('button', { name: 'Bestand vervangen (opnieuw beoordelen)', exact: true })
    .click();
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'same-name.bin', mimeType: '', buffer: changed });
  await expect(dialog).toContainText('Bestandsbytes duurzaam lokaal opgeslagen');
  await expect(
    dialog.getByRole('combobox', { name: 'Verificatiestatus', exact: true }),
  ).toHaveValue('unverified');
  await saveEvidence(page);
  await expect.poll(async () => (await ownEvidence(page)).file.expectedSha256).toBe(hash(changed));
  expect((await ownEvidence(page)).verifiedFileBindingSha256).toBeUndefined();
});

test('failed durable byte storage preserves interview text and leaves no phantom attachment', async ({
  page,
}) => {
  let dialog = await newEvidence(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.add = function () {
      throw new DOMException('Fictieve opslagquota bereikt', 'QuotaExceededError');
    };
  });
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'quota.bin', mimeType: '', buffer: binary });
  await expect(dialog.getByRole('alert')).toContainText('Fictieve opslagquota bereikt');
  await expect(dialog).not.toContainText('Bytes-SHA256:');
  await page.reload();
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'Bewijs', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Bewijs vastleggen en beoordelen' });
  await expect(
    dialog.getByRole('textbox', { name: 'Inhoud en toepassingsbereik', exact: true }),
  ).toHaveValue('Fictieve inhoud; uitsluitend integriteitsproef.');
  await expect(dialog.getByLabel('Controleur van bestandsbytes', { exact: true })).toHaveValue(
    'Fictieve huidige controleur',
  );
  await expect(dialog).not.toContainText('Bytes-SHA256:');
});

test('text edited during an unfinished durable attachment write survives completion, closing and reload', async ({
  page,
}) => {
  let dialog = await newEvidence(page);
  const priorEvidence = (await state(page)).evidence;
  const latest = {
    title: 'Fictieve laatste titel José Ω',
    description: 'Fictieve invoer tijdens byte-opslag Ω\nLaatste teken Ψ',
    reference: 'Fictieve gewijzigde verwijzing tijdens opslag Ω',
    verifiedBy: 'Fictieve nog te bevestigen beoordelaar José Ψ',
    verificationNote:
      'Fictieve beoordelingsinvoer tijdens overdracht Ω\nDit is nog geen bevestiging Ψ',
  };
  await page.evaluate((size) => {
    const original = Blob.prototype.arrayBuffer;
    let calls = 0;
    const holder = window as typeof window & {
      evidenceWritePaused?: boolean;
      releaseEvidenceWrite?: () => void;
    };
    Blob.prototype.arrayBuffer = async function () {
      // Panel inspection, retaining inspection, then the durable store's own byte inspection.
      // Hold that third inspection before IndexedDB accepts the bytes.
      if (this.size === size && ++calls === 3) {
        holder.evidenceWritePaused = true;
        await new Promise<void>((resolve) => {
          holder.releaseEvidenceWrite = resolve;
        });
      }
      return original.call(this);
    };
  }, binary.length);
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'async-edit.bin', mimeType: '', buffer: binary });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { evidenceWritePaused?: boolean }).evidenceWritePaused,
      ),
    )
    .toBe(true);
  await expect(dialog.getByRole('button', { name: 'Bewijs opslaan', exact: true })).toBeDisabled();
  await dialog.getByLabel('Bewijstitel', { exact: true }).fill(latest.title);
  await dialog
    .getByRole('textbox', { name: 'Inhoud en toepassingsbereik', exact: true })
    .fill(latest.description);
  await dialog
    .getByRole('textbox', { name: /^Verwijzing naar bestand of bron/ })
    .fill(latest.reference);
  await dialog.getByLabel('Verificateur', { exact: true }).fill(latest.verifiedBy);
  await dialog
    .getByRole('textbox', { name: 'Verificatiebevinding', exact: true })
    .fill(latest.verificationNote);
  await page.evaluate(() =>
    (window as typeof window & { releaseEvidenceWrite?: () => void }).releaseEvidenceWrite?.(),
  );
  await expect(dialog).toContainText('Bestandsbytes duurzaam lokaal opgeslagen');
  await expect(dialog.getByLabel('Bewijstitel', { exact: true })).toHaveValue(latest.title);
  await expect(
    dialog.getByRole('textbox', { name: 'Inhoud en toepassingsbereik', exact: true }),
  ).toHaveValue(latest.description);
  await expect(
    dialog.getByRole('textbox', { name: /^Verwijzing naar bestand of bron/ }),
  ).toHaveValue(latest.reference);
  await expect(dialog.getByLabel('Verificateur', { exact: true })).toHaveValue(latest.verifiedBy);
  await expect(
    dialog.getByRole('textbox', { name: 'Verificatiebevinding', exact: true }),
  ).toHaveValue(latest.verificationNote);
  await expect(
    dialog.getByRole('combobox', { name: 'Verificatiestatus', exact: true }),
  ).toHaveValue('unverified');
  expect((await state(page)).evidence).toEqual(priorEvidence);
  await dialog.getByRole('button', { name: 'Sluiten', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  await page.getByRole('button', { name: 'Bewijs', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Bewijs vastleggen en beoordelen' });
  await expect(dialog.getByLabel('Bewijstitel', { exact: true })).toHaveValue(latest.title);
  await expect(
    dialog.getByRole('textbox', { name: 'Inhoud en toepassingsbereik', exact: true }),
  ).toHaveValue(latest.description);
  await expect(
    dialog.getByRole('textbox', { name: /^Verwijzing naar bestand of bron/ }),
  ).toHaveValue(latest.reference);
  await expect(dialog.getByLabel('Verificateur', { exact: true })).toHaveValue(latest.verifiedBy);
  await expect(
    dialog.getByRole('textbox', { name: 'Verificatiebevinding', exact: true }),
  ).toHaveValue(latest.verificationNote);
  await expect(dialog).toContainText(hash(binary));
  await dialog.getByRole('button', { name: 'Bewijs opslaan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await state(page)).evidence.length).toBe(priorEvidence.length + 1);
  const saved = (await state(page)).evidence.find(
    (record: { title: string }) => record.title === latest.title,
  );
  expect(saved).toMatchObject({
    ...latest,
    status: 'unverified',
    file: { expectedSha256: hash(binary), expectedByteLength: binary.length },
  });
  expect(saved.verifiedAt).toBeUndefined();
  expect(saved.verifiedContentSha256).toBeUndefined();
  expect(saved.verifiedFileBindingSha256).toBeUndefined();
});

type PrivateObject = { sha: string; bytes: Buffer };
function mockPrivateCloud() {
  const files = new Map<string, PrivateObject>();
  const blobs = new Map<string, Buffer>();
  let mode: 'normal' | 'inaccessible' = 'normal';
  let puts = 0;
  const HEAD = '1'.repeat(40);
  const attach = async (context: BrowserContext) =>
    context.route('https://api.github.com/**', async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      if (mode === 'inaccessible')
        return route.fulfill({ status: 403, json: { message: 'Fictieve toegang geweigerd' } });
      const base = '/repos/fictief/private-evidence';
      if (pathname === base)
        return route.fulfill({ json: { private: true, default_branch: 'main' } });
      if (pathname.startsWith(base + '/branches/'))
        return route.fulfill({ json: { name: 'main', commit: { sha: HEAD } } });
      if (pathname === base + '/contents') return route.fulfill({ json: [] });
      if (pathname.startsWith(base + '/git/blobs/')) {
        const blob = blobs.get(pathname.split('/').at(-1)!);
        return blob
          ? route.fulfill({ body: blob, contentType: 'application/octet-stream' })
          : route.fulfill({ status: 404, json: {} });
      }
      if (pathname.startsWith(base + '/contents/')) {
        const path = pathname.slice((base + '/contents/').length);
        if (route.request().method() === 'PUT') {
          const body = route.request().postDataJSON();
          expect(body.sha).toBeUndefined();
          if (files.has(path)) return route.fulfill({ status: 422, json: {} });
          const content = Buffer.from(body.content, 'base64');
          const sha = createHash('sha1')
            .update(`blob ${content.length}\0`)
            .update(content)
            .digest('hex');
          files.set(path, { sha, bytes: content });
          blobs.set(sha, content);
          puts++;
          return route.fulfill({ status: 201, json: { content: { sha }, commit: { sha: HEAD } } });
        }
        const object = files.get(path);
        return object
          ? route.fulfill({
              json: {
                type: 'file',
                sha: object.sha,
                size: object.bytes.length,
                encoding: 'none',
                content: '',
              },
            })
          : route.fulfill({ status: 404, json: {} });
      }
      return route.fulfill({ status: 400, json: { message: 'Unexpected fictitious route' } });
    });
  return {
    files,
    blobs,
    attach,
    setMode: (value: typeof mode) => {
      mode = value;
    },
    get puts() {
      return puts;
    },
  };
}
async function connectCloud(page: Page) {
  await page.getByRole('button', { name: 'Werkruimte & synchronisatie', exact: true }).click();
  await page.getByLabel('Private repository', { exact: true }).fill('fictief/private-evidence');
  await page.getByLabel(/^Fine-grained GitHub-token/).fill(TOKEN);
}

test('incomplete or invalid private connection input keeps the app live and never enters durable workspace or draft storage', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const before = await state(page);
  const invalidToken = 'placeholder token';
  await page.getByRole('button', { name: 'Werkruimte & synchronisatie', exact: true }).click();
  await page.getByLabel('Private repository', { exact: true }).fill('invalid_owner/repo');
  await page.getByLabel(/^Fine-grained GitHub-token/).fill(invalidToken);
  await expect(page.getByLabel('Private repository', { exact: true })).toHaveValue(
    'invalid_owner/repo',
  );
  await expect(page.getByLabel(/^Fine-grained GitHub-token/)).toHaveValue(invalidToken);
  await page.getByRole('button', { name: 'Overzicht', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Werkruimte & synchronisatie', exact: true }),
  ).toBeVisible();
  expect(await state(page)).toEqual(before);
  expect(errors).toEqual([]);
  const persisted = await page.evaluate(() =>
    Object.keys(localStorage)
      .map((key) => localStorage.getItem(key))
      .join('\n'),
  );
  expect(persisted).not.toContain(invalidToken);
  await page.reload();
  await page.getByRole('button', { name: 'Werkruimte & synchronisatie', exact: true }).click();
  await expect(page.getByLabel(/^Fine-grained GitHub-token/)).toHaveValue('');
  expect(await state(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('3MB PDF transfers privately and pc2 rechecks bytes; changed, missing and inaccessible stay distinct', async ({
  page,
  browser,
  context,
  baseURL,
}) => {
  const cloud = mockPrivateCloud();
  await cloud.attach(context);
  await connectCloud(page);
  await page.getByRole('button', { name: 'Organisatie & dossiers', exact: true }).click();
  let dialog = await newEvidence(page);
  const pdf = fictitiousPdf();
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'fictief-3mb.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(dialog).toContainText('Bestandsbytes duurzaam lokaal opgeslagen');
  await dialog
    .getByRole('button', { name: 'Bijlage opslaan in private GitHub', exact: true })
    .click();
  await expect(dialog).toContainText(
    'Bijlage apart in private GitHub-opslag bewaard en exact teruggelezen',
  );
  await saveEvidence(page);
  const workspace = await state(page);
  const proof = await ownEvidence(page);
  expect(proof.file.expectedByteLength).toBeGreaterThan(2_000_000);
  expect(proof.file.expectedSha256).toBe(hash(pdf));
  const envelope = await page.evaluate(() => localStorage.getItem('ima-apply.workspace.v1')!);
  expect(Buffer.byteLength(JSON.stringify(workspace))).toBeLessThan(2_000_000);
  expect(envelope).not.toContain(TOKEN);
  expect(cloud.puts).toBe(1);
  expect(cloud.files.get(proof.file.storage.path)!.bytes).toEqual(pdf);
  const second = await browser.newContext();
  await cloud.attach(second);
  await second.addInitScript(
    (saved) => localStorage.setItem('ima-apply.workspace.v1', saved),
    envelope,
  );
  const pc2 = await second.newPage();
  await pc2.goto(baseURL!);
  await connectCloud(pc2);
  dialog = await editEvidence(pc2);
  await expect(dialog).toContainText('Bestandsbytes nog niet gecontroleerd in deze sessie');
  await dialog
    .getByLabel('Controleur van bestandsbytes', { exact: true })
    .fill('Fictieve tweede-pc-controleur');
  await dialog
    .getByRole('button', { name: 'Private bron opnieuw controleren', exact: true })
    .click();
  await expect(dialog).toContainText('Controle bruikbaar in deze sessie');
  const downloadEvent = pc2.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Gebonden bestand downloaden', exact: true }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream!) parts.push(part);
  expect(Buffer.concat(parts)).toEqual(pdf);
  const object = cloud.files.get(proof.file.storage.path)!;
  cloud.files.set(proof.file.storage.path, { ...object, sha: '4'.repeat(40) });
  await dialog
    .getByRole('button', { name: 'Private bron opnieuw controleren', exact: true })
    .click();
  await expect(dialog).toContainText('Bestand gewijzigd / bytes wijken af');
  cloud.files.delete(proof.file.storage.path);
  await dialog
    .getByRole('button', { name: 'Private bron opnieuw controleren', exact: true })
    .click();
  await expect(dialog).toContainText('Bestand ontbreekt');
  cloud.setMode('inaccessible');
  await dialog
    .getByRole('button', { name: 'Private bron opnieuw controleren', exact: true })
    .click();
  await expect(dialog).toContainText('Bestand niet toegankelijk');
  expect(cloud.puts).toBe(1);
  await second.close();
});
