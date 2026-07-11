# 06 — Finals & Brackets

Bracket logic is in **`src/lib/bracket.ts`**; the UI and the auto-generation /
repair behavior are in **`src/features/finals/components/FinalsPage.tsx`**. Store
actions: `startFinals`, `generateFinals`, `setManualWinner`, `advancePhase`.

## Starting finals

When the round-robin is complete, **Start Finals** opens a dialog to pick the
bracket size. `startFinals(divisionId, advancingCount)`:

- Reads `getStandings(divisionId)` and seeds the top `advancingCount` teams.
- Calls `generateBracket(...)` and writes the matches.
- Removes any pre-existing finals matches first (so restarting finals never
  duplicates).
- Sets `phase = 'finals'` and stores `advancingTeamCount`.

Only **2** or **4** are offered (4 requires ≥4 active teams).

## Bracket shapes (`generateBracket`)

### 2-team bracket — single final

One match: **#1 vs #2**, `finalsRound: 1`. There is no separate championship
match — this lone `finalsRound 1` match *is* the championship (the UI calls it the
"Final").

### 4-team bracket — semis + final + 3rd place

Two semifinals, both `finalsRound: 1`:

- Semi (court 1): **#1 vs #4**
- Semi (court 2): **#2 vs #3**

The **Championship** (`finalsRound: 2`) and **3rd Place** (`finalsRound: 3`)
matches are *not* created up front — they're generated after both semis finish.

## Generating the final round (`generateFinalRound` / `generateFinals`)

Once both semis are `completed`:

- Winners advance to the **Championship** (`finalsRound 2`).
- Losers drop to the **3rd Place** match (`finalsRound 3`).

If a semi is **tied**, a winner can't be derived from the score — an organizer
pick (`manualWinnerId`) is required, supplied via the `manualWinners` map or
already persisted on the match. Without a pick for a tied semi, `generateFinalRound`
returns nothing and the UI prompts for the pick.

`generateFinals` also **replaces** any existing `finalsRound ≥ 2` matches rather
than stacking duplicates — important for the regeneration cases below.

## Winner resolution (`resolveMatchWinner`)

The single source of truth for "who won a match", used by FinalsPage, the
Scoreboard, and final-round generation:

```ts
resolveMatchWinner(match):
  not completed            -> null
  missing a score          -> null
  tied                     -> match.manualWinnerId ?? null   // needs organizer pick
  otherwise                -> higher score's team
```

## FinalsPage behavior

The page is largely **automatic**:

- **Auto-generate**: when semis complete with decided (non-tied) winners and the
  final round doesn't exist yet, it calls `generateFinals` automatically.
- **Tied semis**: shows a picker per tied semi ("which team advances"); on confirm
  it persists the picks and generates the final round.
- **Stale bracket detection**: if a semi result is *corrected* after the final
  round already exists, the page compares the expected winners/losers against the
  current championship/3rd-place pairings. If they no longer match:
  - and the final round is **untouched** (no scores entered) → it **auto-repairs**
    by regenerating;
  - and the final round **has scores** → it shows a "Semifinal Results Changed"
    warning with a manual **Regenerate Final Round** button (which warns that
    entered final-round scores will be discarded).
- **Tied championship**: shows a picker to choose the champion via
  `setManualWinner`.
- **Champion banner**: once a champion is resolved, shows the team and a **Mark
  Division Complete** button (`advancePhase(id, 'complete')`).

## finalsRound cheat-sheet

| `finalsRound` | Meaning | Bracket sizes |
|---------------|---------|---------------|
| `1` | Semifinal (4-team) **or** the lone Final (2-team) | both |
| `2` | Championship | 4-team only |
| `3` | 3rd Place | 4-team only |

## End-to-end (4-team) flow

```
standings ──seed top 4──▶ Semi(#1v#4), Semi(#2v#3)   [finalsRound 1]
        play semis
            │ both completed, winners decided (or ties resolved by organizer)
            ▼
   Championship(W1 v W2)  [finalsRound 2]
   3rd Place  (L1 v L2)  [finalsRound 3]
        play championship
            │ decided (or tie resolved by organizer)
            ▼
   Champion banner ──▶ Mark Complete ──▶ phase = 'complete'
```
</content>
