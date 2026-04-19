/**
 * Small pill shown beside the team that holds "first choice" for a ladder
 * match. The tooltip (`title`) explains what holding first choice actually
 * means so new players don't have to guess.
 */
export function FirstChoiceBadge({ className }: { className?: string }) {
  return (
    <span
      title="This team chooses to serve/return first OR chooses which side of the court they play on."
      aria-label="First choice — chooses to serve/return first OR chooses court side"
      className={
        "inline-flex items-center gap-1 rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-300 ring-1 ring-accent-500/30" +
        (className ? ` ${className}` : "")
      }
    >
      <svg
        className="h-2.5 w-2.5"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7a1 1 0 0 1-.707 1.707H14v6a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7z"
          clipRule="evenodd"
        />
      </svg>
      First choice
    </span>
  );
}
