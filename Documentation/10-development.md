# 10 — Development & Build

## Prerequisites

- Node.js (works with the versions Vite 8 / React 19 require; `@types/node` is on
  v24).
- npm (a `package-lock.json` is committed).

## Install & run

```bash
npm install
npm run dev        # Vite dev server with HMR
```

## Scripts (`package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` | Dev server with hot reload |
| `build` | `vite build` | Production bundle → `dist/` |
| `preview` | `vite preview` | Serve the built `dist/` locally |
| `lint` | `eslint .` | Lint the project |
| `typecheck` | `tsc -p tsconfig.app.json --noEmit` | Type-check `src` (incl. tests) without emitting |
| `test` | `vitest` | Run tests in watch mode |
| `test:run` | `vitest run` | Run tests once (CI) |
| `coverage` | `vitest run --coverage` | Run tests with a v8 coverage report (enforces thresholds) |
| `check` | `lint && typecheck && test:run` | One-shot quality gate (run this before sharing a build) |
| `build:app` | `bash scripts/build-app.sh` | Build + package a macOS `.app` |

## Build configuration

- **`vite.config.ts`** — React + Tailwind v4 plugins; `base: './'` (relative asset
  paths so `dist/` works when served from any directory, including the macOS app
  bundle); `@` alias → `src`.
- **`tsconfig.app.json`** — bundler module resolution, `@/*` path, strict-ish
  flags (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`),
  `vitest/globals` types so tests don't need explicit imports.
- **`components.json`** — shadcn component generator config.
- **`eslint.config.js`** — flat config with `typescript-eslint`,
  `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.

## Testing

Vitest + jsdom (config in `vitest.config.ts`). Tests live next to the code they
cover. Test files import `{ describe, it, expect }` from `vitest` explicitly
(ESLint isn't configured with Vitest globals, so the explicit imports keep lint
green even though `globals: true` is set for the runner).

```
src/lib/__tests__/
  round-robin.test.ts                    # schedule generation, byes, caps, evade
  bracket.test.ts                        # bracket shapes + resolveMatchWinner
  standings.test.ts                      # ranking + tiebreakers
  schedule-export.test.ts                # TSV/sheet rows + sanitizeForSheet injection guard
  colors.test.ts                         # name→hex, contrast
  id.test.ts                             # id uniqueness
  edge-cases.test.ts                     # cross-cutting regression probes
  scheduling-edge.regression.test.ts     # lib-level cross-module probes (standings + RR + bracket)
  store-regenerate.integration.test.ts   # store-level regenerate / drop integration flows
src/stores/__tests__/
  tournament.store.test.ts               # store actions/selectors + finals generation (largest suite)
```

The `lib/` layer is pure and the prime target for unit tests; the store suite
covers action/selector behavior. Run:

```bash
npm run test       # watch
npm run test:run   # once
npm run coverage   # once, with a coverage report
npm run check      # lint + typecheck + tests (the pre-share gate)
```

> The files now named `scheduling-edge.regression.test.ts` and
> `store-regenerate.integration.test.ts` were previously the throwaway-named
> `scratch-probe*.test.ts`. They are **load-bearing regression/integration
> suites**, not exploratory scratch — they cover constraint interactions
> (evade + caps + preserved results, regenerate/drop flows) that the per-module
> unit tests don't fully exercise. Keep them.

### Coverage

`npm run coverage` uses the `@vitest/coverage-v8` provider and **enforces
thresholds** (build fails below them). Coverage is scoped to the logic layer
(`src/lib/**`, `src/stores/**`) — UI components have no tests yet and are out of
scope, so including them would make the number meaningless. Three logic files are
also excluded for now, tracked for a follow-up: `google-sheet-push.ts` and
`use-auto-push.ts` (need `fetch`/timer mocking) and `utils.ts` (a thin
clsx/tailwind-merge wrapper). Within that scope the suite sits at ~91% statements
/ ~94% lines (lib alone ~99%); thresholds are set just below the baseline so the
gate catches regressions without being immediately red — bump them as coverage
grows. The HTML report lands in `coverage/` (git-ignored).

## Packaging the macOS app (`scripts/build-app.sh`)

`npm run build:app` produces a double-clickable **`VB Tournament.app`** (and a
`VB Tournament.zip` for AirDrop). The script:

1. Runs `npm run build` → `dist/`.
2. Creates a `.app` bundle, copying `dist/` into `Contents/Resources/app/`.
3. Writes an `Info.plist` and a `launch` shell script as the bundle executable.
4. Zips the `.app` (preserving permissions) for sharing.

At launch, the bundled `launch` script:

- kills any previous server it started,
- picks a free port (via a one-line Python `socket` bind),
- serves the static app with `python3 -m http.server` bound to `127.0.0.1`
  (detached via `nohup`),
- opens the URL in the default browser, then exits.

> **Runtime dependency:** the bundled app relies on **`python3`** being present on
> the target Mac (it ships with the Xcode command line tools / many macOS setups,
> but isn't guaranteed). It serves over HTTP on localhost because the app uses
> `localStorage` and `fetch`, which browsers restrict under `file://`.

### Why a local HTTP server instead of `file://`?

Opening `index.html` directly would break ES module loading and storage/fetch
origin rules. Serving from `127.0.0.1` gives the app a proper web origin, so
`localStorage` persistence and the Google Sheet `fetch` both work.

## Data & state notes for contributors

- **Single store, flat maps.** Add new entities as `Record<id, T>` on
  `Tournament`; add a matching selector rather than scattering filters in
  components.
- **Pure logic in `lib/`.** Anything algorithmic (scheduling, ranking, bracket
  math, export shaping) belongs in `lib/` with a unit test — keep it out of
  components and the store body.
- **Persistence versioning.** The persisted shape is `vb-tournament` at
  `version: 1`. If you change the `Tournament` shape in a breaking way, **bump the
  version and add a real `migrate`** (the current one is an identity passthrough)
  — otherwise old saved tournaments are silently dropped on load.
- **Court ref hygiene.** Any action that removes matches should run through
  `pruneCourtRefs` (or the actions that already call it) so `courtNextUp` /
  `courtOverrides` don't dangle.
- **Import validation.** New top-level `Tournament` fields that are required
  should be reflected in `isValidTournament` so imports of older/foreign files
  fail safely instead of corrupting the store.

## Quick reference: where things live

| I want to change… | Look in |
|-------------------|---------|
| A domain type | `src/types/tournament.ts` |
| Any state action/selector | `src/stores/tournament.store.ts` |
| Schedule generation | `src/lib/round-robin.ts` |
| Standings/ranking | `src/lib/standings.ts` |
| Bracket logic | `src/lib/bracket.ts` |
| Export shaping / Sheet payload | `src/lib/schedule-export.ts` |
| Google Sheet push / auto-push | `src/lib/google-sheet-push.ts`, `src/lib/use-auto-push.ts` |
| Team colors | `src/lib/colors.ts` |
| Header / global actions | `src/layout/AppShell.tsx` |
| Phase routing | `src/layout/DivisionView.tsx` |
| A specific screen | `src/features/<area>/components/` |
</content>
