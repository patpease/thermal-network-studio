// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { MAP_COPY } from '../src/config/copy';
import { App } from '../src/ui/App';

const phoneMedia = (phone: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: phone && query.includes('max-width: 860px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

afterEach(() => {
  cleanup();
});

describe('the phone layout', () => {
  it('adds a Map tab on a phone and not on a desk', () => {
    phoneMedia(false);
    render(<App />);
    expect(screen.queryByRole('tab', { name: 'Map' })).toBeNull();
    cleanup();
    phoneMedia(true);
    render(<App />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Map', 'Site', 'Design', 'Results', 'Learn']);
  });

  it('drawing on a phone switches to the map, with its own Finish, Undo and Cancel', async () => {
    phoneMedia(true);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: MAP_COPY.drawButton }));
    expect(screen.getByRole('tab', { name: 'Map' }).getAttribute('aria-selected')).toBe('true');
    const toolbar = screen.getByRole('group', { name: 'Drawing' });
    expect(toolbar.textContent).toContain(MAP_COPY.finishButton);
    expect(toolbar.textContent).toContain(MAP_COPY.undoButton);
  });
});
