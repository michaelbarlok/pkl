import { NextRequest, NextResponse } from "next/server";
import { getTournamentManager } from "@/lib/tournament-auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/tournaments/[id]/court-ranges
 *
 * Anyone with read access to the tournament can pull the ranges
 * (used by the bracket page so players know which courts they
 * play on). Returns ordered by `position` ascending.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_court_ranges")
    .select("id, label, court_start, court_end, divisions, position")
    .eq("tournament_id", tournamentId)
    .order("position", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ranges: data ?? [] });
}

interface RangeInput {
  label?: string;
  court_start: number;
  court_end: number;
  divisions: string[];
}

/**
 * PUT /api/tournaments/[id]/court-ranges
 *
 * Replace the full set of ranges in one call. Body:
 *   { ranges: [{ label, court_start, court_end, divisions[] }, …] }
 *
 * Replace-all (rather than per-row CRUD) keeps the validation
 * single-shot: we know the entire layout at once, so we can verify
 * no court is in two ranges, no division is in two ranges, every
 * court_end ≤ tournament.num_courts, and every division belongs to
 * tournament.divisions before any write.
 *
 * An empty array clears all ranges (= back to the default behavior:
 * one queue covering every active division on every court).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const incoming: unknown = body.ranges;
  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: "ranges must be an array" }, { status: 400 });
  }

  const { data: tournament } = await auth.supabase
    .from("tournaments")
    .select("num_courts, divisions")
    .eq("id", tournamentId)
    .single();
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  const numCourts = (tournament as any).num_courts as number | null;
  if (!numCourts || numCourts < 1) {
    return NextResponse.json(
      { error: "Set the number of courts on the tournament before defining ranges." },
      { status: 400 }
    );
  }
  const validDivisions = new Set(((tournament as any).divisions as string[] | null) ?? []);

  // Normalise + validate each row.
  const ranges: RangeInput[] = [];
  for (let i = 0; i < incoming.length; i++) {
    const r = incoming[i] as Partial<RangeInput>;
    const start = Number(r.court_start);
    const end = Number(r.court_end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      return NextResponse.json(
        { error: `Range ${i + 1}: court_start and court_end must be integers with end ≥ start ≥ 1.` },
        { status: 400 }
      );
    }
    if (end > numCourts) {
      return NextResponse.json(
        {
          error: `Range ${i + 1}: court ${end} is past the tournament's ${numCourts} total courts.`,
        },
        { status: 400 }
      );
    }
    const divs = Array.isArray(r.divisions) ? r.divisions.map(String) : [];
    for (const d of divs) {
      if (!validDivisions.has(d)) {
        return NextResponse.json(
          { error: `Range ${i + 1}: division "${d}" is not part of this tournament.` },
          { status: 400 }
        );
      }
    }
    ranges.push({
      label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : `Courts ${start}–${end}`,
      court_start: start,
      court_end: end,
      divisions: divs,
    });
  }

  // No two ranges may overlap on a court — assignment becomes
  // ambiguous if court 7 belongs to both range A and range B.
  const courtOwner = new Map<number, number>(); // court → range index (1-based)
  for (let i = 0; i < ranges.length; i++) {
    for (let c = ranges[i].court_start; c <= ranges[i].court_end; c++) {
      const owner = courtOwner.get(c);
      if (owner != null) {
        return NextResponse.json(
          {
            error: `Court ${c} appears in both range ${owner} and range ${i + 1} — each court can only belong to one range.`,
          },
          { status: 400 }
        );
      }
      courtOwner.set(c, i + 1);
    }
  }

  // No division can land in two queues — when a match is queued we
  // need to know exactly which range owns it.
  const divOwner = new Map<string, number>();
  for (let i = 0; i < ranges.length; i++) {
    for (const d of ranges[i].divisions) {
      const owner = divOwner.get(d);
      if (owner != null) {
        return NextResponse.json(
          {
            error: `Division "${d}" is assigned to both range ${owner} and range ${i + 1} — assign each division to one range only.`,
          },
          { status: 400 }
        );
      }
      divOwner.set(d, i + 1);
    }
  }

  // All checks passed — replace atomically. Service role for the
  // delete-then-insert so RLS doesn't trip mid-transaction.
  const service = await createServiceClient();
  const { error: delErr } = await service
    .from("tournament_court_ranges")
    .delete()
    .eq("tournament_id", tournamentId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (ranges.length === 0) {
    return NextResponse.json({ ok: true, ranges: [] });
  }

  const rows = ranges.map((r, i) => ({
    tournament_id: tournamentId,
    label: r.label!,
    court_start: r.court_start,
    court_end: r.court_end,
    divisions: r.divisions,
    position: i,
  }));
  const { data: inserted, error: insErr } = await service
    .from("tournament_court_ranges")
    .insert(rows)
    .select("id, label, court_start, court_end, divisions, position");
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, ranges: inserted ?? [] });
}
