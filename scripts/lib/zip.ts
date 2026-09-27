/**
 * Read one entry out of a zip archive, stored or deflated. No dependencies:
 * the central directory gives each entry's name, size and offset.
 *
 * Shared by the AutoBEM check (a TMY3 EPW inside a zip) and the network
 * importer (an .xlsx is a zip of XML parts).
 */
import { inflateRawSync } from 'node:zlib';

export function zipEntries(zip: Uint8Array): string[] {
  return walk(zip, () => false).names;
}

/** The first entry whose name `match` accepts, decompressed. */
export function readZipEntry(zip: Uint8Array, match: (name: string) => boolean): Uint8Array {
  const found = walk(zip, match).data;
  if (!found) throw new Error('No matching entry in the zip');
  return found;
}

function walk(zip: Uint8Array, match: (name: string) => boolean): { names: string[]; data: Uint8Array | null } {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const names: string[] = [];
  for (let e = 0; e < entries; e++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    names.push(name);
    if (match(name)) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = zip.subarray(start, start + size);
      if (method === 0) return { names, data };
      if (method === 8) return { names, data: new Uint8Array(inflateRawSync(data)) };
      throw new Error(`Unsupported zip compression ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { names, data: null };
}
