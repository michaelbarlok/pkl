import Link from "next/link";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  /** Optional second action — rendered as a secondary text link. */
  secondaryLabel?: string;
  secondaryHref?: string;
  /** Renders a compact horizontal banner instead of a centered block */
  inline?: boolean;
  /** Size of the centered empty-state block. Default "md". */
  size?: "sm" | "md" | "lg";
  /** Optional illustration slot rendered above the title. Pass a small
   *  inline SVG or component. Used when `icon` alone doesn't communicate
   *  enough on a high-traffic empty surface (dashboard, sheets list). */
  illustration?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  secondaryLabel,
  secondaryHref,
  inline,
  size = "md",
  illustration,
}: EmptyStateProps) {
  if (inline) {
    return (
      <div className="card flex items-center gap-4">
        {icon && <div className="shrink-0 text-surface-muted">{icon}</div>}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-dark-100">{title}</p>
          {description && <p className="text-sm text-surface-muted">{description}</p>}
        </div>
        {actionLabel && actionHref && (
          <Link
            href={actionHref}
            className="shrink-0 text-sm font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            {actionLabel} →
          </Link>
        )}
      </div>
    );
  }

  const pad = { sm: "py-8", md: "py-12", lg: "py-16" }[size];

  return (
    <div className={cn("card text-center space-y-4", pad)}>
      {illustration ? (
        <div className="flex justify-center">{illustration}</div>
      ) : icon ? (
        <div className="flex justify-center text-surface-muted">{icon}</div>
      ) : null}
      <div className="space-y-1.5">
        <p className="font-semibold text-dark-100">{title}</p>
        {description && (
          <p className="text-sm text-surface-muted max-w-sm mx-auto">{description}</p>
        )}
      </div>
      {(actionLabel || secondaryLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          {actionLabel && actionHref && (
            <Link href={actionHref} className="btn-primary">
              {actionLabel}
            </Link>
          )}
          {secondaryLabel && secondaryHref && (
            <Link
              href={secondaryHref}
              className="text-sm font-medium text-brand-400 hover:text-brand-300"
            >
              {secondaryLabel} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Reusable empty-state illustrations. These are deliberately simple —
 *  just enough to give each major empty surface a unique face without
 *  pulling in an illustration library. They use `currentColor` so they
 *  adapt to the theme. */
export function EmptyIllustrationCalendar() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden className="h-20 w-auto text-brand-vivid/40">
      <rect x="12" y="16" width="96" height="56" rx="6" fill="currentColor" opacity="0.08" />
      <rect x="12" y="16" width="96" height="14" rx="6" fill="currentColor" opacity="0.18" />
      <rect x="28" y="8" width="4" height="14" rx="2" fill="currentColor" opacity="0.35" />
      <rect x="88" y="8" width="4" height="14" rx="2" fill="currentColor" opacity="0.35" />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4, 5].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={20 + col * 14}
            y={38 + row * 8}
            width={10}
            height={5}
            rx={1}
            fill="currentColor"
            opacity={0.12 + ((row + col) % 3) * 0.08}
          />
        ))
      )}
    </svg>
  );
}

export function EmptyIllustrationGroups() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden className="h-20 w-auto text-brand-vivid/40">
      <circle cx="40" cy="34" r="14" fill="currentColor" opacity="0.20" />
      <circle cx="60" cy="30" r="16" fill="currentColor" opacity="0.30" />
      <circle cx="82" cy="36" r="12" fill="currentColor" opacity="0.18" />
      <rect x="20" y="54" width="80" height="12" rx="6" fill="currentColor" opacity="0.12" />
    </svg>
  );
}

export function EmptyIllustrationBell() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden className="h-20 w-auto text-brand-vivid/40">
      <path
        d="M60 16c-9 0-16 7-16 16v8l-6 10h44l-6-10v-8c0-9-7-16-16-16z"
        fill="currentColor"
        opacity="0.2"
      />
      <circle cx="60" cy="58" r="5" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

export function EmptyIllustrationTrophy() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden className="h-20 w-auto text-accent-400/60">
      <path d="M40 16h40v20a20 20 0 0 1-40 0V16z" fill="currentColor" opacity="0.25" />
      <rect x="52" y="54" width="16" height="8" fill="currentColor" opacity="0.35" />
      <rect x="44" y="62" width="32" height="6" rx="1" fill="currentColor" opacity="0.45" />
      <path d="M40 22h-8a6 6 0 0 0 8 12" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.3" />
      <path d="M80 22h8a6 6 0 0 1-8 12" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.3" />
    </svg>
  );
}
