# 02 — Data Model

All domain types live in **`src/types/tournament.ts`**. The entire dataset is one
`Tournament` object stored as flat `Record<id, Entity>` maps (not nested arrays),
which makes lookups and immutable updates cheap.

## Entity tree

```
Tournament
 ├─ divisions: Record<id, Division>
 ├─ teams:     Record<id, Team>      (team.divisionId links up)
 ├─ players:   Record<id, Player>    (player.divisionId + player.teamId link up)
 └─ matches:   Record<id, Match>     (match.divisionId + home/awayTeamId link up)
```

Relationships are by **id reference**, not containment. A `Division` does not
contain its teams; you find them by filtering `teams` where
`divisionId === division.id` (that's exactly what selectors like
`getTeamsForDivision` do).

## Enums

```ts
type DivisionLevel  = 'beginners' | 'intermediate' | 'advanced';
type TournamentPhase = 'checkin' | 'round-robin' | 'finals' | 'complete';
type MatchStatus    = 'scheduled' | 'in-progress' | 'completed' | 'bye';
type CheckinStatus  = 'wip' | 'ready' | 'dropped';      // team-level
type PlayerStatus   = 'unknown' | 'in' | 'out' | 'late'; // player-level
```

## Tournament

```ts
interface Tournament {
  id: string;
  name: string;     // editable in the header
  date: string;     // 'YYYY-MM-DD'
  divisions: Record<string, Division>;
  teams: Record<string, Team>;
  players: Record<string, Player>;
  matches: Record<string, Match>;
}
```

Created empty by `createEmptyTournament()` with today's date.

## Division

```ts
interface Division {
  id: string;
  name: string;
  level: DivisionLevel;
  phase: TournamentPhase;          // drives which UI tabs show (see Lifecycle)
  courtCount: number;              // courts available (default 2)
  currentRound: number;            // round-robin progress marker
  advancingTeamCount: number;      // finals bracket size (2 or 4; default 4)
  targetGames: number | null;      // null = full round-robin (everyone plays everyone)
  courtNextUp?: Record<number, string>;   // courtNumber -> matchId staged "up next"
  courtOverrides?: Record<string, number>;// matchId -> pinned courtNumber
}
```

`courtNextUp` and `courtOverrides` are the persistence behind the Courts view's
drag-and-drop staging and court pinning — see
[Courts & Scoring](./07-courts-and-scoring.md). They are pruned whenever matches
are removed (`pruneCourtRefs`).

## Team

```ts
interface Team {
  id: string;
  name: string;
  color: string;                 // hex; drives the colored badge everywhere
  manager: string;
  playerIds: string[];
  divisionId: string;
  checkinStatus: CheckinStatus;  // wip until 6+ players 'in' -> ready; or dropped
  maxGames: number | null;       // per-team cap; overrides division.targetGames
  evadeTeamIds: string[];        // teams to avoid playing if possible
}
```

- **`checkinStatus`** is recalculated automatically (`recalcTeamStatus`) whenever
  a player's status changes or players are added/removed: `ready` at **6+** `in`
  players, else `wip`. `dropped` is sticky and set manually.
- **`maxGames`** limits how many round-robin games this team plays. Resolution
  order: per-team `maxGames` → division `targetGames` → unlimited (full RR).
- **`evadeTeamIds`** is a soft constraint: the scheduler tries to schedule these
  matchups last and cuts them first when game caps force matches to drop.

## Player

```ts
interface Player {
  id: string;
  name: string;
  teamId: string | null;   // null = free agent (unassigned)
  divisionId: string;
  status: PlayerStatus;     // unknown / in / out / late
  linkGroup: string | null; // players sharing a linkGroup move teams together
}
```

- A `null` `teamId` means the player is a **free agent** in the division's pool.
- **`linkGroup`** is a single letter (A–Z) from import or set in the UI. When you
  assign one linked player to a team, every player in the same `linkGroup` (same
  division) moves with them (`assignPlayerToTeam`). Used for "these people must be
  on the same team" (e.g. couples, carpools).

## Match

```ts
interface Match {
  id: string;
  roundNumber: number;          // round-robin round; finals use 1,2 + finalsRound
  homeTeamId: string | null;    // null on a bye
  awayTeamId: string | null;    // null on a bye
  homeScore: number | null;
  awayScore: number | null;
  courtNumber: number;          // 0 = unassigned
  status: MatchStatus;          // scheduled / in-progress / completed / bye
  divisionId: string;
  isFinals: boolean;            // false = round-robin, true = bracket match
  finalsRound?: number;         // 1 = semi/final, 2 = championship, 3 = 3rd place
  completedAt?: number;         // epoch ms when completed
  manualWinnerId?: string | null; // organizer pick for a TIED finals match
}
```

Key distinctions:

- **`isFinals`** partitions matches into the round-robin set and the bracket set.
  Standings only count `!isFinals` completed matches.
- **`status: 'bye'`** matches are kept in the data but excluded from courts,
  standings, and the scoreboard. A bye can carry one team (`homeTeamId` set,
  `awayTeamId` null) meaning "this team sits out this round".
- **`manualWinnerId`** only matters for finals ties — round-robin ties are just
  ties in the standings (counted as half a win).
- **`finalsRound`** semantics: `1` = semifinal (or the lone final in a 2-team
  bracket), `2` = championship, `3` = 3rd-place match.

## Derived type — TeamStanding

Not stored; produced by `computeStandings()` (see [Standings](./05-standings.md)):

```ts
interface TeamStanding {
  teamId; teamName; teamColor;
  wins; losses; ties;
  gamesPlayed;
  pointsFor; pointsAgainst; diff;  // diff = pointsFor - pointsAgainst
  rank;                            // 1-based, after sorting + tiebreaks
}
```

## Entity-relationship diagram

```
┌──────────────┐ 1      * ┌──────────────┐ 1      * ┌──────────────┐
│   Division   │─────────▶│     Team     │─────────▶│    Player    │
│  phase       │          │  color       │          │  status      │
│  courtCount  │          │  maxGames    │          │  linkGroup ──┼──┐ (peers move
│  targetGames │          │  evadeTeamIds│          │  teamId(null=│  │  together)
└──────┬───────┘          └──────┬───────┘          │   free agent)│◀─┘
       │ 1                       │  ▲                └──────────────┘
       │                         │  │ home/awayTeamId
       │ *                       │  │
┌──────▼───────────────────────-┴──┴──┐
│              Match                    │
│  isFinals (RR vs bracket)            │
│  roundNumber / finalsRound           │
│  status / scores / courtNumber       │
└──────────────────────────────────────┘
```
</content>
