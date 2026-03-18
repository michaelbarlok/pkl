"use client";

import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import { DivisionCheckboxes } from "@/components/division-checkboxes";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function EditTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState("single_elimination");
  const [type, setType] = useState("doubles");
  const [divisions, setDivisions] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [playerCap, setPlayerCap] = useState("");
  const [maxTeamsPerDivision, setMaxTeamsPerDivision] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [registrationOpensAt, setRegistrationOpensAt] = useState("");
  const [registrationClosesAt, setRegistrationClosesAt] = useState("");
  const [scoreToWinPool, setScoreToWinPool] = useState("11");
  const [scoreToWinPlayoff, setScoreToWinPlayoff] = useState("11");
  const [finalsBestOf3, setFinalsBestOf3] = useState(false);

  const [savedLocations, setSavedLocations] = useState<{ name: string; cityState: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [tournamentRes, sheetsRes, tournamentsLocRes] = await Promise.all([
        supabase.from("tournaments").select("*").eq("id", id).single(),
        supabase.from("signup_sheets").select("location, group:shootout_groups(city, state)"),
        supabase.from("tournaments").select("location"),
      ]);

      const data = tournamentRes.data;
      if (data) {
        setTitle(data.title);
        setDescription(data.description ?? "");
        setFormat(data.format);
        setType(data.type);
        setDivisions(data.divisions ?? []);
        setStartDate(data.start_date);
        setEndDate(data.end_date);
        setStartTime(data.start_time ?? "");
        setLocation(data.location);
        setPlayerCap(data.player_cap?.toString() ?? "");
        setMaxTeamsPerDivision(data.max_teams_per_division?.toString() ?? "");
        setEntryFee(data.entry_fee ?? "");
        setRegistrationOpensAt(data.registration_opens_at?.slice(0, 16) ?? "");
        setRegistrationClosesAt(data.registration_closes_at?.slice(0, 16) ?? "");
        setScoreToWinPool(data.score_to_win_pool?.toString() ?? "11");
        setScoreToWinPlayoff(data.score_to_win_playoff?.toString() ?? "11");
        setFinalsBestOf3(data.finals_best_of_3 ?? false);
      }

      // Build location dropdown options
      const locMap = new Map<string, string>();
      for (const s of sheetsRes.data ?? []) {
        const loc = s.location?.trim();
        if (!loc) continue;
        if (!locMap.has(loc)) {
          const g = s.group as any;
          const cs = [g?.city, g?.state].filter(Boolean).join(", ");
          locMap.set(loc, cs);
        }
      }
      for (const t of tournamentsLocRes.data ?? []) {
        const loc = (t as any).location?.trim();
        if (loc && !locMap.has(loc)) locMap.set(loc, "");
      }
      const sorted = Array.from(locMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, cityState]) => ({ name, cityState }));
      setSavedLocations(sorted);

      setLoading(false);
    }
    load();
  }, [id, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (divisions.length === 0) {
      setError("Please select at least one division");
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("tournaments")
      .update({
        title: title.trim(),
        description: description.trim() || null,
        format,
        type,
        divisions,
        start_date: startDate,
        end_date: endDate || startDate,
        start_time: startTime || null,
        location: location.trim(),
        player_cap: playerCap ? parseInt(playerCap) : null,
        max_teams_per_division: maxTeamsPerDivision ? parseInt(maxTeamsPerDivision) : null,
        entry_fee: entryFee.trim() || null,
        registration_opens_at: registrationOpensAt || null,
        registration_closes_at: registrationClosesAt || null,
        score_to_win_pool: format === "round_robin" ? parseInt(scoreToWinPool) || 11 : null,
        score_to_win_playoff: format === "round_robin" ? parseInt(scoreToWinPlayoff) || 11 : null,
        finals_best_of_3: format === "round_robin" ? finalsBestOf3 : false,
      })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    router.push(`/tournaments/${id}`);
  }

  if (loading) return <div className="text-center py-12 text-surface-muted">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-dark-100">Edit Tournament</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">Tournament Name *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input" maxLength={120} required />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-[80px]" maxLength={5000} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Format *</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="input">
              <option value="single_elimination">Single Elimination</option>
              <option value="double_elimination">Double Elimination</option>
              <option value="round_robin">Round Robin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Type *</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input">
              <option value="doubles">Doubles</option>
              <option value="singles">Singles</option>
            </select>
          </div>
        </div>

        {/* Round Robin Settings */}
        {format === "round_robin" && (
          <div className="rounded-lg border border-surface-border p-4 space-y-4">
            <p className="text-sm font-medium text-dark-200">Round Robin Settings</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-dark-200 mb-1">Round Robin Score to Win</label>
                <input
                  type="number"
                  value={scoreToWinPool}
                  onChange={(e) => setScoreToWinPool(e.target.value)}
                  className="input"
                  min={1}
                  placeholder="11"
                />
                <p className="text-xs text-surface-muted mt-1">Points needed to win a pool play game</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-200 mb-1">Playoff Score to Win</label>
                <input
                  type="number"
                  value={scoreToWinPlayoff}
                  onChange={(e) => setScoreToWinPlayoff(e.target.value)}
                  className="input"
                  min={1}
                  placeholder="11"
                />
                <p className="text-xs text-surface-muted mt-1">Points needed to win a playoff game</p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={finalsBestOf3}
                onChange={(e) => setFinalsBestOf3(e.target.checked)}
                className="rounded border-surface-border text-brand-300 focus:ring-brand-300"
              />
              <span className="text-sm text-dark-200">Finals &mdash; Best 2 out of 3</span>
            </label>
            <p className="text-xs text-surface-muted -mt-2">
              Championship match will be best 2 out of 3 games (each played to the playoff score above)
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-dark-200 mb-2">Divisions *</label>
          <div className="rounded-lg border border-surface-border p-4">
            <DivisionCheckboxes selected={divisions} onChange={setDivisions} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Start Date *</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" min={startDate} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Start Time</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Location *</label>
            {savedLocations.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={savedLocations.some((l) => l.name === location) ? location : "__custom__"}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setLocation("");
                    } else {
                      setLocation(e.target.value);
                    }
                  }}
                  className="input"
                >
                  {savedLocations.map((loc) => (
                    <option key={loc.name} value={loc.name}>
                      {loc.name}{loc.cityState ? ` — ${loc.cityState}` : ""}
                    </option>
                  ))}
                  <option value="__custom__">+ Add new location</option>
                </select>
                {!savedLocations.some((l) => l.name === location) && (
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="input"
                    placeholder="Enter new location name"
                    required
                  />
                )}
              </div>
            ) : (
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="input" required />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Player/Team Cap</label>
            <input type="number" value={playerCap} onChange={(e) => setPlayerCap(e.target.value)} className="input" min={2} placeholder="Leave blank for unlimited" />
            <p className="text-xs text-surface-muted mt-1">Overall tournament cap</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Max Teams per Division</label>
            <input type="number" value={maxTeamsPerDivision} onChange={(e) => setMaxTeamsPerDivision(e.target.value)} className="input" min={2} placeholder="Leave blank for unlimited" />
            <p className="text-xs text-surface-muted mt-1">Extra teams go on a waitlist</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Entry Fee</label>
            <input type="text" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Registration Opens</label>
            <input type="datetime-local" value={registrationOpensAt} onChange={(e) => setRegistrationOpensAt(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Registration Closes</label>
            <input type="datetime-local" value={registrationClosesAt} onChange={(e) => setRegistrationClosesAt(e.target.value)} className="input" />
          </div>
        </div>

        <FormError message={error} />

        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={submitting}>
            {submitting ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
