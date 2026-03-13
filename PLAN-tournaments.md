# Tournament Feature - Implementation Plan

## Overview

A new top-level "Tournaments" feature, completely independent from Groups/Leagues/Sheets. Any logged-in user can create a tournament (no approval needed) and any logged-in user can register. Supports singles and doubles (register as a pair). Includes full bracket generation, match scheduling, and score entry.

---

## Design Decisions (confirmed)

| Decision | Answer |
|---|---|
| Who can create? | Any logged-in user, no approval |
| Doubles registration | Register as a pair (both must have accounts) |
| Bracket/results | Full brackets & scoring |
| Entry fee | Display-only text field (no payment processing) |

---

## Database Schema

### New Tables (migration `013_tournaments.sql`)

#### `tournaments`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `title` | `text` | required, max 120 chars |
| `description` | `text` | optional, max 5000 chars |
| `format` | `text` | `single_elimination`, `double_elimination`, `round_robin` |
| `type` | `text` | `singles` or `doubles` |
| `skill_level` | `text` | `open`, `beginner`, `intermediate`, `advanced` |
| `start_date` | `date` | tournament start |
| `end_date` | `date` | tournament end (can equal start for single-day) |
| `start_time` | `time` | optional |
| `location` | `text` | required |
| `player_cap` | `integer` | max players/teams (null = unlimited) |
| `entry_fee` | `text` | display-only, e.g. "$20 per person - pay at venue" |
| `registration_opens_at` | `timestamptz` | when signups open |
| `registration_closes_at` | `timestamptz` | when signups close |
| `status` | `text` | `draft`, `registration_open`, `registration_closed`, `in_progress`, `completed`, `cancelled` |
| `created_by` | `uuid` FK → profiles.id | the organizer |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**RLS policies:**
- SELECT: all authenticated users can view non-draft tournaments; creator can view own drafts
- INSERT: any authenticated user
- UPDATE: creator or site admin
- DELETE: creator (only if draft) or site admin

#### `tournament_registrations`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tournament_id` | `uuid` FK → tournaments.id | |
| `player_id` | `uuid` FK → profiles.id | registering player |
| `partner_id` | `uuid` FK → profiles.id | nullable, for doubles |
| `status` | `text` | `confirmed`, `waitlist`, `withdrawn` |
| `waitlist_position` | `integer` | null if confirmed |
| `seed` | `integer` | optional seeding by organizer |
| `registered_at` | `timestamptz` | |

**Unique constraint:** `(tournament_id, player_id)` — a player can only register once per tournament (either as registrant or partner of someone else — enforced in app logic).

**RLS policies:**
- SELECT: all authenticated users
- INSERT: any authenticated user (self-registration, `player_id = auth.uid()`)
- UPDATE: registrant (withdraw only), tournament creator, or site admin
- DELETE: tournament creator or site admin

#### `tournament_matches`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tournament_id` | `uuid` FK → tournaments.id | |
| `round` | `integer` | 1-based round number |
| `match_number` | `integer` | position within the round |
| `court` | `text` | optional court assignment |
| `player1_id` | `uuid` FK → profiles.id | singles: player, doubles: team registrant |
| `player2_id` | `uuid` FK → profiles.id | singles: player, doubles: team registrant |
| `score1` | `integer[]` | array of game scores, e.g. `{11, 9, 11}` |
| `score2` | `integer[]` | array of game scores, e.g. `{7, 11, 5}` |
| `winner_id` | `uuid` FK → profiles.id | null until match decided |
| `status` | `text` | `pending`, `in_progress`, `completed`, `bye` |
| `scheduled_time` | `timestamptz` | optional |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**Note:** For doubles, `player1_id`/`player2_id` reference the `player_id` from `tournament_registrations` (the registrant of each pair). The partner is looked up via the registration record.

**RLS policies:**
- SELECT: all authenticated users
- INSERT/UPDATE: tournament creator or site admin
- DELETE: tournament creator or site admin

---

## File Structure (all new files)

```
# Database
supabase/migrations/013_tournaments.sql

# Types
types/database.ts                          (add Tournament, TournamentRegistration, TournamentMatch interfaces)

# Query layer
lib/queries/tournament.ts                  (all Supabase queries)
lib/tournament-bracket.ts                  (bracket generation logic for all formats)

# Player-facing pages
app/(app)/tournaments/page.tsx             (browse/list all tournaments)
app/(app)/tournaments/new/page.tsx         (create tournament form)
app/(app)/tournaments/[id]/page.tsx        (tournament detail, registration, bracket view)
app/(app)/tournaments/[id]/edit/page.tsx   (edit tournament - creator only)

# Shared components
components/tournament-card.tsx             (card for tournament listing)
components/tournament-bracket.tsx          (bracket visualization component)
components/tournament-registration.tsx     (registration form/button)

# API routes
app/api/tournaments/[id]/register/route.ts (register/withdraw - handles waitlist logic)
app/api/tournaments/[id]/bracket/route.ts  (generate bracket, record scores)

# Admin
app/(app)/admin/tournaments/page.tsx       (admin tournament management)

# Navigation updates (existing files)
app/(app)/nav.tsx                          (add Tournaments tab)
app/(app)/mobile-nav.tsx                   (add Tournaments tab)
```

---

## Implementation Phases

### Phase 1: Foundation (Database + Types + Nav)
1. Write migration `013_tournaments.sql` — create all 3 tables with RLS
2. Add TypeScript interfaces to `types/database.ts`
3. Add "Tournaments" to desktop nav (`nav.tsx`) and mobile nav (`mobile-nav.tsx`)
4. Create `lib/queries/tournament.ts` with basic CRUD queries

**Zero interference with existing code** — only touches nav files (adding a link) and types file (adding new interfaces).

### Phase 2: Tournament CRUD
5. Build `/tournaments` listing page — filterable by status, format, skill level
6. Build `/tournaments/new` create form — all tournament fields, server action to insert
7. Build `/tournaments/[id]` detail page — show all info, organizer, registrants
8. Build `/tournaments/[id]/edit` edit page — creator-only access
9. Build `tournament-card.tsx` component for the listing

### Phase 3: Registration
10. Build registration API route — handles capacity, waitlist, doubles partner validation
11. Build `tournament-registration.tsx` component — register/withdraw buttons
12. Add partner search/selection for doubles (search profiles by name)
13. Add waitlist auto-promotion when someone withdraws
14. Send notifications on registration events (new registrant, waitlist promoted, tournament cancelled)

### Phase 4: Brackets & Scoring
15. Build `lib/tournament-bracket.ts` — bracket generation for:
    - **Single elimination**: Standard seeded bracket with byes for non-power-of-2
    - **Double elimination**: Winners + losers bracket
    - **Round robin**: All-play-all schedule generation
16. Build bracket generation API route — organizer triggers bracket creation
17. Build `tournament-bracket.tsx` visualization component
18. Build score entry UI — organizer/admin can enter match scores
19. Auto-advance winners through the bracket
20. Mark tournament as `completed` when final match is decided

### Phase 5: Admin + Polish
21. Build `/admin/tournaments` page — site admins can manage/cancel any tournament
22. Add tournament notifications to `lib/notify.ts` (types: `tournament_created`, `tournament_registration`, `tournament_reminder`, `tournament_cancelled`)
23. Add tournament-related notification types to the DB

---

## Key Design Details

### Bracket Generation Logic

**Single Elimination:**
- Seed players by registration order (or manual seed by organizer)
- If count isn't a power of 2, top seeds get byes in round 1
- Winner advances, loser is eliminated
- Final match determines 1st/2nd place

**Double Elimination:**
- Winners bracket + losers bracket
- Losing in winners bracket drops you to losers bracket
- Losing in losers bracket = elimination
- Grand final: winners bracket champion vs losers bracket champion

**Round Robin:**
- Every player/team plays every other player/team
- Standings based on W-L record, then head-to-head, then point differential
- Schedule generated using circle method for balanced rounds

### Doubles Partner Handling
- When registering for doubles, the registrant searches for their partner by name
- Partner must have an account on the site
- The registration record stores both `player_id` (registrant) and `partner_id`
- Both players show up in the tournament registrants list
- A player cannot register for the same tournament twice (checked: neither as primary nor as someone's partner)

### Status Transitions
```
draft → registration_open → registration_closed → in_progress → completed
                                                                ↗
Any status ──────────────────────────────────────→ cancelled
```
- `draft`: Only visible to creator. Not yet accepting signups.
- `registration_open`: Listed publicly, accepting signups.
- `registration_closed`: No more signups. Organizer can generate bracket.
- `in_progress`: Bracket generated, matches being played.
- `completed`: All matches finished.
- `cancelled`: Tournament cancelled at any point.

### What Existing Code Gets Modified
Only these existing files are touched (minimal additions):
1. `app/(app)/nav.tsx` — add one nav link
2. `app/(app)/mobile-nav.tsx` — add one nav link/tab
3. `types/database.ts` — add new interfaces (additive only)
4. `lib/notify.ts` — add tournament notification types (additive only)

Everything else is **new files** — zero risk of breaking existing features.

---

## Decisions Finalized

- **Migrations**: SQL files stored in `supabase/migrations/`. You'll run them manually in Supabase dashboard. I'll tell you which to run and in what order.
- **Formats**: All 3 formats (single elimination, double elimination, round robin) built in v1.
- **Notifications**: Registration events only (confirmed, waitlisted, promoted, tournament cancelled). No blast notification on tournament creation.
- **Bracket UI**: Tree/ladder view for elimination formats, table view for round robin.
