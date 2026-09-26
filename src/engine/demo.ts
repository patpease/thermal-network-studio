/**
 * The demo neighbourhood: what the engine runs before there is a map.
 *
 * A made-up mixed-use quarter in climate zone 5A on the PJM West grid (Cook
 * County, IL maps there in Cambium's county table): streets of homes, a few
 * apartment blocks, an office, a school, a supermarket, restaurants and a
 * hotel, with a data centre nearby. Invented, and labelled as such wherever it
 * is shown — it exists to exercise every part of the engine at once.
 */
import type { NetworkDesign } from './network.ts';
import type { Neighbourhood, NeighbourhoodBuilding } from './demand.ts';

function many(prefix: string, count: number, b: Omit<NeighbourhoodBuilding, 'id'>): NeighbourhoodBuilding[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i + 1}`, ...b }));
}

export const DEMO_NEIGHBOURHOOD: Neighbourhood = {
  zone: '5A',
  region: 'PJM_West',
  landArea: 350_000,
  buildings: [
    ...many('house', 60, { archetype: 'single-family', floorArea: 170, vintage: '1950-1979' }),
    ...many('house-new', 20, { archetype: 'single-family', floorArea: 210, vintage: '2000+' }),
    ...many('flats', 10, { archetype: 'small-multifamily', floorArea: 420 }),
    ...many('apartments', 3, { archetype: 'large-multifamily', floorArea: 7_000 }),
    { id: 'office', archetype: 'office-large', floorArea: 14_000 },
    { id: 'school', archetype: 'school-primary', floorArea: 6_000 },
    { id: 'supermarket', archetype: 'supermarket', floorArea: 4_000 },
    ...many('restaurant', 3, { archetype: 'restaurant', floorArea: 450 }),
    { id: 'hotel', archetype: 'hotel', floorArea: 9_000 },
  ],
};

/**
 * A starting design: a bore field, a data centre's heat, a tower for summer and
 * an air-source heat pump for the coldest weeks. Sized so almost every hour is
 * met (peak demand is about 12 MW heating, 7 MW cooling) — and deliberately
 * NOT balanced: this quarter already rejects more heat than it draws, the data
 * centre adds more, and the 25-year drift shows the ground warming past the
 * fluid limit. That is the first thing a player should find.
 */
export const DEMO_DESIGN: NetworkDesign = {
  sources: [
    { kind: 'waste-heat', id: 'data-centre', label: 'Data centre', capacityW: 400_000, temperature: 30 },
    { kind: 'bore-field', id: 'bores', spec: { boreholes: 600 } },
    { kind: 'cooling-tower', id: 'tower', capacityW: 4_000_000 },
    { kind: 'air-source', id: 'ashp', capacityW: 4_000_000 },
  ],
};
