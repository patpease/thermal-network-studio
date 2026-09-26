/**
 * The map and its panel: phase 03's screen. Owns the site state and the
 * map-only state (selection, fly-to), and rebuilds the map palette when the
 * resolved theme changes.
 */
import { useEffect, useState } from 'react';

import { MapView } from '../map/MapView';
import { readPalette } from '../map/style';
import type { MapPalette } from '../map/style';
import type { UnitSystem } from '../units/units';
import { SitePanel } from './SitePanel';
import type { ThemeChoice } from './theme';
import { useSite } from './useSite';

export function Workspace({ units, theme }: { units: UnitSystem; theme: ThemeChoice }) {
  const site = useSite();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ center: [number, number]; zoom: number; key: number } | null>(null);
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
    <div className="workspace-map">
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
        />
      </div>
      <aside className="side-panel" aria-label="Neighbourhood">
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
      </aside>
    </div>
  );
}
