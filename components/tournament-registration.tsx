"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import type { TournamentRegistration } from "@/types/database";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  tournamentId: string;
  tournamentType: string;
  myRegistration: TournamentRegistration | null;
  playerCap: number | null | undefined;
  confirmedCount: number;
}

export function TournamentRegistrationButton({
  tournamentId,
  tournamentType,
  myRegistration,
  playerCap,
  confirmedCount,
}: Props) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; display_name: string }[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<{ id: string; display_name: string } | null>(null);
  const [showPartnerSearch, setShowPartnerSearch] = useState(false);

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

    if (tournamentType === "doubles" && !selectedPartner) {
      setError("Please select a partner for doubles");
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partner_id: selectedPartner?.id || null,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Registration failed");
      setLoading(false);
      return;
    }

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
            <p className="text-sm font-medium text-teal-300">
              {myRegistration.status === "confirmed" ? "You're registered!" : "You're on the waitlist"}
            </p>
            {myRegistration.waitlist_position && (
              <p className="text-xs text-surface-muted">Position #{myRegistration.waitlist_position}</p>
            )}
          </div>
          <button onClick={handleWithdraw} disabled={loading} className="btn-secondary text-xs !border-red-500/50 !text-red-400">
            {loading ? "..." : "Withdraw"}
          </button>
        </div>
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>
    );
  }

  const isFull = playerCap != null && confirmedCount >= playerCap;

  return (
    <div className="card space-y-3">
      {tournamentType === "doubles" && (
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">Partner</label>
          {selectedPartner ? (
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
            <div>
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
                      className="w-full px-3 py-2 text-left text-sm text-dark-100 hover:bg-surface-overlay"
                    >
                      {p.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={handleRegister}
        disabled={loading}
        className="btn-primary w-full"
      >
        {loading ? "Registering..." : isFull ? "Join Waitlist" : "Register"}
      </button>
    </div>
  );
}
