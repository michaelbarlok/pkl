/**
 * Small pill shown beside the team that holds "first choice" for a match.
 * The tooltip (`title`) explains what holding first choice actually means
 * so new players don't have to guess. Sized a touch smaller on mobile so
 * it doesn't crowd tight match rows.
 */
export function FirstChoiceBadge({ className }: { className?: string }) {
  return (
    <span
      title="This team chooses to serve/return first OR chooses which side of the court they play on."
      aria-label="First choice — chooses to serve/return first OR chooses court side"
      className={
        // Colors live in the `.badge-first-choice` CSS token in
        // globals.css so they flip with the .light theme class.
        "badge-first-choice" + (className ? ` ${className}` : "")
      }
    >
      <svg
        className="h-2 w-2 sm:h-2.5 sm:w-2.5"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden
      >
        <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.09l-4.94 2.6.94-5.49-4-3.9 5.53-.8L10 1.5z" />
      </svg>
      First choice
    </span>
  );
}
