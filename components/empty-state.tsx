import Link from "next/link";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({ icon, title, description, actionLabel, actionHref }: EmptyStateProps) {
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
