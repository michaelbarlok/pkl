"use client";

import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import { getDivisionLabel } from "@/lib/divisions";
import type { TournamentRegistration } from "@/types/database";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  tournamentId: string;
  tournamentType: string;
  divisions: string[];
  myRegistration: TournamentRegistration | null;
  playerCap: number | null | undefined;
  maxTeamsPerDivision: number | null | undefined;
  confirmedCount: number;
  divisionConfirmedCounts: Record<string, number>;
}

export function TournamentRegistrationButton({
  tournamentId,
  tournamentType,
  divisions,
  myRegistration,
  playerCap,
  maxTeamsPerDivision,
  confirmedCount,
  divisionConfirmedCounts,
}: Props) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDivision, setSelectedDivision] = useState(
    divisions.length === 1 ? divisions[0] : ""
  );
  const [partnerSearch, setPartnerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; display_name: string }[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<{ id: string; display_name: string } | null>(null);
  const [showPartnerSearch, setShowPartnerSearch] = useState(false);
  // Doubles players who don't yet have a partner can opt into the
  // need-partner pool; their registered-list entry renders a badge
  // and other players can send them an "Ask to Partner" request.
  const [needPartner, setNeedPartner] = useState(false);

  async function searchPartners(query: string) {
    setPartnerSearch(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", `%${query}%`)
      .limit(5);
    setSearchResults(data ?? []);
  }

  async function handleRegister() {
    setLoading(true);
    setError("");

    if (tournamentType === "doubles" && !selectedPartner && !needPartner) {
      setError("Please select a partner or check \"I need a partner\"");
      setLoading(false);
      return;
    }

    if (divisions.length > 1 && !selectedDivision) {
      setError("Please select a division");
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partner_id: needPartner ? null : selectedPartner?.id || null,
        division: selectedDivision || divisions[0] || null,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Registration failed");
      setLoading(false);
      return;
    }

    // Flip the spinner off as soon as the server ack comes back. The
    // tournament page still runs router.refresh() in the background,
    // and once the fresh `myRegistration` prop lands this component
    // swaps to the "You're registered!" branch on its own. Without
    // this, the button reads "Registering…" for as long as the full
    // server render takes, which can be several seconds on big
    // tournaments with lots of joins.
    setLoading(false);
    router.refresh();
  }

  async function handleWithdraw() {
    if (!confirm("Are you sure you want to withdraw?")) return;
    setLoading(true);
    setError("");

    const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Withdrawal failed");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  // Already registered
  if (myRegistration) {
    return (
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-teal-vivid">
              {myRegistration.status === "confirmed" ? "You're registered!" : "You're on the waitlist"}
            </p>
            {myRegistration.division && (
              <p className="text-xs text-surface-muted">Division: {getDivisionLabel(myRegistration.division)}</p>
            )}
            {myRegistration.waitlist_position && (
              <p className="text-xs text-surface-muted">Waitlist position #{myRegistration.waitlist_position}</p>
            )}
          </div>
          <button onClick={handleWithdraw} disabled={loading} className="btn-secondary text-xs !border-red-500/50 !text-red-400">
            {loading ? "..." : "Withdraw"}
          </button>
        </div>
        <FormError message={error} />
      </div>
    );
  }

  // Determine if the selected division (or overall tournament) is full
  const activeDivision = selectedDivision || (divisions.length === 1 ? divisions[0] : "");
  const divisionFull = maxTeamsPerDivision != null && activeDivision
    ? (divisionConfirmedCounts[activeDivision] ?? 0) >= maxTeamsPerDivision
    : false;
  const overallFull = playerCap != null && confirmedCount >= playerCap;
  const willWaitlist = divisionFull || overallFull;

  return (
    <div className="card space-y-3">
      {/* Division selector */}
      {divisions.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">Division *</label>
          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="input"
            required
          >
            <option value="">Select a division...</option>
            {divisions.map((code) => {
              const count = divisionConfirmedCounts[code] ?? 0;
              const full = maxTeamsPerDivision != null && count >= maxTeamsPerDivision;
              return (
                <option key={code} value={code}>
                  {getDivisionLabel(code)}
                  {maxTeamsPerDivision != null ? ` (${count}/${maxTeamsPerDivision}${full ? " — Waitlist" : ""})` : ""}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Division full notice */}
      {activeDivision && divisionFull && (
        <p className="text-xs text-amber-400">
          This division is full. You&apos;ll be added to the waitlist and notified by email if a spot opens up.
        </p>
      )}

      {/* Partner search for doubles */}
      {tournamentType === "doubles" && (
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">Partner</label>
          {needPartner ? (
            <div className="rounded-md bg-accent-500/10 border border-accent-500/40 px-3 py-2 text-xs text-dark-200">
              You&apos;ll show up as <span className="font-medium text-accent-300">Need Partner</span> on the registered list. Other players can send you an &quot;Ask to Partner&quot; request.
              <button
                type="button"
                onClick={() => setNeedPartner(false)}
                className="ml-2 text-surface-muted hover:text-dark-100 underline"
              >
                Change
              </button>
            </div>
          ) : selectedPartner ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-dark-100">{selectedPartner.display_name}</span>
              <button
                onClick={() => { setSelectedPartner(null); setShowPartnerSearch(true); }}
                className="text-xs text-surface-muted hover:text-dark-200"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={partnerSearch}
                onChange={(e) => searchPartners(e.target.value)}
                onFocus={() => setShowPartnerSearch(true)}
                className="input"
                placeholder="Search by name..."
              />
              {showPartnerSearch && searchResults.length > 0 && (
                <div className="mt-1 rounded-lg bg-surface-raised border border-surface-border overflow-hidden">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPartner(p);
                        setShowPartnerSearch(false);
                        setPartnerSearch("");
                        setSearchResults([]);
                      }}
                      className="w-full px-3 py-2.5 text-left text-sm text-dark-100 hover:bg-surface-overlay focus:bg-surface-overlay focus:outline-none transition-colors"
                    >
                      {p.display_name}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setNeedPartner(true);
                  setShowPartnerSearch(false);
                  setPartnerSearch("");
                  setSearchResults([]);
                }}
                className="text-xs text-brand-vivid hover:underline"
              >
                I don&apos;t have a partner yet &mdash; find one for me
              </button>
            </div>
          )}
        </div>
      )}

      <FormError message={error} />

      <button
        onClick={handleRegister}
        disabled={loading}
        className="btn-primary w-full"
      >
        {loading ? "Registering..." : willWaitlist ? "Join Waitlist" : "Register"}
      </button>
    </div>
  );
}
