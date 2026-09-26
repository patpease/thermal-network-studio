/**
 * Cambium's levelization, reproduced from the LRMER workbook's Lookups tab.
 * Its own module so the tests can pin it without running the extractor.
 */
export const LEVELIZATION = { startYear: 2025, years: 20, discountRate: 0.03, scenario: 'Mid-case' };
export const PUBLISHED_YEARS = [2025, 2030, 2035, 2040, 2045, 2050];
// Mid-case, CO₂ from direct combustion, 2025…2050: columns R…W of the data.
export const MIDCASE_CO2_COMBUSTION = [17, 18, 19, 20, 21, 22];

/** The weight each published year carries in the levelized value. */
export function levelizationWeights({ startYear, years, discountRate } = LEVELIZATION) {
  const weights = PUBLISHED_YEARS.map(() => 0);
  for (let y = startYear; y < startYear + years; y++) {
    const discount = 1 / (1 + discountRate) ** (y - startYear);
    // Beyond 2050 the workbook holds the 2050 value.
    const clamped = Math.min(y, 2050);
    const k = Math.min(Math.floor((clamped - 2025) / 5), PUBLISHED_YEARS.length - 2);
    const fraction = (clamped - PUBLISHED_YEARS[k]) / 5;
    weights[k] += discount * (1 - fraction);
    weights[k + 1] += discount * fraction;
  }
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / total);
}

