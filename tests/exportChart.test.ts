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
  it('has a one-line footer: the app, the host and the month, and nothing else', () => {
    const { svg } = compose();
    const text = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(text.at(-1)).toBe(`${BRAND.appName} · ${BRAND.host} · September 2026`);
    expect(svg).not.toContain(SCOPE_STATEMENT.body.slice(0, 30));
    expect(svg).not.toContain('OpenStreetMap');
    expect(svg).not.toContain('ComStock');
  });

  it('is the desk width, and the chart takes the height', () => {
    const { svg, height } = compose();
    expect(svg).toContain(`width="${EXPORT_WIDTH}"`);
    expect(height).toBeGreaterThan(300 + 52);
    expect(height).toBeLessThan(300 + 260);
  });

  it('escapes a title', () => {
    expect(compose({ title: 'A < B & C' }).svg).toContain('A &lt; B &amp; C');
  });
});
