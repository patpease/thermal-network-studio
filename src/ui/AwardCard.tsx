/**
 * The award for a met challenge (D34): check the place names, preview the
 * graphic, download it, edit the post, copy it, open LinkedIn.
 *
 * The preview is the very SVG that becomes the PNG, fonts and all, so what
 * is seen is what is posted.
 */
import { useEffect, useMemo, useState } from 'react';

import type { AwardInput, AwardOutline } from '../award/graphic';
import { linkedInComposeUrl, postText, printedLink } from '../award/post';
import { awardPng, awardPreviewUrl, download } from '../award/raster';
import type { Challenge } from '../challenges/challenges';
import { AWARD_COPY } from '../config/copy';
import type { Design } from '../engine/design';
import type { ScenarioResult } from '../engine/scenario';
import type { Site } from '../site/classify';
import { connected } from '../site/neighbourhood';
import type { Selection } from '../site/neighbourhood';
import type { PlaceEdits } from './useSite';

export interface AwardCardProps {
  readonly challenge: Challenge;
  readonly result: ScenarioResult;
  readonly design: Design;
  readonly site: Site;
  readonly selection: Selection;
  /** What the lookups found. */
  readonly found: { neighbourhood: string | null; town: string | null; state: string | null };
  readonly edits: PlaceEdits;
  readonly onEdit: (e: PlaceEdits) => void;
}

const ROLE = { 'bore-field': 'ground', 'air-source': 'heat', 'cooling-tower': 'cool', 'waste-heat': 'heat', water: 'cool' } as const;

export function AwardCard(props: AwardCardProps) {
  const { challenge, result, design, site, selection, found, edits } = props;
  const place = {
    neighbourhood: edits.neighbourhood ?? found.neighbourhood ?? '',
    town: edits.town ?? found.town ?? '',
    state: edits.state ?? found.state ?? '',
  };

  const outline: AwardOutline = useMemo(
    () => ({
      boundary: site.boundary,
      buildings: connected(site, selection).map((b) => b.footprint),
      sources: design.sources.flatMap((s) => (s.at ? [{ at: s.at, role: ROLE[s.kind] }] : [])),
    }),
    [site, selection, design],
  );

  // The date is fixed when the award is first shown, not re-read per render.
  const [date] = useState(() => new Date());
  const input: AwardInput = useMemo(
    () => ({
      challenge,
      place,
      carbonReduction: result.score.carbonReduction,
      energyReduction: result.score.energyReduction,
      outline,
      date,
      url: printedLink(),
    }),
    // place is rebuilt each render from primitives, so the memo keys on them.
    [challenge, place.neighbourhood, place.town, place.state, result, outline, date],
  );

  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return; // jsdom
    let url: string | null = null;
    let cancelled = false;
    void awardPreviewUrl(input).then((u) => {
      if (cancelled) URL.revokeObjectURL(u);
      else {
        url = u;
        setPreview(u);
      }
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [input]);

  const generated = postText({ challenge, place, carbonReduction: result.score.carbonReduction, energyReduction: result.score.energyReduction });
  const [text, setText] = useState(generated);
  const [edited, setEdited] = useState(false);
  // Follow the generated text until the player has typed in it.
  useEffect(() => {
    if (!edited) setText(generated);
  }, [generated, edited]);

  const [status, setStatus] = useState<string | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(AWARD_COPY.copied);
    } catch {
      setStatus(AWARD_COPY.copyFailed);
    }
  };

  const slug = [challenge.id, place.neighbourhood || place.town].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <section className="card award" aria-labelledby="award-heading">
      <h2 id="award-heading" className="card__heading">
        {AWARD_COPY.heading}
      </h2>
      <p className="card__note">{AWARD_COPY.placeNote}</p>
      <div className="fields fields--three">
        <label className="field">
          <span className="field-label">{AWARD_COPY.neighbourhood}</span>
          <input value={place.neighbourhood} onChange={(e) => props.onEdit({ neighbourhood: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">{AWARD_COPY.town}</span>
          <input value={place.town} onChange={(e) => props.onEdit({ town: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">{AWARD_COPY.state}</span>
          <input value={place.state} maxLength={20} onChange={(e) => props.onEdit({ state: e.target.value })} />
        </label>
      </div>

      <div className="award__preview">
        {preview ? <img src={preview} alt={`${AWARD_COPY.preview}: ${challenge.title}`} width={1080} height={1350} /> : <p className="message">{AWARD_COPY.drawing}</p>}
      </div>
      <button
        type="button"
        className="button button--primary"
        onClick={() => {
          void awardPng(input)
            .then((png) => download(png, `thermal-network-award-${slug}.png`))
            .catch((e: unknown) => setStatus(e instanceof Error ? e.message : String(e)));
        }}
      >
        {AWARD_COPY.download}
      </button>

      <label className="field-label" htmlFor="post-text">
        {AWARD_COPY.postLabel}
      </label>
      <textarea
        id="post-text"
        className="post-text"
        rows={9}
        value={text}
        onChange={(e) => {
          setEdited(true);
          setText(e.target.value);
        }}
      />
      <div className="button-row">
        <button type="button" className="button" onClick={() => void copy()}>
          {AWARD_COPY.copy}
        </button>
        <a className="button" href={linkedInComposeUrl(text)} target="_blank" rel="noopener noreferrer" onClick={() => void copy()}>
          {AWARD_COPY.openLinkedIn}
        </a>
      </div>
      {status && (
        <p className="message" role="status">
          {status}
        </p>
      )}
      <p className="card__note">{AWARD_COPY.steps}</p>
    </section>
  );
}
