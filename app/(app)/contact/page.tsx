export default function ContactPage() {
  return (
    <div className="max-w-xl mx-auto py-16 sm:py-24 space-y-6">
      <h1 className="text-3xl font-bold text-dark-100 sm:text-4xl tracking-tight">
        Contact Us
      </h1>
      <p className="text-dark-200 text-base sm:text-lg leading-relaxed">
        Have questions, feedback, or want to learn more about Tri-Star Pickleball? We&apos;d love to hear from you.
      </p>
      <div className="card space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-dark-100 uppercase tracking-wide">Email</h2>
          <a
            href="mailto:info@pkl-ball.app"
            className="text-brand-300 hover:text-brand-200 transition-colors text-base"
          >
            info@pkl-ball.app
          </a>
        </div>
        <p className="text-sm text-dark-300">
          We typically respond within 24 hours.
        </p>
      </div>
    </div>
  );
}
