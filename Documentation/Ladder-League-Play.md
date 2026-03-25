# Ladder League Play — Gameplay Process

Complete start-to-finish process for how Ladder League (Shootout) mode works.

---

## Overview

Ladder League is a structured competitive format where players are organized into **steps** (skill levels, 1-10) and compete in pools on numbered courts. After each round, players move up or down courts based on their pool finish — winners move toward Court 1 (stronger competition), last-place finishers move down. Over multiple sessions, player steps and ELO ratings adjust to reflect true skill level.

---

## Step 1: Group Setup

### Create a Ladder League Group

1. Go to **Groups → New Group**
2. Select **Ladder League** as the group type
3. Configure group settings:
   - Name, description, location
   - Visibility: public or private

### Configure Group Preferences

Group admins can set these under group settings:

| Setting | Description | Default |
|---------|-------------|---------|
| Step Window Percentages | Range of steps that play together | Varies |
| New Player Starting Step | What step new members begin at | 5 |
| Step Move Up | Steps gained for 1st place finish | 1 |
| Step Move Down | Steps lost for last place finish | 1 |
| Game Limits per Court Size | Number of games per round | Varies |
| Win-by-2 | Whether games require winning by 2 | Off |
| Rolling Sessions Count | How many recent sessions count for stats | 14 |

---

## Step 2: Create a Signup Sheet

An admin creates a signup sheet to schedule a play date.

**Sheet fields:**
- Event date and time
- Player limit (how many can play)
- Court count
- Signup window (when registration opens)
- Withdraw window (deadline to withdraw)
- Guest allowance (can members bring guests?)
- Notification settings

**Sheet status:** `open` → `closed` → `cancelled`

---

## Step 3: Player Registration

### Signing Up

1. Players visit the sheet page
2. Click **"Sign Up"**
3. If spots available → status = `confirmed`
4. If sheet is full → status = `waitlist` with a position number

### Registration Priority

Each registration has a priority level: `high`, `normal`, or `low`.
- Admins can adjust priority via the roster view
- Priority affects waitlist promotion order

### Waitlist Promotion

When a confirmed player withdraws:
1. The system finds the first waitlisted player (ordered by priority, then waitlist position)
2. That player is automatically promoted to `confirmed`
3. Remaining waitlist positions are resequenced
4. The promoted player receives a notification (email + push)

---

## Step 4: Session Start — Check-In

On the day of play, the admin starts a session from the sheet.

### Check-In Phase

1. The admin opens the check-in screen
2. All confirmed players from the sheet are shown
3. The admin checks off who is physically present
4. **Minimum 4 players** required to proceed
5. Click **"Start Session"**

### What Happens

- A `shootout_session` is created with status `checking_in`
- `session_participants` records are created for all checked-in players
- Each participant's current step, win percentage, and other stats are captured

---

## Step 5: Seeding — Court Assignment

After check-in, players are assigned to courts. The seeding strategy depends on whether this is the first session of the day.

### Session 1 (First Session of the Day)

Players are sorted by their **ranking sheet order**:
1. **Step** (ascending — lower step = stronger)
2. **Win Percentage / Point Percentage** (descending)
3. **Last Played** (descending — more recent = better tiebreaker)
4. **Total Sessions** (descending)

Sorted players are distributed to courts sequentially:
- Best players → Court 1
- Next group → Court 2
- And so on

### Session 2+ (Same Day, After Previous Session)

Players who played in the previous session are **anchored** to their target court (determined by their pool finish in the last session):

1. **Anchored players** are placed on their assigned target court (immovable)
2. **Non-anchored players** (new joiners) are sorted by ranking sheet order and fill remaining spots
3. If a court overflows, non-anchored players shift to the next court
4. Anchored players never move during this process

### Court Size Rules

| Rule | Value |
|------|-------|
| Minimum per court | 4 players |
| Maximum per court | 5 players |
| Extra players | Go to lower-numbered (stronger) courts first |

**Example distributions:**

| Players | Courts | Distribution |
|---------|--------|-------------|
| 8 | 2 | [4, 4] |
| 9 | 2 | [5, 4] |
| 10 | 2 | [5, 5] |
| 12 | 3 | [4, 4, 4] |
| 13 | 3 | [5, 4, 4] |
| 16 | 4 | [4, 4, 4, 4] |
| 18 | 4 | [5, 5, 4, 4] |
| 20 | 4 | [5, 5, 5, 5] |

---

## Step 6: Round Play

### Match Generation

For each court/pool, the system generates doubles matchups:

**For 4-player courts:**
- 3 possible team pairings are evaluated
- The system selects the pairing that **minimizes repeat partnerships** from earlier rounds
- Example: Players A, B, C, D → possible pairings are AB vs CD, AC vs BD, AD vs BC

**For 5-player courts:**
- One player sits out each game
- Pairings rotate so all players participate

**Partnership tracking:**
- A bidirectional pairing map tracks which players have been partners
- Each round updates the map to prevent the same partnerships repeating

### Playing the Games

Players play their assigned matches on the physical courts. The number of games per round is configured in group preferences.

---

## Step 7: Score Entry

After the round finishes, the admin enters scores.

### Score Submission

1. Go to the session's scoring page
2. For each court, enter the game results:
   - Team A score vs Team B score (per game)
3. Click **"Submit Scores"**

### Score Confirmation

- Scores can be confirmed or disputed by players
- The admin has final say on disputed scores

---

## Step 8: Pool Rankings

After scores are entered, each court's pool is ranked using these tiebreakers (in order):

| Priority | Tiebreaker | Direction |
|----------|-----------|-----------|
| 1 | **Wins** | Most wins first |
| 2 | **Point Differential** | Highest diff first |
| 3 | **Head-to-Head Points** | Points scored against the specific tied opponent |
| 4 | **Overall Ranking** | Step (lower = better), then Point % (higher = better) |

---

## Step 9: Court Movement

Based on pool finish, players are assigned their target court for the next round/session:

| Pool Finish | Court Movement |
|-------------|---------------|
| **1st place** | Move UP one court (court number - 1) |
| **Middle finishers** (2nd through 2nd-to-last) | Stay on same court |
| **Last place** | Move DOWN one court (court number + 1) |

**Boundaries:**
- Court 1 winners stay on Court 1 (can't move higher)
- Last court losers stay on the last court (can't move lower)

**Example with 4 courts:**

| Player | Current Court | Finish | Next Court |
|--------|--------------|--------|------------|
| Alice | Court 2 | 1st | Court 1 |
| Bob | Court 2 | 2nd | Court 2 |
| Carol | Court 2 | 3rd | Court 2 |
| Dave | Court 2 | 4th (last) | Court 3 |

---

## Step 10: Step Movement

After each session, player steps adjust based on pool finish:

| Pool Finish | Step Change |
|-------------|------------|
| **1st place** | Step decreases by `stepMoveUp` (default 1) — gets better |
| **Middle finishers** | No change |
| **Last place** | Step increases by `stepMoveDown` (default 1) — gets worse |

**Step boundaries:**
- Minimum step: 1 (best possible)
- No maximum cap

**Example:**

| Player | Current Step | Finish | New Step |
|--------|-------------|--------|----------|
| Alice | 5 | 1st | 4 |
| Bob | 5 | 2nd | 5 |
| Carol | 5 | 3rd | 5 |
| Dave | 5 | 4th (last) | 6 |

---

## Step 11: Multiple Rounds in a Session

Steps 6-10 can repeat multiple times within a single session:

1. Generate round matchups
2. Play games
3. Enter scores
4. Rank pools and calculate movement
5. Redistribute players to courts based on target courts
6. Repeat

Each subsequent round within the same session uses the updated court assignments from the previous round.

---

## Step 12: Session Completion

When the admin ends the session:

1. **Final pool finishes** are computed for each player
2. **Steps are updated** based on the final round's results
3. **Target courts** are saved for the next session
4. **ELO ratings are updated** (see below)
5. **Player profiles are updated** with:
   - New step value
   - Updated win percentage
   - Incremented total sessions count
   - Last played timestamp
   - Target court for next session

---

## ELO Rating System

### How ELO Works

Every player has an internal ELO rating (800-2200) that is displayed as a 2.0-5.0 USAP rating.

| Internal ELO | Display Rating |
|-------------|---------------|
| 800 | 2.0 |
| 1100 | 2.65 |
| 1500 | 3.5 |
| 1800 | 4.15 |
| 2200 | 5.0 |

**Starting ELO:** 1500 (displays as ~3.5)

### Rating Updates After Games

For each doubles game:

1. **Calculate team averages:**
   - Team 1 avg = (Player 1 ELO + Player 2 ELO) / 2
   - Team 2 avg = (Player 3 ELO + Player 4 ELO) / 2

2. **Calculate expected score:**
   ```
   Expected = 1 / (1 + 10^((opponent_avg - team_avg) / 400))
   ```

3. **Calculate rating change:**
   ```
   Delta = K × (actual - expected)
   ```
   Where K = 32, actual = 1 for win, 0 for loss

4. **Weaker-player weighting** (within a team):
   - If the ELO spread between teammates is < 50: even split
   - If spread >= 50: the weaker player gets a larger share of the delta
   - Asymmetry factor = min(0.3, spread / 1000)
   - Weaker player: delta × (1 + factor)
   - Stronger player: delta × (1 - factor)

**Example:** Team wins with ratings [1600, 1400]:
- Spread = 200, factor = 0.2
- If base delta = +5 per player:
  - Player at 1400: +5 × 1.2 = **+6**
  - Player at 1600: +5 × 0.8 = **+4**
- This helps weaker players catch up faster

---

## Stats & Leaderboard

### Ladder Page

The group's ladder page shows all members ranked by step, then win percentage.

### Stats Tracked Per Player

| Stat | Description |
|------|-------------|
| Current Step | 1-10 ladder position |
| Win Percentage | Points scored / points possible |
| Point Differential | Cumulative points scored - points allowed |
| ELO / Display Rating | 2.0-5.0 USAP-scale rating |
| Total Sessions | Number of sessions played |
| Last Played | Most recent session date |

### Rolling Window

Stats are calculated based on the **rolling sessions count** (default 14). Only the most recent N sessions count toward the leaderboard. This keeps the rankings dynamic and rewards recent play.

### Stats Reset

Admins can reset the leaderboard at any time:
- Sets a `stats_reset_at` timestamp
- All matches before the timestamp are excluded from leaderboard calculations
- Historical data is preserved, just filtered out

---

## Notifications

The system sends notifications at various points:

| Event | Channels |
|-------|----------|
| New sheet created | Email, Push, In-app |
| Signup reminder (before sheet closes) | Email, Push |
| Withdraw reminder (before withdraw deadline) | Email, Push |
| Waitlist promotion | Email, Push, In-app |
| Pool assignment / court assignment | Email |
| Step change | In-app |
| Rating update | In-app |
| Session starting | Push |

---

## Complete Flow Diagram

```
GROUP CREATED (Ladder League)
    ↓
SIGNUP SHEET CREATED
    ↓
PLAYERS REGISTER (Confirmed / Waitlist)
    ↓  ← Waitlist promotions happen automatically on withdrawals
    ↓
SESSION DAY: ADMIN STARTS SESSION
    ↓
CHECK-IN: Mark present players
    ↓
SEEDING: Assign players to courts
    ├─ Session 1: Rank by step → win% → last played → sessions
    └─ Session 2+: Anchor to previous target court, fill gaps with new players
    ↓
ROUND 1: Generate matchups (avoid repeat partners)
    ↓
PLAY GAMES on physical courts
    ↓
ENTER SCORES
    ↓
RANK POOLS: Wins → Point Diff → H2H → Overall Ranking
    ↓
CALCULATE MOVEMENT:
    ├─ 1st place → move up one court, step decreases
    ├─ Middle → stay, step unchanged
    └─ Last place → move down one court, step increases
    ↓
ROUND 2+ (repeat matchups → play → score → rank → move)
    ↓
END SESSION:
    ├─ Finalize steps
    ├─ Update ELO ratings
    ├─ Save target courts for next session
    └─ Update player profiles
    ↓
NEXT SESSION (same day or new day)
    └─ Players anchor to their earned court positions
```
