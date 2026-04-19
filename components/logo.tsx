/**
 * Brand mark. Renders the light/dark variant via CSS classes, and
 * always appends a small ™ superscript so the trademark-intent
 * signal shows up every place the logo does (landing, nav, sidebar,
 * mobile header, missing-profile screen, etc.) without having to
 * touch each call site.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className="relative inline-flex items-start">
      <img
        src="/TriStarPB-dark-Photoroom.png"
        alt="Tri-Star Pickleball"
        className={`logo-dark ${className ?? ""}`}
      />
      <img
        src="/TriStarPB-light-Photoroom.png"
        alt="Tri-Star Pickleball"
        className={`logo-light ${className ?? ""}`}
      />
      <span
        aria-hidden
        className="ml-0.5 mt-0.5 text-[0.6rem] font-semibold leading-none text-dark-300"
      >
        ™
      </span>
    </span>
  );
}
