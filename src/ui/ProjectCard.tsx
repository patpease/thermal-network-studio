/**
 * Save, open and share (phase 11). A saved file is the whole study —
 * buildings and weather included — and opens with no network call; a share
 * link is short and re-reads the buildings. Both are offered, and the card
 * says which is which.
 */
import { useRef } from 'react';

import { CHALLENGE_COPY, PROJECT_COPY } from '../config/copy';
import { PROJECT_EXTENSION } from '../io/project';

export interface ProjectCardProps {
  readonly canSave: boolean;
  readonly openedFrom: string | null;
  readonly message: string | null;
  readonly shareStatus: { text: string; url: string } | null;
  readonly onSave: () => void;
  readonly onOpen: (file: File) => void;
  readonly onShare: () => void;
  readonly onReread: () => void;
}

const savedDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'earlier' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

export function ProjectCard(p: ProjectCardProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="card project-card" aria-labelledby="project-heading">
      <h2 id="project-heading" className="card__heading">
        {PROJECT_COPY.heading}
      </h2>
      {p.openedFrom !== null && (
        <p className="card__note">
          {PROJECT_COPY.openedFrom(savedDate(p.openedFrom))}{' '}
          <button type="button" className="button button--small" onClick={p.onReread}>
            {PROJECT_COPY.reread}
          </button>
        </p>
      )}
      <div className="button-row">
        <button type="button" className="button" disabled={!p.canSave} onClick={p.onSave}>
          {PROJECT_COPY.save}
        </button>
        <button type="button" className="button" onClick={() => input.current?.click()}>
          {PROJECT_COPY.open}
        </button>
        {p.canSave && (
          <button type="button" className="button" onClick={p.onShare}>
            {CHALLENGE_COPY.share}
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept={`${PROJECT_EXTENSION},.json,application/json`}
          hidden
          aria-label={PROJECT_COPY.open}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) p.onOpen(file);
          }}
        />
      </div>
      <p className="card__note">{PROJECT_COPY.saveNote}</p>
      {p.message && (
        <p className="message" role="status">
          {p.message}
        </p>
      )}
      {p.shareStatus && (
        <>
          <p className="message" role="status">
            {p.shareStatus.text}
          </p>
          <input className="share-url" readOnly value={p.shareStatus.url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
    </section>
  );
}
