/**
 * Seed "Final Final Test Tournament" with 45 test teams across six
 * divisions (5/6/7/8/9/10 teams). Each player is used in exactly
 * one division so the gender-conflict guard never fires. Idempotent
 * within reason — if any division already has registrations, we
 * skip past existing players when picking pairs.
 */
const TID = "cb713649-e3c4-424f-9591-c719bbd81a8e";
const MGMT = process.env.SUPABASE_ACCESS_TOKEN!;
const REF = process.env.SUPABASE_PROJECT_REF!;

async function sql<T = any>(q: string): Promise<T> {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${MGMT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    }
  );
  if (!r.ok) throw new Error(`SQL fail ${r.status}: ${await r.text()}`);
  return r.json();
}

const PLAN: { division: string; teams: number }[] = [
  { division: "mens_all_ages_3.5",   teams: 5  },
  { division: "womens_all_ages_3.5", teams: 6  },
  { division: "mens_all_ages_4.0",   teams: 7  },
  { division: "womens_all_ages_4.0", teams: 8  },
  { division: "mens_all_ages_3.0",   teams: 9  },
  { division: "womens_all_ages_3.0", teams: 10 },
];
const totalPlayersNeeded = PLAN.reduce((s, d) => s + d.teams * 2, 0); // 90

async function main() {
  // Pull eligible test players: is_test=true, has auth user, NOT
  // already on a non-withdrawn registration in this tournament.
  const free = await sql<{ id: string; display_name: string }[]>(`
    SELECT p.id, p.display_name
    FROM profiles p
    WHERE p.is_test = true
      AND p.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM tournament_registrations r
        WHERE r.tournament_id = '${TID}'
          AND r.status != 'withdrawn'
          AND (r.player_id = p.id OR r.partner_id = p.id)
      )
    ORDER BY p.display_name
    LIMIT ${totalPlayersNeeded + 5};
  `);
  if (free.length < totalPlayersNeeded) {
    throw new Error(`Only ${free.length} free test players, need ${totalPlayersNeeded}`);
  }
  console.log(`✓ ${free.length} free test players available, using ${totalPlayersNeeded}`);

  const rows: string[] = [];
  let cursor = 0;
  for (const div of PLAN) {
    for (let t = 0; t < div.teams; t++) {
      const p1 = free[cursor++];
      const p2 = free[cursor++];
      rows.push(
        `('${TID}', '${p1.id}', '${p2.id}', '${div.division}', 'confirmed', false)`
      );
    }
    console.log(`  prepared ${div.teams} teams for ${div.division}`);
  }

  const insertSql = `
    INSERT INTO tournament_registrations
      (tournament_id, player_id, partner_id, division, status, paid)
    VALUES ${rows.join(",\n            ")}
    RETURNING id, division;
  `;
  const inserted: { id: string; division: string }[] = await sql(insertSql);
  console.log(`\n✓ Inserted ${inserted.length} registrations`);

  // Verify the final per-division counts
  const counts = await sql<{ division: string; teams: number }[]>(`
    SELECT division, count(*)::int AS teams
    FROM tournament_registrations
    WHERE tournament_id = '${TID}' AND status != 'withdrawn'
    GROUP BY division ORDER BY division;
  `);
  console.log("\n=== Final per-division counts ===");
  for (const c of counts) console.log(`  ${c.division}: ${c.teams} teams`);
}

main().catch((e) => { console.error(e); process.exit(1); });
