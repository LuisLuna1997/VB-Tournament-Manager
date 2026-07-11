# 05 — Standings

Standings are computed on demand by **`computeStandings()`** in
`src/lib/standings.ts`, exposed through the store selector
`getStandings(divisionId)`. Nothing is cached — the table re-derives from match
results every time it's read.

## What counts

Only matches that are:

- in the given division,
- `status === 'completed'`,
- **`isFinals === false`** (finals never affect round-robin standings),

with both team ids and both scores present. **Dropped** teams are excluded from
the table entirely.

## Per-team tallies

For each counted match, both teams accumulate:

- `gamesPlayed`
- `pointsFor` / `pointsAgainst` (and `diff = pointsFor − pointsAgainst`)
- `wins` / `losses` / `ties`

A tie (`homeScore === awayScore`) counts as a **tie** for both teams (not a
win/loss) — round-robin ties are allowed and are worth half a win in the ranking.

## Ranking — primary sort

Teams are sorted by, in order:

1. **Win %** descending — `(wins + ties × 0.5) / gamesPlayed`. This is fair when
   teams have played different numbers of games (common with byes / game caps).
   A team with 0 games played gets win% `0`.
2. **Wins** descending
3. **Diff** descending (point differential)
4. **Points For** descending

## Tiebreaker — head-to-head (exactly two teams)

After the primary sort, a second pass handles head-to-head:

- The code scans for groups of teams tied on **both win% and wins**.
- If a group is **exactly two teams**, the result of the game they played against
  each other wins — if the lower-sorted team beat the higher-sorted team
  head-to-head, they swap.
- For groups of **3+** tied teams, head-to-head can be cyclic (A beat B, B beat C,
  C beat A), so it's skipped and the diff/PF ordering stands.

Head-to-head net results are tracked during tallying in a `headToHead` map keyed
by sorted team-id pair, storing net wins of the sorted-first team.

## Ranks

After all sorting, `rank` is assigned `1..n` in array order. Ranks feed the finals
bracket seeding (`#1 vs #4`, `#2 vs #3`, etc. — see [Finals](./06-finals.md)).

## Where standings are used

- **Standings tab** (`StandingsPage` / `StandingsTable`) — the live table.
- **Start Finals** — `startFinals` seeds the bracket from `getStandings`.
- **Exports** — `buildStandingRows` (XLSX / Google Sheet) recomputes standings per
  division via the same `computeStandings`.

## Summary of the ordering logic

```
sort by:  winPct ↓ , wins ↓ , diff ↓ , pointsFor ↓
then:     for each pair tied on (winPct, wins), apply head-to-head
finally:  rank = index + 1
```
</content>
