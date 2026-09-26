/**
 * The award as a PNG: fonts embedded, drawn through an <img> onto a canvas.
 *
 * Browser only — jsdom has no canvas and no image decoder, so this is
 * verified in Chromium, never in the suite (ZEEL's lesson).
 *
 * An SVG inside an <img> is an isolated document: no stylesheet, no custom
 * properties, and no fetches. That is why graphic.ts writes literal colours,
 * and why the fonts are read here and handed over as data URIs. A blob: URL
 * is used for the image (the CSP allows blob: in img-src).
 */
import sansUrl from '@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2?url';
import monoUrl from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url';

import { AWARD_HEIGHT, AWARD_WIDTH, awardSvg } from './graphic';
import type { AwardFonts, AwardInput } from './graphic';

let fonts: Promise<AwardFonts> | null = null;

async function dataUri(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return `data:font/woff2;base64,${btoa(binary)}`;
}

/** Read once per page; the files are the ones the page already uses. */
export function awardFonts(): Promise<AwardFonts> {
  fonts ??= Promise.all([dataUri(sansUrl), dataUri(monoUrl)]).then(([sans, mono]) => ({ sans, mono }));
  return fonts;
}

/** The finished SVG, fonts in, as a blob: URL for a preview <img>. */
export async function awardPreviewUrl(input: AwardInput): Promise<string> {
  const svg = awardSvg(input, await awardFonts());
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}

export async function awardPng(input: AwardInput): Promise<Blob> {
  const url = await awardPreviewUrl(input);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The award could not be drawn.'));
      img.src = url;
    });
    // Give the embedded fonts a frame to apply inside the isolated document.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const canvas = document.createElement('canvas');
    canvas.width = AWARD_WIDTH;
    canvas.height = AWARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the award.');
    ctx.drawImage(img, 0, 0, AWARD_WIDTH, AWARD_HEIGHT);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The award could not be saved.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Save a blob as a file, through a temporary link. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
