# 08 — Import / Export / Google Sheets

VB Tournament has no server, so getting data in and out happens through files and
an optional Google Sheet push. Entry points are in the header (`AppShell`) and the
check-in import dialog.

## Spreadsheet import (teams + players)

**Where:** check-in phase → Import (`src/features/checkin/components/ImportDialog.tsx`,
hook `useImportSpreadsheet`). Parses `.xlsx` / `.xls` / `.csv` via SheetJS.

### Sheet selection (`findBestSheet`)

1. A sheet named exactly `Teams` (case-insensitive), else
2. the first sheet whose name contains `team`, else
3. the sheet with the most columns containing `player`.

### Column detection (fuzzy, header-name based)

Headers are normalized (lowercased, trailing `:`/`.`/spaces stripped) and matched
by substring:

| Field | Matches header containing | Notes |
|-------|---------------------------|-------|
| Manager | `team manager`, `manager`, `staff` | |
| Division | `division` | informational in preview |
| Team name | `team name`, `teamname`, `team` | excludes `manager` |
| Color | `color`, `colour` | resolved name → hex |

### Player triplets

Players are read as repeating **`Player N` → Status → Link** column groups:

- A column containing `player` holds the **name**.
- The **next** column (if not another player column) is the **status**:
  `IN` / `OUT` / `LATE` (anything else = `unknown`).
- The column **after that** is an optional **link group**: a single letter `A–Z`
  (players sharing a letter are kept on the same team — see
  [Data Model](./02-data-model.md#player)).

### Free agents

A row whose team name contains "free agent" is treated as a **free-agent pool**:
its players are imported as unassigned players (`addPlayer` + status + link) into
the **division being imported into**, not as a team. Pools are labeled by their
sheet division in the preview (e.g. "Free Agents — Advanced") so multiple pools
are distinguishable.

### Preview & commit

Import is **per-division** (triggered from a division's check-in page). The
dialog lists every row found in the sheet, but **pre-selects only the rows whose
`Division` cell matches the division being imported into** (`rowMatchesDivision`,
lenient case-insensitive match against the division's name and level) — its teams
*and* its free-agent pool. Non-matching rows stay visible (dimmed) and checkable,
so you can still pull another division's pool in if you want. If no row's division
lines up (e.g. the sheet has no usable `Division` column), it falls back to
selecting all. The preview shows resolved color swatches and player statuses, then:

- Teams → `importTeams(divisionId, rows)` — resolves color names to hex
  (auto-assigning an unused palette color if none/unknown), and sets
  `checkinStatus = ready` if 6+ players are `in`.
- Free agents → individual `addPlayer` calls.

## Tournament backup — JSON

- **Export as JSON** (`handleExportJSON`) — `exportState()` serializes the whole
  `Tournament` (pretty-printed) and downloads
  `Name_YYYY-MM-DD.json`. This is the **full, lossless backup**.
- **Import Tournament** (`handleImportJSON`) — reads a JSON file, validates it
  with `isValidTournament`, and **replaces** the current tournament (with a
  confirm prompt if data already exists). Invalid files are rejected.

> JSON is the only round-trippable format. XLSX/TSV/Sheet are one-way views.

## XLSX export (report)

**Export as XLSX** (`handleExportCSV`, despite the name) builds a 3-sheet workbook
with SheetJS:

- **Teams** — grouped by division: Team, Manager, Color, Status, Players.
- **Matches** — Division, Round, Court, Home, Away, Home/Away Score, Status
  (`buildScheduleRows`).
- **Standings** — Division, Rank, Team, W, L, PF, PA, Diff (`buildStandingRows`).

Downloads `Name_YYYY-MM-DD.xlsx`.

## Copy Schedule — clipboard TSV

**Copy Schedule** (`buildTsvClipboard`) copies a tab-separated, division-grouped
view designed to paste into a spreadsheet or message. Bye matches are skipped.
Each match row shows a friendly status:

| Status | Shown as | Court |
|--------|----------|-------|
| in-progress | `NOW PLAYING` | its court |
| completed | `DONE` (with `home - away` score) | its court |
| staged next-up | `Up Next` | staged court |
| otherwise | `TBD` | `n/a` |

## Live push to Google Sheets

For coaches/spectators to watch a live sheet. Logic in
`src/lib/google-sheet-push.ts`; config UI in `src/layout/SettingsDialog.tsx`.

### One-time setup (in the Settings dialog)

1. Create a Google Sheet → **Extensions → Apps Script**.
2. Paste the provided `doPost` script (copy button in the dialog). It writes three
   tabs: **Schedule**, **Standings**, **Meta** (last-updated, tournament, date).
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access:
   Anyone*.
4. Paste the deployment URL into the dialog (must start with
   `https://script.google.com/`). Optionally enable **auto-push**. Use **Test Push
   Now** to verify.

URL and auto-push toggle persist in `localStorage`
(`vb-apps-script-url`, `vb-auto-push-enabled`).

### How the push works (`pushToSheet`)

- POSTs `buildSheetPayload(tournament)` as `Content-Type: text/plain` to keep it a
  CORS "simple request" (no preflight).
- If the response is readable, it verifies the script returned `status: 'ok'`.
- If the deployment blocks cross-origin reads, it falls back to a `no-cors`
  fire-and-forget and returns `{ ok: true, unverified: true }` ("sent, delivery
  unconfirmed").

### Auto-push (`useAutoPush`, called once in `App.tsx`)

Subscribes to the store and pushes when a **result-affecting** change happens — a
match completing, a completed score being edited, or a completed match being
reopened/removed (`hasResultChange`). Details:

- Only fires if a URL is configured **and** auto-push is enabled (read from
  `localStorage` each time to avoid stale closures).
- **5-second trailing debounce** so rapid edits collapse into one push.
- Single-flight: if a push is in progress, the latest state is pushed again when
  it finishes (so the sheet always ends on the newest data).
- Surfaces success / unverified / failure via `sonner` toasts.

### Formula-injection safety (`sanitizeForSheet`)

All names/text written to a sheet are sanitized: tabs/newlines collapsed to
spaces, and any value starting with `=`, `+`, or `@` is prefixed with `'` so
Sheets renders it as text instead of executing it as a formula.

## At a glance

| Feature | Direction | Format | Round-trip? |
|---------|-----------|--------|-------------|
| Import Tournament / Export JSON | both | JSON | ✅ full backup |
| Spreadsheet import | in | xlsx/csv | teams + players only |
| Export XLSX | out | xlsx | ❌ report |
| Copy Schedule | out | TSV (clipboard) | ❌ report |
| Push to Google Sheet | out | HTTP POST → Apps Script | ❌ live mirror |
</content>
