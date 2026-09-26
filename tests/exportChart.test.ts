import { describe, expect, it } from 'vitest';

import { composeChartSvg, EXPORT_WIDTH } from '../src/charts/exportChart';
import { BRAND, SCOPE_STATEMENT } from '../src/config/branding';

const compose = (over: Partial<Parameters<typeof composeChartSvg>[0]> = {}) =>
  composeChartSvg({
    chart: '<svg width="1104" height="300"></svg>',
    chartHeight: 300,
    title: 'Loop temperature through the year',
    subtitle: 'Held between 2 °C and 30 °C.',
    legend: [
      { label: 'Loop', colour: '#14202b', key: 'line' },
      { label: 'Outdoor air', colour: '#8794a2', key: 'line' },
    ],
    ink: '#14202b',
    muted: '#5d6b7a',
    date: new Date(2026, 8, 26),
    fonts: {},
    ...over,
  });

describe('an exported chart', () => {
  it('burns in the scope line, the sources, the host and the month', () => {
    const { svg } = compose();
    expect(svg).toContain(SCOPE_STATEMENT.body);
    expect(svg).toContain(SCOPE_STATEMENT.emphasis);
    expect(svg).toContain('OpenStreetMap contributors');
    expect(svg).toContain('ComStock™');
    expect(svg).toContain(BRAND.host);
    expect(svg).toContain('September 2026');
  });

  it('is the desk width, and tall enough for the chart and its footer', () => {
    const { svg, height } = compose();
    expect(svg).toContain(`width="${EXPORT_WIDTH}"`);
    expect(height).toBeGreaterThan(300 + 150);
  });

  it('escapes a title', () => {
    expect(compose({ title: 'A < B & C' }).svg).toContain('A &lt; B &amp; C');
  });
});
