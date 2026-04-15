"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// ============================================================
// CSV parsing
// ============================================================

interface ParsedRow {
  player: string;
  rounds: string;
  step: string;
  lastPlayed: string;
  pct: string;
  selfRating: string;
  gender: string;
  signedUp: string;
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
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_%-]/g, "");
  headers.forEach((h, i) => {
    map[normalize(h)] = i;
  });
  return map;
}

function rowToParsed(row: string[], headerMap: Record<string, number>): ParsedRow {
  const get = (key: string) => (row[headerMap[key]] ?? "").trim();
  return {
    player: get("player"),
    rounds: get("rounds"),
    step: get("step"),
    lastPlayed: get("lastplayed"),
    pct: get(""),    // "%" normalizes to ""
    selfRating: get("selfrating"),
    gender: get("gender"),
    signedUp: get("signedup"),
  };
}

// The "%" column normalizes to empty string — handle specially
function rowToParsedFull(row: string[], headers: string[]): ParsedRow {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => { idx[normalize(h)] = i; });

  // Find the "%" column (exact or close)
  let pctIdx = -1;
  headers.forEach((h, i) => {
    if (h.trim() === "%" || h.toLowerCase().trim() === "pct" || h.toLowerCase().trim() === "win%") {
      pctIdx = i;
    }
  });

  const get = (key: string) => (row[idx[key]] ?? "").trim();

  return {
    player: get("player"),
    rounds: get("rounds"),
    step: get("step"),
    lastPlayed: get("lastplayed"),
    pct: pctIdx >= 0 ? (row[pctIdx] ?? "").trim() : "",
    selfRating: get("selfrating"),
    gender: get("gender"),
    signedUp: get("signedup"),
  };
}

// ============================================================
// Types
// ============================================================

interface GroupMember {
  playerId: string;
  displayName: string;
  currentStep: number;
}

interface PreviewRow extends ParsedRow {
  matched: boolean;
  matchedName?: string;
  matchedProfileId?: string;
}

interface RowResult {
  playerName: string;
  displayName?: string;
  status: "updated" | "added_to_group" | "pending" | "not_found" | "error";
  error?: string;
}

// ============================================================
// Page
// ============================================================

export default function ImportStepsPage() {
  const { id: groupId } = useParams<{ id: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [summary, setSummary] = useState<{ updated: number; addedToGroup: number; pending: number; errors: number } | null>(null);

  // Load group members for matching
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/groups/${groupId}/import-steps`);
        if (res.ok) {
          const data = await res.json();
          setGroupMembers(data.members ?? []);
        }
      } finally {
        setMembersLoading(false);
      }
    }
    load();
  }, [groupId]);

  function matchRows(parsed: ParsedRow[]): PreviewRow[] {
    const memberMap = new Map<string, GroupMember>();
    for (const m of groupMembers) {
      memberMap.set(m.displayName.toLowerCase().trim(), m);
    }

    return parsed.map((row) => {
      const key = row.player.toLowerCase().trim();
      const member = memberMap.get(key);
      return {
        ...row,
        matched: !!member,
        matchedName: member?.displayName,
        matchedProfileId: member?.playerId,
      };
    });
  }

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
        const { headers, rows: csvRows } = parseCSV(text);

        const headerLower = headers.map((h) => h.toLowerCase());
        if (!headerLower.some((h) => h.includes("player"))) {
          setParseError("CSV must have a 'Player' column with display names.");
          setRows([]);
          return;
        }

        const parsed = csvRows
          .map((row) => rowToParsedFull(row, headers))
          .filter((r) => r.player.length > 0);

        if (parsed.length === 0) {
          setParseError("No valid rows found in CSV.");
          setRows([]);
          return;
        }

        setRows(matchRows(parsed));
      } catch {
        setParseError("Failed to parse CSV. Please check the file format.");
        setRows([]);
      }
    };
    reader.readAsText(file);
  }

  async function handleSubmit() {
    const matched = rows.filter((r) => r.matched);
    if (matched.length === 0) return;
    setSubmitting(true);
    setResults(null);

    try {
      const payload = matched.map((r) => ({
        playerName: r.player,
        step: r.step ? parseInt(r.step, 10) : undefined,
        winPct: r.pct ? parseFloat(r.pct) : undefined,
        totalSessions: r.rounds ? parseInt(r.rounds, 10) : undefined,
        lastPlayedAt: r.lastPlayed || undefined,
        joinedAt: r.signedUp || undefined,
        skillLevel: r.selfRating ? parseFloat(r.selfRating) : undefined,
      }));

      const res = await fetch(`/api/admin/groups/${groupId}/import-steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });

      const data = await res.json();
      if (!res.ok) {
        setParseError(data.error ?? "Import failed");
      } else {
        setResults(data.results);
        setSummary({ updated: data.updated, addedToGroup: data.addedToGroup ?? 0, pending: data.pending ?? 0, errors: data.errors });
        setRows([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      setParseError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const matchedCount = rows.filter((r) => r.matched).length;
  const unmatchedCount = rows.filter((r) => !r.matched).length;
  const hasPreview = rows.length > 0;
  const isDone = results !== null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/groups/${groupId}`}
          className="inline-flex items-center gap-1 text-sm text-dark-300 hover:text-dark-100 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Group
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-dark-100">Import Player Steps</h1>
        <p className="mt-1 text-surface-muted">
          Upload a CSV of player stats to update group membership data. Players are matched by display name.
          Unmatched rows are skipped.
        </p>
      </div>

      {/* Expected format */}
      <div className="card border border-surface-border">
        <h2 className="text-sm font-semibold text-dark-100 mb-2">Expected CSV columns</h2>
        <p className="text-xs text-surface-muted mb-2">Comma or tab-separated. <span className="font-medium text-dark-200">Player</span> is required (matched against member display names).</p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b border-surface-border">
                {["Player", "Rounds", "Step", "Last Played", "%", "Self-Rating", "Gender", "Signed-up"].map((h) => (
                  <th key={h} className="text-left px-2 py-1.5 text-dark-200 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-surface-muted">
                <td className="px-2 py-1.5">Jane Smith</td>
                <td className="px-2 py-1.5">24</td>
                <td className="px-2 py-1.5">7</td>
                <td className="px-2 py-1.5">2026-03-15</td>
                <td className="px-2 py-1.5">62.5</td>
                <td className="px-2 py-1.5">3.5</td>
                <td className="px-2 py-1.5">Female</td>
                <td className="px-2 py-1.5">2024-01-10</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 1: Upload */}
      {!isDone && (
        <div className="card border border-surface-border space-y-4">
          <h2 className="text-base font-semibold text-dark-100">Step 1 — Upload CSV</h2>
          {membersLoading && (
            <p className="text-sm text-surface-muted">Loading group members…</p>
          )}
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">CSV File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileChange}
              disabled={membersLoading}
              className="block w-full text-sm text-dark-200 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-brand-300/20 file:text-brand-300 hover:file:bg-brand-300/30 cursor-pointer disabled:opacity-50"
            />
          </div>
          {parseError && <p className="text-sm text-red-400">{parseError}</p>}
        </div>
      )}

      {/* Step 2: Preview */}
      {hasPreview && !isDone && (
        <div className="card border border-surface-border space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-dark-100">
              Step 2 — Preview
            </h2>
            <div className="flex gap-3 text-xs">
              {matchedCount > 0 && (
                <span className="flex items-center gap-1 text-teal-400">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" /></svg>
                  {matchedCount} matched
                </span>
              )}
              {unmatchedCount > 0 && (
                <span className="flex items-center gap-1 text-amber-400">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" /></svg>
                  {unmatchedCount} unmatched (will be skipped)
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-md border border-surface-border">
            <table className="text-xs w-full min-w-max">
              <thead className="sticky top-0 bg-surface-raised z-10">
                <tr className="border-b border-surface-border">
                  <th className="text-left px-3 py-2 text-dark-200 font-medium">Player</th>
                  <th className="text-left px-3 py-2 text-dark-200 font-medium">Step</th>
                  <th className="text-left px-3 py-2 text-dark-200 font-medium">%</th>
                  <th className="text-left px-3 py-2 text-dark-200 font-medium">Rounds</th>
                  <th className="text-left px-3 py-2 text-dark-200 font-medium">Last Played</th>
                  <th className="text-left px-3 py-2 text-dark-200 font-medium">Rating</th>
                  <th className="text-left px-3 py-2 text-dark-200 font-medium">Match</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-b border-surface-border/50 last:border-0 ${r.matched ? "" : "opacity-50"}`}
                  >
                    <td className="px-3 py-2 text-dark-100">{r.player}</td>
                    <td className="px-3 py-2 text-dark-200">{r.step || <span className="text-surface-muted">—</span>}</td>
                    <td className="px-3 py-2 text-dark-200">{r.pct || <span className="text-surface-muted">—</span>}</td>
                    <td className="px-3 py-2 text-dark-200">{r.rounds || <span className="text-surface-muted">—</span>}</td>
                    <td className="px-3 py-2 text-dark-200">{r.lastPlayed || <span className="text-surface-muted">—</span>}</td>
                    <td className="px-3 py-2 text-dark-200">{r.selfRating || <span className="text-surface-muted">—</span>}</td>
                    <td className="px-3 py-2">
                      {r.matched ? (
                        <span className="inline-flex items-center gap-1 text-teal-400">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                          {r.matchedName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                          No match
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || matchedCount === 0}
              className="btn-primary"
            >
              {submitting ? "Importing…" : `Import ${matchedCount} player${matchedCount !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => {
                setRows([]);
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
              {summary.updated > 0 && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 text-xs font-bold">{summary.updated}</span>
                  <span className="text-dark-200">stats updated</span>
                </div>
              )}
              {summary.addedToGroup > 0 && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold">{summary.addedToGroup}</span>
                  <span className="text-dark-200">added to group</span>
                </div>
              )}
              {summary.pending > 0 && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">{summary.pending}</span>
                  <span className="text-dark-200">pending (no account yet)</span>
                </div>
              )}
              {summary.errors > 0 && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-xs font-bold">{summary.errors}</span>
                  <span className="text-dark-200">error{summary.errors !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
            {summary.pending > 0 && (
              <p className="mt-3 text-xs text-surface-muted">
                Pending players will be automatically added to the group with their imported stats when they create an account.
              </p>
            )}
          </div>

          {results && results.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-surface-border">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-raised">
                    <th className="text-left px-3 py-2 text-dark-200 font-medium">Player (CSV)</th>
                    <th className="text-left px-3 py-2 text-dark-200 font-medium">Matched Name</th>
                    <th className="text-left px-3 py-2 text-dark-200 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-surface-border/50 last:border-0">
                      <td className="px-3 py-2 text-dark-100">{r.playerName}</td>
                      <td className="px-3 py-2 text-dark-200">{r.displayName ?? <span className="text-surface-muted">—</span>}</td>
                      <td className="px-3 py-2">
                        {r.status === "updated" && (
                          <span className="inline-flex items-center gap-1 text-teal-400">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            Updated
                          </span>
                        )}
                        {r.status === "added_to_group" && (
                          <span className="inline-flex items-center gap-1 text-blue-400">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3M13.5 4.5 12 3m0 0-1.5 1.5M12 3v13.5" /></svg>
                            Added to group
                          </span>
                        )}
                        {r.status === "pending" && (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                            Pending signup
                          </span>
                        )}
                        {r.status === "not_found" && (
                          <span className="text-amber-400">Not found</span>
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
              }}
              className="btn-secondary"
            >
              Import another file
            </button>
            <Link href={`/admin/groups/${groupId}`} className="btn-primary">
              Back to Group
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
