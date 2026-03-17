# Free Play — Complete Feature Documentation

Free Play is a casual game mode where groups track wins, losses, and point differentials across rotating doubles matches. Unlike Ladder League (which uses step-based rankings), Free Play focuses on simple W/L standings with automatic partner rotation.

---

## 1. Creating a Free Play Group

**Page:** `/groups/new`
**Files:** `app/(app)/groups/new/page.tsx`, `app/(app)/groups/new/create-group-form.tsx`

### Form Fields

| Field | Required | Notes |
|-------|----------|-------|
| Group Name | Yes | Auto-generates a URL slug |
| Description | No | Shown on group page |
| City | No | Location display |
| State | No | Dropdown of US states |
| Group Type | Yes | **Free Play** or Ladder League |
| Visibility | Yes | **Public** (anyone can find/join) or **Private** (invite-only) |

When "Free Play" is selected, the Ladder Settings section (win % window, step ranges, game limits, etc.) is hidden — those settings only apply to Ladder League groups.

### What Happens on Submit

1. A row is inserted into `shootout_groups` with `group_type = 'free_play'`.
2. A database trigger (`auto_create_group_preferences`) auto-creates a default `group_preferences` row (not used for Free Play, but created for all groups).
3. The creator is automatically added to `group_memberships` with `group_role = 'admin'`.
4. The user is redirected to the new group's page.

---

## 2. Joining a Free Play Group

**Files:** `app/(app)/groups/[slug]/page.tsx` (JoinButton), `app/(app)/groups/page.tsx` (group list)

### Join Paths

| Where | Who Sees It | What Happens |
|-------|-------------|--------------|
| Group detail page | Logged-in non-members (public groups or via invite token) | "Join Group" button inserts membership, redirects to refresh |
| Groups browse list | Logged-in non-members (public groups only) | "Join Group" button inserts membership, revalidates list |
| Private group invite link | Anyone with a valid `?token=` URL | Token grants page access, then normal join flow |

Members are inserted into `group_memberships` with `group_role = 'member'` (default), `current_step = 5`, `win_pct = 0`, `total_sessions = 0`.

---

## 3. Group Page (Free Play View)

**File:** `app/(app)/groups/[slug]/page.tsx`

When a member views a Free Play group page, they see:

- **Header:** Group name, location, description, visibility badge, "Member" badge, Invite button, Forum link
- **Stats cards:** Member count, upcoming events, link to full standings
- **Action buttons:** "Start Session" (or "Continue Session" if one is active), "Reset Stats"
- **Standings table** (`FreePlayLeaderboard` component): Rank, Player, W, L, Win %, Pt Diff — sorted by wins desc, then point diff desc
- **Recent Matches:** Last 10 matches showing team names and scores
- **Members table:** All group members listed

### Permissions

All group members have equal permissions in Free Play:

| Action | Who Can Do It |
|--------|---------------|
| Start a session | Any member |
| Submit scores | Any member |
| Advance rounds | Any member |
| End a session | Any member |
| Reset stats | Any member |
| Invite players | Any member |

---

## 4. Session Lifecycle

### Phase 1: Check-In

**File:** `app/(app)/groups/[slug]/session/session-manager.tsx` (CheckInPhase component)

When no active session exists, the session page shows the check-in screen:

1. All group members are listed with checkboxes.
2. A "Select all" button checks everyone.
3. At least **4 players** must be checked in to start.
4. Clicking "Start Session" calls `POST /api/groups/[id]/sessions`.

**API:** `app/api/groups/[id]/sessions/route.ts`

The API:
1. Verifies the caller is an authenticated group member.
2. Confirms no active session already exists (only one per group).
3. Generates the first round using the free-play engine.
4. Creates a `free_play_sessions` row with `status = 'active'` and the round stored as JSONB in `current_round`.
5. Inserts all checked-in players into `free_play_session_players`.

### Phase 2: Active Play (Rounds)

**File:** `app/(app)/groups/[slug]/session/session-manager.tsx` (ActivePhase component)

Each round displays:

- **Round number** and player count badge
- **Match cards** — one per court, showing:
  - Team A (two player names) on the left
  - Score inputs (number fields) in the center
  - Team B (two player names) on the right
- **Sitting out** — players not assigned to a court this round
- **Two action buttons:**
  - "Submit Scores & Next Round" — saves scores, generates next round
  - "Submit Scores & End Session" / "End Session" — saves scores (if entered) and ends the session

### Phase 3: Session Complete

When a session ends, a summary screen shows the total rounds played and a "Back to Group" link.

---

## 5. Round Generation Engine

**File:** `lib/free-play-engine.ts`

### Core Algorithm: `generateRound(players, previousSitting, partnerHistory)`

**Inputs:**
- `players`: Array of player IDs currently checked in
- `previousSitting`: Player IDs who sat out last round
- `partnerHistory`: Map of partner-pair keys to count of times paired

**How It Works:**

1. **Calculate courts:** `numCourts = floor(playerCount / 4)`. Extra players (1-3) sit out.
2. **Pick sitters:** Players who did NOT sit last round are preferred. This prevents anyone from sitting two rounds in a row (unless fewer than 5 players).
3. **Form matches:** Runs up to 50 random shuffles of the playing group. For each shuffle, groups of 4 are assigned to courts (indices 0-1 vs 2-3, etc.). Each shuffle is scored by summing how many times partners have been paired before. The shuffle with the lowest "repeat partnership" score wins.
4. **Early exit:** If a shuffle scores 0 (no repeat partnerships), it's used immediately.

**Partner Rotation:**

The `partnerHistory` is a `Record<string, number>` where keys are order-independent pair keys (`"idA|idB"` where idA < idB). After each round, partner counts are incremented. This history persists across rounds in the session's `current_round` JSONB field.

### Sitting Out Logic

| Players | Courts | Sitting |
|---------|--------|---------|
| 4 | 1 | 0 |
| 5 | 1 | 1 |
| 6 | 1 | 2 |
| 7 | 1 | 3 |
| 8 | 2 | 0 |
| 9 | 2 | 1 |
| ... | ... | ... |

Players who sat last round won't sit again (unless unavoidable). Selection among eligible sitters is random.

---

## 6. Score Submission & Next Round

**API:** `app/api/groups/[id]/sessions/[sessionId]/next-round/route.ts`

**POST body:** `{ scores: [{ scoreA: number, scoreB: number }, ...] }`

1. Validates scores are provided for every match in the round.
2. Persists each match to `free_play_matches` with:
   - `group_id`, `session_id`, `round_number`
   - `team_a_p1`, `team_a_p2`, `team_b_p1`, `team_b_p2`
   - `score_a`, `score_b`
3. Retrieves checked-in player IDs from `free_play_session_players`.
4. Calls `generateRound()` with updated partner history and previous sitting list.
5. Updates the session's `current_round` JSONB and increments `round_number`.

---

## 7. Ending a Session

**API:** `app/api/groups/[id]/sessions/[sessionId]/end/route.ts`

**POST body:** `{ scores?: [{ scoreA: number, scoreB: number }, ...] }`

Two modes:
- **With scores:** If all scores are filled in, they're persisted as final-round matches before ending.
- **Without scores:** The current round's matches are discarded (not saved).

The session is updated to `status = 'completed'`, `ended_at = now()`, `current_round = null`.

---

## 8. Standings & Leaderboard

**View:** `free_play_player_stats` (database view)
**Query:** `lib/queries/free-play.ts` → `getPlayerStats(groupId)`
**Component:** `app/(app)/groups/[slug]/leaderboard.tsx` → `FreePlayLeaderboard`

### How Stats Are Calculated

The `free_play_player_stats` database view aggregates from `free_play_matches`:

- For each match, every player position (team_a_p1, team_a_p2, team_b_p1, team_b_p2) is checked.
- A **win** is counted when the player's team scored higher.
- A **loss** is counted when the player's team scored lower.
- **Point differential** is the sum of (own team score - opponent score) across all matches.

Stats respect `stats_reset_at`: if a group has reset stats, only matches played after the reset timestamp are included.

### Leaderboard Display

| Column | Description |
|--------|-------------|
| # | Rank (by position in sorted list) |
| Player | Avatar + display name |
| W | Total wins (green) |
| L | Total losses (red) |
| Win % | `wins / (wins + losses) * 100` |
| Pt Diff | Cumulative point differential (green if positive, red if negative) |

Sorting: Wins descending, then point differential descending.

The current user's row is highlighted with a brand-colored background.

---

## 9. Recent Matches

**Query:** `lib/queries/free-play.ts` → `getRecentMatches(groupId, limit)`

Displays the most recent 10 matches on the group page, showing:
- Team A player names vs Team B player names
- Final score (winning score highlighted in green)

Fetched with player profile joins for display names.

---

## 10. Reset Stats

**Button:** `app/(app)/groups/[slug]/reset-stats-button.tsx`
**API:** `app/api/groups/[id]/reset-stats/route.ts`

Resetting stats does NOT delete match data. Instead:

1. Sets `shootout_groups.stats_reset_at = now()`.
2. The `free_play_player_stats` view filters to only include matches where `played_at >= stats_reset_at`.
3. Effectively zeros out the leaderboard while preserving historical data.

The button requires a confirmation click ("Reset all W/L records?" → Confirm / Cancel).

---

## 11. Database Schema

### `free_play_sessions`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| group_id | UUID (FK) | References shootout_groups |
| created_by | UUID (FK) | References profiles |
| status | TEXT | `'active'` or `'completed'` |
| current_round | JSONB | Null when completed; contains round data during play |
| round_number | INTEGER | Starts at 1, increments each round |
| created_at | TIMESTAMPTZ | Auto-set |
| ended_at | TIMESTAMPTZ | Set when session ends |

### `free_play_session_players`

| Column | Type | Notes |
|--------|------|-------|
| session_id | UUID (FK, PK) | References free_play_sessions |
| player_id | UUID (FK, PK) | References profiles |

### `free_play_matches`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| group_id | UUID (FK) | References shootout_groups |
| created_by | UUID (FK) | Who submitted the score |
| session_id | UUID (FK) | Nullable — links to session |
| round_number | INTEGER | Nullable — which round |
| played_at | TIMESTAMPTZ | Default now() |
| team_a_p1 | UUID (FK) | Team A player 1 (required) |
| team_a_p2 | UUID (FK) | Team A player 2 (nullable for 1v1) |
| team_b_p1 | UUID (FK) | Team B player 1 (required) |
| team_b_p2 | UUID (FK) | Team B player 2 (nullable for 1v1) |
| score_a | INTEGER | Team A's score |
| score_b | INTEGER | Team B's score |
| notes | TEXT | Optional |

### `free_play_player_stats` (view)

| Column | Type | Notes |
|--------|------|-------|
| group_id | UUID | |
| player_id | UUID | |
| wins | INTEGER | Matches where player's team won |
| losses | INTEGER | Matches where player's team lost |
| total_point_diff | INTEGER | Sum of point differentials |

### `current_round` JSONB Structure

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

## 12. File Map

| Purpose | File |
|---------|------|
| Group creation form | `app/(app)/groups/new/create-group-form.tsx` |
| Group creation handler | `app/(app)/groups/new/page.tsx` |
| Group detail page | `app/(app)/groups/[slug]/page.tsx` |
| Session page (server) | `app/(app)/groups/[slug]/session/page.tsx` |
| Session manager (client) | `app/(app)/groups/[slug]/session/session-manager.tsx` |
| Leaderboard component | `app/(app)/groups/[slug]/leaderboard.tsx` |
| Reset stats button | `app/(app)/groups/[slug]/reset-stats-button.tsx` |
| Free play engine | `lib/free-play-engine.ts` |
| Free play queries | `lib/queries/free-play.ts` |
| Create session API | `app/api/groups/[id]/sessions/route.ts` |
| Next round API | `app/api/groups/[id]/sessions/[sessionId]/next-round/route.ts` |
| End session API | `app/api/groups/[id]/sessions/[sessionId]/end/route.ts` |
| Reset stats API | `app/api/groups/[id]/reset-stats/route.ts` |
| DB migration (types + matches) | `supabase/migrations/015_group_types.sql` |
| DB migration (sessions) | `supabase/migrations/033_free_play_sessions.sql` |
| TypeScript types | `types/database.ts` |
