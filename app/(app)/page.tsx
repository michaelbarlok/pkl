import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LandingFooter } from "./landing-footer";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  return (
    <div className="space-y-20 py-8 sm:py-16">
      {/* ── Hero ── */}
      <section className="text-center space-y-6">
        <img
          src="/pkl-logo.png"
          alt="PKL"
          className="mx-auto h-28 w-auto sm:h-36"
        />
        <h1 className="text-3xl font-bold text-dark-100 sm:text-5xl tracking-tight">
          Your pickleball community,<br className="hidden sm:block" /> all in one place.
        </h1>
        <p className="max-w-lg mx-auto text-base text-dark-200 sm:text-lg">
          Track free play sessions, sign up for shootouts, climb the rankings, and never miss a match.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          {isLoggedIn ? (
            <Link href="/dashboard" className="btn-primary px-8 py-3 text-base">
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link href="/register" className="btn-primary px-8 py-3 text-base">
                Get Started
              </Link>
              <Link href="/login" className="btn-secondary px-8 py-3 text-base">
                Log In
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ── Feature Showcase ── */}
      <section id="features" className="space-y-12 max-w-4xl mx-auto scroll-mt-24">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-dark-100 sm:text-3xl tracking-tight">
            Everything you need to run your pickleball community
          </h2>
          <p className="text-dark-300 max-w-2xl mx-auto">
            From casual shootouts to competitive tournaments — all managed in one place.
          </p>
        </div>

        {/* Signup Sheets */}
        <div id="signup-sheets" className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center scroll-mt-24">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-brand-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Sign-Up Sheets</h2>
            </div>
            <p className="text-dark-200">
              Browse upcoming events, sign up with one tap, and see exactly who&apos;s playing. Full? You&apos;ll be added to the waitlist and promoted automatically when a spot opens.
            </p>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase text-surface-muted">Upcoming Events</p>
            </div>
            <div className="divide-y divide-surface-border">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Thursday Shootout</p>
                  <p className="text-xs text-surface-muted">Mar 20 at Calhoun Courts</p>
                </div>
                <span className="badge-green">Open</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Saturday Shootout</p>
                  <p className="text-xs text-surface-muted">Mar 22 at Calhoun Courts</p>
                </div>
                <span className="badge-green">12/16</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Tuesday Night</p>
                  <p className="text-xs text-surface-muted">Mar 25 at Calhoun Courts</p>
                </div>
                <span className="badge-yellow">Waitlist</span>
              </div>
            </div>
          </div>
        </div>

        {/* Free Play */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
          <div className="order-2 sm:order-1 card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase text-surface-muted">Session Standings</p>
            </div>
            <div className="divide-y divide-surface-border">
              {[
                { rank: 1, name: "Alex M.", record: "4-1", diff: "+12", diffColor: "text-teal-300" },
                { rank: 2, name: "Jordan T.", record: "3-1", diff: "+8", diffColor: "text-teal-300" },
                { rank: 3, name: "Casey R.", record: "3-2", diff: "+3", diffColor: "text-teal-300" },
                { rank: 4, name: "Morgan D.", record: "2-3", diff: "-4", diffColor: "text-red-400" },
                { rank: 5, name: "Riley K.", record: "1-4", diff: "-9", diffColor: "text-red-400" },
              ].map((p) => (
                <div key={p.rank} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-sm font-medium text-surface-muted w-5 text-right">{p.rank}</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                    {p.name.charAt(0)}
                  </div>
                  <span className="flex-1 text-sm font-medium text-dark-100">{p.name}</span>
                  <span className="text-sm font-semibold text-dark-100">{p.record}</span>
                  <span className={`text-sm font-semibold w-10 text-right ${p.diffColor}`}>{p.diff}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="order-1 sm:order-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-teal-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Free Play Tracking</h2>
            </div>
            <p className="text-dark-200">
              Log casual games as you play and watch session standings update in real time. Track wins, losses, and point differential — no structured brackets needed. Just show up, play, and see where you stand.
            </p>
          </div>
        </div>

        {/* Rankings */}
        <div id="rankings" className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center scroll-mt-24">
          <div className="order-2 sm:order-1 card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase text-surface-muted">Rankings</p>
            </div>
            <div className="divide-y divide-surface-border">
              {[
                { rank: 1, name: "Alex M.", step: 1, pct: "82.4%" },
                { rank: 2, name: "Jordan T.", step: 1, pct: "78.1%" },
                { rank: 3, name: "Casey R.", step: 2, pct: "75.9%" },
                { rank: 4, name: "Morgan D.", step: 2, pct: "71.3%" },
                { rank: 5, name: "Riley K.", step: 3, pct: "68.7%" },
              ].map((p) => (
                <div key={p.rank} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-sm font-medium text-surface-muted w-5 text-right">{p.rank}</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-xs font-medium">
                    {p.name.charAt(0)}
                  </div>
                  <span className="flex-1 text-sm font-medium text-dark-100">{p.name}</span>
                  <span className="inline-flex items-center rounded-md bg-brand-900/40 px-1.5 py-0.5 text-xs font-semibold text-brand-300">
                    Step {p.step}
                  </span>
                  <span className="text-sm text-dark-200 w-14 text-right">{p.pct}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="order-1 sm:order-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-teal-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .982-3.172M12 3.75a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Live Rankings</h2>
            </div>
            <p className="text-dark-200">
              Track your step and scoring percentage across sessions. The ranking system updates after every shootout — climb the ladder by winning games and earning points.
            </p>
          </div>
        </div>

        {/* Shootout Sessions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-accent-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Shootout Sessions</h2>
            </div>
            <p className="text-dark-200">
              Real-time tournament management from check-in to final scores. Get your court assignment, enter scores after each game, and watch the live standings update round by round.
            </p>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase text-surface-muted">Your Court</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-brand-300">Court 2</span>
                <span className="badge-green">Round 3</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-overlay p-3 text-center">
                  <p className="text-xs text-surface-muted">Your Score</p>
                  <p className="text-2xl font-bold text-teal-300">11</p>
                </div>
                <div className="rounded-lg bg-surface-overlay p-3 text-center">
                  <p className="text-xs text-surface-muted">Opponent</p>
                  <p className="text-2xl font-bold text-dark-200">7</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-surface-muted">
                <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse"></span>
                Live — 12 players across 3 courts
              </div>
            </div>
          </div>
        </div>

        {/* Tournaments */}
        <div id="tournaments" className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center scroll-mt-24">
          <div className="order-2 sm:order-1 card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase text-surface-muted">Upcoming Tournaments</p>
            </div>
            <div className="divide-y divide-surface-border">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Spring Singles Championship</p>
                  <p className="text-xs text-surface-muted">Apr 12 &middot; Single Elimination</p>
                </div>
                <span className="badge-green">Open</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Doubles Round Robin</p>
                  <p className="text-xs text-surface-muted">Apr 19 &middot; Round Robin</p>
                </div>
                <span className="badge-blue">16/32</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">Summer Classic</p>
                  <p className="text-xs text-surface-muted">May 3 &middot; Double Elimination</p>
                </div>
                <span className="badge-yellow">Coming Soon</span>
              </div>
            </div>
          </div>
          <div className="order-1 sm:order-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-teal-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .982-3.172M12 3.75a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Tournaments</h2>
            </div>
            <p className="text-dark-200">
              Compete in organized tournaments with brackets, seeding, and multiple formats. From casual round robins to competitive single and double elimination — find the right tournament for your skill level.
            </p>
          </div>
        </div>

        {/* Groups & Community */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
          <div className="order-2 sm:order-1 card p-0 overflow-hidden">
            <div className="bg-surface-overlay px-4 py-2.5 border-b border-surface-border">
              <p className="text-xs font-medium uppercase text-surface-muted">Your Groups</p>
            </div>
            <div className="divide-y divide-surface-border">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-dark-100">Thursday Shootout</p>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-surface-muted">Ladder</span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-surface-muted">
                  <span>Step 2</span>
                  <span>72.5% Win</span>
                  <span>14 sessions</span>
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-dark-100">Sunday Open Play</p>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-teal-400">Free Play</span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-surface-muted">
                  <span>12-5 record</span>
                  <span>+18 pts</span>
                  <span>6 sessions</span>
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-dark-100">Saturday Competitive</p>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-surface-muted">Ladder</span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-surface-muted">
                  <span>Step 1</span>
                  <span>81.2% Win</span>
                  <span>8 sessions</span>
                </div>
              </div>
            </div>
          </div>
          <div className="order-1 sm:order-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-brand-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-dark-100">Groups &amp; Community</h2>
            </div>
            <p className="text-dark-200">
              Join groups that match your schedule and play style — ladder leagues for competitive tracking, or free play groups for casual sessions. Track your stats per group and follow along with community discussions in the forum.
            </p>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="text-center space-y-4 pb-8">
        <h2 className="text-2xl font-bold text-dark-100 sm:text-3xl">
          Ready to play?
        </h2>
        <p className="text-dark-200 max-w-md mx-auto">
          Join the community and start tracking your games — casual or competitive.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          {isLoggedIn ? (
            <Link href="/dashboard" className="btn-primary px-8 py-3 text-base">
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link href="/register" className="btn-primary px-8 py-3 text-base">
                Create Your Account
              </Link>
              <Link href="/login" className="btn-secondary px-8 py-3 text-base">
                Log In
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ── Footer (always visible, even for authenticated users) ── */}
      <LandingFooter />
    </div>
  );
}
