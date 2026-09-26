/**
 * The map and its panel. Two tabs beside the map — the site and the design —
 * over one map, which shows both. Owns the site state and the map-only state
 * (selection, fly-to), and rebuilds the map palette when the resolved theme
 * changes.
 */
import { useEffect, useState } from 'react';

import { MapView } from '../map/MapView';
import { readPalette } from '../map/style';
import type { MapPalette } from '../map/style';
import type { UnitSystem } from '../units/units';
import { DESIGN_COPY, RESULTS_COPY } from '../config/copy';
import { DesignPanel } from './DesignPanel';
import { ResultsPanel } from './ResultsPanel';
import { SitePanel } from './SitePanel';
import type { ThemeChoice } from './theme';
import { useSite } from './useSite';

type Tab = 'site' | 'design' | 'results';

const TAB_LABEL: Record<Tab, string> = { site: DESIGN_COPY.tabSite, design: DESIGN_COPY.tabDesign, results: RESULTS_COPY.tab };

export function Workspace({ units, theme }: { units: UnitSystem; theme: ThemeChoice }) {
  const site = useSite();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ center: [number, number]; zoom: number; key: number } | null>(null);
  const [tab, setTab] = useState<Tab>('site');
  const [palette, setPalette] = useState<MapPalette>(() => readPalette());

  // The theme attribute is applied in an effect (theme.ts); read the tokens
  // after it has landed, on the next frame.
  useEffect(() => {
    // Only a real change of colours: a new object with the same values would
    // make the map rebuild its style for nothing, mid-load.
    const id = requestAnimationFrame(() => {
      const next = readPalette();
      setPalette((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    });
    return () => cancelAnimationFrame(id);
  }, [theme]);

  const { state } = site;

  return (
    <div className="workspace-map" data-tab={tab}>
      <div className="map-pane">
        <MapView
          palette={palette}
          drawing={state.phase === 'drawing'}
          draft={state.draft}
          boundary={state.boundary}
          site={state.site}
          selection={state.selection}
          selectedId={selectedId}
          flyTo={flyTo}
          onDraftPoint={site.addPoint}
          onFinishDraft={site.finishDrawing}
          onSelectBuilding={setSelectedId}
          design={state.design}
          placing={state.placing !== null}
          onPlace={site.placeAt}
        />
      </div>
      <aside className="side-panel" aria-label="Neighbourhood and design">
        <div className="tabs" role="tablist" aria-label="Panel">
          {(['site', 'design', 'results'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`tabpanel-${t}`}
              className="tabs__tab"
              onClick={() => {
                setTab(t);
                if (t !== 'design') site.startPlacing(null);
              }}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'site' ? (
            <SitePanel
              state={state}
              units={units}
              selectedId={selectedId}
              onFly={(p) => setFlyTo({ center: [p.longitude, p.latitude], zoom: 15, key: Date.now() })}
              onDraw={() => {
                setSelectedId(null);
                site.startDrawing();
              }}
              onFinish={site.finishDrawing}
              onUndo={site.undoPoint}
              onCancel={site.clear}
              onToggle={site.toggleBuilding}
              onOverride={(id, archetype) => site.overrideBuilding(id, { archetype })}
            />
          ) : tab === 'results' ? (
            <ResultsPanel
              result={state.result}
              design={state.design}
              weather={state.weather}
              running={state.running}
              units={units}
              hasSite={state.site !== null}
            />
          ) : (
            <DesignPanel
              site={state.site}
              design={state.design}
              result={state.result}
              running={state.running}
              placing={state.placing}
              units={units}
              onUpdate={site.updateDesign}
              onPlace={site.startPlacing}
              onSuggest={site.suggest}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
