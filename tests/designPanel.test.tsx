// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { EMPTY_DESIGN } from '../src/engine/design';
import type { Design } from '../src/engine/design';
import type { Site } from '../src/site/classify';
import { DesignPanel } from '../src/ui/DesignPanel';
import type { UnitSystem } from '../src/units/units';

afterEach(cleanup);

const SITE: Site = {
  boundary: [
    [-94, 44],
    [-93.99, 44],
    [-93.99, 44.01],
    [-94, 44],
  ],
  areaM2: 1e6,
  buildings: [],
  sources: [
    { id: 'rink', kind: 'ice-rink', name: 'All Seasons Arena', at: [-93.995, 44.005], distanceM: 0, exchange: 'waste-heat', estimatedCapacityW: 300_000, temperature: 30 },
    { id: 'shop', kind: 'supermarket', name: 'Hy-Vee', at: [-93.995, 44.005], distanceM: 0, exchange: 'in-load', estimatedCapacityW: 0, temperature: null },
  ],
  barriers: [],
  openSpaceM2: 36_000,
  skipped: 0,
};

let last: Design = EMPTY_DESIGN;

function Harness({ units = 'si' as UnitSystem }) {
  const [design, setDesign] = useState<Design>(EMPTY_DESIGN);
  last = design;
  return (
    <DesignPanel
      site={SITE}
      design={design}
      result={null}
      running={false}
      placing={null}
      units={units}
      onUpdate={(u) => setDesign((d) => u(d))}
      onPlace={() => {}}
      onSuggest={() => {}}
    />
  );
}

describe('DesignPanel', () => {
  it('offers found waste heat but never a load already counted', () => {
    render(<Harness />);
    expect(screen.getByText(/All Seasons Arena/)).toBeTruthy();
    expect(screen.queryByText(/Hy-Vee/)).toBeNull();
  });

  it('connects a found source once, at its estimate and with its origin', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(last.sources).toHaveLength(1);
    expect(last.sources[0]).toMatchObject({ kind: 'waste-heat', capacityW: 300_000, origin: 'rink' });
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
  });

  it('adds, sizes in display units, and removes', () => {
    render(<Harness units="ip" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Cooling tower' }));
    // 1 MW shown in MMBtu/h, with the unit printed beside the box.
    const input = screen.getByLabelText('Heat rejection') as HTMLInputElement;
    expect(input.value).toBe('3.41');
    expect(screen.getByText('MMBtu/h')).toBeTruthy();
    fireEvent.change(input, { target: { value: '6.8243' } });
    const tower = last.sources[0];
    expect(tower?.kind === 'cooling-tower' && tower.capacityW).toBeCloseTo(2_000_000, -2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(last.sources).toHaveLength(0);
  });

  it('refuses a value out of range rather than storing it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Bore field' }));
    const input = screen.getByLabelText('Boreholes') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-4' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const b = last.sources[0];
    expect(b?.kind === 'bore-field' && b.boreholes).toBe(100);
  });

  it('keeps the loop band in the displayed temperature unit', () => {
    render(<Harness units="ip" />);
    const low = screen.getByLabelText('Loop at least') as HTMLInputElement;
    expect(low.value).toBe('35.6');
    fireEvent.change(low, { target: { value: '41' } });
    expect(last.band.min).toBeCloseTo(5, 6);
  });

  it('lists every retrofit factor the design can hold', () => {
    render(<Harness />);
    const select = screen.getByLabelText(/Envelope retrofit/) as HTMLSelectElement;
    expect(select.value).toBe('1');
    fireEvent.change(select, { target: { value: '0.6' } });
    expect(last.retrofit).toBe(0.6);
  });

  it('asks for a site before anything else', () => {
    render(
      <DesignPanel site={null} design={EMPTY_DESIGN} result={null} running={false} placing={null} units="si" onUpdate={() => {}} onPlace={() => {}} onSuggest={() => {}} />,
    );
    expect(screen.getByText(/Draw a neighbourhood first/)).toBeTruthy();
  });
});
