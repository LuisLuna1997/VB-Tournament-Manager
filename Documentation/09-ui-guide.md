# 09 — UI Guide

This is a tour of the screens and components, top-down. The app is a single page;
"navigation" is the division tabs plus phase-driven sub-tabs.

## App chrome

### `App.tsx`
Root component: wraps everything in `TooltipProvider`, renders `AppShell` and the
`sonner` `<Toaster />`, and calls `useAutoPush()` once (the Google Sheet
auto-push subscriber).

### `AppShell` (`src/layout/AppShell.tsx`)
The header + main region.

- **Editable title** (click the name to rename), tournament **date**, and a
  `PhaseIndicator` for the active division.
- **Header actions** (right side):
  - **Settings** — opens `SettingsDialog` (Google Sheet config).
  - **Dark mode toggle** — hand-rolled `useDarkMode` (toggles `.dark` on `<html>`,
    persists to `vb-dark-mode`).
  - **Copy Schedule** — TSV to clipboard (`buildTsvClipboard`).
  - **Scoreboard** — toggles the full-screen `ScoreboardPage`.
  - **Import Tournament** — load a JSON backup (replaces current, with confirm).
  - **Export Tournament** (hover menu) — **JSON**, **XLSX**, or **Push to Google
    Sheet**.
  - **Reset** — type `RESET` to wipe everything (`resetTournament`).
- **Body** — either the Scoreboard, or `DivisionTabs` wrapping the active
  `DivisionView`.

### `DivisionTabs` (`src/layout/DivisionTabs.tsx`)
Division switcher. Tab per division (hover reveals a delete ✕ → type the division
name to confirm a destructive `removeDivision`), plus a **+** to add one
(`AddDivisionDialog`). Empty state prompts to create the first division.

### `DivisionView` (`src/layout/DivisionView.tsx`)
The phase-aware router. Given the active division's `phase`, it renders:

| Phase | Tabs shown |
|-------|-----------|
| `checkin` | `CheckinPage` (no tabs) |
| `round-robin` | **Courts** · Schedule · Standings · Teams |
| `finals` / `complete` | **Finals** · Standings · Schedule · Teams |

### `PhaseIndicator`
Small badge showing the current phase in the header.

## Check-in (`features/checkin/`)

### `CheckinPage`
The setup screen. Header shows active/total team counts and a **Courts** number
input (`updateDivisionCourtCount`). Actions: **Import** (spreadsheet),
**Add Player**, **Add Team**, and **Start Round Robin** (disabled until ≥2 active
teams). Start opens a confirm dialog with an optional **Games per team** value
(sets `targetGames`) before calling `generateSchedule`.

- **`TeamCard`** — a team's card: name/color/manager editing, roster with
  per-player status, status badge (`wip`/`ready`/`dropped`). Link-group hover
  highlighting is coordinated via `hoveredLinkGroup` state lifted to the page.
- **`FreeAgentPool`** — unassigned players for the division; assign them to teams.
- **`PlayerChip`** — a single player pill with status.
- **`AddTeamDialog`** / **`AddPlayerDialog`** — create entities (also reused on the
  Courts and Schedule pages for mid-tournament additions).
- **`ImportDialog`** (`useImportSpreadsheet`) — file picker + preview table for
  spreadsheet import. See [Import/Export](./08-import-export.md).

## Courts (`features/scoring/`) — round-robin command center

### `ScoringPage`
The **Courts** tab. Court cards, the up-next drop zones, and the
Queue/Completed/Upcoming tabs. Full behavior in
[Courts & Scoring](./07-courts-and-scoring.md). Top bar: progress, **Teams play N
games**, **Add Team**, **Regen**, and **Start Finals** (when complete).

### `ScoreEntry`
The reusable match widget, rendered in three states:

- **scheduled** → team badges + a **Start** button (`startMatch`, or the page's
  `onStart` to also pin the court).
- **in-progress** → big ± steppers and number inputs per team (`updateScore`,
  clamped 0–99), **Cancel** (`resetMatch`) and **Complete Match**
  (`completeMatch`). Completing a tie prompts for confirmation (worded differently
  for round-robin vs finals).
- **completed** → frozen score, **Final** badge, **Undo** (`reopenMatch`, keeps
  the score).

Used by the Courts page, Finals page, and the completed list.

## Schedule (`features/schedule/`)

### `SchedulePage`
Full schedule grouped into round cards (`MatchCard` per match, "Done" badge when a
round is finished). Extras:

- **Games Per Team** summary: each team's `played/projected` count plus a per-team
  **game cap** input (`updateTeamMaxGames`) and inline **free-agent assignment**.
- **Teams play N games** control (mirrors the Courts one) — regenerates on change.
- **Edit** → `EditSchedule` (manual schedule editor).
- **Add Player / Add Team / Drop Team / Regenerate**. Dropping a team
  (`dropTeam`) removes its round-robin matches (including results) and
  auto-regenerates.

### `MatchCard`
Compact read-only match row (teams, court, score/status) used in schedule and
upcoming-round views.

### `EditSchedule`
Manual editor for tweaking the generated schedule by hand
(`replaceMatches`).

## Standings (`features/standings/`)

### `StandingsPage` / `StandingsTable`
Live ranking table from `getStandings` (W/L/T, games, PF/PA, diff, rank). See
[Standings](./05-standings.md) for the ranking rules.

## Finals (`features/finals/`)

### `FinalsPage`
Bracket UI with champion banner, semifinal/championship/3rd-place cards (each a
`ScoreEntry`), tie pickers, stale-bracket repair, and **Mark Division Complete**.
See [Finals & Brackets](./06-finals.md).

## Scoreboard (`features/scoreboard/ScoreboardPage.tsx`)

A **full-screen public display** toggled from the header — meant for a projector
or TV. Shows all divisions side by side (1/2/3-column grid by visible count), each
with:

- **Live matches** rendered large, with court / finals labels.
- **Up Next** staged matches per court (from `courtNextUp`).
- A **Champion** banner when a division's championship is decided.
- Per-division toggle chips to hide/show divisions on the board.

It's read-only — no scoring happens here; it just mirrors store state.

## Shared components

- **`TeamBadge`** (`src/components/TeamBadge.tsx`) — the colored team pill used
  everywhere; reads the team from the store by id and applies a readable text
  color via `getContrastColor`.
- **`components/ui/*`** — shadcn-style primitives over `@base-ui/react`: `button`,
  `card`, `dialog`, `alert-dialog`, `select`, `tabs`, `table`, `input`, `badge`,
  `separator`, `tooltip`, `sonner`.

## Component → store cheat sheet

| Component | Key store calls |
|-----------|-----------------|
| `DivisionTabs` | `addDivision`, `removeDivision`, `setActiveDivision` |
| `CheckinPage` | `generateSchedule`, `updateDivisionCourtCount`, `setTargetGames` |
| `TeamCard` / dialogs | `addTeam`, `addPlayer`, `assignPlayerToTeam`, `updatePlayerStatus`, `updateTeam*` |
| `ImportDialog` | `importTeams`, `addPlayer`, `updatePlayerStatus`, `setPlayerLinkGroup` |
| `ScoringPage` | `startMatch`, `regenerateSchedule`, `startFinals`, `setCourt*` |
| `ScoreEntry` | `startMatch`, `updateScore`, `completeMatch`, `reopenMatch`, `resetMatch` |
| `SchedulePage` | `regenerateSchedule`, `dropTeam`, `updateTeamMaxGames`, `setTargetGames` |
| `FinalsPage` | `generateFinals`, `setManualWinner`, `advancePhase` |
| `ScoreboardPage` | selectors only (read-only) |
| `AppShell` | `exportState`, `importState`, `resetTournament`, `setTournamentName` |
</content>
