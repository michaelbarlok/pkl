"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function InviteMemberPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, displayName }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to send invite");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/members"
          className="text-sm text-brand-600 hover:text-brand-500"
        >
          &larr; Back to Members
        </Link>
        <div className="card text-center space-y-4">
          <h2 className="text-xl font-semibold text-dark-100">Invite Sent!</h2>
          <p className="text-surface-muted">
            An invite email has been sent to <strong>{email}</strong>. They can
            click the link in the email to set up their account.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                setEmail("");
                setDisplayName("");
                setSuccess(false);
              }}
              className="btn-primary"
            >
              Invite Another
            </button>
            <Link href="/admin/members" className="btn-secondary">
              Back to Members
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/members"
          className="text-sm text-brand-600 hover:text-brand-500"
        >
          &larr; Back to Members
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-dark-100">
          Invite Member
        </h1>
        <p className="mt-1 text-surface-muted">
          Send an email invitation to join PKL.
        </p>
      </div>

      <div className="card max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-dark-200 mb-1"
            >
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
              placeholder="John Smith"
              required
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-dark-200 mb-1"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="john@example.com"
              required
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Sending Invite..." : "Send Invite"}
          </button>
        </form>
      </div>
    </div>
  );
}
