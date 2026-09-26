/**
 * A streaming CSV reader, quote-aware, with no dependencies.
 *
 * The NREL files are 1–2 GB and some fields are quoted (HVAC system names
 * carry commas), so neither `split(',')` nor reading the whole file is an
 * option. Rows arrive as arrays of strings; the caller maps the header.
 */
import https from 'node:https';
import zlib from 'node:zlib';

/** Stream `url` (gunzipping if it ends .gz) and call `onRow(fields)` per row. */
export function streamCsv(url, onRow) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`${response.statusCode} for ${url}`));
          return;
        }
        const source = url.endsWith('.gz') ? response.pipe(zlib.createGunzip()) : response;
        source.setEncoding('utf8');

        let field = '';
        let row = [];
        let quoted = false;
        // A quote seen inside a quoted field: either an escaped quote ("") or
        // the end of the field. Only the next character can tell which.
        let pendingQuote = false;

        source.on('data', (chunk) => {
          for (let i = 0; i < chunk.length; i++) {
            const c = chunk[i];
            if (pendingQuote) {
              pendingQuote = false;
              if (c === '"') {
                field += '"';
                continue;
              }
              quoted = false;
            }
            if (quoted) {
              if (c === '"') pendingQuote = true;
              else field += c;
              continue;
            }
            if (c === '"') quoted = true;
            else if (c === ',') {
              row.push(field);
              field = '';
            } else if (c === '\n') {
              row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
              onRow(row);
              row = [];
              field = '';
            } else field += c;
          }
        });
        source.on('end', () => {
          if (field !== '' || row.length > 0) {
            row.push(field);
            onRow(row);
          }
          resolve();
        });
        source.on('error', reject);
      })
      .on('error', reject);
  });
}
