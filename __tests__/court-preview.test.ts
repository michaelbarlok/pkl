/**
 * Court preview tests
 *
 * computeCourtPreview wraps seedSession1 — the same logic that runs at
 * StartShootout time. These tests lock in the preview's guarantees:
 *   - it picks the max legal court count (4-per-court when possible)
 *   - it returns null when there are too few players or no legal split
 *   - it maps memberships onto players and preserves roster data
 *   - the court ordering matches the real seeding (step ASC → win% DESC)
 */

import { computeCourtPreview } from "@/app/(app)/sheets/[id]/court-preview";

type Confirmed = Parameters<typeof computeCourtPreview>[0];
type Memberships = Parameters<typeof computeCourtPreview>[1];

function mkConfirmed(id: string, name = id): Confirmed[number] {
  return {
    player_id: id,
    player: { id, display_name: name, avatar_url: null },
  };
}

function mkMembership(
  id: string,
  step: number,
  winPct: number,
  totalSessions = 0,
  lastPlayedAt: string | null = null,
): Memberships[number] {
  return {
    player_id: id,
    current_step: step,
    win_pct: winPct,
    total_sessions: totalSessions,
    last_played_at: lastPlayedAt,
  };
}

describe("computeCourtPreview", () => {
  test("returns null below 4 players", () => {
    const confirmed = [mkConfirmed("a"), mkConfirmed("b"), mkConfirmed("c")];
    const memberships = confirmed.map((r) => mkMembership(r.player_id, 1, 50));
    expect(computeCourtPreview(confirmed, memberships)).toBeNull();
  });

  test("8 players → 2 courts of 4", () => {
    const confirmed = Array.from({ length: 8 }, (_, i) => mkConfirmed(`p${i}`));
    const memberships = confirmed.map((r, i) =>
      mkMembership(r.player_id, 1, 90 - i),
    );
    const result = computeCourtPreview(confirmed, memberships);
    expect(result).not.toBeNull();
    expect(result!.numCourts).toBe(2);
    expect(result!.courts.map((c) => c.players.length)).toEqual([4, 4]);
  });

  test("12 players → 3 courts of 4 (max courts wins)", () => {
    const confirmed = Array.from({ length: 12 }, (_, i) => mkConfirmed(`p${i}`));
    const memberships = confirmed.map((r) => mkMembership(r.player_id, 1, 50));
    const result = computeCourtPreview(confirmed, memberships);
    expect(result!.numCourts).toBe(3);
    expect(result!.courts.map((c) => c.players.length)).toEqual([4, 4, 4]);
  });

  test("13 players → 3 courts with 5+4+4 (lower courts get extras)", () => {
    const confirmed = Array.from({ length: 13 }, (_, i) => mkConfirmed(`p${i}`));
    const memberships = confirmed.map((r) => mkMembership(r.player_id, 1, 50));
    const result = computeCourtPreview(confirmed, memberships);
    expect(result!.numCourts).toBe(3);
    expect(result!.courts.map((c) => c.players.length)).toEqual([5, 4, 4]);
  });

  test("returns null for counts with no legal 4-5 split (e.g. 7)", () => {
    const confirmed = Array.from({ length: 7 }, (_, i) => mkConfirmed(`p${i}`));
    const memberships = confirmed.map((r) => mkMembership(r.player_id, 1, 50));
    expect(computeCourtPreview(confirmed, memberships)).toBeNull();
  });

  test("best-ranked players land on court 1 (step ASC, win% DESC)", () => {
    const confirmed = [
      mkConfirmed("low1"),
      mkConfirmed("high1"),
      mkConfirmed("low2"),
      mkConfirmed("high2"),
      mkConfirmed("mid1"),
      mkConfirmed("mid2"),
      mkConfirmed("mid3"),
      mkConfirmed("mid4"),
    ];
    const memberships = [
      mkMembership("low1", 3, 40),
      mkMembership("high1", 1, 80),
      mkMembership("low2", 3, 30),
      mkMembership("high2", 1, 90),
      mkMembership("mid1", 2, 70),
      mkMembership("mid2", 2, 60),
      mkMembership("mid3", 2, 50),
      mkMembership("mid4", 2, 55),
    ];

    const result = computeCourtPreview(confirmed, memberships);
    const court1Ids = result!.courts[0].players.map((p) => p.id);
    const court2Ids = result!.courts[1].players.map((p) => p.id);

    // Court 1 should contain the two step-1 players, plus the top step-2 pair.
    expect(court1Ids).toContain("high1");
    expect(court1Ids).toContain("high2");
    expect(court1Ids).toContain("mid1"); // best win% among step 2
    // Court 2 should contain the step-3 pair.
    expect(court2Ids).toContain("low1");
    expect(court2Ids).toContain("low2");
  });

  test("attaches display_name and avatar_url from the roster", () => {
    const confirmed = Array.from({ length: 4 }, (_, i) => ({
      player_id: `p${i}`,
      player: {
        id: `p${i}`,
        display_name: `Player ${i}`,
        avatar_url: `https://example.com/${i}.png`,
      },
    }));
    const memberships = confirmed.map((r) => mkMembership(r.player_id, 1, 50));
    const result = computeCourtPreview(confirmed, memberships);
    const first = result!.courts[0].players[0];
    expect(first.displayName.startsWith("Player")).toBe(true);
    expect(first.avatarUrl).toMatch(/example\.com/);
  });

  test("players without a membership row still appear (pushed to the back)", () => {
    // A rare but possible case: someone signed up but their membership row
    // didn't make it into the set we looked up.
    const confirmed = Array.from({ length: 4 }, (_, i) => mkConfirmed(`p${i}`));
    const memberships = [
      mkMembership("p0", 1, 80),
      mkMembership("p1", 1, 70),
      mkMembership("p2", 1, 60),
      // p3 missing
    ];
    const result = computeCourtPreview(confirmed, memberships);
    expect(result).not.toBeNull();
    expect(result!.courts[0].players.length).toBe(4);
    const ids = result!.courts[0].players.map((p) => p.id);
    expect(ids).toContain("p3");
  });
});
