"use client";

import { useState, useRef } from "react";
import Link from "next/link";

// ============================================================
// CSV parsing
// ============================================================

interface ParsedMember {
  firstName: string;
  lastName: string;
  email: string;
  gender: string;
  phone: string;
  dateOfBirth: string;
  selfRating: string;
}

function detectDelimiter(header: string): string {
  return header.includes("\t") ? "\t" : ",";
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) =>
    line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""))
  );
  return { headers, rows };
}

function mapHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  headers.forEach((h, i) => {
    map[normalize(h)] = i;
  });
  return map;
}

function rowToMember(row: string[], headerMap: Record<string, number>): ParsedMember {
  const get = (key: string) => (row[headerMap[key]] ?? "").trim();
  return {
    firstName: get("firstname"),
    lastName: get("lastname"),
    email: get("email"),
    gender: get("gender"),
    phone: get("phone"),
    dateOfBirth: get("dateofbirth"),
    selfRating: get("selfrating"),
  };
}

// ============================================================
// Result types
// ============================================================

interface ImportResult {
  email: string;
  displayName: string;
  status: "invited" | "already_member" | "already_invited" | "error";
  error?: string;
}

// ============================================================
// Page
// ============================================================

export default function ImportMembersPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [members, setMembers] = useState<ParsedMember[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [summary, setSummary] = useState<{ invited: number; skipped: number; errors: number } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setResults(null);
    setSummary(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const { headers, rows } = parseCSV(text);
        const headerMap = mapHeaders(headers);

        if (!("email" in headerMap)) {
          setParseError("CSV must have an 'Email' column.");
          setMembers([]);
          return;
        }

        const parsed = rows
          .map((row) => rowToMember(row, headerMap))
          .filter((m) => m.email.length > 0);

        if (parsed.length === 0) {
          setParseError("No valid rows found in CSV.");
          setMembers([]);
          return;
        }

        setMembers(parsed);
      } catch {
        setParseError("Failed to parse CSV. Please check the file format.");
        setMembers([]);
      }
    };
    reader.readAsText(file);
  }

  async function handleSubmit() {
    if (members.length === 0) return;
    setSubmitting(true);
    setResults(null);

    try {
      const res = await fetch("/api/admin/import-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          members: members.map((m) => ({
            firstName: m.firstName,
            lastName: m.lastName,
            email: m.email,
            gender: m.gender || undefined,
            phone: m.phone || undefined,
            dateOfBirth: m.dateOfBirth || undefined,
            selfRating: m.selfRating ? parseFloat(m.selfRating) : undefined,
          })),
          message: message.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setParseError(data.error ?? "Import failed");
      } else {
        setResults(data.results);
        setSummary({ invited: data.invited, skipped: data.skipped, errors: data.errors });
        setMembers([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      setParseError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasPreview = members.length > 0;
  const isDone = results !== null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/members" className="inline-flex items-center gap-1 text-sm text-dark-300 hover:text-dark-100 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Members
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-dark-100">Import Members</h1>
        <p className="mt-1 text-surface-muted">
          Upload a CSV to invite multiple members at once. Each person will receive an email with a link to set up their account.
        </p>
      </div>

      {/* Expected format */}
      <div className="card border border-surface-border">
        <h2 className="text-sm font-semibold text-dark-100 mb-2">Expected CSV columns</h2>
        <p className="text-xs text-surface-muted mb-2">Comma or tab-separated. Only <span className="font-medium text-dark-200">Email</span> is required.</p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b border-surface-border">
                {["First Name", "Last Name", "Email", "Gender", "Phone", "Date Of Birth", "Self-Rating"].map((h) => (
                  <th key={h} className="text-left px-2 py-1.5 text-dark-200 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-surface-muted">
                <td className="px-2 py-1.5">Jane</td>
                <td className="px-2 py-1.5">Smith</td>
                <td className="px-2 py-1.5">jane@example.com</td>
                <td className="px-2 py-1.5">Female</td>
                <td className="px-2 py-1.5">555-1234</td>
                <td className="px-2 py-1.5">1980-06-15</td>
                <td className="px-2 py-1.5">3.5</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 1: Upload */}
      {!isDone && (
        <div className="card border border-surface-border space-y-4">
          <h2 className="text-base font-semibold text-dark-100">Step 1 — Upload CSV</h2>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">CSV File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileChange}
              className="block w-full text-sm text-dark-200 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-brand-300/20 file:text-brand-300 hover:file:bg-brand-300/30 cursor-pointer"
            />
          </div>

          {parseError && (
            <p className="text-sm text-red-400">{parseError}</p>
          )}
        </div>
      )}

      {/* Step 2: Preview */}
      {hasPreview && !isDone && (
        <div className="card border border-surface-border space-y-4">
          <h2 className="text-base font-semibold text-dark-100">
            Step 2 — Preview
            <span className="ml-2 text-xs font-normal text-surface-muted">{members.length} row{members.length !== 1 ? "s" : ""}</span>
          </h2>

          <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-md border border-surface-border">
            <table className="text-xs w-full min-w-max">
              <thead className="sticky top-0 bg-surface-raised z-10">
                <tr className="border-b border-surface-border">
                  {["First Name", "Last Name", "Email", "Phone", "Rating"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-dark-200 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={i} className="border-b border-surface-border/50 last:border-0">
                    <td className="px-3 py-2 text-dark-100">{m.firstName || <span className="text-surface-muted">—</span>}</td>
                    <td className="px-3 py-2 text-dark-100">{m.lastName || <span className="text-surface-muted">—</span>}</td>
                    <td className="px-3 py-2 text-dark-200">{m.email}</td>
                    <td className="px-3 py-2 text-dark-200">{m.phone || <span className="text-surface-muted">—</span>}</td>
                    <td className="px-3 py-2 text-dark-200">{m.selfRating || <span className="text-surface-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Optional message */}
          <div>
            <label htmlFor="invite-message" className="block text-sm font-medium text-dark-200 mb-1">
              Custom message <span className="text-surface-muted font-normal">(optional)</span>
            </label>
            <textarea
              id="invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Add a personal note that will appear in the invite email…"
              className="input resize-none"
            />
            <p className="text-xs text-surface-muted mt-1">{message.length}/600</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? "Sending invites…" : `Send ${members.length} Invite${members.length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => {
                setMembers([]);
                setParseError(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="btn-secondary"
              disabled={submitting}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {isDone && summary && (
        <div className="space-y-4">
          <div className="card border border-surface-border">
            <h2 className="text-base font-semibold text-dark-100 mb-3">Import complete</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 text-xs font-bold">{summary.invited}</span>
                <span className="text-dark-200">invite{summary.invited !== 1 ? "s" : ""} sent</span>
              </div>
              {summary.skipped > 0 && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-overlay text-surface-muted text-xs font-bold">{summary.skipped}</span>
                  <span className="text-dark-200">skipped (already a member)</span>
                </div>
              )}
              {summary.errors > 0 && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-xs font-bold">{summary.errors}</span>
                  <span className="text-dark-200">error{summary.errors !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          </div>

          {results && results.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-surface-border">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-raised">
                    <th className="text-left px-3 py-2 text-dark-200 font-medium">Name</th>
                    <th className="text-left px-3 py-2 text-dark-200 font-medium">Email</th>
                    <th className="text-left px-3 py-2 text-dark-200 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-surface-border/50 last:border-0">
                      <td className="px-3 py-2 text-dark-100">{r.displayName}</td>
                      <td className="px-3 py-2 text-dark-200">{r.email}</td>
                      <td className="px-3 py-2">
                        {r.status === "invited" && (
                          <span className="inline-flex items-center gap-1 text-teal-400">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            Invited
                          </span>
                        )}
                        {r.status === "already_member" && (
                          <span className="text-surface-muted">Already a member</span>
                        )}
                        {r.status === "already_invited" && (
                          <span className="text-amber-400">Re-invited</span>
                        )}
                        {r.status === "error" && (
                          <span className="text-red-400">Error: {r.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setResults(null);
                setSummary(null);
                setParseError(null);
                setMessage("");
              }}
              className="btn-secondary"
            >
              Import another file
            </button>
            <Link href="/admin/members" className="btn-primary">
              Back to Members
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
