// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BRAND } from '../src/config/branding';
import { MAP_COPY, SCOPE_STATEMENT } from '../src/config/copy';
import { App } from '../src/ui/App';

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  window.localStorage.clear();
});

describe('the shell', () => {
  it('names the product as the page heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(BRAND.appName);
  });

  it('carries the scope statement as page furniture, not a dismissible notice', () => {
    render(<App />);
    expect(screen.getByText(SCOPE_STATEMENT.emphasis)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /dismiss|close/i })).toBeNull();
  });

  it('opens on the map, ready to draw a neighbourhood', () => {
    render(<App />);
    expect(screen.getByRole('region', { name: 'Map' })).toBeTruthy();
    expect(screen.getByRole('button', { name: MAP_COPY.drawButton })).toBeTruthy();
  });

  it('drawing mode offers Finish, Undo and Cancel, and Finish waits for three corners', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: MAP_COPY.drawButton }));
    const finish = screen.getByRole('button', { name: MAP_COPY.finishButton }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: MAP_COPY.cancelButton }));
    expect(screen.getByRole('button', { name: MAP_COPY.drawButton })).toBeTruthy();
  });

  it('starts in IP and switches to SI', async () => {
    render(<App />);
    const ip = screen.getByRole('button', { name: 'IP' });
    const si = screen.getByRole('button', { name: 'SI' });
    expect(ip.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(si);
    expect(si.getAttribute('aria-pressed')).toBe('true');
    expect(ip.getAttribute('aria-pressed')).toBe('false');
  });

  it('lights one theme button on a first visit, not neither', () => {
    render(<App />);
    const light = screen.getByRole('button', { name: 'Light appearance' });
    const dark = screen.getByRole('button', { name: 'Dark appearance' });
    expect([light, dark].filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });
});
