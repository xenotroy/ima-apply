import { checkedFileBytes, EvidenceFileError } from './evidence-files';
import type { EvidenceFileStore } from './evidence-file-types';

export const EVIDENCE_FILE_DATABASE = 'ima-evidence-files-v1';
const STORE = 'files';

/** Binary bytes never enter localStorage, drafts, or the workspace JSON. */
export class IndexedDbEvidenceFileStore implements EvidenceFileStore {
  #db?: Promise<IDBDatabase>;
  constructor(private readonly factory: IDBFactory | undefined = globalThis.indexedDB) {}

  #open(): Promise<IDBDatabase> {
    if (!this.factory)
      return Promise.reject(
        new EvidenceFileError(
          'Lokale bijlageopslag is niet beschikbaar. Het bewijsrecord is niet gewijzigd.',
        ),
      );
    if (!this.#db)
      this.#db = new Promise((resolve, reject) => {
        const request = this.factory!.open(EVIDENCE_FILE_DATABASE, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE))
            request.result.createObjectStore(STORE);
        };
        request.onerror = () =>
          reject(new EvidenceFileError('Lokale bijlageopslag kon niet worden geopend.'));
        request.onblocked = () =>
          reject(
            new EvidenceFileError(
              'Een ander tabblad blokkeert de bijlageopslag. Sluit dat tabblad en probeer opnieuw.',
            ),
          );
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
      });
    return this.#db;
  }

  async get(hash: string): Promise<Blob | null> {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new EvidenceFileError('Ongeldige bijlagehash.');
    const db = await this.#open();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(hash);
      let result: unknown;
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () =>
        reject(new EvidenceFileError('De lokale bijlage kon niet worden gelezen.'));
    });
    if (value === undefined) return null;
    if (!(value instanceof Blob))
      throw new EvidenceFileError('De lokale bijlageopslag bevat een ongeldig bestand.');
    if ((await checkedFileBytes(value)).sha256 !== hash)
      throw new EvidenceFileError(
        'De lokale bijlage is gewijzigd of beschadigd; de oorspronkelijke byteshash is behouden.',
      );
    return value;
  }

  async put(hash: string, blob: Blob): Promise<void> {
    const actual = await checkedFileBytes(blob);
    if (actual.sha256 !== hash)
      throw new EvidenceFileError('De lokale opslagbinding past niet bij de bytes.');
    if (await this.get(hash)) return;
    const db = await this.#open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add(blob, hash);
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () =>
          reject(
            new EvidenceFileError(
              'De bijlage is niet duurzaam opgeslagen. Lokale opslag is vol, geblokkeerd of gewijzigd. De bestaande registratie is behouden.',
            ),
          );
      });
    } catch (error) {
      // Concurrent identical writes may race on add(); verify before accepting reuse.
      if (await this.get(hash).catch(() => null)) return;
      throw error;
    }
    if (!(await this.get(hash)))
      throw new EvidenceFileError('De opgeslagen bijlage kon niet worden teruggelezen.');
  }
}
