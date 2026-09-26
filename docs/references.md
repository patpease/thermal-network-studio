# References

The two reports draft 5 of the plan was revised against. Neither is
redistributed here; both are public at the links below. Figures quoted are
checked against the source text, with page numbers.

## EPRI — Mapping Heating and Cooling Loads to Assess the Potential of Thermal Energy Networks

EPRI, Palo Alto, CA: 2024. Technical Update 3002029431.
<https://restservice.epri.com/publicdownload/000000003002029431/0/Product>

What the game takes from it:

- **1R1C gray-box load model** per building (§4, p. 12–13):
  dT/dt = (1/C_eq)·((T₀(t) − T(t))/R_eq + G(t)). Chosen by EPRI as sufficient
  for urban-scale analysis with limited data. → PLAN D22.
- **Synthetic building stock** (Table 2–3, p. 11, 16–17): footprint × floors,
  box geometry at 10 ft floor-to-floor, vintage bands (<1950, 1950–69,
  1970–89, 1990–2009, >2010), U-values and capacity from Building America and
  TABULA, conditioned fraction residential 80–100 % and commercial 40–80 %,
  heating setpoint 60–72 °F, cooling 75–85 °F.
- **Demand overlap coefficient** (p. 14):
  DOC = 2·Σₜ min(Σ_b Q̇_h, Σ_b Q̇_c) / Σₜ Σ_b (Q̇_h + Q̇_c). 0 = no overlap,
  1 = perfect. → D24.
- **Load balance index** (p. 15): LBI = (Q_h − Q_c)/(Q_h + Q_c), −1 cooling
  only, +1 heating only. → D24.
- **Density thresholds** (p. 13–14): typical 50–150 GWh/km²·yr; sinks at
  ≥ 400 billion Btu/mi²·yr, connecting hexes 300–400, clusters under
  800 billion Btu/yr excluded. The report's parenthetical "(100 GWh)" does not
  match: 800 × 10⁹ Btu is 234 GWh.
- **The caveat** (p. 21–22): Framingham with space conditioning only came out
  DOC 1.5 % (range 0.3–3.4 %) and LBI 0.98. The authors note DHW and
  commercial cooling (data centres, ice rinks, supermarkets) could change the
  picture. → hard problem 3.

## Minnesota — Thermal Energy Network Site Suitability Study

Minnesota Department of Commerce, Division of Energy Resources. Prepared by
Buro Happold with Building Decarbonization Coalition, Slipstream and Thermal
Energy Insights. January 15, 2026. Pursuant to Minn. Laws 2024, ch. 126,
art. 6, sec. 51(d).
<https://www.lrl.mn.gov/docs/2026/mandated/260051.pdf>

What the game takes from it:

- **Eight weighted criteria** (Table 3-1, p. 28–30): bore field access 15 %,
  geology 10 %, load characteristics 18 %, environmental constraints 5 %,
  behind-the-meter costs 27 %, opportunistic thermal resources 10 %,
  disadvantaged communities 10 %, expansion 5 %. **Used as an information
  panel only — not a score.** → D25.
- **Load balance rubric** (Table D-1, p. 80): ≤ 80 % heating-dominant = 100,
  80–90 % = 50, > 90 % = 0. → reference marks on LBI, D24.
- **Opportunistic resources** (§D.1.6, p. 76): data centres, ice rinks,
  breweries, manufacturing, wastewater plants, large supermarkets, lakes,
  rivers, aquifers. → D26.
- **Anchor tenants** (§5.2, p. 46–47): city halls, libraries, courthouses,
  schools, hospitals. → D27.
- **Sixteen scored sites** (Table 5-2, p. 47–48), 34.98 to 74.61. → test
  fixtures for computable indicators only, D28.
- **Ten qualitative criteria** (Table 3-2, p. 31–32) — champion, ownership,
  financial capacity and so on. The report says they should only be applied
  by people assessing their own community. Not used.
