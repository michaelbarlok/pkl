# Project Notes for Claude

## Database migrations

Migrations live in `supabase/migrations/` and are auto-applied by Supabase's
GitHub integration when a branch lands on `main`.

**Rule: any migration that changes the shape of a table — `ADD COLUMN`,
`DROP COLUMN`, `ALTER COLUMN`, renames, new tables, new views, new RPC
functions — must end with:**

```sql
NOTIFY pgrst, 'reload schema';
```

PostgREST keeps an in-memory schema cache and serves the JS client (and
PostgREST REST API) from it. Without the explicit notify, the cache can
miss DDL changes and the next `.insert({...})` or `.update({...})`
referencing the new column fails with:

> Could not find the 'X' column of 'Y' in the schema cache

This bit us once on `tournaments.win_by_2` (migrations 093/094). Don't
let it bite again — make the NOTIFY part of the muscle memory.

If a migration has already shipped without the NOTIFY and you're seeing
the schema-cache error in production, the fix is a one-line follow-up
migration containing only `NOTIFY pgrst, 'reload schema';`.
