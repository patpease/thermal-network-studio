/**
 * The map and its panel. Three tabs beside the map — the site, the design
 * (with the challenge and its award) and the results — over one map. A share
 * link or a `?challenge=` link is read once, on arrival. Owns the site state and the map-only state
 * (selection, fly-to), and rebuilds the map palette when the resolved theme
 * changes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { MapView } from '../map/MapView';
import { readPalette } from '../map/style';
import type { MapPalette } from '../map/style';
import type { UnitSystem } from '../units/units';
import { challengeById, evaluate } from '../challenges/challenges';
import { CHALLENGE_COPY, DESIGN_COPY, RESULTS_COPY } from '../config/copy';
import { readLocation, shareUrl } from '../io/share';
import { boreholeRoom } from '../site/classify';
import { centroid } from '../site/geometry';
import { AwardCard } from './AwardCard';
import { ChallengeCard } from './ChallengeCard';
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

  // Arrival: a full share link restores everything; a challenge link (what an
  // award's post carries) only picks the challenge. Read once.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    const { shared, challenge } = readLocation(window.location);
    if (challengeById(challenge)) site.setChallenge(challenge);
    if (shared) {
      const [lon, lat] = centroid(shared.boundary);
      setFlyTo({ center: [lon, lat], zoom: 15, key: Date.now() });
      setTab('design');
      void site.load(shared.boundary, { selection: shared.selection, design: shared.design });
    } else if (challenge) setTab('site');
  }, [site]);

  const challenge = challengeById(state.challengeId);
  const evaluation = useMemo(
    () =>
      challenge && state.result && state.site && state.design.sources.length > 0
        ? evaluate(challenge, state.result, state.design, { boreholeRoom: boreholeRoom(state.site.openSpaceM2) })
        : null,
    [challenge, state.result, state.site, state.design],
  );
  const [showAward, setShowAward] = useState(false);
  // An award is for the design as it stands: any miss closes it.
  useEffect(() => {
    if (!evaluation?.met) setShowAward(false);
  }, [evaluation]);

  const [shareStatus, setShareStatus] = useState<{ text: string; url: string } | null>(null);
  const share = async () => {
    if (!state.boundary) return;
    const url = shareUrl(window.location.origin, { boundary: state.boundary, selection: state.selection, design: state.design, challenge: state.challengeId });
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus({ text: CHALLENGE_COPY.shared, url });
    } catch {
      setShareStatus({ text: CHALLENGE_COPY.shareFailed, url });
    }
  };

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
            <>
            {state.site && (
              <div className="panel-body panel-body--top">
                <ChallengeCard
                  challengeId={state.challengeId}
                  evaluation={evaluation}
                  running={state.running}
                  onChange={site.setChallenge}
                  onAward={() => setShowAward(true)}
                />
                {showAward && challenge && evaluation?.met && state.result && state.site && (
                  <AwardCard
                    challenge={challenge}
                    result={state.result}
                    design={state.design}
                    site={state.site}
                    selection={state.selection}
                    found={{ neighbourhood: state.site.placeName ?? null, town: state.place?.town ?? null, state: state.place?.state ?? null }}
                    edits={state.placeEdits}
                    onEdit={site.editPlace}
                  />
                )}
              </div>
            )}
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
            {state.site && (
              <div className="panel-body panel-body--bottom">
                <section className="card">
                  <button type="button" className="button" onClick={() => void share()}>
                    {CHALLENGE_COPY.share}
                  </button>
                  {shareStatus && (
                    <>
                      <p className="message" role="status">
                        {shareStatus.text}
                      </p>
                      <input className="share-url" readOnly value={shareStatus.url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
                    </>
                  )}
                </section>
              </div>
            )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
