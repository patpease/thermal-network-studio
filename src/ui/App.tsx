import { useState } from 'react';

import { BRAND } from '../config/branding';
import { COMING_SOON, SCOPE_STATEMENT, STEPS } from '../config/copy';
import { DEFAULT_UNITS } from '../units/units';
import type { UnitSystem } from '../units/units';
import { Mark } from './Mark';
import { SiteFooter } from './SiteFooter';
import { ThemeIcon } from './ThemeIcon';
import { useTheme } from './theme';
import type { ThemeChoice } from './theme';

/**
 * The shell. Phase 00 is chrome and nothing else: the header matched to
 * Psychrometric Studio's, the scope line, the five steps of play as a road
 * map, and the studio footer.
 */
export function App() {
  const theme = useTheme();
  const [units, setUnits] = useState<UnitSystem>(DEFAULT_UNITS);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <Mark />
          <div className="brand-text">
            <a className="brand-org" href={BRAND.organisationUrl}>
              {BRAND.organisation}
            </a>
            <h1>{BRAND.appName}</h1>
            <span className="brand-tagline">{BRAND.tagline}</span>
          </div>
        </div>

        <div className="header-toggles">
          <div className="unit-toggle" role="group" aria-label="Unit system">
            {(['ip', 'si'] as UnitSystem[]).map((system) => (
              <button
                key={system}
                type="button"
                className={units === system ? 'active' : ''}
                onClick={() => setUnits(system)}
                aria-pressed={units === system}
              >
                {system.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Two buttons for three states: no stored preference follows the
              operating system, and pressing either pins it. The active button
              tracks `resolved`, not `preference`, so on a first visit one of
              them is lit rather than neither. See ui/theme.ts. */}
          <div className="unit-toggle theme-toggle" role="group" aria-label="Appearance">
            {([
              { choice: 'light' as ThemeChoice, icon: 'sun' as const, label: 'Light' },
              { choice: 'dark' as ThemeChoice, icon: 'moon' as const, label: 'Dark' },
            ]).map(({ choice, icon, label }) => (
              <button
                key={choice}
                type="button"
                className={theme.resolved === choice ? 'active' : ''}
                onClick={() => theme.setPreference(choice)}
                aria-pressed={theme.resolved === choice}
                aria-label={`${label} appearance`}
                title={`${label} appearance`}
              >
                <ThemeIcon name={icon} />
              </button>
            ))}
          </div>
        </div>
      </header>

      <p className="scope">
        <span className="scope__lead">{SCOPE_STATEMENT.lead}</span>
        <span>
          {SCOPE_STATEMENT.body} <strong>{SCOPE_STATEMENT.emphasis}</strong>
        </span>
      </p>

      <main className="workspace">
        <ol className="steps">
          {STEPS.map((step, index) => (
            <li key={step.key} className="step">
              <span className="step__number mono">{String(index + 1).padStart(2, '0')}</span>
              <h2 className="step__title">{step.title}</h2>
              <p className="step__body">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="coming-soon">{COMING_SOON}</p>
      </main>

      <SiteFooter />
    </div>
  );
}
