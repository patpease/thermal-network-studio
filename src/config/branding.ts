/**
 * Branding — the single source of truth, mirroring the siblings'
 * `config/branding.ts` so the suite stays in step.
 *
 * Every branded surface reads from here: the chrome now, and from phase 07 the
 * stamp burned into every export.
 */
export const APP_VERSION = '0.0.1';

export const BRAND = {
  /** The parent identity, shown as an endorsement above the product name. */
  organisation: 'Pease Studio',
  organisationUrl: 'https://peasestudio.com/',
  appName: 'Thermal Network Studio',
  tagline: 'Share heat across a neighbourhood',
  /** Provisional until a real tile is drawn; see ui/Mark.tsx. */
  markIsPlaceholder: true,
  /**
   * Where the tool lives. Stamped on every export, so it moves with the
   * deployed route in wrangler.jsonc — workers.dev until a domain is chosen.
   */
  host: 'thermal-network-studio.patpease0.workers.dev',
} as const;

/**
 * PLACEHOLDER: the link every award and LinkedIn post carries, until the tool
 * is published at its own address. It points at the live workers.dev route so
 * that the link works in the meantime — a placeholder that 404s would be
 * posted for ever. Change it here and every award follows.
 */
export const AWARD_LINK_BASE = `https://${BRAND.host}`;

/**
 * The prose lives in copy.ts. Re-exported so an export path keeps one import
 * and there is never a second copy of the same sentence to drift.
 */
export { SCOPE_STATEMENT } from './copy';

/**
 * The studio footer's links — the same set, in the same order, as the footer on
 * peasestudio.com and in every sibling tool.
 */
export type FooterLink = {
  readonly label: string;
  readonly href: string;
  /** Drawn inline. A deliberately closed set: a footer of icons is noise. */
  readonly icon?: 'coffee';
};

export const FOOTER_LINKS: readonly FooterLink[] = [
  { label: 'Privacy', href: 'https://peasestudio.com/privacy/' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/patrick-pease-eng/' },
  { label: 'GitHub', href: 'https://github.com/patpease' },
  { label: 'Email', href: 'mailto:peasestudio@gmail.com' },
  {
    label: 'Buy me a coffee',
    href: 'https://buymeacoffee.com/peasestudio',
    icon: 'coffee',
  },
];

/** Alias so SiteFooter.tsx is identical across the tools. */
export const STUDIO_NAME = BRAND.organisation;
