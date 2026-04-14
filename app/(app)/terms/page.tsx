import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Tri-Star Pickleball",
};

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Terms of Service</h1>
        <p className="mt-1 text-sm text-surface-muted">Last updated: April 14, 2026</p>
      </div>

      <div className="space-y-6 text-sm text-dark-200 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">1. Acceptance of Terms</h2>
          <p>
            By creating an account or using the Tri-Star Pickleball platform ("the Service"),
            you agree to be bound by these Terms of Service. If you do not agree, please do
            not use the Service.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">2. Use of the Service</h2>
          <p>
            The Service is provided for recreational pickleball scheduling, group play management,
            and ladder tracking. You agree to use it only for its intended purpose and in
            compliance with all applicable laws. You may not:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use the Service for any unlawful purpose</li>
            <li>Attempt to gain unauthorized access to any part of the platform</li>
            <li>Harass, impersonate, or harm other users</li>
            <li>Use automated tools to scrape or abuse the platform</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">3. Account Responsibility</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials
            and for all activity that occurs under your account. Please notify us immediately
            if you suspect unauthorized use.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">4. Content</h2>
          <p>
            You retain ownership of any content you submit (such as forum posts or profile
            information). By submitting content, you grant Tri-Star Pickleball a non-exclusive
            license to display that content within the platform. We reserve the right to remove
            any content that violates these terms or is otherwise inappropriate.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">5. Disclaimer of Warranties</h2>
          <p>
            The Service is provided "as is" without warranties of any kind, express or implied.
            We do not guarantee uninterrupted or error-free operation. Participation in
            pickleball activities involves physical risk; we are not responsible for any
            injuries sustained during play.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">6. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, Tri-Star Pickleball shall not be liable
            for any indirect, incidental, or consequential damages arising from your use of
            the Service, even if we have been advised of the possibility of such damages.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">7. Changes to These Terms</h2>
          <p>
            We reserve the right to update these Terms at any time. We will post the revised
            version with an updated date. Continued use of the Service after changes are
            posted constitutes your acceptance of the new terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-dark-100">8. Contact</h2>
          <p>
            Questions about these terms? Email us at{" "}
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
