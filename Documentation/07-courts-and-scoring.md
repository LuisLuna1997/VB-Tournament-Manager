# 07 — Courts & Scoring

The **Courts** tab (`src/features/scoring/components/ScoringPage.tsx`) is the
day-of control center during the `round-robin` phase. It assigns matches to
physical courts, runs score entry, and stages what plays next.

## Court assignment (`assignCourts`)

A pure function maps `courtNumber → Match | null` for the division's `courtCount`.
It fills courts in priority order:

1. **In-progress matches** first — placed on their override court → their stored
   `courtNumber` → the first empty court (bumping a merely-scheduled match if
   needed). In-progress matches never get displaced by scheduled ones.
2. **Scheduled matches with an explicit override** (`courtOverrides[matchId]`).
3. **Remaining scheduled matches** fill any still-empty courts.

The pool fed to `assignCourts` is the **current round's** playable matches plus
any **future-round matches that have a court override** (so you can pull a future
match onto a free court early).

### "Current round"

The current round is the lowest-numbered round that still has a non-completed,
non-bye match. Note in-progress matches are moved to `roundNumber = 0` by
regeneration so they always sort first ("In Progress" header instead of
"Round N").

## Persisted staging state

Two fields on the `Division` (so they survive tab switches and reloads):

| Field | Shape | Meaning |
|-------|-------|---------|
| `courtOverrides` | `Record<matchId, courtNumber>` | Pin a match to a specific court |
| `courtNextUp` | `Record<courtNumber, matchId>` | The match staged "up next" on a court |

The component reads/writes these via the store actions `setCourtOverrides` /
`setCourtNextUp`. Both are pruned automatically when matches disappear
(`pruneCourtRefs`).

### Auto-pin

When you **start** a match on a court, the component writes a court override and
calls `startMatch(matchId, courtNumber)` (which also persists `courtNumber` on the
match). This stops an in-progress match from "jumping" courts when another court's
match completes and assignment recomputes.

## Score entry (`ScoreEntry`)

Each court card renders a `ScoreEntry` for its current match. The scoring actions
(in the store) are:

| Action | Effect |
|--------|--------|
| `startMatch(id, court?)` | `scheduled → in-progress`; seeds scores to 0; pins court |
| `updateScore(id, home, away)` | Set scores while playing |
| `completeMatch(id)` | `→ completed`; stamps `completedAt` |
| `reopenMatch(id)` | `completed → in-progress` (keeps scores; clears manual winner) |
| `resetMatch(id)` | `→ scheduled`; clears scores/`completedAt`/manual winner |
| `setManualWinner(id, teamId)` | Organizer pick for a tied finals match |

When a match completes on a court, the card **promotes the staged "up next"
match** for that court: it sets a court override for the next-up match and clears
the next-up slot.

## "Up Next" drag-and-drop

Each court card has a dashed **Up Next** drop zone. From the **Queue** tab you can
drag a match (HTML5 DnD, payload `application/vb-match-id`) onto a court's drop
zone to stage it. Staging:

- removes the match from any other court's next-up slot,
- shows a `C{court} Next` badge on the queue item,
- offers **Send to Court** (pin now) and **Clear** buttons in the drop zone.

A queue item also has quick **C1 / C2 / …** buttons to pin directly to a court
(displacing whatever scheduled match was there).

## The Queue / Completed / Upcoming tabs

- **Queue** — matches waiting for a court: the current round's unplaced scheduled
  matches, plus future-round scheduled matches (so free courts can pull ahead).
  - Teams currently **playing** elsewhere are flagged "Playing" and their match is
    dimmed and **not draggable** (a team can't be on two courts at once).
  - Future-round items show an `R{n}` badge.
- **Completed** — completed matches in the current round (each editable via
  `ScoreEntry`, which can reopen/reset).
- **Upcoming Rounds** — read-only preview of future rounds (`MatchCard`).

## Top controls

- **Tournament Progress** — `completed / totalPlayable` games, round count, and a
  progress bar.
- **Teams play _N_ games** — sets `division.targetGames` (capped at
  `activeTeams − 1`, the max possible). Changing it on blur triggers
  `regenerateSchedule`, preserving overrides for in-progress matches.
- **Add Team** — add a team mid-tournament (`AddTeamDialog`).
- **Regen** — `regenerateSchedule` (keeps played/in-progress games; see
  [Scheduling](./04-scheduling.md)).
- **Start Finals** — appears only when all matches are completed/bye; opens the
  bracket-size dialog (`startFinals`).

## Court assignment priority (visual)

```
courts: [1] [2] ... [courtCount]
  1) in-progress  → override court → stored courtNumber → first empty (bump a scheduled)
  2) scheduled w/ override → its override court (if free)
  3) leftover scheduled → fill remaining empty courts
pool = current-round playable matches + future matches that have an override
```
</content>
