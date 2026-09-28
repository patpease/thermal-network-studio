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
import { CHALLENGE_COPY, DESIGN_COPY, LEARN_COPY, MAP_COPY, PROJECT_COPY, RESULTS_COPY } from '../config/copy';
import { challengeSiteFact } from '../education/learn';
import { download } from '../award/raster';
import { openProject, projectFilename, projectJson } from '../io/project';
import { readLocation, shareUrl } from '../io/share';
import { boreholeRoom } from '../site/classify';
import { centroid } from '../site/geometry';
import { connected } from '../site/neighbourhood';
import { AwardCard } from './AwardCard';
import { ChallengeCard } from './ChallengeCard';
import { DesignPanel } from './DesignPanel';
import { LearnPanel } from './LearnPanel';
import { ProjectCard } from './ProjectCard';
import { ResultsPanel } from './ResultsPanel';
import { SitePanel } from './SitePanel';
import type { ThemeChoice } from './theme';
import { usePhone } from './usePhone';
import { useSite } from './useSite';
import { withUnit } from './format';
import { draftArea } from './useSite';

type Tab = 'map' | 'site' | 'design' | 'results' | 'learn';

const TAB_LABEL: Record<Tab, string> = {
  map: 'Map', site: DESIGN_COPY.tabSite, design: DESIGN_COPY.tabDesign, results: RESULTS_COPY.tab, learn: LEARN_COPY.tab };

export function Workspace({ units, theme, onUnits }: { units: UnitSystem; theme: ThemeChoice; onUnits: (u: UnitSystem) => void }) {
  const site = useSite();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ center: [number, number]; zoom: number; key: number } | null>(null);
  const [chosen, setTab] = useState<Tab>('site');
  // Below 860 px the map is a tab of its own (one screen at a time, as the
  // sibling tools do on a phone). On a desk it is always shown, so a 'map'
  // choice left over from a narrower window means the site panel.
  const phone = usePhone();
  const tab: Tab = !phone && chosen === 'map' ? 'site' : chosen;
  const tabs: readonly Tab[] = phone ? ['map', 'site', 'design', 'results', 'learn'] : ['site', 'design', 'results', 'learn'];
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

  // Open the Learn tab at a fact, and bring it into view once drawn.
  const openLearn = (anchor: string) => {
    setTab('learn');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(anchor);
        el?.scrollIntoView({ block: 'center' });
        el?.focus({ preventScroll: true });
      }),
    );
  };

  const finish = () => {
    site.finishDrawing();
    if (phone) setTab('site');
  };
  const edit = () => {
    setSelectedId(null);
    site.startEditing();
    if (phone) setTab('map');
  };
  const editDone = () => {
    site.finishEditing();
    if (phone) setTab('site');
  };
  const editCancel = () => {
    site.cancelEditing();
    if (phone) setTab('site');
  };

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

  // Save and open (phase 11).
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const canSave = state.phase === 'ready' && state.snapshot !== null && state.boundary !== null;
  const save = () => {
    const s = site.state;
    if (!s.snapshot || !s.boundary) return;
    const name = projectFilename([
      s.placeEdits.neighbourhood ?? s.site?.placeName,
      s.placeEdits.town ?? s.place?.town,
      s.placeEdits.state ?? s.place?.state,
    ]);
    const text = projectJson({
      saved: new Date().toISOString(),
      boundary: s.boundary,
      selection: s.selection,
      design: s.design,
      challenge: s.challengeId,
      placeEdits: s.placeEdits,
      units,
      snapshot: s.snapshot,
    });
    download(new Blob([text], { type: 'application/json' }), name);
    setFileMessage(PROJECT_COPY.saved(name));
  };
  const openFile = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      setFileMessage(PROJECT_COPY.unreadable);
      return;
    }
    const opened = openProject(text);
    if (!opened.ok) {
      setFileMessage(PROJECT_COPY.refused[opened.reason]);
      return;
    }
    if (site.state.site && !window.confirm(PROJECT_COPY.replace)) return;
    const p = opened.project;
    setSelectedId(null);
    setShareStatus(null);
    setFileMessage(null);
    site.open(p);
    onUnits(p.units);
    const [lon, lat] = centroid(p.boundary);
    setFlyTo({ center: [lon, lat], zoom: 15, key: Date.now() });
    setTab('design');
  };
  // Ctrl/⌘+S saves, as it does everywhere else.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const projectCard = (
    <div className="panel-body panel-body--bottom">
      <ProjectCard
        canSave={canSave}
        openedFrom={state.openedFrom}
        message={fileMessage}
        shareStatus={shareStatus}
        onSave={save}
        onOpen={(f) => void openFile(f)}
        onShare={() => void share()}
        onReread={site.reread}
      />
    </div>
  );

  return (
    <div className="workspace-map" data-tab={tab}>
      <div className="map-pane">
        <MapView
          palette={palette}
          drawing={state.phase === 'drawing'}
          editing={state.phase === 'editing'}
          onMoveVertex={site.moveVertex}
          draft={state.draft}
          boundary={state.boundary}
          site={state.site}
          selection={state.selection}
          selectedId={selectedId}
          flyTo={flyTo}
          onDraftPoint={site.addPoint}
          onFinishDraft={finish}
          onSelectBuilding={setSelectedId}
          design={state.design}
          placing={state.placing !== null}
          onPlace={(p) => {
            site.placeAt(p);
            if (phone) setTab('design');
          }}
        />
        {/* The map's own controls, for the phone, where the panel is another screen. */}
        {phone && state.phase === 'drawing' && (
          <div className="map-toolbar" role="group" aria-label="Drawing">
            <span className="numeric">
              {state.draft.length} {state.draft.length === 1 ? 'corner' : 'corners'}
              {state.draft.length >= 3 && ` · ${withUnit('area', draftArea(state.draft), units)}`}
            </span>
            <button type="button" className="button button--primary" disabled={state.draft.length < 3} onClick={finish}>
              {MAP_COPY.finishButton}
            </button>
            <button type="button" className="button" disabled={state.draft.length === 0} onClick={site.undoPoint}>
              {MAP_COPY.undoButton}
            </button>
            <button type="button" className="button" onClick={site.clear}>
              {MAP_COPY.cancelButton}
            </button>
          </div>
        )}
        {phone && state.phase === 'editing' && (
          <div className="map-toolbar" role="group" aria-label="Editing">
            <span>{MAP_COPY.editHint}</span>
            <button type="button" className="button button--primary" onClick={editDone}>
              {MAP_COPY.doneButton}
            </button>
            <button type="button" className="button" onClick={editCancel}>
              {MAP_COPY.cancelButton}
            </button>
          </div>
        )}
        {phone && state.placing && (
          <div className="map-toolbar" role="group" aria-label="Placing">
            <span>{DESIGN_COPY.placing}</span>
            <button
              type="button"
              className="button"
              onClick={() => {
                site.startPlacing(null);
                if (phone) setTab('design');
              }}
            >
              {DESIGN_COPY.cancelPlacing}
            </button>
          </div>
        )}
      </div>
      <aside className="side-panel" aria-label="Neighbourhood and design">
        <div className="tabs" role="tablist" aria-label="Panel">
          {tabs.map((t) => (
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
                if (t !== 'design' && t !== 'map') site.startPlacing(null);
              }}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'map' ? null : tab === 'site' ? (
            <>
            <SitePanel
              state={state}
              units={units}
              selectedId={selectedId}
              onFly={(p) => setFlyTo({ center: [p.longitude, p.latitude], zoom: 15, key: Date.now() })}
              onDraw={() => {
                setSelectedId(null);
                site.startDrawing();
                if (phone) setTab('map');
              }}
              onFinish={finish}
              onEdit={edit}
              onRetry={site.retry}
              onReread={site.reread}
              onEditDone={editDone}
              onEditCancel={editCancel}
              onUndo={site.undoPoint}
              onCancel={site.clear}
              onToggle={site.toggleBuilding}
              onOverride={(id, archetype) => site.overrideBuilding(id, { archetype })}
            />
            {projectCard}
            </>
          ) : tab === 'learn' ? (
            <LearnPanel site={state.site} metrics={state.result?.site ?? null} units={units} />
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
                  siteFact={challenge && state.result ? challengeSiteFact(challenge, state.site, state.result.site, (m) => withUnit('length', m, units)) : null}
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
              onPlace={(id) => {
                site.startPlacing(id);
                if (phone && id) setTab('map');
              }}
              onSuggest={site.suggest}
              onLearn={openLearn}
              onEditBoundary={() => {
                edit();
                if (!phone) setTab('site');
              }}
              connectedCount={state.site ? connected(state.site, state.selection).length : 0}
            />
            {state.site && projectCard}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
