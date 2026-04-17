import Link from "next/link";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  /** Renders a compact horizontal banner instead of a centered block */
  inline?: boolean;
}

export function EmptyState({ icon, title, description, actionLabel, actionHref, inline }: EmptyStateProps) {
  if (inline) {
    return (
      <div className="card flex items-center gap-4">
        {icon && (
          <div className="shrink-0 text-surface-muted">{icon}</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-dark-100">{title}</p>
          {description && (
            <p className="text-sm text-surface-muted">{description}</p>
          )}
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

  return (
    <div className="card text-center py-12 space-y-3">
      {icon && (
        <div className="flex justify-center text-surface-muted">{icon}</div>
      )}
      <p className="font-medium text-dark-100">{title}</p>
      {description && (
        <p className="text-sm text-surface-muted max-w-sm mx-auto">{description}</p>
      )}
      {actionLabel && actionHref && (
        <Link href={actionHref} className="inline-block text-sm font-medium text-brand-400 hover:text-brand-300">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
