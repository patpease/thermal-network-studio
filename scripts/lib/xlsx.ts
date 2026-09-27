/**
 * Read a worksheet out of an .xlsx as rows of strings. No dependencies: an
 * .xlsx is a zip of XML parts, and a table of cells needs only the workbook
 * (sheet names), its relationships (sheet files), the shared strings and the
 * sheet itself. Formatting, formulas and dates are not interpreted — a cell
 * reads as the value Excel stored.
 */
import { readZipEntry } from './zip.ts';

const text = (zip: Uint8Array, path: string) => new TextDecoder().decode(readZipEntry(zip, (n) => n === path));

const unescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** "B12" → column index 1. */
function column(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function sheetNames(zip: Uint8Array): string[] {
  return [...text(zip, 'xl/workbook.xml').matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => unescape(m[1]!));
}

export function readSheet(zip: Uint8Array, name: string): string[][] {
  const workbook = text(zip, 'xl/workbook.xml');
  const sheet = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].find((m) => unescape(/\bname="([^"]*)"/.exec(m[1]!)?.[1] ?? '') === name);
  if (!sheet) throw new Error(`No sheet named "${name}"`);
  const rid = /\br:id="([^"]*)"/.exec(sheet[1]!)?.[1];
  const rels = text(zip, 'xl/_rels/workbook.xml.rels');
  const target = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .map((m) => m[1]!)
    .find((a) => new RegExp(`\\bId="${rid}"`).test(a));
  const file = /\bTarget="([^"]*)"/.exec(target ?? '')?.[1];
  if (!file) throw new Error(`No file for sheet "${name}"`);
  const path = file.startsWith('/') ? file.slice(1) : `xl/${file}`;

  let shared: string[] = [];
  try {
    shared = [...text(zip, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      unescape([...m[1]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
    );
  } catch {
    // A workbook with no text cells has no shared strings.
  }

  const rows: string[][] = [];
  for (const row of text(zip, path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const out: string[] = [];
    for (const cell of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1]!;
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1];
      const body = cell[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = unescape([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else if (v !== undefined) value = unescape(v);
      out[column(ref)] = value;
    }
    rows.push(Array.from(out, (x) => x ?? ''));
  }
  return rows;
}
