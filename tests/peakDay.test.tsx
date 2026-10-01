// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { PeakDay } from '../src/charts/PeakDay';
import { peakCheck } from '../src/engine/ruleOfThumb';

afterEach(cleanup);

const check = peakCheck({ archetype: 'office-small', zone: '5A' }, calibrationWeather('5A'));

describe('the peak day charts', () => {
  it('draw 24 columns, the peak hour solid and the rest a wash', () => {
    const { container } = render(<PeakDay kind="heating" day={check.heatingDay!} building="Small office" units="ip" />);
    const columns = [...container.querySelectorAll('.chart__plot path.fill--heat')];
    expect(columns).toHaveLength(24);
    expect(columns.filter((c) => !c.classList.contains('wash'))).toHaveLength(1);
    expect(screen.getAllByRole('row')).toHaveLength(25);
  });

  it('draw cooling as LOAD (taller is more), with the rule in the unit it is written in', () => {
    const { container } = render(<PeakDay kind="cooling" day={check.coolingDay!} building="Small office" units="ip" />);
    expect(container.querySelector('.chart__plot svg')!.textContent).toContain('Btu/h·ft²');
    expect(container.querySelector('.chart__plot svg')!.textContent).toContain('400 ft²/ton');
    expect(container.querySelectorAll('.chart__plot path.fill--cool')).toHaveLength(24);
  });

  it('print SI when SI is chosen', () => {
    const { container } = render(<PeakDay kind="heating" day={check.heatingDay!} building="Small office" units="si" />);
    const text = container.querySelector('.chart__plot svg')!.textContent!;
    expect(text).toContain('W/m²');
    expect(text).not.toContain('Btu');
  });
});
