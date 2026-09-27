/**
 * The AutoBEM check's pure half (scripts/validate/autobem-lib.ts). The check
 * itself downloads data and runs only on `npm run validate:autobem`; this
 * keeps its parsing, units and arithmetic honest in the ordinary suite.
 */
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import {
  autobemDemand,
  autobemRows,
  compare,
  EFFICIENCY,
  gap,
  parseCsv,
  parseEpw,
  reportMarkdown,
  STATIONS,
  summarise,
  TYPE_MAP,
  unzipOne,
  vintageOf,
} from '../scripts/validate/autobem-lib';
import { ARCHETYPES } from '../src/loads/archetypes';

const HEAD = 'index,CZ,BuildingType,Area,Standard,Area_multiplier, Heating_NaturalGas[kBTU], Heating_Electricity[kBTU], Cooling_Electricity[kBTU]';

describe('reading AutoBEM', () => {
  it('parses quoted fields and trims the padded headers AutoBEM writes', () => {
    const rows = parseCsv('a, b\n"x, y",2\n');
    expect(rows).toEqual([{ a: 'x, y', b: '2' }]);
  });

  it('converts ft² and kBtu to m² and kWh, and weights by the stock it stands for', () => {
    const [r] = autobemRows('2B', `${HEAD}\n1,2B,SmallOffice,1000,90.1-2013,50,100,10,300\n`);
    expect(r!.area).toBeCloseTo(92.903, 3);
    expect(r!.stockArea).toBeCloseTo(92.903 * 50, 1);
    expect(r!.heatingGas).toBeCloseTo(29.307, 3);
    expect(r!.coolingElectric).toBeCloseTo(87.921, 3);
  });

  it('maps every AutoBEM type to a real archetype, and each standard to a vintage', () => {
    const ids = new Set(ARCHETYPES.map((a) => a.id));
    for (const a of Object.values(TYPE_MAP)) expect(ids.has(a)).toBe(true);
    expect(vintageOf('DOE-Ref-Pre-1980')).toBe('1950-1979');
    expect(vintageOf('DOE-Ref-1980-2004')).toBe('1980-1999');
    expect(vintageOf('90.1-2019')).toBe('2000+');
    expect(vintageOf('something else')).toBeUndefined();
  });

  it('turns energy in into demand at the stated efficiencies', () => {
    const base = { zone: '2B' as const, standard: '', area: 1, stockArea: 1, heatingGas: 100, heatingElectric: 10, coolingElectric: 20 };
    expect(autobemDemand({ ...base, type: 'SmallOffice' })).toEqual({ heating: 100 * EFFICIENCY.gasHeating + 10, cooling: 20 * EFFICIENCY.coolingDx });
    expect(autobemDemand({ ...base, type: 'Hospital' }).cooling).toBe(20 * EFFICIENCY.coolingChiller);
  });
});

describe('reading the weather', () => {
  const epw = [
    'LOCATION,Phoenix-Sky Harbor Intl AP,AZ,USA,TMY3,722780,33.45,-111.98,-7.0,337.0',
    ...Array.from({ length: 5 }, () => 'X'),
    'DATA PERIODS,1,1,Data,Sunday, 1/ 1,12/31',
    'X',
    ...Array.from({ length: 8760 }, (_, h) => `1999,1,1,${(h % 24) + 1},0,x,${(h % 24) - 2},0,40,97000,0,0,0,${h % 24 === 12 ? 800 : -5}`),
  ].join('\n');

  it('takes dry bulb, humidity and GHI, and the first weekday from DATA PERIODS', () => {
    const w = parseEpw(epw);
    expect(w.location).toBe('Phoenix-Sky Harbor Intl AP, AZ, USA');
    expect(w.temperature).toHaveLength(8760);
    expect(w.temperature[3]).toBe(1);
    expect(w.relativeHumidity![0]).toBe(40);
    expect(w.ghi[12]).toBe(800);
    expect(w.ghi[0]).toBe(0);
    expect(w.firstWeekday).toBe(6);
  });

  it('refuses a year that is not 8760 hours', () => {
    expect(() => parseEpw(epw.split('\n').slice(0, 100).join('\n'))).toThrow(/8760/);
  });

  it('reads the EPW out of a deflated zip', async () => {
    const name = new TextEncoder().encode('station.epw');
    const body = new TextEncoder().encode('hello weather');
    const data = deflateRawSync(body);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, 0, true);
    central.set(name, 46);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(16, local.length + data.length, true);
    const zip = new Uint8Array([...local, ...data, ...central, ...end]);
    expect(new TextDecoder().decode(await unzipOne(zip, '.epw'))).toBe('hello weather');
  });
});

describe('comparing', () => {
  const rows = autobemRows('2B', `${HEAD}\n1,2B,SmallOffice,1000,90.1-2013,1,100,0,300\n2,2B,SmallOffice,1000,DOE-Ref-Pre-1980,3,200,0,300\n3,2B,Mystery,1000,,1,1,1,1\n`);

  it('weights each archetype by the stock it stands for, and skips types it cannot map', () => {
    const c = compare(rows, () => ({ heating: 0, cooling: 0 }), () => null);
    expect(c).toHaveLength(1);
    const perM2 = (kbtu: number) => (kbtu * 0.29307107 * EFFICIENCY.gasHeating) / (1000 * 0.09290304);
    // One weighted 1, the other 3: (100 + 3 × 200) / 4.
    expect(c[0]!.autobem.heating).toBeCloseTo(perM2((100 + 3 * 200) / 4), 6);
  });

  it('a total can agree while every type disagrees: the absolute gap says so', () => {
    const two = autobemRows('2B', `${HEAD}\n1,2B,SmallOffice,1000,90.1-2013,1,100,0,100\n2,2B,Warehouse,1000,90.1-2013,1,100,0,100\n`);
    const c = compare(two, (r) => (r.type === 'SmallOffice' ? { heating: 2 * autobemDemand(r).heating, cooling: 0 } : { heating: 0, cooling: 0 }), () => null);
    const all = summarise(c).find((s) => s.zone === 'all')!;
    expect(all.tool.heating).toBeCloseTo(all.autobem.heating, 9);
    expect(all.absoluteGap.heating).toBeCloseTo(1, 9);
  });

  it('prints the gap as tool ÷ AutoBEM − 1, and nothing against a near-zero reference', () => {
    expect(gap(110, 100)).toBe('+10%');
    expect(gap(76, 100)).toBe('−24%');
    expect(gap(80, 0)).toBe('—');
  });

  it('the report states the source, the conversion and that it is not hourly', () => {
    const c = compare(rows, () => ({ heating: 1, cooling: 1 }), () => ({ heating: 1, cooling: 1 }));
    const md = reportMarkdown({ date: '2026-09-27', rows: c, summary: summarise(c.length ? c : c), stations: STATIONS });
    expect(md).toContain('Zenodo 10393563');
    expect(md).toContain(`× ${EFFICIENCY.gasHeating}`);
    expect(md).toMatch(/Annual, not hourly/);
    expect(md).toMatch(/Do not tune the tool to it/);
  });
});
