# Plan: Add Group Types (Free Play & Ladder League)

## Overview

Add a `group_type` field to groups so each group's match structure is determined by its type. Starting with two types — **Free Play** and **Ladder League** — with the schema designed to easily add more later.

- **Ladder League** = the current shootout system (steps, courts, seeding, win%)
- **Free Play** = open format where any member can create matches, add players, and track simple W-L + point differential per player. No steps, no percentages, no structured rounds.

---

## Step 1: Database Migration — Add `group_type` column

**New file:** `supabase/migrations/015_group_types.sql`

- Create enum type: `group_type_enum` with values `'ladder_league'`, `'free_play'`
- Add column `group_type` to `shootout_groups` table, default `'ladder_league'` (so all existing groups keep working)
- Add `free_play_matches` table for Free Play match tracking:

```sql
CREATE TYPE group_type_enum AS ENUM ('ladder_league', 'free_play');

ALTER TABLE shootout_groups
  ADD COLUMN group_type group_type_enum NOT NULL DEFAULT 'ladder_league';

-- Free Play match tracking (simple W-L + point diff)
CREATE TABLE free_play_matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES shootout_groups(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES profiles(id),
  played_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Team A
  team_a_p1     UUID NOT NULL REFERENCES profiles(id),
  team_a_p2     UUID REFERENCES profiles(id),          -- nullable for singles
  -- Team B
  team_b_p1     UUID NOT NULL REFERENCES profiles(id),
  team_b_p2     UUID REFERENCES profiles(id),          -- nullable for singles
  score_a       INTEGER NOT NULL,
  score_b       INTEGER NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Materialized stats view (or regular view) for Free Play leaderboard
CREATE VIEW free_play_player_stats AS
SELECT
  group_id,
  player_id,
  COUNT(*) FILTER (WHERE won) AS wins,
  COUNT(*) FILTER (WHERE NOT won) AS losses,
  SUM(point_diff) AS total_point_diff
FROM (
  -- Unnest each match into per-player rows
  SELECT group_id, team_a_p1 AS player_id,
    (score_a > score_b) AS won,
    (score_a - score_b) AS point_diff
  FROM free_play_matches
  UNION ALL
  SELECT group_id, team_a_p2, (score_a > score_b), (score_a - score_b)
  FROM free_play_matches WHERE team_a_p2 IS NOT NULL
  UNION ALL
  SELECT group_id, team_b_p1, (score_b > score_a), (score_b - score_a)
  FROM free_play_matches
  UNION ALL
  SELECT group_id, team_b_p2, (score_b > score_a), (score_b - score_a)
  FROM free_play_matches WHERE team_b_p2 IS NOT NULL
) sub
GROUP BY group_id, player_id;

-- RLS: members of the group can read, members can insert
ALTER TABLE free_play_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view free play matches"
  ON free_play_matches FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM group_memberships gm
    WHERE gm.group_id = free_play_matches.group_id
    AND gm.player_id = auth.uid()
  ));

CREATE POLICY "Group members can create free play matches"
  ON free_play_matches FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM group_memberships gm
      WHERE gm.group_id = free_play_matches.group_id
      AND gm.player_id = auth.uid()
    )
  );
```

---

## Step 2: Update TypeScript Types

**File:** `types/database.ts`

- Add `GroupType` union type: `'ladder_league' | 'free_play'`
- Add `group_type` field to `ShootoutGroup` interface
- Add `FreePlayMatch` interface
- Add `FreePlayPlayerStats` interface

---

## Step 3: Update Group Creation UI — Add Type Selector

**File:** `app/(app)/admin/groups/page.tsx`

- Add a type selector (radio buttons or dropdown) to the create group form
- Options: "Ladder League" and "Free Play"
- Default to "Ladder League"
- Pass `group_type` in the `createGroup` server action insert
- When "Free Play" is selected, skip creating `group_preferences` (steps/pct config are irrelevant)

---

## Step 4: Conditionally Show/Hide Ladder-Specific UI

Several pages need to branch on `group_type`:

### 4a. Group Detail Page — `app/(app)/groups/[slug]/page.tsx`
- Fetch `group_type` from the group record (already fetched)
- **Ladder League**: show current ladder link, upcoming shootout sessions — no changes
- **Free Play**: hide ladder link, show "Log a Match" button and recent matches list instead

### 4b. Group Ladder Page — `app/(app)/groups/[slug]/ladder/page.tsx`
- If group is `free_play`, redirect to group detail or show a Free Play leaderboard (W-L-PtDiff table) instead of the step-based ladder

### 4c. Admin Group Edit — `app/(app)/admin/groups/[id]/page.tsx`
- If group is `free_play`, hide the preferences form (steps, pct window, game limits, etc.)
- Show group type as a read-only badge (don't allow changing type after creation to avoid data inconsistency)

### 4d. Signup Sheets / Start Shootout — `app/(app)/sheets/[id]/start-shootout.tsx`
- Only allow starting shootout sessions for `ladder_league` groups
- Free Play groups don't use signup sheets for structured sessions

---

## Step 5: Free Play Match Logging

### 5a. New Query File — `lib/queries/free-play.ts`
- `createFreePlayMatch(groupId, matchData)` — insert into `free_play_matches`
- `getRecentMatches(groupId, limit)` — fetch recent matches with player names
- `getPlayerStats(groupId)` — query `free_play_player_stats` view for leaderboard

### 5b. API Route — `app/api/groups/[id]/free-play/route.ts`
- **POST**: Create a new match (validate caller is group member, validate all players are group members)
- **GET**: List recent matches for the group

### 5c. Log Match UI — New component `app/(app)/groups/[slug]/log-match.tsx`
- Form with:
  - Player selectors (dropdowns populated from group members) for Team A and Team B
  - Toggle for singles vs doubles
  - Score inputs for each team
  - Optional notes field
- On submit, POST to the API route
- Any group member can log a match (not just admins)

### 5d. Free Play Leaderboard — New component `app/(app)/groups/[slug]/leaderboard.tsx`
- Table showing: Player Name | W | L | Win% | Point Diff
- Sorted by wins descending, then point diff
- Reused on both the group detail page and as a replacement for the ladder page

---

## Step 6: Group Membership Adjustments

**File:** `lib/queries/group.ts` — `getGroupMembers()`

- For Free Play groups, the sort order should be by W-L record instead of step/win%
- The `current_step` and `win_pct` fields in `group_memberships` are unused for Free Play groups — they stay at defaults and are simply not displayed

---

## Step 7: Groups Browse Page Update

**File:** `app/(app)/groups/page.tsx`

- Show a badge/tag on each group card indicating type ("Ladder League" / "Free Play")
- Helps users understand the group format before joining

---

## File Summary

| Action | File |
|--------|------|
| New | `supabase/migrations/015_group_types.sql` |
| Edit | `types/database.ts` |
| Edit | `app/(app)/admin/groups/page.tsx` |
| Edit | `app/(app)/admin/groups/[id]/page.tsx` |
| Edit | `app/(app)/groups/page.tsx` |
| Edit | `app/(app)/groups/[slug]/page.tsx` |
| Edit | `app/(app)/groups/[slug]/ladder/page.tsx` |
| Edit | `app/(app)/sheets/[id]/start-shootout.tsx` |
| New | `lib/queries/free-play.ts` |
| New | `app/api/groups/[id]/free-play/route.ts` |
| New | `app/(app)/groups/[slug]/log-match.tsx` |
| New | `app/(app)/groups/[slug]/leaderboard.tsx` |
| Edit | `lib/queries/group.ts` |
