import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold text-dark-100">Page not found</h2>
      <p className="mt-2 text-sm text-surface-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="btn-primary mt-4">
        Go to Dashboard
      </Link>
    </div>
  );
}
