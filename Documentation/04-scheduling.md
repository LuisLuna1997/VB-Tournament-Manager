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
  teamMaxGames?: Map<string, number>;   // teamId -> max games allowed
  evadePairs?: Set<string>;             // "teamA::teamB" (sorted) pairs to defer
}
```

The store builds `teamMaxGames` (`buildTeamMaxGames`: per-team `maxGames` ||
division `targetGames`) and `evadePairs` (`buildEvadePairs`) from the active
teams before calling it.

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

### 3. Game caps (`teamMaxGames`) — convert excess matches to byes

When teams have a game limit, a greedy pass walks the scheduled matches and turns
excess ones into byes:

- Completed/preserved games are counted first (they always count toward a cap).
- Matches are processed **non-evaded first, then evaded**, so when a team hits its
  cap the **evaded matchups are the ones dropped** preferentially.
- For each scheduled match: if both teams are at cap → drop it entirely
  (double-bye); if one team is at cap → the other gets a bye; otherwise keep it
  and increment both counts.

After the cap pass, double-bye matches are removed, rounds left with only byes are
dropped, and **courts are assigned per round**: playable matches in a round get
`courtNumber = (index % courtCount) + 1`.

### 4. Multi-attempt selection (only with caps)

The greedy cap pass is shuffle-dependent and can strand teams below their cap. So
when `teamMaxGames` is set, `generateRoundRobin` runs **8 attempts** and keeps the
best by `scoreSchedule`:

```
score = (playable matches) * 1000 − (evaded matchups kept)
```

i.e. **maximize games played**, and among equal counts prefer schedules that keep
fewer evaded matchups. Without caps, a single full round-robin is generated.

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
