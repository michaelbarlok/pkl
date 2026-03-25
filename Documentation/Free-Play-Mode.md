# Free Play Mode — Gameplay Process

Complete start-to-finish process for how Free Play mode works.

---

## Overview

Free Play is a drop-in format for casual pickleball sessions. An admin creates a session, checks in the players who are present, and the system generates doubles matches with automatic partner rotation. Scores are entered after each round, and the system generates new rounds with fresh partner pairings until the organizer ends the session.

---

## Step 1: Group Setup

Before Free Play can be used, a group must exist with `group_type = free_play`.

1. Go to **Groups → New Group**
2. Select **Free Play** as the group type
3. Configure group settings:
   - Group name, description, location
   - Visibility: public or private
   - Rolling sessions count (default 14) — how many recent sessions count toward the leaderboard

---

## Step 2: Start a Session

**Who can start:** Any group member.

**Where:** Navigate to the group page → click **Start Session** (or go to the group's session page).

### Check-In Phase

1. The system displays a list of all group members with checkboxes
2. The organizer checks off every player who is physically present
3. A **"Select All"** option is available for convenience
4. **Minimum 4 players** are required to start
5. Click **"Start Session"**

### What Happens Behind the Scenes

1. The system verifies no active session already exists for this group (one at a time)
2. The first round of matches is auto-generated using the partner rotation algorithm
3. A `free_play_sessions` record is created with `status = active`
4. All checked-in players are recorded in `free_play_session_players`

---

## Step 3: Court Assignment & Match Generation

### How Courts Are Calculated

```
Number of courts = floor(players / 4)
Players on courts = courts × 4
Players sitting out = total players - players on courts
```

**Examples:**

| Players | Courts | Playing | Sitting Out |
|---------|--------|---------|-------------|
| 4 | 1 | 4 | 0 |
| 5 | 1 | 4 | 1 |
| 6 | 1 | 4 | 2 |
| 7 | 1 | 4 | 3 |
| 8 | 2 | 8 | 0 |
| 9 | 2 | 8 | 1 |
| 10 | 2 | 8 | 2 |
| 12 | 3 | 12 | 0 |

### Who Sits Out

The system uses a **no-consecutive-sitting** rule:
1. Players who sat out last round get priority to play this round
2. Sitters are chosen from those who played last round (randomized)
3. This minimizes anyone sitting out two rounds in a row

### Partner Rotation Algorithm

The goal is to **minimize repeat partnerships** across rounds.

1. Take all players assigned to play this round
2. Run up to **50 random shuffle attempts**
3. For each shuffle, group players in consecutive groups of 4:
   - Players [0,1] are Team A on Court 1
   - Players [2,3] are Team B on Court 1
   - Players [4,5] are Team A on Court 2
   - etc.
4. **Score each shuffle** by summing the partner history counts:
   - If Player A and Player B have been partners 2 times before, add 2 to the score
   - Lower score = fewer repeat partnerships
5. Select the shuffle with the **lowest score**
6. **Early exit:** If any shuffle scores 0 (no repeat partnerships), use it immediately

### Partner History Tracking

- The system tracks every partnership as a pair key (e.g., `"playerA|playerB"`)
- The count increments each time two players are on the same team
- This history persists across all rounds within the session
- The history is stored in the session's `current_round` JSONB field

---

## Step 4: Play the Round

### What Players See

- Each court is displayed as a card showing:
  - **Team A:** Player 1 & Player 2
  - **Team B:** Player 3 & Player 4
- Players sitting out are listed separately
- Players go play their assigned matches on the physical courts

---

## Step 5: Enter Scores

After all courts finish playing:

1. The organizer enters scores for each court:
   - Team A score (number)
   - Team B score (number)
2. Click **"Submit Scores & Next Round"** (or **"Submit Scores & End"**)

### What Happens Behind the Scenes

1. Each match is saved to the `free_play_matches` table with:
   - All 4 player IDs
   - Both team scores
   - Round number and session reference
2. The partner history is updated with the new pairings
3. A new round is generated using the updated partner history
4. The session's round number increments

---

## Step 6: Repeat Rounds

Steps 3-5 repeat for as many rounds as the group wants to play. Each round:
- Generates new court assignments
- Rotates partners (minimizing repeats)
- Rotates who sits out (no back-to-back sitting)
- Tracks cumulative standings

### Live Standings

During the session, standings are available showing:
- Each player's wins and losses for this session only
- Point differential
- Sorted by: wins (descending), then point differential (descending)

---

## Step 7: End the Session

The organizer can end the session in two ways:

### Option A: Submit Final Scores & End
1. Enter scores for the current round
2. Click **"Submit Scores & End Session"**
3. Final round matches are saved, then session is completed

### Option B: End Without Final Scores
1. Click **"End Session"** without entering scores
2. The current (unscored) round is discarded
3. Session is completed with all previously scored rounds

### What Happens on Completion

- Session status changes to `completed`
- `ended_at` timestamp is set
- `current_round` is cleared (set to null)
- All match results are permanently stored
- Leaderboard automatically reflects the new data

---

## Stats & Leaderboard

### How Stats Are Calculated

Stats are computed from `free_play_matches` with these filters:
1. Only matches within the **rolling sessions window** (default: last 14 sessions)
2. Only matches **after the stats reset date** (if a reset was performed)

### Per-Player Stats

| Stat | Calculation |
|------|-------------|
| Wins | Matches where the player's team scored higher |
| Losses | Matches where the player's team scored lower |
| Point Differential | Sum of (own team score - opponent score) across all matches |
| Win Percentage | (Points won / total points possible) × 100 |

### Leaderboard Sorting

Players are ranked by:
1. **Wins** (descending)
2. **Point Differential** (descending)
3. **Win Percentage** (descending)

### Stats Reset

An admin can reset the leaderboard:
- Go to group settings → **Reset Stats**
- Sets a `stats_reset_at` timestamp on the group
- All matches before this timestamp are excluded from the leaderboard
- Historical data is preserved (not deleted), just filtered out

---

## Session Data Structure

### Round JSONB (stored on session)

```json
{
  "roundNumber": 1,
  "matches": [
    {
      "teamA": ["player-id-1", "player-id-2"],
      "teamB": ["player-id-3", "player-id-4"],
      "scoreA": null,
      "scoreB": null
    }
  ],
  "sitting": ["player-id-5"],
  "partnerHistory": {
    "id1|id2": 1,
    "id3|id4": 1
  },
  "previousSitting": ["player-id-5"]
}
```

---

## Constraints & Rules

- **One active session per group** at a time
- **Minimum 4 players** to start a session
- **All group members** can start, advance, and end sessions (not just admins)
- **No dispute system** — scores are entered in good faith by the organizer
- **No singles support** in sessions — always doubles (4 players per court)
- **No player add/remove mid-session** — roster is locked at session start
