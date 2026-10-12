import { strToU8, strFromU8, zlibSync, unzlibSync } from 'fflate';
import { sha256 } from '@noble/hashes/sha2.js';
const encoding = 'ima.zlib-json/v1';
const hash = (bytes: Uint8Array) =>
  Array.from(sha256(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
/** Native JSON exports remain ordinary JSON. Only large local storage envelopes are compressed. */
export function encodeStoredJson(value: unknown): string {
  const raw = JSON.stringify(value);
  const bytes = strToU8(raw);
  if (bytes.length < 1_500_000) return raw;
  const compressed = zlibSync(bytes, { level: 1 });
  let binary = '';
  for (let index = 0; index < compressed.length; index += 8192)
    binary += String.fromCharCode(...compressed.subarray(index, index + 8192));
  const packed = JSON.stringify({
    encoding,
    byteLength: bytes.length,
    sha256: hash(bytes),
    body: btoa(binary),
  });
  return packed.length < raw.length ? packed : raw;
}
export function decodeStoredJson(raw: string, maxBytes: number): unknown {
  if (strToU8(raw).length > maxBytes)
    throw new Error('Lokale opslag is te groot; de gegevens blijven bewaard.');
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || value.encoding !== encoding) return value;
  if (
    Object.keys(value).some((key) => !['encoding', 'byteLength', 'sha256', 'body'].includes(key)) ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 1 ||
    value.byteLength > maxBytes ||
    typeof value.body !== 'string' ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sha256)
  )
    throw new Error('Ongeldige gecomprimeerde opslag; de gegevens blijven bewaard.');
  const binary = atob(value.body);
  const data = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  // Fixed allocation prevents an untrusted stored record from allocating an unbounded output.
  const bytes = unzlibSync(data, { out: new Uint8Array(value.byteLength) });
  if (bytes.length !== value.byteLength || hash(bytes) !== value.sha256)
    throw new Error('Lokale opslagcontrole mislukt; de gegevens blijven bewaard.');
  return JSON.parse(strFromU8(bytes));
}
