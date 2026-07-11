# 03 — Tournament Lifecycle

Each **division** owns its own `phase` and moves through it independently. The
active division's `phase` decides which tabs `DivisionView` renders
(`src/layout/DivisionView.tsx`).

```
 checkin ──generateSchedule──▶ round-robin ──startFinals──▶ finals ──Mark Complete──▶ complete
   │                                │                          │
   │  add/import teams,             │  play matches on courts, │  semis → championship
   │  set players in/out,           │  track standings         │  + 3rd place, pick a
   │  mark teams ready              │                          │  champion
```

## Phase: `checkin`

**UI:** `CheckinPage` (Teams + Free Agents).

What happens here:

- Create teams manually (`AddTeamDialog`) or **import from a spreadsheet**
  (`ImportDialog` — see [Import/Export](./08-import-export.md)).
- Add players, set each player `in` / `out` / `late`, assign free agents to teams.
- A team auto-flips to `ready` once **6+** players are `in`
  (`recalcTeamStatus`). You can also drop a team.
- Set `courtCount` for the division.

**Exit:** calling `generateSchedule(divisionId)` (the "Generate Schedule"
action). It builds the round-robin from **active** teams (`checkinStatus !==
'dropped'`, needs ≥2), writes the matches, and sets
`phase = 'round-robin'`, `currentRound = 1`.

## Phase: `round-robin`

**UI tabs:** `Courts` (`ScoringPage`), `Schedule`, `Standings`, `Teams`.

What happens here:

- The **Courts** view assigns matches to courts, lets you start/score/complete
  them, and stages "up next" matches (see [Courts & Scoring](./07-courts-and-scoring.md)).
- **Standings** update live from completed matches (see [Standings](./05-standings.md)).
- You can still **Add Team** or **Regen** the schedule mid-phase; regeneration
  preserves completed/in-progress results (see [Scheduling](./04-scheduling.md)).
- The "Teams play _N_ games" control sets `division.targetGames` and regenerates.

**Exit:** when every match is `completed` or `bye`, a **Start Finals** button
appears. `startFinals(divisionId, advancingCount)` builds the bracket from the
standings and sets `phase = 'finals'`.

## Phase: `finals`

**UI tabs:** `Finals` (`FinalsPage`), `Standings`, `Schedule`, `Teams`.

What happens here (see [Finals & Brackets](./06-finals.md) for detail):

- **2-team bracket:** a single Final (#1 vs #2).
- **4-team bracket:** two Semifinals (#1v#4, #2v#3). When both semis complete with
  decided winners, the **Championship** and **3rd Place** matches auto-generate.
- **Ties** in a semi or the championship require an organizer pick
  (`manualWinnerId`).
- If a semi result is corrected after the final round was created, the page
  flags a **stale bracket** and can regenerate the final round.

**Exit:** once a champion is decided, **Mark Division Complete** sets
`phase = 'complete'`.

## Phase: `complete`

Same tabs as `finals`, but the division is finished — the champion banner shows
and there's nothing left to advance. The scoreboard shows the champion.

## Cross-cutting: division independence

Because each division has its own phase, a tournament can have (say) Beginners in
`round-robin` while Advanced is already in `finals`. The header's
`PhaseIndicator` shows the **active** division's phase; the **Scoreboard** shows
all divisions side by side regardless of their individual phases.

## State transitions reference

| From | Action | To | Store fn |
|------|--------|----|----------|
| `checkin` | Generate Schedule | `round-robin` | `generateSchedule` |
| `round-robin` | Regen | `round-robin` | `regenerateSchedule` (stays in phase) |
| `round-robin` | Start Finals | `finals` | `startFinals` |
| `finals` | (semis done) | `finals` | `generateFinals` (auto) |
| `finals` | Mark Complete | `complete` | `advancePhase(id, 'complete')` |
| any | (manual) | any | `advancePhase(id, phase)` |

`advancePhase` can move a division to any phase directly — it's the low-level
setter the higher-level actions build on.
</content>
