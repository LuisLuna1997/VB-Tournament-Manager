# VB Tournament — Documentation

VB Tournament is a single-page web app for running **beach/indoor volleyball
tournaments** day-of: check in teams, generate a round-robin schedule, run
matches across multiple courts, track standings, and play out an elimination
bracket. It runs entirely in the browser — no backend, no accounts. All state
lives in `localStorage`.

It can run as a normal website (`npm run dev` / static `dist/`) or be bundled
into a self-contained macOS `.app` for AirDrop sharing (see
[Development & Build](./10-development.md)).

## What it does

- **Multi-division** tournaments (e.g. Beginners / Intermediate / Advanced),
  each progressing through its own phases independently.
- **Check-in**: import teams + players from a spreadsheet (`.xlsx`/`.csv`) or
  add them by hand; track who's `in`/`out`/`late`; mark teams `ready`.
- **Round-robin scheduling**: circle-method generation with byes, per-team or
  per-division game caps, and "evade" pairings (teams to keep apart).
- **Courts view**: live court assignment, drag-and-drop "up next" staging,
  score entry, and a queue that blocks teams already playing.
- **Standings**: win% ranking with diff / points-for / head-to-head tiebreaks.
- **Finals**: 2-team (final only) or 4-team (semis → championship + 3rd place)
  brackets, with organizer tie-break picks.
- **Public scoreboard**: a big-screen view of live matches and champions.
- **Export / sharing**: JSON (full backup), XLSX, clipboard TSV, and live push
  to a Google Sheet via an Apps Script web app.

## Documentation map

| Doc | Covers |
|-----|--------|
| [01 — Architecture](./01-architecture.md) | Tech stack, folder layout, state store, persistence |
| [02 — Data Model](./02-data-model.md) | Entities (Tournament → Division → Team → Player, Match), relationships |
| [03 — Tournament Lifecycle](./03-tournament-lifecycle.md) | Phases and how a division moves through them |
| [04 — Scheduling (Round-Robin)](./04-scheduling.md) | The generation algorithm: byes, caps, evade, regeneration |
| [05 — Standings](./05-standings.md) | Ranking rules and tiebreakers |
| [06 — Finals & Brackets](./06-finals.md) | Bracket generation, ties, auto-repair |
| [07 — Courts & Scoring](./07-courts-and-scoring.md) | Court assignment, next-up staging, score entry |
| [08 — Import / Export / Sheets](./08-import-export.md) | Spreadsheet import, exports, Google Sheet push |
| [09 — UI Guide](./09-ui-guide.md) | Pages, components, navigation |
| [10 — Development & Build](./10-development.md) | Scripts, tests, the macOS `.app` bundle |

## 60-second mental model

```
Tournament
 └─ Division        (phase: checkin → round-robin → finals → complete)
     ├─ Teams       (color, manager, players, checkinStatus, game caps, evade list)
     │   └─ Players (status: in/out/late, linkGroup)
     └─ Matches     (round-robin or finals; scores, court, status)
```

Everything is keyed by id in flat `Record<id, T>` maps on a single `Tournament`
object held in one Zustand store. The UI reads slices of that store and calls
store actions; the store recomputes derived data (standings, schedules) on
demand via selectors. There is no server — see
[Architecture](./01-architecture.md).
</content>
</invoke>
