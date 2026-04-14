import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Tri-Star Pickleball",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Privacy Policy</h1>
        <p className="mt-1 text-sm text-surface-muted">Last updated: April 14, 2026</p>
      </div>

      <div className="space-y-6 text-sm text-dark-200 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">1. Information We Collect</h2>
          <p>
            When you create an account, we collect your name, email address, and any profile
            information you choose to provide (such as a profile photo or skill rating). When
            you participate in sessions and tournaments, we record game results, scores, court
            assignments, and session history associated with your account.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Operate the Tri-Star Pickleball platform and manage your account</li>
            <li>Display your standings, stats, and history within your groups</li>
            <li>Send transactional emails (sign-up confirmations, invites, session updates)</li>
            <li>Notify you of events and schedule changes you have opted into</li>
          </ul>
          <p>We do not sell or share your personal information with third parties for marketing purposes.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">3. Data Storage</h2>
          <p>
            Your data is stored securely using{" "}
            <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 underline underline-offset-2">
              Supabase
            </a>
            , a hosted PostgreSQL database platform. All data is encrypted at rest and in transit.
            Transactional emails are delivered via{" "}
            <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 underline underline-offset-2">
              Resend
            </a>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">4. Cookies</h2>
          <p>
            We use session cookies solely to keep you logged in. We do not use tracking cookies,
            advertising cookies, or any third-party analytics cookies.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">5. Your Rights</h2>
          <p>
            You may request deletion of your account and associated data at any time by contacting
            us at the email below. You may also update your profile information at any time from
            your account settings.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">6. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Continued use of the platform
            after changes are posted constitutes your acceptance of the updated policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">7. Contact</h2>
          <p>
            Questions about this policy? Email us at{" "}
            <a href="mailto:info@tristarpickleball.com" className="text-brand-400 hover:text-brand-300 underline underline-offset-2">
              info@tristarpickleball.com
            </a>
            .
          </p>
        </section>
      </div>

      <div className="pt-4 border-t border-surface-border">
        <Link href="/dashboard" className="text-sm text-surface-muted hover:text-dark-200">
          &larr; Back to dashboard
        </Link>
      </div>
    </div>
  );
}
