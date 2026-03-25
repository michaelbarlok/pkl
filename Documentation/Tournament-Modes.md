# Tournament Modes — Gameplay Process

Complete start-to-finish process for all three tournament formats: Single Elimination, Double Elimination, and Round Robin (Pool Play → Bracket).

---

## Overview

Tournaments support three formats, each with a distinct bracket structure but sharing the same creation, registration, and scoring workflows. All tournaments support multiple skill/age/gender divisions, doubles or singles play, co-organizers, and waitlist management.

---

## Part 1: Tournament Lifecycle (All Formats)

### Step 1: Create the Tournament

**Who can create:** Any logged-in user.

**Go to:** Tournaments → New Tournament

**Required fields:**
- Tournament Name (max 120 characters)
- Format: **Single Elimination**, **Double Elimination**, or **Round Robin**
- Type: **Singles** or **Doubles**
- Divisions (at least 1): Choose from 24 combinations:
  - Gender: Men's, Women's, Mixed
  - Age: All Ages, Senior (60+)
  - Skill: 3.0, 3.5, 4.0, 4.5+
- Start Date
- Location

**Optional fields:**
- Description, End Date, Start Time
- Player/Team Cap (overall tournament limit)
- Max Teams Per Division (excess goes to waitlist)
- Entry Fee (text field, not payment processing)
- Registration Opens At / Closes At (datetime windows)

**Round Robin additional settings:**
- Score to Win Pool (default 11) — points to win a pool play game
- Score to Win Playoff (default 11) — points to win a playoff game
- Finals Best 2 of 3 — championship match requires winning 2 games

**Result:** Tournament created in **Draft** status. Creator is the primary organizer.

---

### Step 2: Open Registration

The organizer clicks **"Open Registration"** on the tournament page.
- Status changes: `draft` → `registration_open`
- Players can now see and register for the tournament

---

### Step 3: Player Registration

**Players register by:**
1. Visiting the tournament page
2. Selecting their division
3. For doubles: optionally selecting a partner
4. Clicking **Register**

**Capacity logic (checked in order):**
1. If `max_teams_per_division` is set → check division count → waitlist if full
2. If `player_cap` is set → check total tournament count → waitlist if full
3. Otherwise → confirmed

**Waitlist:**
- Players get a waitlist position number
- When a confirmed player withdraws, the first waitlisted player in that division is auto-promoted
- Promoted player (and partner, for doubles) receives a notification

---

### Step 4: Close Registration

The organizer clicks **"Close Registration"**.
- Status changes: `registration_open` → `registration_closed`
- No more registrations accepted
- The **Division Review** panel appears

---

### Step 5: Division Review

The organizer reviews each division before generating brackets.

**What's shown per division:**
- Division name (e.g., "Men's All Ages 3.5")
- Player count and player names
- Warning if below minimum (3 for Round Robin, 4 for Elimination)

**Available actions:**

**Merge Divisions:**
1. Check 2+ divisions
2. Click **Merge** — all registrations move to the first selected division
3. Source divisions are removed

**Cancel Division:**
- Withdraw all registrations in that division
- Remove the division

**Round Robin pool configuration** (only for RR format):
- Each division shows its pool structure:
  - 3-7 teams → 1 pool
  - 8-14 teams → 2 pools (with pool sizes shown)
  - 15+ teams → pools of ~5 (with pool count and sizes shown)
- Organizer sets **number of rounds** per division (1 to max)
  - Max = largest pool size - 1
  - Defaults to maximum (full round robin)
- For 15+ team divisions, a note shows: "Top 2 per pool advance to bracket"

---

### Step 6: Generate Brackets

The organizer clicks **"Generate Brackets"**.

**What happens:**
1. Each division's confirmed registrations are fetched (ordered by seed, then registration date)
2. Brackets are generated per division based on the tournament format
3. All matches are inserted into the database
4. Bye matches are auto-completed (winner = the non-bye player)
5. Tournament status changes: `registration_closed` → `in_progress`

From here, the flow diverges by format.

---

## Part 2: Single Elimination

### Bracket Structure

- Bracket size rounds up to the next power of 2
- Total rounds = log2(bracket size)
- Standard seeding: #1 vs #N, #2 vs #(N-1), etc.
- Top seeds get first-round byes when the team count isn't a power of 2

**Example (6 teams, bracket size = 8):**
```
Round 1 (Quarterfinals):
  #1 vs BYE → #1 advances
  #4 vs #5
  #2 vs BYE → #2 advances
  #3 vs #6

Round 2 (Semifinals):
  #1 vs Winner(4v5)
  #2 vs Winner(3v6)

Round 3 (Final):
  SF Winner vs SF Winner
```

### Match Play Flow

1. Organizer views the bracket (tab per division if multiple)
2. For each pending match with both players assigned:
   - Click **"Enter Score"**
   - Enter the game score (e.g., 11-7)
   - Click **"Save Score"**
3. The winner automatically advances to the next round:
   - Next match = ceil(match_number / 2) in the next round
   - Slot = player1 if match was odd-numbered, player2 if even
4. Repeat until the final is played

### Score Editing

- Click **"Edit"** on any completed match
- Change the scores
- If the winner changes, all downstream matches are updated:
  - The old winner is replaced by the new winner in all later rounds
  - The old loser is replaced by the new loser where applicable

### Tournament Completion

When all matches are completed → status changes to `completed`.

---

## Part 3: Double Elimination

### Bracket Structure

**Winners Bracket:** Same as Single Elimination.

**Losers Bracket:**
- Total losers rounds = 2 × (winners rounds - 1)
- After each winners round (except round 1), losers drop into the losers bracket
- Two types of losers rounds alternate:
  1. **Drop-in round:** Losers from the winners bracket join
  2. **Elimination round:** Remaining losers play each other
- Match count halves every 2 losers rounds

**Grand Final:**
- Winners bracket champion vs. Losers bracket champion
- If winners bracket champion wins → tournament over
- If losers bracket champion wins → a second final is played

### Match Play Flow

1. Winners bracket plays first (same as single elimination)
2. Losers from each winners round feed into the losers bracket
3. Losers bracket matches are played
4. Grand final is played once both brackets produce a champion
5. Scoring and advancement work the same as single elimination

---

## Part 4: Round Robin (Pool Play → Bracket)

This is the most complex format with two distinct phases.

### Phase 1: Pool Play

#### Pool Structure

| Teams in Division | Pools | How They're Split |
|-------------------|-------|-------------------|
| 3-7 | 1 pool | All teams in one pool |
| 8-14 | 2 pools | Split evenly (e.g., 10 teams → 5 and 5) |
| 15+ | ~5 per pool | Math.round(teams/5) pools, distributed evenly |

**Examples for 15+ teams:**

| Teams | Pools | Pool Sizes |
|-------|-------|------------|
| 15 | 3 | 5, 5, 5 |
| 16 | 3 | 6, 5, 5 |
| 17 | 3 | 6, 6, 5 |
| 18 | 4 | 5, 5, 4, 4 |
| 19 | 4 | 5, 5, 5, 4 |
| 20 | 4 | 5, 5, 5, 5 |

Teams are **randomly shuffled** before being assigned to pools.

#### Match Generation (Circle Method)

Within each pool, matches are generated using the **circle method**:
1. If odd number of players, add a dummy "BYE" player
2. Fix player 0 in position, rotate all other players each round
3. Pair: player[i] vs player[n-1-i]
4. Generate matches for the configured number of rounds (set by organizer)

**Full round robin** (all teams play all others) requires (pool_size - 1) rounds.
The organizer can choose fewer rounds for time constraints.

#### Pool Play Scoring

For each pool match:
1. Organizer clicks **"Enter Score"**
2. Enters the game score (e.g., 11-8)
3. Score to win is configurable (default 11, shown on match cards)
4. Click **"Save Score"**

#### Pool Standings

Standings are calculated live as scores are entered:

| Column | Description |
|--------|-------------|
| # | Rank |
| Team | Player/team name |
| W | Wins |
| L | Losses |
| +/- | Point differential (cumulative points scored minus points allowed) |

**Sorting:** Wins (descending), then point differential (descending).

Bye matches are excluded from standings.

---

### Phase 2: Advancement to Playoffs

When all non-bye pool matches are completed, the organizer sees a **"Pool Play Complete"** message.

#### Step 1: Review Advancement

Click **"Review Advancement"**. The system proposes seedings:

**For 1 pool (3-7 teams):**
- Top 4 teams advance (or all if fewer than 4)
- Seeded by standings

**For 2 pools (8-14 teams):**
- Top 3 from each pool (6 total)
- Re-ranked across pools by wins, then point differential

**For 3+ pools (15+ teams):**
- Top 2 from each pool
- Ranked across all pools by wins, then point differential

#### Step 2: Adjust Seeding (Optional)

The organizer sees the proposed seeding list with:
- Seed number (#1, #2, etc.)
- Team name
- Record (e.g., 3W-1L)
- Point differential (e.g., +12)
- Up/down arrows to manually reorder

The organizer can adjust seeds if they disagree with the automatic ranking.

#### Step 3: Confirm & Generate Playoffs

Click **"Confirm & Generate Playoffs"**.

The playoff bracket is generated based on the number of advancing teams:

---

### Playoff Bracket Structures

#### 4-Team Playoff (from single pool)

```
Round 1 (Semifinals):
  #1 seed vs #4 seed
  #2 seed vs #3 seed

Round 2:
  Match 1: Championship (SF winners)
  Match 2: 3rd Place Game (SF losers)
```

#### 6-Team Playoff (from two pools)

```
Round 1 (Quarterfinals):
  #3 seed vs #6 seed
  #4 seed vs #5 seed
  (#1 and #2 seeds have a first-round bye)

Round 2 (Semifinals):
  #1 seed vs Winner of QF1 (3v6)
  #2 seed vs Winner of QF2 (4v5)

Round 3:
  Match 1: Championship (SF winners)
  Match 2: 3rd Place Game (SF losers)
```

#### 8+ Team Playoff (from 15+ team divisions)

Standard single-elimination bracket with byes for top seeds (if not a power of 2), plus a 3rd place game in the final round.

**Example (8 teams advancing from 4 pools of 5):**
```
Round 1 (Quarterfinals):
  #1 vs #8
  #4 vs #5
  #2 vs #7
  #3 vs #6

Round 2 (Semifinals):
  QF winners

Round 3:
  Match 1: Championship
  Match 2: 3rd Place Game
```

---

### Playoff Scoring

- Score to win: organizer-configured (default 11, can differ from pool play)
- **Best-of-3 Championship** (if enabled):
  - Enter scores for each game (2-3 games)
  - A team must win 2 games to win the match
  - UI shows a tennis-style scoreboard with G1, G2, G3 columns
  - Maximum 3 games allowed

### Winner Advancement in Playoffs

- **Quarterfinal winners** advance to semifinals
  - For 6-team bracket: QF winners fill the player2 slot of their respective SF match
  - For 8+ team bracket: standard single-elim (ceil(match/2) in next round)
- **Semifinal winners** advance to the Championship (match 1 in final round)
- **Semifinal losers** are routed to the 3rd Place Game (match 2 in final round)

---

### Results Display

When the championship and 3rd place games are both completed:
- 1st place (championship winner)
- 2nd place (championship loser)
- 3rd place (3rd place game winner)

Results are displayed with medal icons at the top of the division view.

---

## Part 5: Score Entry Details (All Formats)

### Who Can Score

Only tournament **organizers** (creator + co-organizers) can enter and edit scores.

### Entering a Score

1. Match must have both players/teams assigned (not TBD)
2. Match cannot be a bye
3. Click **"Enter Score"**
4. Enter numeric scores for each team
5. System determines winner (higher score)
6. Click **"Save Score"**

### Editing a Score

1. Click **"Edit"** on a completed match
2. Existing scores pre-populate
3. Modify and save
4. If the winner changes:
   - All downstream matches in the same bracket/division are updated
   - Previous winner references are replaced with the new winner
   - Previous loser references are replaced with the new loser
   - This cascades through all subsequent rounds

### Best-of-3 (Round Robin Finals Only)

1. Form starts with 2 game rows
2. Enter scores per game
3. **"+ Add Game 3"** button if needed
4. Validation: one team must win 2 games
5. Display: tennis-style scoreboard showing all game scores

---

## Part 6: Co-Organizer Management

### Adding Co-Organizers

1. Tournament creator goes to the tournament page
2. Search for a player by name
3. Click **Add** to make them a co-organizer

### Co-Organizer Permissions

| Action | Creator | Co-Organizer |
|--------|---------|--------------|
| Enter/edit match scores | Yes | Yes |
| Manage divisions (merge/cancel) | Yes | Yes |
| Generate brackets | Yes | Yes |
| Advance to playoffs (RR) | Yes | Yes |
| Mark tournament complete | Yes | Yes |
| Add/remove co-organizers | Yes | No |
| Edit tournament settings | Yes | No |
| Delete tournament | Yes | No |

---

## Part 7: Tournament Status Flow

```
DRAFT
  │
  ▼  Organizer: "Open Registration"
REGISTRATION_OPEN
  │
  ▼  Organizer: "Close Registration"
REGISTRATION_CLOSED
  │  ← Division Review (merge, cancel, configure pool rounds)
  │
  ▼  Organizer: "Generate Brackets"
IN_PROGRESS
  │  ← Score entry, bracket advancement
  │  ← (Round Robin: "Advance to Playoffs" mid-tournament)
  │
  ▼  All matches completed
COMPLETED

At any point:
  → Organizer: "Cancel Tournament" → CANCELLED
```

---

## Division System

Each tournament can have multiple independent divisions. Each division:
- Has its own registrations and player pool
- Gets its own bracket/pool play
- Runs independently (different team counts, different advancement)
- Is displayed as a tab in the bracket view

**Available divisions (24 total):**
- 3 genders × 2 age groups × 4 skill levels
- Example: "Women's Senior 4.0", "Mixed All Ages 3.5"
