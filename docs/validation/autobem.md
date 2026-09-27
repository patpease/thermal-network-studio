# This tool against ORNL AutoBEM: annual heating and cooling demand

Generated 2026-09-27 by `npm run validate:autobem`. Not part of the app or `npm test`; nothing here is tuned to it.

## What is compared

- **AutoBEM**: ORNL, *Model America – Arizona extract (archetypes with simulation results)*, Zenodo 10393563. 527 EnergyPlus archetypes over climate zones 2B, 3B, 4B and 5B, each weighted by the stock floor area it stands for. TMY3 weather.
- **This tool**: its own load model (`src/loads`), calibrated to NLR ComStock/ResStock, run for each archetype at the same floor area and vintage, on the same kind of weather: one TMY3 year per zone from climate.onebuilding.org.
  2B: USA_AZ_Phoenix-Sky.Harbor.Intl.AP.722780_TMY3; 3B: USA_AZ_Kingman.AP.723700_TMY3; 4B: USA_AZ_Prescott.Muni.AP-Love.Field.723723_TMY3; 5B: USA_AZ_Flagstaff.Pulliam.AP.723755_TMY3.
- **Annual, not hourly.** AutoBEM publishes annual end-use energy per building; no public release carries an hourly profile. The hour-by-hour shape remains unchecked.
- **Energy → demand.** AutoBEM reports energy in. Its demand here is gas heating × 0.8 + electric heating × 1 (furnaces, boilers, resistance reheat), and cooling electricity × 3 (packaged DX) or × 5.5 (water-cooled chillers: LargeOffice, Hospital, LargeHotel). The raw energy is in the tables beside it.
- **Gap** is this tool ÷ AutoBEM − 1. Positive: this tool is higher.

## Result

Over all four zones, weighted by stock floor area (720 million m²):

| | This tool, kWh/m²·yr | AutoBEM, kWh/m²·yr | Gap |
|---|---:|---:|---:|
| **Heating demand** | 15.3 | 16.8 | **−9%** |
| **Cooling demand** | 151 | 140 | **+8%** |

**The totals hide offsetting gaps.** Type by type, with nothing allowed to cancel, the stock-weighted absolute gap is **57% for heating** and **48% for cooling**.

**Most of the gap is between the two reference sets, not the tool and its own.** Against NLR — the stock data it is calibrated to — the tool is −1% on heating and +2% on cooling here (TMY3 weather against NLR's 2018). NLR against AutoBEM: −8% heating, +5% cooling.

### By climate zone

| Zone | Stock, million m² | Heating: tool | Heating: AutoBEM | Heating gap | Heating absolute gap | Cooling: tool | Cooling: AutoBEM | Cooling gap | Cooling absolute gap |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2B | 577 | 6.4 | 8.4 | −24% | 80% | 172 | 157 | +10% | 48% |
| 3B | 59.1 | 23.7 | 21.6 | +10% | 52% | 88.3 | 90.8 | −3% | 52% |
| 4B | 48.2 | 63.7 | 54.3 | +17% | 59% | 59.7 | 76.8 | −22% | 38% |
| 5B | 35.8 | 79.3 | 93.0 | −15% | 25% | 31.5 | 33.4 | −5% | 59% |

### Largest gaps

Types holding at least 0.5% of the stock and 5 kWh/m²·yr of AutoBEM demand:

- 2B Outpatient (outpatient), heating: tool 5.3, AutoBEM 97.9 kWh/m²·yr, −95%.
- 2B LargeOffice (office-large), heating: tool 4.2, AutoBEM 33.6 kWh/m²·yr, −87%.
- 2B MediumOffice (office-large), heating: tool 4.2, AutoBEM 30.3 kWh/m²·yr, −86%.
- 2B MidriseApartment (large-multifamily), cooling: tool 86.9, AutoBEM 346 kWh/m²·yr, −75%.
- 2B RetailStandalone (retail-standalone), heating: tool 5.1, AutoBEM 19.6 kWh/m²·yr, −74%.
- 2B MidriseApartment (large-multifamily), heating: tool 3.5, AutoBEM 11.7 kWh/m²·yr, −70%.
- 2B PrimarySchool (school-primary), heating: tool 4.6, AutoBEM 14.7 kWh/m²·yr, −69%.
- 2B LargeHotel (hotel), cooling: tool 211, AutoBEM 668 kWh/m²·yr, −68%.

## By zone and building type

kWh/m²·yr. "NLR" is the stock intensity this tool is calibrated to for that archetype and zone (on the 2018 calibration weather, not TMY3). AutoBEM energy is what it reports, before conversion.

| Zone | AutoBEM type | Tool archetype | Stock, 1000 m² | Heat: tool | Heat: AutoBEM | Heat gap | Heat: NLR | Cool: tool | Cool: AutoBEM | Cool gap | Cool: NLR | AutoBEM heating energy | AutoBEM cooling electricity |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2B | IECC | single-family | 358,405 | 6.6 | 3.3 | +100% | 7.5 | 143 | 99.1 | +44% | 138 | 4.1 | 33.0 |
| 2B | Warehouse | warehouse | 42,246 | 1.8 | 0.0 | — | 1.6 | 79.9 | 0.0 | — | 76.4 | 0.0 | 0.0 |
| 2B | RetailStandalone | retail-standalone | 27,341 | 5.1 | 19.6 | −74% | 5.3 | 281 | 195 | +44% | 272 | 24.5 | 64.9 |
| 2B | SmallOffice | office-small | 26,280 | 4.6 | 7.3 | −38% | 4.2 | 210 | 145 | +45% | 202 | 9.1 | 48.2 |
| 2B | SecondarySchool | school-secondary | 20,978 | 7.1 | 21.8 | −68% | 6.8 | 246 | 223 | +10% | 236 | 27.2 | 74.5 |
| 2B | LargeHotel | hotel | 19,106 | 12.4 | 18.5 | −33% | 11.7 | 211 | 668 | −68% | 199 | 23.2 | 121 |
| 2B | PrimarySchool | school-primary | 15,221 | 4.6 | 14.7 | −69% | 4.5 | 242 | 238 | +2% | 233 | 18.3 | 79.2 |
| 2B | RetailStripmall | retail-stripmall | 13,834 | 10.6 | 23.7 | −55% | 12.6 | 331 | 215 | +54% | 322 | 29.6 | 71.7 |
| 2B | Hospital | hospital | 10,485 | 12.9 | 10.0 | +28% | 12.4 | 394 | 348 | +13% | 375 | 12.5 | 63.2 |
| 2B | MediumOffice | office-large | 10,269 | 4.2 | 30.3 | −86% | 4.7 | 232 | 339 | −32% | 224 | 31.5 | 113 |
| 2B | Outpatient | outpatient | 8,819 | 5.3 | 97.9 | −95% | 4.5 | 268 | 585 | −54% | 256 | 122 | 195 |
| 2B | HighriseApartment | large-multifamily | 8,348 | 3.7 | 0.9 | +298% | 3.1 | 87.2 | 211 | −59% | 82.4 | 1.0 | 70.4 |
| 2B | LargeOffice | office-large | 5,894 | 4.2 | 33.6 | −87% | 4.7 | 232 | 606 | −62% | 224 | 42.0 | 110 |
| 2B | MidriseApartment | large-multifamily | 4,556 | 3.5 | 11.7 | −70% | 3.1 | 86.9 | 346 | −75% | 82.4 | 14.6 | 115 |
| 2B | FullServiceRestaurant | restaurant | 2,260 | 12.0 | 9.8 | +22% | 12.0 | 564 | 462 | +22% | 542 | 12.2 | 154 |
| 2B | QuickServiceRestaurant | restaurant | 1,832 | 11.9 | 9.5 | +25% | 12.0 | 563 | 494 | +14% | 542 | 11.9 | 165 |
| 2B | SmallHotel | hotel | 1,319 | 12.4 | 1.8 | +592% | 11.7 | 211 | 425 | −50% | 199 | 1.8 | 142 |
| 3B | IECC | single-family | 40,959 | 22.1 | 14.0 | +57% | 21.5 | 71.1 | 48.2 | +47% | 67.8 | 17.5 | 16.1 |
| 3B | Warehouse | warehouse | 3,464 | 5.0 | 0.1 | — | 4.3 | 8.4 | 0.0 | — | 7.4 | 0.1 | 0.0 |
| 3B | MidriseApartment | large-multifamily | 2,397 | 6.7 | 72.7 | −91% | 5.1 | 46.9 | 325 | −86% | 44.5 | 90.9 | 108 |
| 3B | SmallOffice | office-small | 1,953 | 39.7 | 21.9 | +81% | 34.9 | 147 | 145 | +1% | 142 | 27.3 | 48.2 |
| 3B | RetailStandalone | retail-standalone | 1,891 | 42.2 | 57.0 | −26% | 38.0 | 213 | 164 | +30% | 209 | 71.3 | 54.6 |
| 3B | SecondarySchool | school-secondary | 1,601 | 38.5 | 52.2 | −26% | 34.0 | 174 | 158 | +11% | 166 | 65.3 | 52.5 |
| 3B | MediumOffice | office-large | 1,421 | 72.5 | 74.8 | −3% | 70.0 | 181 | 240 | −24% | 174 | 77.4 | 80.0 |
| 3B | HighriseApartment | large-multifamily | 1,347 | 7.0 | 3.7 | +90% | 5.1 | 46.9 | 226 | −79% | 44.5 | 4.2 | 75.3 |
| 3B | RetailStripmall | retail-stripmall | 941 | 32.0 | 41.8 | −24% | 31.8 | 240 | 125 | +91% | 238 | 52.3 | 41.8 |
| 3B | PrimarySchool | school-primary | 913 | 36.8 | 39.6 | −7% | 32.0 | 184 | 155 | +19% | 176 | 49.5 | 51.5 |
| 3B | LargeHotel | hotel | 594 | 27.8 | 21.0 | +32% | 22.9 | 112 | 457 | −75% | 106 | 26.3 | 83.1 |
| 3B | Outpatient | outpatient | 525 | 30.8 | 93.8 | −67% | 25.1 | 156 | 349 | −55% | 148 | 117 | 116 |
| 3B | SmallHotel | hotel | 313 | 27.8 | 16.8 | +66% | 22.9 | 112 | 342 | −67% | 106 | 16.8 | 114 |
| 3B | QuickServiceRestaurant | restaurant | 238 | 27.5 | 31.8 | −14% | 25.3 | 515 | 296 | +74% | 515 | 39.8 | 98.8 |
| 3B | LargeOffice | office-large | 211 | 70.8 | 93.4 | −24% | 70.0 | 181 | 597 | −70% | 174 | 117 | 109 |
| 3B | FullServiceRestaurant | restaurant | 202 | 28.5 | 32.3 | −12% | 25.3 | 515 | 259 | +99% | 515 | 40.3 | 86.3 |
| 3B | Hospital | hospital | 181 | 15.8 | 21.1 | −25% | 15.5 | 224 | 308 | −27% | 216 | 26.4 | 55.9 |
| 4B | IECC | single-family | 30,944 | 71.9 | 43.6 | +65% | 72.0 | 45.2 | 50.2 | −10% | 59.6 | 54.5 | 16.7 |
| 4B | MediumOffice | office-large | 3,450 | 60.5 | 95.1 | −36% | 62.9 | 103 | 117 | −12% | 124 | 102 | 39.1 |
| 4B | MidriseApartment | large-multifamily | 2,838 | 22.2 | 123 | −82% | 22.1 | 34.3 | 156 | −78% | 45.0 | 153 | 51.9 |
| 4B | SmallHotel | hotel | 2,608 | 47.3 | 43.6 | +8% | 44.5 | 79.6 | 154 | −48% | 103 | 43.6 | 51.3 |
| 4B | SmallOffice | office-small | 1,571 | 56.4 | 33.6 | +68% | 52.1 | 79.7 | 50.9 | +57% | 98.0 | 41.9 | 17.0 |
| 4B | RetailStandalone | retail-standalone | 1,400 | 52.5 | 75.2 | −30% | 47.4 | 116 | 49.6 | +135% | 137 | 94.0 | 16.5 |
| 4B | SecondarySchool | school-secondary | 1,142 | 84.2 | 50.9 | +65% | 84.9 | 110 | 69.5 | +58% | 136 | 63.6 | 23.2 |
| 4B | Warehouse | warehouse | 916 | 26.1 | 1.1 | +2288% | 24.7 | 27.4 | 0.0 | — | 35.9 | 1.4 | 0.0 |
| 4B | HighriseApartment | large-multifamily | 717 | 22.0 | 17.3 | +27% | 22.1 | 34.4 | 135 | −75% | 45.0 | 20.3 | 44.9 |
| 4B | LargeOffice | office-large | 639 | 59.7 | 156 | −62% | 62.9 | 103 | 359 | −71% | 124 | 195 | 65.3 |
| 4B | PrimarySchool | school-primary | 412 | 66.7 | 84.1 | −21% | 64.9 | 107 | 94.6 | +13% | 131 | 105 | 31.5 |
| 4B | Outpatient | outpatient | 375 | 28.9 | 127 | −77% | 29.6 | 125 | 241 | −48% | 149 | 159 | 80.4 |
| 4B | LargeHotel | hotel | 370 | 47.2 | 24.4 | +93% | 44.5 | 79.6 | 295 | −73% | 103 | 30.5 | 53.6 |
| 4B | RetailStripmall | retail-stripmall | 282 | 74.5 | 88.1 | −15% | 72.0 | 145 | 61.0 | +138% | 170 | 110 | 20.3 |
| 4B | FullServiceRestaurant | restaurant | 198 | 83.5 | 77.8 | +7% | 72.9 | 272 | 138 | +98% | 315 | 97.3 | 45.9 |
| 4B | QuickServiceRestaurant | restaurant | 189 | 81.6 | 79.9 | +2% | 72.9 | 273 | 112 | +144% | 315 | 99.9 | 37.3 |
| 4B | Hospital | hospital | 157 | 42.4 | 16.0 | +164% | 37.0 | 152 | 272 | −44% | 185 | 20.0 | 49.5 |
| 5B | IECC | single-family | 22,661 | 87.3 | 83.2 | +5% | 85.6 | 19.7 | 17.0 | +15% | 33.9 | 104 | 5.7 |
| 5B | Warehouse | warehouse | 1,941 | 30.2 | 2.7 | +1026% | 28.0 | 14.9 | 0.0 | — | 24.9 | 3.4 | 0.0 |
| 5B | HighriseApartment | large-multifamily | 1,625 | 27.7 | 39.7 | −30% | 29.5 | 14.9 | 103 | −86% | 24.2 | 46.7 | 34.4 |
| 5B | SecondarySchool | school-secondary | 1,543 | 112 | 111 | +1% | 104 | 58.6 | 31.7 | +85% | 97.2 | 139 | 10.6 |
| 5B | RetailStandalone | retail-standalone | 1,483 | 84.3 | 102 | −17% | 74.8 | 71.3 | 18.1 | +293% | 100 | 128 | 6.0 |
| 5B | SmallOffice | office-small | 1,211 | 71.5 | 65.0 | +10% | 63.6 | 50.0 | 23.4 | +113% | 74.7 | 80.8 | 7.8 |
| 5B | MidriseApartment | large-multifamily | 1,060 | 29.3 | 253 | −88% | 29.5 | 14.4 | 61.3 | −77% | 24.2 | 317 | 20.4 |
| 5B | MediumOffice | office-large | 880 | 95.8 | 194 | −51% | 93.3 | 71.0 | 63.3 | +12% | 105 | 210 | 21.1 |
| 5B | PrimarySchool | school-primary | 659 | 80.2 | 74.7 | +7% | 74.5 | 56.5 | 30.1 | +87% | 88.8 | 93.4 | 10.0 |
| 5B | LargeOffice | office-large | 508 | 93.6 | 485 | −81% | 93.3 | 71.5 | 310 | −77% | 105 | 607 | 56.3 |
| 5B | Outpatient | outpatient | 503 | 57.9 | 154 | −62% | 53.2 | 87.5 | 100 | −13% | 127 | 193 | 33.4 |
| 5B | LargeHotel | hotel | 480 | 57.2 | 67.6 | −15% | 54.4 | 75.2 | 184 | −59% | 104 | 84.4 | 33.4 |
| 5B | RetailStripmall | retail-stripmall | 391 | 82.1 | 109 | −25% | 78.0 | 94.5 | 21.6 | +338% | 124 | 137 | 7.2 |
| 5B | Hospital | hospital | 364 | 62.2 | 30.9 | +101% | 56.7 | 120 | 162 | −26% | 164 | 38.7 | 29.5 |
| 5B | SmallHotel | hotel | 286 | 57.8 | 119 | −52% | 54.4 | 75.0 | 73.4 | +2% | 104 | 119 | 24.5 |
| 5B | FullServiceRestaurant | restaurant | 125 | 139 | 181 | −23% | 119 | 174 | 48.0 | +262% | 240 | 226 | 16.0 |
| 5B | QuickServiceRestaurant | restaurant | 112 | 141 | 170 | −17% | 119 | 173 | 57.4 | +202% | 240 | 212 | 19.1 |

## Reading it

- A gap is a difference between two models, not an error in either. AutoBEM models each building from its footprint and height with DOE prototype systems; this tool matches the NLR stock average for its type and zone.
- Where the tool agrees with NLR but not AutoBEM, the two reference sets disagree. Where it disagrees with both, look at the tool.
- The conversion from energy to demand moves every AutoBEM figure by the efficiency assumed. Heating is mostly gas at 0.80; a 0.90 boiler would raise AutoBEM heating demand 12%.
- Record the gap. Do not tune the tool to it.

Data: ORNL AutoBEM Model America, Arizona extract (Zenodo 10393563). Weather: climate.onebuilding.org TMY3. Loads calibrated to NLR ComStock™ and ResStock™.
