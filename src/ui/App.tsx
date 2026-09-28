import { useState } from 'react';

import { BRAND } from '../config/branding';
import { SCOPE_STATEMENT, TOUR_COPY } from '../config/copy';
import { DEFAULT_UNITS } from '../units/units';
import type { UnitSystem } from '../units/units';
import { Mark } from './Mark';
import { SiteFooter } from './SiteFooter';
import { ThemeIcon } from './ThemeIcon';
import { useTheme } from './theme';
import type { ThemeChoice } from './theme';
import { Workspace } from './Workspace';

/**
 * The shell: the header matched to Psychrometric Studio's, the scope line
 * (permanent furniture, never dismissible), the map workspace, the footer.
 */
export function App() {
  const theme = useTheme();
  const [units, setUnits] = useState<UnitSystem>(DEFAULT_UNITS);
  const [tourRequest, setTourRequest] = useState(0);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <Mark />
          <div className="brand-text">
            <a className="brand-org" href={BRAND.organisationUrl}>
              {BRAND.organisation}
            </a>
            <div className="brand-name">
              <h1>{BRAND.appName}</h1>
              {BRAND.stage && <span className="brand-stage">{BRAND.stage}</span>}
            </div>
            <span className="brand-tagline">{BRAND.tagline}</span>
          </div>
        </div>

        <div className="header-toggles">
          <button type="button" className="button button--small tour-button" onClick={() => setTourRequest((n) => n + 1)}>
            {TOUR_COPY.button}
          </button>
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
        <Workspace units={units} theme={theme.resolved} onUnits={setUnits} tourRequest={tourRequest} />
      </main>

      <SiteFooter />
    </div>
  );
}
