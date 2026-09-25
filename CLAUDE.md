# Thermal Network Studio

Pick a neighbourhood on a real map, see its hourly heating and cooling demand,
build an ambient-loop thermal energy network against it, and score the result
on efficiency and carbon against the buildings as they are today. For
engineers, planners, architects, utilities, campus owners and citizens.
Everything runs in the browser: no account, no upload, nothing kept. MIT.

It is a **Cloudflare Worker, not a Pages site.** They are different products and
the difference has broken a sibling's deploy: a `functions/` directory is
ignored here. The Worker entry point is `worker/index.ts`; everything it decides
is in `worker/handler.ts`, where the suite can reach it.

**Read this file first.** `PLAN.md` holds the decisions (D1–D21) and the phase
list — a record of *why*. `BACKLOG.md` is what is done and what is next.

## The framing is load-bearing

The tool **conveys an idea; it does not predict a saving** — ZEEL's rule, for
ZEEL's reason. The scope statement is permanent page furniture, never a
dismissible modal, and from phase 07 it is burned into every export. Never state
a ± tolerance. A score is not a saving.

## Layout

```
src/config/   branding and copy. Every sentence the tool says is in copy.ts.
src/units/    IP and SI. Converted at the boundary, nowhere else.
src/ui/       shell, tokens, theme, the mark.
worker/       the Worker: an adapter (index.ts) over handler.ts.
tests/        vitest. Node by default; a DOM test opts in with a docblock.
```

Planned, per PLAN.md: `scripts/eulp/` (the load-shape generator, phase 01),
`src/engine/` (pure functions and a Web Worker, phase 02), `src/map/` and the
Overpass relay (phase 03).

## Rules

1. **Canonical SI, converted at the display edge.** W, kWh, °C, K for
   differences, m². Default display is IP (US-first). A temperature and a
   temperature *difference* are different quantities in `units.ts` — 10 K is
   18 °F of difference, not 50 °F.
2. **Anything printed with a unit reads it from `LABELS[units]`.** A
   temperature literal in JSX is a bug waiting to be found.
3. **Heat is orange, cooling is blue**, in both themes. Physical convention,
   not styling; a test pins the hues. `--heat`/`--cool` are for fills and
   strokes; text takes `--heat-ink`/`--cool-ink`. The accent is never a series
   colour.
4. **The palette is declared three times** in `src/ui/tokens.css`: light, dark
   inside a guarded media query, dark on a bare `[data-theme='dark']`. Add a
   colour to all three; `tests/tokens.test.ts` checks the dark blocks match.
5. **No `unsafe-inline` in the CSP.** The only third-party origins are
   OpenFreeMap (tiles, D17) and the Cloudflare analytics beacon, and
   `tests/worker.test.ts` fails if a fourth appears.
6. **Generated data is never edited by hand** (from phase 01): edit the source,
   re-run the generator, commit both.

## Verifying a change

```bash
npm run typecheck && npm test && npm run build
npm run preview:worker   # the ONLY place the CSP and the routes are true
```

**A green suite is not evidence the browser works, and a green build is not
evidence the deploy works.** Both lessons cost a sibling a shipped failure. For
anything user-visible, open it. `npm run dev` serves on 5186, `npm run preview`
on 4186, `preview:worker` on 8790 — the siblings hold 5183–5185, 4183–4185 and
8787–8789, and every port is `strictPort` so a clash fails loudly.

**Measure performance on the production build, never the dev one.** The
simulation budget is a sub-second re-run of a full 8760 (D6); measure it on
`npm run preview`.

## Things that look right and are not (inherited)

- **`<img src>` for the product mark.** An image cannot see a theme pinned with
  the toggle. The mark is inlined in `ui/Mark.tsx` and every colour is a token.
- **Theme buttons tracking `preference`.** With nothing stored both sit unlit
  and the control looks broken on a first visit. They track `resolved`.
- **`color-scheme: light dark` alone.** A dark-OS viewer who pins light gets
  dark system widgets. `styles.css` sets the scheme from `data-theme`.
- **A cache rule that matches a PATH applied to a FAILURE.** `_headers` stamps
  `/assets/*` immutable, and that matched the 404 too — a blank page for a year.
  The Worker sets `no-store` on any non-2xx.
- **`not_found_handling: "single-page-application"`.** A missing asset answers
  200 with the HTML shell. It is `"none"` here.
- **A box that measures 0 is desktop, not phone** (from phase 03). jsdom reports
  every width as 0, and an export's off-screen copy relies on measuring wide.
- **An export must never be the phone layout** (from phase 07).
- **`pkill -f "wrangler dev"` from a shell whose own command line contains
  that string** kills the shell. Stop the dev server by PID.

## The map (from phase 03)

MapLibre GL paints a canvas from a style object, so it cannot read CSS custom
properties. The map style must be rebuilt from `theme.resolved` — never from
`preference` — or the basemap stays light under a dark theme. OSM data is ODbL:
the attribution string is in `copy.ts` and goes on the map and on every export.
