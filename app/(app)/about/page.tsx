import Link from "next/link";

export const metadata = {
  title: "About — Tri-Star Pickleball",
  description:
    "Tri-Star Pickleball is a community-run platform for ladder leagues, free play, and tournaments.",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 space-y-10">
      <header className="space-y-2">
        <p className="text-eyebrow">About</p>
        <h1 className="text-heading">Built by pickleball players, for pickleball players.</h1>
        <p className="text-dark-200">
          Tri-Star Pickleball is a Tennessee-based platform that grew out of the
          Athens, Tennessee pickleball community.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-title">Our mission</h2>
        <p className="text-sm text-dark-200 leading-relaxed">
          Keep the game at the center. We build software that handles the logistics —
          sign-ups, waitlists, rankings, court promotions — so organizers can focus on
          running a great session and players can focus on playing.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-title">What we care about</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card card-static space-y-1.5">
            <p className="text-title">Fairness</p>
            <p className="text-caption">
              Promotion logic is deterministic and published — no black-box rankings.
            </p>
          </div>
          <div className="card card-static space-y-1.5">
            <p className="text-title">Clarity</p>
            <p className="text-caption">
              Every sheet, every score, every step change is visible and auditable.
            </p>
          </div>
          <div className="card card-static space-y-1.5">
            <p className="text-title">Speed</p>
            <p className="text-caption">
              Built for the moment before a session starts, when the bar is "it just works."
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-title">Contact</h2>
        <p className="text-sm text-dark-200 leading-relaxed">
          Questions, feedback, or running a league you want to move onto the platform? Email{" "}
          <a
            href="mailto:info@tristarpickleball.com"
            className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
          >
            info@tristarpickleball.com
          </a>
          .
        </p>
      </section>

      <div className="pt-4 border-t border-surface-border">
        <Link href="/" className="text-sm text-brand-400 hover:text-brand-300">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
