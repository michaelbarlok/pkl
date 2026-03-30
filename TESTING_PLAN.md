# Athens Pickleball — Manual Testing Plan
## Tournaments & Ladder Leagues

Use this guide to systematically verify the app before going live with the 30-person league.
Run each section end-to-end with real test users (seed them via the admin panel first).

---

## Setup: Seed Test Users

1. Go to **Admin → Manage Sign-Up Sheets** and create a test sheet for today.
2. In the browser console or via a tool like Postman, hit:
   ```
   POST /api/admin/seed-test-users
   Body: { "sheetId": "<your-sheet-id>" }
   ```
   This creates a batch of test profiles and signs them onto the sheet.
3. After testing, go to **Admin → Members**, select all test users via the checkboxes, and click **Delete Selected**.

---

## Part 1: Tournament Flow

### 1A — Create & Configure Tournament

- [ ] Go to **Tournaments → Create Tournament**
- [ ] Fill in: title, date, format (start with **Single Elimination**), player cap (e.g. 8)
- [ ] Set status to **Draft** and save
- [ ] Verify tournament appears in the list with "Draft" badge
- [ ] Open the tournament and confirm all fields display correctly
- [ ] Edit the tournament — change format to **Round Robin**, save, verify update

### 1B — Registration

- [ ] Set tournament status to **Registration Open**
- [ ] Log in as a test user (not admin) and register for the tournament
  - Confirm you see your name in the registration list
  - Confirm status shows "Confirmed"
- [ ] Register until the player cap is hit (use admin "seed" users to fill it)
- [ ] Register one more player — confirm they land on **Waitlist** with position 1
- [ ] Register a second extra — confirm Waitlist position 2
- [ ] **Withdraw** the first confirmed player (as admin or as that user)
  - Confirm Waitlist position 1 gets auto-promoted to Confirmed
  - Confirm remaining waitlist re-numbers (position 2 → position 1)
  - Confirm the promoted player receives a notification (check their notification bell)

### 1C — Bracket Generation

- [ ] Set tournament status to **Registration Closed**
- [ ] Click **Generate Bracket**
  - Confirm bracket appears on the tournament page
  - For Single Elimination with 8 players: verify 4 first-round matches, correct byes for non-power-of-2 counts
  - For Round Robin: verify every player faces every other player once
- [ ] Attempt to generate bracket again — confirm existing matches are cleared and regenerated cleanly

### 1D — Score Entry & Advancement

- [ ] Open Round 1, Match 1 — enter a score and pick a winner
  - Confirm match shows "Completed" status
  - Confirm the winner is populated in the Round 2 match slot (Single Elim)
- [ ] Complete all Round 1 matches
- [ ] Verify Round 2 matches have correct players populated from Round 1 winners
- [ ] Complete all rounds through to the final
- [ ] Confirm tournament status auto-advances to **Completed** after the final match
- [ ] Check the winner's profile — confirm tournament badge was awarded (if badge system is active)

### 1E — Doubles Tournament

- [ ] Repeat 1A–1D with type set to **Doubles**
- [ ] Register as a team (player + partner)
  - Confirm partner shows up in the registration alongside the registrant
- [ ] Verify bracket shows team names, not just individual names
- [ ] Confirm partner also gets the waitlist-promotion notification when applicable

### 1F — Edge Cases

- [ ] Try registering a player who is already registered — confirm "already registered" error
- [ ] Try registering as partner of someone who's already registered — confirm partner conflict error
- [ ] Try generating a bracket with only 1 confirmed player — confirm error message
- [ ] Try withdrawing from a tournament that's In Progress — confirm it's still possible (no status gate)

---

## Part 2: Ladder League (Shootout Sessions)

### 2A — Group Setup

- [ ] Go to **Admin → Groups → Create Group**
- [ ] Set type to **Ladder/Shootout** (not Free Play)
- [ ] Set number of courts (e.g. 3 for 12–15 players)
- [ ] Add 12+ test users as group members
- [ ] Verify the group membership page shows all players with their current steps

### 2B — Sign-Up Sheet

- [ ] Create a **Sign-Up Sheet** for the group with a future date
- [ ] Set player limit (e.g. 12), signup close time (in 5 min for testing)
- [ ] Have test users sign up — confirm confirmed vs waitlist behavior works (same as tournaments)
- [ ] Set a **withdrawal deadline** and verify the withdraw-reminder cron would fire (you can manually call `GET /api/cron/withdraw-reminders` with the cron secret in the header)
- [ ] Close sign-up and confirm no more signups are accepted

### 2C — Session Creation

- [ ] Go to the group page and click **Start Session**
- [ ] Select the players from the sign-up sheet (12 players, 3 courts = 4 per court)
- [ ] Confirm the session is created and Round 1 court assignments are displayed
  - Verify Step 1–4 players are on Court 1, Step 5–8 on Court 2, etc.
  - Verify no player is paired with the same partner they had last session (partner history)
- [ ] Try starting a second session while one is active — confirm it's blocked

### 2D — Score Entry

- [ ] Enter scores for all matches on Court 1, Round 1
- [ ] Enter scores for all courts
- [ ] Click **Complete Round** — verify Round 2 is generated with new pairings
  - Same court, new partners
  - No repeat partner from Round 1 or previous session (if history exists)
- [ ] Complete all rounds
- [ ] Click **End Session**

### 2E — Step Changes After Session

- [ ] After ending the session, verify step changes are applied:
  - Court 1 winner(s) should **not move** (already at top) or move up
  - Court 1 last-place player drops to Court 2
  - Court 2 winner promotes to Court 1
  - Court N last-place drops to Court N+1 (or stays if bottom court)
- [ ] Navigate to the group leaderboard/standings — confirm updated steps match expectations
- [ ] **Manually calculate** expected step changes for 3 courts × 4 players and verify the app matches

### 2F — Rolling Session Count

- [ ] Run 2–3 sessions with the same player set
- [ ] Verify the rolling session count (recent sessions only) updates correctly
- [ ] Verify a player who misses a session retains their step (doesn't get penalized)

### 2G — Edge Cases

- [ ] Try starting a session with only 3 players — confirm "minimum 4 players" error
- [ ] Try starting a session with a player not in the group — confirm they can't be added
- [ ] End a session mid-way (without completing all rounds) — confirm state is consistent

---

## Part 3: Notifications

### 3A — Signup Reminders

- [ ] Create a sheet with `signup_closes_at` set to ~55 minutes from now
- [ ] Manually trigger: `GET /api/cron/signup-reminders` (with `Authorization: Bearer <CRON_SECRET>`)
- [ ] Confirm registered players did NOT receive a reminder
- [ ] Confirm unregistered active members DID receive a reminder
- [ ] Trigger again — confirm `signup_reminder_sent = true` prevents duplicate sends

### 3B — Waitlist Promotion

- [ ] Fill a sheet to capacity
- [ ] Add a waitlisted player
- [ ] Withdraw a confirmed player via the admin panel
- [ ] Confirm the waitlisted player:
  - Moves to "Confirmed" in the registrations table
  - Receives an in-app notification ("You're in!")
  - Receives an email notification (check Resend logs or email inbox)

### 3C — Push Notifications

- [ ] Enable push notifications in your browser (via the notification settings in the app)
- [ ] Trigger an action that sends a notification (sheet signup reminder, waitlist promotion)
- [ ] Confirm the browser push notification appears

---

## Part 4: Admin Functions

### 4A — Bulk Member Delete

- [ ] Go to **Admin → Members**
- [ ] Check a few test users using the checkboxes
- [ ] Verify the **Delete Selected (N)** button appears in the toolbar
- [ ] Click the check-all box — confirm all non-self members get selected
- [ ] Uncheck a few, confirm count updates
- [ ] Click **Delete Selected**, confirm through both dialogs
- [ ] Verify deleted members no longer appear in the list
- [ ] Verify their data was cleaned up (check Supabase: tournament_registrations, game_results, etc. should be empty or nulled)

### 4B — Role Management

- [ ] Promote a test user to Global Admin — confirm they gain access to `/admin` routes
- [ ] Demote them back to Player — confirm access is revoked
- [ ] Make a test user a Group Admin for a specific group — confirm they can manage that group's sessions

### 4C — Member Suspend / Activate

- [ ] Suspend a test user — confirm they can't log in or access the app
- [ ] Reactivate them — confirm access is restored

---

## Part 5: Data Integrity Checks

After running the full test suite, run these queries in Supabase SQL editor to confirm no orphaned data:

```sql
-- No active registrations for deleted profiles
SELECT COUNT(*) FROM registrations r
LEFT JOIN profiles p ON r.player_id = p.id
WHERE p.id IS NULL AND r.status != 'withdrawn';

-- No tournament_registrations for deleted profiles
SELECT COUNT(*) FROM tournament_registrations tr
LEFT JOIN profiles p ON tr.player_id = p.id
WHERE p.id IS NULL AND tr.status != 'withdrawn';

-- No sessions with invalid created_by
SELECT COUNT(*) FROM free_play_sessions s
LEFT JOIN profiles p ON s.created_by = p.id
WHERE p.id IS NULL;

-- Waitlist positions are contiguous (no gaps)
SELECT sheet_id, array_agg(waitlist_position ORDER BY waitlist_position) as positions
FROM registrations
WHERE status = 'waitlist'
GROUP BY sheet_id
HAVING array_agg(waitlist_position ORDER BY waitlist_position) !=
       (SELECT array_agg(i) FROM generate_series(1, COUNT(*)::int) i);
```

All counts should be **0** and the waitlist check should return **0 rows**.

---

## Sign-Off Checklist

Before going live with the 30-person league:

- [ ] Part 1 (Tournaments) completed without errors
- [ ] Part 2 (Ladder Sessions) step changes match manual calculation
- [ ] Part 3 (Notifications) working for at least email + in-app
- [ ] Part 4 (Admin) bulk delete and role management working
- [ ] Part 5 (Data Integrity) all queries return 0
- [ ] One full dry-run weekly cycle completed (sheet → session → scores → step changes → standings)
