/**
 * Just enough of an .xlsx reader to pull cached cell values out of a sheet.
 *
 * An .xlsx is a zip of XML. Node has inflate but no unzip and no XML parser,
 * and a dependency for one build-time script is a poor trade, so this reads the
 * zip's central directory itself and scans cells with a regular expression.
 * It returns each cell's cached VALUE — for a formula cell that is the result
 * Excel last computed, which is why callers here read only raw-data columns.
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

function unzip(path) {
  const buf = readFileSync(path);
  // End of central directory: signature 0x06054b50, within the last 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${path}: not a zip file`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad central directory entry');
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    const localName = buf.readUInt16LE(local + 26);
    const localExtra = buf.readUInt16LE(local + 28);
    const start = local + 30 + localName + localExtra;
    files.set(name, () => {
      const data = buf.subarray(start, start + compressed);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Column letters → zero-based index: A → 0, R → 17, AA → 26. */
export function columnIndex(letters) {
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Open a workbook; `sheet(name)` returns rows as sparse arrays of values. */
export function openWorkbook(path) {
  const files = unzip(path);
  const read = (name) => {
    const f = files.get(name);
    if (!f) throw new Error(`${path}: missing ${name}`);
    return f();
  };

  const strings = [];
  if (files.has('xl/sharedStrings.xml')) {
    for (const m of read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      strings.push(decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
    }
  }

  const rels = new Map();
  for (const m of read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, ''));
  }
  const sheets = new Map();
  for (const m of read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(/name="([^"]+)"/.exec(m[0])?.[1] ?? '');
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (rid) sheets.set(name, `xl/${rels.get(rid)}`);
  }

  return {
    sheet(name) {
      const file = sheets.get(name);
      if (!file) throw new Error(`${path}: no sheet named ${name}`);
      const rows = [];
      for (const row of read(file).matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells = [];
        for (const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = /r="([A-Z]+)\d+"/.exec(c[1])?.[1];
          const type = /t="([^"]+)"/.exec(c[1])?.[1];
          const raw = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? '')?.[1];
          const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2] ?? '')?.[1];
          if (!ref) continue;
          let value = null;
          if (type === 's' && raw !== undefined) value = strings[Number(raw)];
          else if (type === 'inlineStr' && inline !== undefined) value = decode(inline);
          else if (type === 'str' && raw !== undefined) value = decode(raw);
          else if (raw !== undefined) value = Number(raw);
          cells[columnIndex(ref)] = value;
        }
        rows[Number(row[1]) - 1] = cells;
      }
      return rows;
    },
  };
}
