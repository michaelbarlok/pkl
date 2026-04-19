import { cn } from "@/lib/utils";

/** Base shimmer block. Use this when none of the presets below fit. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}

/** Circle used for avatar placeholders; size mirrors PlayerAvatar sizes. */
export function SkeletonAvatar({
  size = "md",
  className,
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}) {
  const sizes = {
    xs: "h-6 w-6",
    sm: "h-7 w-7",
    md: "h-8 w-8",
    lg: "h-10 w-10",
    xl: "h-14 w-14",
    "2xl": "h-20 w-20",
  };
  return <div className={cn("skeleton rounded-full", sizes[size], className)} />;
}

/** Horizontal row: avatar + two stacked text lines. Good for member lists,
 *  notifications, registrations — anything that loads as a list of people. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 py-2", className)}>
      <SkeletonAvatar size="sm" />
      <div className="flex-1 space-y-1.5">
        <div className="skeleton h-3.5 w-1/3" />
        <div className="skeleton h-3 w-1/4" />
      </div>
    </div>
  );
}

/** Card-shaped placeholder matching the .card primitive. Use for groups,
 *  sheets, tournaments list pages while data loads. */
export function SkeletonCard({
  lines = 3,
  hasHeader = true,
  className,
}: {
  lines?: number;
  hasHeader?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("card card-static space-y-3", className)}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-2">
          <div className="skeleton h-4 w-2/5" />
          <div className="skeleton h-5 w-14 rounded-full" />
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className={cn("skeleton h-3", i === lines - 1 ? "w-1/2" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/** A grid of skeleton cards, responsive like the real group / sheet grid. */
export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Compact stat tile placeholder matching the dashboard's stat cards. */
export function SkeletonStat() {
  return (
    <div className="card flex items-start gap-3 p-4 sm:p-5">
      <div className="skeleton h-9 w-9 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton h-7 w-12" />
      </div>
    </div>
  );
}

/** Table placeholder — N rows with a header. */
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="border-b border-surface-border px-4 py-2.5">
        <div className="skeleton h-3 w-24" />
      </div>
      <div className="divide-y divide-surface-border">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} className="px-4" />
        ))}
      </div>
    </div>
  );
}
