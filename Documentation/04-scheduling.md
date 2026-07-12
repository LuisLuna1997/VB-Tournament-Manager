# 04 — Scheduling (Round-Robin)

Schedule generation lives in **`src/lib/round-robin.ts`** and is driven by the
store actions `generateSchedule` (first build) and `regenerateSchedule`
(rebuild while preserving played games).

## Entry point

```ts
generateRoundRobin(options: RoundRobinOptions): Match[]

interface RoundRobinOptions {
  teamIds: string[];
  courtCount: number;
  divisionId: string;
  preservedResults?: Map<string, {homeScore; awayScore}>; // restore played games
  teamMaxGames?: Map<string, number>;   // teamId -> hard CEILING (per-team cap)
  targetGames?: number;                 // division FLOOR: every team plays >= this
  evadePairs?: Set<string>;             // "teamA::teamB" (sorted) pairs to defer
  readyTeamIds?: Set<string>;           // checked-in teams -> onto the first courts
}
```

The store builds these from the active teams before calling it:
`buildTeamCeilings` (per-team `maxGames` only), `division.targetGames` (the
floor), `buildEvadePairs`, and `buildReadyTeamIds` (`checkinStatus === 'ready'`).

## The base algorithm: circle method

`generateOnce()` produces one full round-robin where every team plays every other
exactly once:

1. **Shuffle** the team list (so each regeneration looks different).
2. If the count is **odd**, append a sentinel `__BYE__` so the count is even —
   the team paired with `__BYE__` each round sits out.
3. For `n` teams there are `n − 1` rounds. Each round pairs
   `teams[i]` vs `teams[n−1−i]`, then **rotates**: fix `teams[0]`, move the last
   element to position 1. This is the standard "circle" rotation.
4. Each pairing becomes a `Match` (status `scheduled`, or `bye` if either side is
   `__BYE__`).

This guarantees a balanced single round-robin before any caps/evades are applied.

## Layered constraints (applied after generation)

### 1. Preserved results (regeneration only)

If `preservedResults` is supplied, any generated pairing that was already played
is restored: scores are re-applied (stored in sorted-team order so home/away can
be reconstructed unambiguously) and the match is marked `completed`. This is how
**Regen** keeps games you've already played.

### 2. Evade pairs — schedule undesirable matchups last

Rounds in the circle method are independent and self-contained (every team plays
in every round), so individual matches can't be moved between rounds — but whole
rounds can be reordered. The scheduler counts evaded matchups per round and
**reorders rounds so those with more evaded pairings land latest**. This pushes
"teams to avoid" matchups toward the end (where they may be cut by game caps, or
simply never reached if play runs out of time).

### 2b. Ready-first ordering — start play while teams are still checking in

`arrangeTeams(teamIds, readyTeamIds)` seeds the circle method so that **round 1's
first courts are Ready-vs-Ready**. The circle method pairs mirror positions
`(i, n−1−i)` in round 1, so placing checked-in (`ready`) teams at the first mirror
pairs makes Court 1 / Court 2 open with Ready teams while WIP teams are still
signing up. `reorderRounds` then keeps the Ready-heavy round as round 1 (and, as
before, pushes evaded-heavy rounds last). The odd-team `__BYE__` is filled last so
a **WIP** team — never a Ready team — sits out round 1. All non-dropped teams are
still scheduled; Ready teams simply play first. (The Courts view places a round's
scheduled matches on courts in array order, which is slot order, so the Ready
pairs — the lowest slots — land on Courts 1 & 2.)

### 3. Target floor + game ceilings (`targetGames`, `teamMaxGames`)

Two separate constraints, handled by `reduceToFloor` after a full round-robin is
generated:

- **`targetGames` is a FLOOR** (the division "Teams play _N_ games" control):
  every team plays **at least** `min(targetGames, n−1)` games. When parity forces
  an odd total, one team plays **`target + 1`** — a team is **never** left below
  the target. Excess matches are converted to byes, but only when **both** teams
  stay at or above their floor, and **round 1 is never trimmed** (so the
  Ready-first opening survives).
- **`teamMaxGames` is a hard CEILING** (the per-team override box — e.g. a team
  that must leave early): that team never plays more than its cap. A ceiling can
  force a *neighbor* below the target floor (there may be no other way to satisfy
  the cap) — **ceilings win over the floor**.

Evaded / later-round / WIP-involving matches are cut first, so early
Ready-vs-Ready matches survive. Completed/preserved games are locked and never
removed. Afterward, double-bye matches are removed, byes-only rounds are dropped,
and **courts are assigned per round** (`courtNumber = (index % courtCount) + 1`).

### 4. Multi-attempt selection

The reduce pass is shuffle-dependent, so when a target floor and/or ceilings apply
`generateRoundRobin` runs **16 attempts** and keeps the best by `scoreSchedule`:

```
score = −(shortfall × 1e6 + excess × 1e3 + evadedKept)
```

i.e. **first minimize shortfall** (teams below their floor — the worst outcome),
then **minimize excess** above the floor, then keep fewer evaded matchups. Without
a target or ceilings, a single full round-robin is generated.

## Regeneration semantics (`regenerateSchedule`)

`Regen` (and editing "Teams play N games") rebuilds the schedule **without losing
played games**:

1. Collect `preservedResults` from completed matches.
2. Keep all `completed` and `in-progress` matches; delete only `scheduled` and
   `bye` matches.
3. Count in-progress games toward caps too (so they're not double-scheduled).
4. Generate a new schedule; **skip** any matchup already kept (completed or
   in-progress) so it isn't duplicated.
5. Move in-progress matches to `roundNumber = 0` ("always current") so the Courts
   view always surfaces them.
6. Prune `courtNextUp` / `courtOverrides` entries pointing at removed matches.

If a division drops below 2 active teams, regeneration just clears the scheduled
matches.

## Helper functions

| Function | Purpose |
|----------|---------|
| `collectPreservedResults(matches)` | Build the `preservedResults` map from completed matches |
| `getCompletedRoundCount(matches)` | How many rounds are fully done (all completed/bye) |
| `getRoundsGrouped(matches)` | `Map<roundNumber, Match[]>` — used by the Courts view |

## Worked example

6 teams, 2 courts, no caps:

- 6 is even → no bye sentinel.
- `n − 1 = 5` rounds, 3 matches per round = 15 total matches (each team plays 5).
- Per round, the 3 matches get courts `1, 2, 1` (`index % 2 + 1`), so one match
  waits for a court to free up — that's what the Courts **Queue** handles.

7 teams, 2 courts, cap 4 games/team:

- 7 is odd → `__BYE__` added (8 slots), 7 rounds, one team sits each round.
- With a 4-game cap, the greedy pass converts later matches to byes once teams
  reach 4 games; 8 attempts run and the schedule keeping the most playable games
  wins.
</content>
