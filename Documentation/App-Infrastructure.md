# PKL App Infrastructure

Complete technical documentation for the PKL (Pickleball Leagues & Tournaments) platform.

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2 (React 18.3) |
| Language | TypeScript 5.9 |
| Styling | Tailwind CSS 3.4 |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth (JWT cookies) |
| State Management | Zustand (lightweight client store) |
| Email | Resend + React Email templates |
| SMS | Twilio (optional) |
| Push Notifications | Web Push API (VAPID) |
| Hosting | Vercel |
| Cron Jobs | Vercel Crons |

---

## 2. File Structure

```
athens-pickleball/
├── app/
│   ├── (app)/                    # Authenticated app pages
│   │   ├── admin/                # Admin panel (sheets, sessions, groups, members, tournaments)
│   │   ├── badges/               # Achievement showcase
│   │   ├── contact/              # Contact form
│   │   ├── dashboard/            # Main dashboard
│   │   ├── forum/                # Global forum
│   │   ├── groups/               # Group management & browsing
│   │   ├── notifications/        # Notification center
│   │   ├── players/              # Player profiles & editing
│   │   ├── ratings/              # Global rankings
│   │   ├── sessions/             # Active sessions & scoring
│   │   ├── sheets/               # Signup sheet management
│   │   ├── tournaments/          # Tournament pages
│   │   └── layout.tsx            # Authenticated layout wrapper
│   ├── (auth)/                   # Public auth pages
│   │   ├── login/
│   │   ├── register/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   ├── api/                      # API routes (40+ endpoints)
│   │   ├── admin/                # Admin operations
│   │   ├── badges/               # Badge check/award
│   │   ├── cron/                 # Scheduled jobs
│   │   ├── forum/                # Forum notifications
│   │   ├── groups/               # Group operations
│   │   ├── notifications/        # Notification CRUD
│   │   ├── push/                 # Push subscription
│   │   ├── register/             # Profile creation
│   │   ├── sessions/             # Session operations
│   │   ├── sheets/               # Sheet operations
│   │   └── tournaments/          # Tournament operations
│   └── layout.tsx                # Root layout
├── components/                   # Reusable UI components
│   └── providers/
│       └── supabase-provider.tsx # Supabase auth context
├── lib/                          # Business logic & utilities
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── middleware.ts         # Session refresh
│   │   └── server.ts             # Server-side clients (anon + service role)
│   ├── queries/                  # Reusable database queries
│   ├── elo.ts                    # ELO rating engine
│   ├── shootout-engine.ts        # Ladder session logic
│   ├── free-play-engine.ts       # Free play match generation
│   ├── tournament-bracket.ts     # Bracket & pool play generation
│   ├── badges.ts                 # Badge evaluation engine
│   ├── notify.ts                 # Multi-channel notification helper
│   ├── push.ts                   # Server-side push sender
│   ├── waitlist.ts               # Waitlist promotion logic
│   └── rate-limit.ts             # API rate limiter
├── types/
│   └── database.ts               # Full TypeScript schema
├── supabase/
│   ├── migrations/               # 44 SQL migrations
│   └── functions/                # Supabase Edge Functions (Deno)
│       ├── send-announcement/
│       ├── waitlist-promote/
│       └── session-reminder/
├── emails/                       # 18 React Email templates
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service worker (push notifications)
│   └── [icons & images]
├── middleware.ts                  # Auth, rate limiting, redirects
├── next.config.js                # Security headers, image domains
├── vercel.json                   # Cron job schedules
└── package.json
```

---

## 3. Database Schema

### User Management

**profiles**
- Core user table linked to Supabase Auth
- Display name, avatar URL, bio, skill level
- External ratings (DUPR, USAP)
- Notification preferences (email, SMS, push per category)
- Role: `admin` or `player`

### Groups

**shootout_groups**
- Type: `ladder_league` or `free_play`
- Visibility: `public` or `private`
- Location (city, state), rolling session count

**group_memberships**
- Player step (1-10 ladder position)
- Win percentage and stats
- Role: `admin` or `member`

**group_preferences**
- Step window percentages, new player starting step
- Step movement rules (up/down thresholds)
- Game limits per court size, win-by-2 toggle

**group_invites** - Invitation workflow

### Signup Sheets

**signup_sheets**
- Event date/time, player limit, court count
- Signup/withdraw windows
- Guest allowance, notification flags
- Status: `open`, `closed`, `cancelled`

**registrations**
- Sheet-to-player mapping
- Priority: `high`, `normal`, `low`
- Status: `confirmed`, `waitlist`, `withdrawn`
- Waitlist position tracking

### Sessions

**shootout_sessions** (Ladder)
- Status: `created` → `checking_in` → `seeding` → `round_active` → `round_complete` → `session_complete`
- Current round, court count, same-day continuation

**session_participants**
- Check-in status, court assignment, pool position
- Step before/after for tracking movement

**free_play_sessions** / **free_play_session_players** / **free_play_matches**
- Drop-in play with partner rotation
- Score tracking, confirmation, dispute handling

### Games & Ratings

**game_results**
- Round/pool tracking, team assignments
- Scores and confirmation status

**player_ratings**
- ELO points (800-2200 internal scale)
- Display rating (2.0-5.0 USAP scale)
- Games played count

### Tournaments

**tournaments**
- Format: `single_elimination`, `double_elimination`, `round_robin`
- Type: `singles` or `doubles`
- Status: `draft` → `registration_open` → `registration_closed` → `in_progress` → `completed`
- Division settings (JSONB, per-division pool rounds)
- Score-to-win settings for pool play and playoffs
- Finals best-of-3 option

**tournament_registrations**
- Player + optional partner
- Division assignment, seed, waitlist

**tournament_matches**
- Bracket: `winners`, `losers`, `grand_final`, `playoff`, or `pool_1`/`pool_2`/etc.
- Round, match number, division
- Score arrays (multi-game support)
- Status: `pending`, `in_progress`, `completed`, `bye`

### Forum

**forum_threads** - Global and group-specific discussions, pinned support
**forum_replies** - Threaded replies
**forum_polls** / **forum_poll_options** / **forum_poll_votes** - Polling system

### Notifications

**notifications**
- Types: `new_sheet`, `signup_reminder`, `sheet_updated`, `waitlist_promoted`, `forum_reply`, `forum_mention`, `rating_updated`, `badge_earned`, etc.
- In-app with read/unread state
- Realtime via Supabase subscriptions

### Push Notifications

**push_subscriptions**
- Browser/device subscription objects (JSONB)
- Endpoint URL, profile reference

### Badges

**badge_definitions** - 20+ badges across 6 categories (play, winning, rating, community, tournament, ladder)
**player_badges** - Earned badges with timestamps

---

## 4. Authentication & Security

### Auth Flow
1. Supabase Auth handles registration, login, password reset
2. Middleware refreshes JWT session cookie on every request
3. Server components use service role key for admin operations
4. Browser client enforces Row Level Security (RLS) policies

### Rate Limiting (middleware.ts)
| Route Type | Limit |
|-----------|-------|
| Cron routes | 5 req/min |
| Auth routes | 10 req/min |
| General API | 60 req/min |

### Security Headers (next.config.js)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` with preload
- `Permissions-Policy`: camera, microphone, geolocation all disabled

### Public vs Protected Pages
- **Public**: `/`, `/login`, `/register`, `/forgot-password`, `/groups`, `/ratings`, `/contact`
- **Protected**: Everything under `/(app)/` requires authentication

---

## 5. API Routes

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/global-role` | Set global admin role |
| POST | `/api/admin/group-role` | Set group admin role |
| POST | `/api/admin/invite` | Bulk invite members |
| POST | `/api/admin/delete-member` | Remove/delete member |

### Sheets
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sheets/[id]/signup` | Register for sheet |
| POST | `/api/sheets/[id]/withdraw` | Withdraw from sheet |
| POST | `/api/sheets/[id]/cancel` | Cancel sheet |
| POST | `/api/sheets/[id]/delete` | Delete sheet |
| POST | `/api/sheets/[id]/contact-admins` | Send message to admins |
| POST | `/api/sheets/notify-create` | Notify members of new sheet |
| POST | `/api/sheets/registrations/[id]/priority` | Set registration priority |
| POST | `/api/sheets/registrations/[id]/remove` | Remove registration |

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions/[id]/complete-round` | End current round |
| POST | `/api/sessions/[id]/score` | Submit game scores |
| POST | `/api/groups/[id]/sessions` | List/create sessions |
| POST | `/api/groups/[id]/sessions/[sid]/end` | End session |
| POST | `/api/groups/[id]/sessions/[sid]/next-round` | Generate next round |
| POST | `/api/groups/[id]/sessions/[sid]/standings` | Compute standings |

### Groups
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/groups/[id]/free-play` | Create free play session |
| POST | `/api/groups/[id]/invite` | Invite to group |
| POST | `/api/groups/[id]/reset-stats` | Reset group stats |
| POST | `/api/groups/[id]/settings` | Update group settings |

### Tournaments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tournaments/[id]` | Tournament details |
| POST | `/api/tournaments/[id]/register` | Register for tournament |
| POST/PUT | `/api/tournaments/[id]/bracket` | Generate bracket / score match |
| POST/PUT | `/api/tournaments/[id]/divisions` | Manage divisions / advance playoffs |
| POST | `/api/tournaments/[id]/organizers` | Add co-organizers |

### Notifications & Push
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List notifications |
| POST | `/api/notifications/read-all` | Mark all as read |
| POST | `/api/push/subscribe` | Register push subscription |

### Cron Jobs
| Method | Endpoint | Schedule | Description |
|--------|----------|----------|-------------|
| GET | `/api/cron/signup-reminders` | Every hour at :00 | Remind about upcoming sheets |
| GET | `/api/cron/withdraw-reminders` | Every hour at :30 | Remind about withdrawal deadlines |

---

## 6. Key Features

### Ladder Leagues (Shootout Groups)
- 10-step ladder system where players move up/down based on performance
- Signup sheets for scheduled events with player limits and court counts
- Session workflow: check-in → seeding → rounds → scoring → step adjustments
- Pool-based court assignments by skill level
- ELO rating system mapped to 2.0-5.0 USAP scale
- Waitlist with automatic promotion when spots open

### Free Play Groups
- Drop-in format without rigid signup requirements
- Partner rotation algorithm (avoids repeat partnerships)
- Score tracking and match history per group
- Stats reset capability for new seasons

### Tournaments
- Three formats: Single Elimination, Double Elimination, Round Robin
- Division system: 3 genders (mens, womens, mixed) x 2 ages (all ages, senior) x 4 skills (3.0, 3.5, 4.0, 4.5+)
- Round Robin pool play with organizer-configured rounds per division:
  - 3-7 teams: 1 pool
  - 8-14 teams: 2 pools
  - 15+ teams: pools of ~5 (top 2 per pool advance to bracket)
- Bracket scoring with automatic winner advancement
- 3rd place game in playoffs
- Best-of-3 championship option
- Co-organizer support

### Forums
- Global and group-specific discussion threads
- Threaded replies with @mention notifications
- Polling system (anonymous or attributed)
- Pinned threads, soft delete

### Notifications (Multi-Channel)
- In-app with realtime updates via Supabase subscriptions
- Email via Resend (18 React Email templates)
- SMS via Twilio (optional)
- Web Push via VAPID (service worker in sw.js)
- User-configurable preferences per notification type

### Badges & Achievements
- 20+ badges across 6 categories: play, winning, rating, community, tournament, ladder
- Automatically checked and awarded via `/api/badges/check`

### Ratings & Leaderboards
- ELO system with K-factor 32
- Internal scale 800-2200, displayed as 2.0-5.0 USAP scale
- Per-group rankings on ladder page
- Global leaderboard at `/ratings`

---

## 7. External Services

| Service | Purpose | Config |
|---------|---------|--------|
| **Supabase** | Database, Auth, Realtime, Storage | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Vercel** | Hosting, Crons, Edge | Automatic via `vercel.json` |
| **Resend** | Email delivery | `RESEND_API_KEY` |
| **Twilio** | SMS notifications | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| **Web Push** | Browser push notifications | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |

---

## 8. Supabase Edge Functions

| Function | Trigger | Description |
|----------|---------|-------------|
| `send-announcement` | Manual | Broadcast messages to group members |
| `waitlist-promote` | DB trigger | Auto-promote waitlisted players when spots open |
| `session-reminder` | Scheduled | Pre-session reminder notifications |

---

## 9. PWA Support

- `manifest.json` configured with Tri-Star Pickleball branding
- Service worker (`sw.js`) handles push notification display
- Icons: 192x192 and 512x512 (maskable)
- Standalone display mode
- OG image for link previews (`TriStarPB-dark-Photoroom.png`, 1200x630)

---

## 10. Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Email (Resend)
RESEND_API_KEY=

# SMS (Twilio - optional)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=

# Cron Authentication
CRON_SECRET=

# App URL
NEXT_PUBLIC_APP_URL=
```

---

## 11. Database Migrations

44 migrations (in `supabase/migrations/`), covering:

| Migration | Description |
|-----------|-------------|
| 001-005 | Core tables: profiles, groups, memberships, sessions |
| 006-010 | Game results, ratings, signup sheets, registrations |
| 011-013 | Forum system (threads, replies, polls) |
| 014-017 | Tournaments (base, registrations, matches) |
| 018-020 | Notifications, free play |
| 021-025 | Tournament divisions, group preferences, playoff bracket |
| 026-030 | Round robin settings, session improvements, step tracking |
| 031-035 | Guest registrations, badge system, forum enhancements |
| 036-040 | Push subscriptions, scalability improvements |
| 041-044 | Waitlist promotion, admin signup, division settings, multi-pool support |

All tables use Row Level Security (RLS) with appropriate policies for read/write access.
