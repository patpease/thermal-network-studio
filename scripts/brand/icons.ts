/**
 * Writes the favicons from src/brand/mark.ts. Run after changing the mark:
 *   npm run brand:icons
 * tests/mark.test.ts fails if the files and the source disagree.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MARK_REVERSED, MARK_STANDARD, markSvg } from '../../src/brand/mark.ts';

const root = resolve(import.meta.dirname, '../..');
writeFileSync(resolve(root, 'public/icon.svg'), markSvg(MARK_STANDARD));
writeFileSync(resolve(root, 'public/icon-dark.svg'), markSvg(MARK_REVERSED));
console.log('public/icon.svg and public/icon-dark.svg written from src/brand/mark.ts');
