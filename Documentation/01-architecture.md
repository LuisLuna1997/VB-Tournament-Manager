# 01 — Architecture

## Tech stack

| Area | Choice |
|------|--------|
| Framework | React 19 (function components + hooks) |
| Build tool | Vite 8 (`base: './'` so `dist/` works from any path) |
| Language | TypeScript 6 (strict-ish: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`) |
| State | Zustand 5 with `persist` middleware → `localStorage` |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| UI primitives | shadcn-style components in `src/components/ui/` built on `@base-ui/react` |
| Icons | `lucide-react` |
| Toasts | `sonner` |
| Spreadsheets | `xlsx` (SheetJS) for import + XLSX export |
| Font | `@fontsource-variable/geist` |

There is **no backend**. The only network calls are the optional outbound
pushes to a user-supplied Google Apps Script URL (see
[Import/Export](./08-import-export.md)).

Path alias: `@/*` → `src/*` (configured in both `tsconfig.app.json` and
`vite.config.ts`).

## Folder layout

```
src/
├── App.tsx                      # Root: TooltipProvider + AppShell + Toaster; calls useAutoPush()
├── main.tsx                     # React root mount
├── index.css                    # Tailwind + theme tokens
│
├── types/
│   └── tournament.ts            # ALL domain types (single source of truth)
│
├── stores/
│   └── tournament.store.ts      # The one Zustand store: state + actions + selectors
│
├── lib/                         # Pure logic (no React) — the testable core
│   ├── round-robin.ts           # Schedule generation (circle method, caps, evade)
│   ├── bracket.ts               # Finals bracket generation + winner resolution
│   ├── standings.ts             # Ranking + tiebreakers
│   ├── schedule-export.ts       # Build rows for XLSX / TSV / Sheet payloads
│   ├── google-sheet-push.ts     # POST to Apps Script web app + LS config
│   ├── use-auto-push.ts         # Hook: debounced auto-push on result changes
│   ├── colors.ts                # TEAM_COLORS palette, name→hex, contrast
│   ├── id.ts                    # generateId()
│   └── utils.ts                 # cn() classname helper
│
├── layout/                      # App chrome
│   ├── AppShell.tsx             # Header, export/import menu, dark mode, scoreboard toggle
│   ├── DivisionTabs.tsx         # Division switcher + add-division
│   ├── DivisionView.tsx         # Phase-aware tab router for the active division
│   ├── PhaseIndicator.tsx       # Small phase badge
│   ├── AddDivisionDialog.tsx
│   └── SettingsDialog.tsx       # Google Sheet / Apps Script config
│
├── features/                    # One folder per functional area
│   ├── checkin/                 # Teams, players, free agents, spreadsheet import
│   ├── schedule/                # Schedule view, MatchCard, manual edit
│   ├── scoring/                 # Courts page + ScoreEntry
│   ├── standings/               # Standings table
│   ├── finals/                  # Finals bracket page
│   └── scoreboard/              # Full-screen public display
│
└── components/
    ├── TeamBadge.tsx            # Colored team pill (reused everywhere)
    └── ui/                      # shadcn primitives (button, card, dialog, table, ...)
```

The **`lib/` layer is the heart of the app** and is framework-agnostic and unit
tested. The store wires `lib/` functions into actions; React components are thin
and mostly render store data + dispatch actions.

## State management

A single Zustand store (`src/stores/tournament.store.ts`) holds:

```ts
{
  tournament: Tournament,          // the entire dataset (see Data Model)
  activeDivisionId: string | null  // which division tab is selected
}
```

Plus ~50 actions and selectors. Conventions:

- **Actions** mutate via immutable spreads (`set(state => ({ tournament: {...} }))`).
  Nested updates always copy the affected `Record` and the touched entity.
- **Selectors** (`getStandings`, `getRoundRobinMatches`, `getActiveTeams`, …)
  derive data on read by filtering the flat maps. They are plain methods on the
  store, so components call `useTournamentStore(s => s.getStandings(id))` or grab
  them via destructuring. Derived data (standings, schedules) is **computed, not
  stored** — except match results, which are persisted.
- **Heavy generation** (round-robin, brackets) is delegated to `lib/` and the
  result is written back into `tournament.matches`.

Components subscribe with selector functions to limit re-renders, e.g.
`useTournamentStore(s => s.tournament.divisions[divisionId])`.

### Helper functions inside the store

- `buildTeamMaxGames` — resolves each team's game cap (per-team `maxGames`
  overrides the division `targetGames`).
- `buildEvadePairs` — collects "avoid this matchup" pairs into a sorted-key set.
- `recalcTeamStatus` — a team becomes `ready` once **6+** of its players are `in`
  (unless manually `dropped`).
- `pruneCourtRefs` — strips `courtNextUp` / `courtOverrides` entries pointing at
  matches that no longer exist (after regeneration / team removal).
- `isValidTournament` — structural validation of imported JSON before it replaces
  the store.

## Persistence

The store uses Zustand's `persist` middleware:

- **Key**: `vb-tournament` in `localStorage`
- **Version**: `1` (with an identity `migrate` placeholder — add per-version
  transforms there before bumping the version, or persisted data is discarded)
- **`partialize`**: persists `{ tournament, activeDivisionId }`

Other `localStorage` keys used directly (outside the store):

| Key | Purpose | Set by |
|-----|---------|--------|
| `vb-dark-mode` | `"true"`/`"false"` dark theme | `AppShell` `useDarkMode` |
| `vb-apps-script-url` | Google Apps Script web app URL | `SettingsDialog` / `google-sheet-push.ts` |
| `vb-auto-push-enabled` | `"true"`/`"false"` auto-push toggle | `SettingsDialog` / `google-sheet-push.ts` |

> Because everything is local, **clearing browser storage wipes the tournament**.
> Use **Export as JSON** for backups (see [Import/Export](./08-import-export.md)).

## ID generation

`generateId()` (`src/lib/id.ts`) returns
`` `${base36 time}-${base36 counter}-${base36 random}` `` — monotonic enough to
avoid collisions within a session without pulling in a UUID dependency.

## Data flow summary

```
User action (click / drag / form)
      │
      ▼
Store action  ──calls──▶  lib/ pure function (e.g. generateRoundRobin)
      │                          │
      │◀────────result──────────-┘
      ▼
set() updates tournament  ──persist──▶ localStorage ("vb-tournament")
      │
      ▼
Subscribed components re-render  ──┐
                                   ├─▶ useAutoPush subscriber: on result change,
                                   │   debounced POST to Google Sheet (if enabled)
                                   └─▶ Scoreboard / Courts / Standings update
```
</content>
