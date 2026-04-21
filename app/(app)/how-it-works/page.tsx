import Link from "next/link";

export const metadata = {
  title: "How it Works — Tri-Star Pickleball",
  description:
    "How Tri-Star Pickleball calculates ladder steps, points %, free-play point differential, and runs tournaments.",
};

export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">How it Works</h1>
        <p className="mt-1 text-sm text-surface-muted">
          A quick reference for how standings, percentages, and tournaments are
          calculated on Tri-Star Pickleball.
        </p>
      </div>

      {/* Table of contents — anchor links to sections below. */}
      <nav className="rounded-xl bg-surface-raised ring-1 ring-surface-border p-4 text-sm">
        <p className="font-semibold text-dark-100 mb-2">On this page</p>
        <ul className="space-y-1 text-dark-200">
          <li>
            <a href="#ladder-steps" className="hover:text-brand-vivid">Ladder Leagues — Steps</a>
          </li>
          <li>
            <a href="#ladder-points-pct" className="hover:text-brand-vivid">Ladder Leagues — Points %</a>
          </li>
          <li>
            <a href="#free-play" className="hover:text-brand-vivid">Free Play — Point Differential</a>
          </li>
          <li>
            <a href="#tournaments" className="hover:text-brand-vivid">Tournaments</a>
          </li>
        </ul>
      </nav>

      {/* ─────────────────────────── Ladder Steps */}
      <section id="ladder-steps" className="space-y-4 scroll-mt-24">
        <header>
          <h2 className="text-xl font-semibold text-dark-100">Ladder Leagues — Steps</h2>
          <p className="mt-1 text-sm text-surface-muted">
            Your &ldquo;step&rdquo; is where you sit on the ladder. Lower is better — step 1 is the top court.
          </p>
        </header>

        <div className="space-y-4 text-sm text-dark-200 leading-relaxed">
          <p>
            Every ladder group defines a range of steps (for example 1–15) and how big a move
            a round produces. Two rules drive your next-session step:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Finish 1st</strong> on your court — move up by the group&apos;s <em>Step Move Up</em> value (typically 1).</li>
            <li><strong>Finish last</strong> on your court — move down by the group&apos;s <em>Step Move Down</em> value (typically 1).</li>
            <li><strong>Anything in between</strong> — your step stays the same.</li>
          </ul>
          <p>
            Your step is then clamped to the group&apos;s configured range (so you can&apos;t
            move above step 1 or below the lowest step). New members start at the group&apos;s
            <em> New Player Start Step</em>, which admins set in the group&apos;s preferences.
          </p>
          <p>
            Two modes are available per group:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Court Promotion</strong> — each court plays through a session, then 1st place moves up one
              court and last place moves down one court. Players carry their specific court assignment forward
              between sessions that happen on the same day.
            </li>
            <li>
              <strong>Dynamic Ranking</strong> — after each session, everyone&apos;s step and Points % are updated,
              and courts are re-seeded from scratch by overall ranking at the start of the next session.
            </li>
          </ul>
        </div>
      </section>

      {/* ─────────────────────────── Ladder Points % */}
      <section id="ladder-points-pct" className="space-y-4 scroll-mt-24">
        <header>
          <h2 className="text-xl font-semibold text-dark-100">Ladder Leagues — Points %</h2>
          <p className="mt-1 text-sm text-surface-muted">
            Your Points % is a rolling average of the share of points you&apos;ve won across
            the group&apos;s most recent sessions.
          </p>
        </header>

        <div className="space-y-4 text-sm text-dark-200 leading-relaxed">
          <p>
            Each group sets a <strong>Pt % Window</strong> — the number of recent sessions that count
            toward your percentage. If the window is 14, only the last 14 sessions affect it.
            Older sessions fall off as new ones take their place.
          </p>
          <p>
            Within that window:
          </p>
          <div className="rounded-lg bg-surface-overlay p-3 text-sm text-dark-100">
            <p className="font-mono">
              Points % = <span className="text-brand-vivid">total points you scored</span> ÷ <span className="text-brand-vivid">total points possible</span>
            </p>
          </div>
          <p>
            &ldquo;Points possible&rdquo; for each game is the higher of the two team scores (so a game to 11
            contributes 11 points possible, even if the loser scored 4). Your side&apos;s actual
            score counts toward &ldquo;points scored.&rdquo;
          </p>
          <h3 className="text-base font-semibold text-dark-100 pt-2">Imported History</h3>
          <p>
            If a group admin imported your historical stats via the Import Steps tool, your
            imported Points % is treated as virtual past sessions inside the rolling window
            until real sessions fill it up. Concretely:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Say your imported stats are <strong>74.72%</strong> over <strong>14 sessions</strong>, and the group window is 14.</li>
            <li>After your first real session (where you scored 60% of your points), the window holds 13 virtual imported sessions at 74.72% and 1 real session at 60%.</li>
            <li>Your new Points % comes out to roughly <strong>73.67%</strong> — mostly the imported baseline with a small tug from the real result.</li>
            <li>After 14 real sessions the imported contribution is zero, and Points % is purely your real play.</li>
          </ul>
          <p className="text-surface-muted">
            The &ldquo;Sessions played&rdquo; count shown per group is also capped at the window — so a member who has
            played 16 sessions in a group with a 14-session window will show 14. That way the number
            matches what actually influences the percentage.
          </p>
        </div>
      </section>

      {/* ─────────────────────────── Free Play */}
      <section id="free-play" className="space-y-4 scroll-mt-24">
        <header>
          <h2 className="text-xl font-semibold text-dark-100">Free Play — Point Differential</h2>
          <p className="mt-1 text-sm text-surface-muted">
            Free Play groups don&apos;t use steps or percentages. Standings are based on wins, losses,
            and point differential across a rolling window of recent sessions.
          </p>
        </header>

        <div className="space-y-4 text-sm text-dark-200 leading-relaxed">
          <p>
            For every match you play in a free play session, the system records the score of both
            teams and credits you with the point margin:
          </p>
          <div className="rounded-lg bg-surface-overlay p-3 text-sm text-dark-100">
            <p className="font-mono">
              Point Differential = <span className="text-brand-vivid">your team&apos;s score</span> − <span className="text-brand-vivid">the other team&apos;s score</span>
            </p>
          </div>
          <p>
            Your differential accumulates across every match in the group&apos;s rolling window
            (defaults to 14 sessions). A win by 11–3 contributes +8. A loss of 7–11 contributes
            −4. Sessions outside the window drop off automatically as new sessions happen.
          </p>
          <p>
            The leaderboard sorts by wins first (descending), then by point differential
            (descending) — so two players with the same W-L are broken by who played the closer
            games.
          </p>
        </div>
      </section>

      {/* ─────────────────────────── Tournaments */}
      <section id="tournaments" className="space-y-4 scroll-mt-24">
        <header>
          <h2 className="text-xl font-semibold text-dark-100">Tournaments</h2>
          <p className="mt-1 text-sm text-surface-muted">
            Tri-Star supports three tournament formats. Each can run multiple divisions in parallel
            (for example Men&apos;s 3.5 and Mixed 4.0).
          </p>
        </header>

        <div className="space-y-6 text-sm text-dark-200 leading-relaxed">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-dark-100">Single Elimination</h3>
            <p>
              A straight bracket: lose once and you&apos;re out. If the team count isn&apos;t a power of two,
              the top seeds get byes through the first round so every subsequent round has a full matchup.
              Seeds come from registration order, or explicit seed numbers if the organizer sets them.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-semibold text-dark-100">Double Elimination</h3>
            <p>
              Two brackets run side by side. Losing a match in the winners bracket drops you into the
              losers bracket, and you can still win the whole thing by running through losers. The winners
              finalist and the losers finalist meet in the grand final to determine the champion.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-semibold text-dark-100">Round Robin with Playoffs</h3>
            <p>
              Teams are split into pools (up to six per pool). Every team plays every other team in its
              pool. Top finishers advance to a playoff bracket:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>1 pool</strong> → top 4 advance.</li>
              <li><strong>2 pools</strong> → top 3 from each advance.</li>
              <li><strong>3 or more pools</strong> → top 2 from each advance.</li>
            </ul>
            <p>
              The playoff bracket uses snake-seeding so the best finishers from different pools are
              spread across the draw. A third-place game is always played. The organizer can also opt
              into a best-of-three final. Pool play and playoff games can have different point targets
              (for example pool to 11, playoffs to 15) — the organizer picks both when creating the
              tournament.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-semibold text-dark-100">Divisions &amp; Seeding</h3>
            <p>
              Every tournament can offer multiple divisions — any combination of gender (Men&apos;s /
              Women&apos;s / Mixed), skill band (3.0, 3.5, 4.0, 4.5+), and age group. Each division
              generates its own independent bracket or pool set. A single registration form lets
              teams sign up for the division that fits them.
            </p>
            <p>
              Seeding for the bracket is taken from the <em>seed</em> field on each registration — the
              organizer can set it explicitly, or leave it to fall back to registration order.
              Playoff seeding from round-robin pools uses the standings within each pool (wins, then
              point differential, then head-to-head).
            </p>
          </div>
        </div>
      </section>

      <div className="pt-6 border-t border-surface-border text-sm text-surface-muted">
        Still have questions?{" "}
        <Link href="/contact" className="text-brand-vivid hover:opacity-80">
          Get in touch
        </Link>
        .
      </div>
    </div>
  );
}
