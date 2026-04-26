"use client";

import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import { DivisionCheckboxes } from "@/components/division-checkboxes";
import { DivisionStartTimes } from "@/components/division-start-times";
import { TournamentLogoUpload } from "@/components/tournament-logo-upload";
import { fifteenMinuteSlots, isoToLocalDateTimeInput, localDateTimeToIso } from "@/lib/datetime-local";
import { DateTimeFifteenMin } from "@/components/date-time-15";
import { getDivisionGender } from "@/lib/divisions";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TIME_SLOTS = fifteenMinuteSlots();

export default function EditTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState("round_robin");
  const [type, setType] = useState("doubles");
  const [divisions, setDivisions] = useState<string[]>([]);
  // Per-division start time overrides loaded from division_settings.
  const [divisionStartTimes, setDivisionStartTimes] = useState<Record<string, string>>({});
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [playerCap, setPlayerCap] = useState("");
  const [maxTeamsPerDivision, setMaxTeamsPerDivision] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [paymentOptions, setPaymentOptions] = useState<Record<string, string>>({});
  const [paymentLink, setPaymentLink] = useState("");
  const [paymentDirections, setPaymentDirections] = useState("");
  const [registrationOpensAt, setRegistrationOpensAt] = useState("");
  const [registrationClosesAt, setRegistrationClosesAt] = useState("");
  const [scoreToWinPool, setScoreToWinPool] = useState("11");
  const [scoreToWinPlayoff, setScoreToWinPlayoff] = useState("11");
  const [finalsBestOf3, setFinalsBestOf3] = useState(false);
  const [winBy2, setWinBy2] = useState(false);
  const [numCourts, setNumCourts] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

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
        // Hydrate per-division start times from the JSONB column.
        const settings = (data as any).division_settings ?? {};
        const times: Record<string, string> = {};
        for (const [code, val] of Object.entries(settings)) {
          const t = (val as { start_time?: string } | null)?.start_time;
          if (t) times[code] = t;
        }
        setDivisionStartTimes(times);
        setStartDate(data.start_date);
        setEndDate(data.end_date);
        setStartTime(data.start_time ?? "");
        setLocation(data.location);
        setPlayerCap(data.player_cap?.toString() ?? "");
        setMaxTeamsPerDivision(data.max_teams_per_division?.toString() ?? "");
        setEntryFee(data.entry_fee ?? "");
        if (Array.isArray((data as any).payment_options)) {
          const opts: Record<string, string> = {};
          for (const opt of (data as any).payment_options) {
            if (opt?.method) opts[opt.method] = opt.detail ?? "";
          }
          setPaymentOptions(opts);
        }
        setPaymentLink((data as any).payment_link ?? "");
        setPaymentDirections((data as any).payment_directions ?? "");
        setRegistrationOpensAt(isoToLocalDateTimeInput(data.registration_opens_at));
        setRegistrationClosesAt(isoToLocalDateTimeInput(data.registration_closes_at));
        setScoreToWinPool(data.score_to_win_pool?.toString() ?? "11");
        setScoreToWinPlayoff(data.score_to_win_playoff?.toString() ?? "11");
        setFinalsBestOf3(data.finals_best_of_3 ?? false);
        setWinBy2((data as any).win_by_2 ?? false);
        setNumCourts((data as any).num_courts?.toString() ?? "");
        setLogoUrl((data as any).logo_url ?? null);
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

    // Cross-field date sanity — same rules as the create form.
    const opensIso = localDateTimeToIso(registrationOpensAt);
    const closesIso = localDateTimeToIso(registrationClosesAt);
    if (opensIso && closesIso && new Date(opensIso) >= new Date(closesIso)) {
      setError("Registration closes before it opens — check the dates.");
      setSubmitting(false);
      return;
    }
    if (startDate && closesIso && new Date(closesIso) > new Date(`${startDate}T23:59`)) {
      setError("Registration must close on or before the tournament start date.");
      setSubmitting(false);
      return;
    }

    // Mixed must run at a different time than gendered divisions —
    // a player can register Men's/Women's AND Mixed and can't be on
    // two courts at once. Same rule the create form enforces.
    const genderedTimes = new Set<string>();
    for (const d of divisions) {
      const g = getDivisionGender(d);
      const t = divisionStartTimes[d]?.trim();
      if (!t) continue;
      if (g === "mens" || g === "womens") genderedTimes.add(t);
    }
    for (const d of divisions) {
      const g = getDivisionGender(d);
      const t = divisionStartTimes[d]?.trim();
      if (!t) continue;
      if (g === "mixed" && genderedTimes.has(t)) {
        setError(
          `Mixed divisions can't start at the same time as a Men's or Women's division (${t}). Stagger the start times.`
        );
        setSubmitting(false);
        return;
      }
    }

    // Build division_settings JSONB. Preserve any non-start_time
    // settings (games_per_team etc.) that may have been added later
    // by the bracket-generation flow — only overwrite start_time.
    const divisionSettings: Record<string, { start_time?: string }> = {};
    for (const d of divisions) {
      const t = divisionStartTimes[d]?.trim();
      if (t) divisionSettings[d] = { start_time: t };
    }

    // Route through the server API so organizer auth + validation
    // (type flip, division removal) run before the write. Previously
    // we wrote direct via supabase-js which only had RLS to rely on.
    const res = await fetch(`/api/tournaments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
        payment_options: Object.keys(paymentOptions).length > 0
          ? Object.entries(paymentOptions).map(([method, detail]) => ({ method, detail }))
          : null,
        payment_link: paymentLink.trim() || null,
        payment_directions: paymentDirections.trim() || null,
        registration_opens_at: opensIso,
        registration_closes_at: closesIso,
        score_to_win_pool: format === "round_robin" ? parseInt(scoreToWinPool) || 11 : null,
        score_to_win_playoff: format === "round_robin" ? parseInt(scoreToWinPlayoff) || 11 : null,
        finals_best_of_3: format === "round_robin" ? finalsBestOf3 : false,
        win_by_2: winBy2,
        num_courts: numCourts ? parseInt(numCourts) || null : null,
        division_settings: Object.keys(divisionSettings).length > 0 ? divisionSettings : null,
        logo_url: logoUrl,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save changes");
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
        <TournamentLogoUpload
          tournamentId={id}
          currentUrl={logoUrl}
          onUploaded={setLogoUrl}
        />

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
            <label className="block text-sm font-medium text-dark-200 mb-1">Format</label>
            {/* Format is currently locked to whatever was set at
                 creation. Round Robin is the only user-facing option
                 right now; Single / Double Elimination stay visible
                 as read-only labels so editing a legacy tournament
                 doesn't silently flip its format. */}
            <p className="input !bg-surface-overlay text-sm text-dark-200 cursor-not-allowed">
              {format === "round_robin"
                ? "Round Robin"
                : format === "single_elimination"
                  ? "Single Elimination"
                  : format === "double_elimination"
                    ? "Double Elimination"
                    : format}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Type *</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input">
              <option value="doubles">Doubles</option>
              <option value="singles">Singles</option>
            </select>
          </div>
        </div>

        {/* Live-play logistics */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">
            Number of courts available
          </label>
          <input
            type="number"
            min={1}
            value={numCourts}
            onChange={(e) => setNumCourts(e.target.value)}
            className="input"
            placeholder="e.g. 4"
          />
          <p className="text-xs text-surface-muted mt-1">
            Used when divisions go live to auto-assign matches to courts. Leave blank if unknown.
          </p>
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={winBy2}
                onChange={(e) => setWinBy2(e.target.checked)}
                className="rounded border-surface-border text-brand-300 focus:ring-brand-300"
              />
              <span className="text-sm text-dark-200">Win by 2</span>
            </label>
            <p className="text-xs text-surface-muted -mt-2">
              Winning team must lead by at least 2 points (e.g. 12&ndash;10, 14&ndash;12). Score validation enforces this when entering match scores.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-dark-200 mb-2">Divisions *</label>
          <div className="rounded-lg border border-surface-border p-4 mb-3">
            <DivisionCheckboxes selected={divisions} onChange={setDivisions} />
          </div>
          <DivisionStartTimes
            selectedDivisions={divisions}
            values={divisionStartTimes}
            onChange={setDivisionStartTimes}
            defaultTime={startTime}
          />
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
            <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input">
              <option value="">—</option>
              {TIME_SLOTS.map((slot) => (
                <option key={slot.value} value={slot.value}>{slot.label}</option>
              ))}
            </select>
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
        {/* Entry Fee & Payment Options */}
        <div className="rounded-lg border border-surface-border p-4 space-y-4">
          <p className="text-sm font-medium text-dark-200">Entry Fee &amp; Payment</p>
          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">Entry Fee</label>
            <input
              type="text"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
              className="input"
              placeholder='e.g. "$20 per person"'
            />
          </div>
          <div>
            <p className="text-xs font-medium text-dark-200 mb-2">Payment Methods</p>
            <p className="text-xs text-surface-muted mb-3">
              Select how players can pay their entry fee.
            </p>
            <div className="space-y-3">
              {[
                { key: "venmo",  label: "Venmo",  placeholder: "@username" },
                { key: "paypal", label: "PayPal", placeholder: "email or paypal.me/username" },
                { key: "zelle",  label: "Zelle",  placeholder: "phone number or email" },
                { key: "cash",   label: "Cash",   placeholder: null },
                { key: "check",  label: "Check",  placeholder: "payable to..." },
                { key: "other",  label: "Other",  placeholder: "URL or description" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={key in paymentOptions}
                      onChange={(e) => {
                        setPaymentOptions((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) {
                            next[key] = "";
                          } else {
                            delete next[key];
                          }
                          return next;
                        });
                      }}
                      className="rounded border-surface-border text-brand-300 focus:ring-brand-300"
                    />
                    <span className="text-sm text-dark-200">{label}</span>
                  </label>
                  {key in paymentOptions && placeholder !== null && (
                    <input
                      type="text"
                      value={paymentOptions[key]}
                      onChange={(e) =>
                        setPaymentOptions((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="input mt-2 ml-6"
                      placeholder={placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">
              Payment Link
            </label>
            <input
              type="url"
              value={paymentLink}
              onChange={(e) => setPaymentLink(e.target.value)}
              className="input"
              placeholder="e.g. https://donate.example.org/pay"
            />
            <p className="text-xs text-surface-muted mt-1">
              Optional external link (donation page, payment portal, etc.)
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">
              Payment Directions
            </label>
            <textarea
              value={paymentDirections}
              onChange={(e) => setPaymentDirections(e.target.value)}
              className="input min-h-[72px]"
              maxLength={1000}
              placeholder="Any additional instructions for paying the entry fee..."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Registration Opens</label>
            <DateTimeFifteenMin
              value={registrationOpensAt}
              onChange={setRegistrationOpensAt}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Registration Closes</label>
            <DateTimeFifteenMin
              value={registrationClosesAt}
              onChange={setRegistrationClosesAt}
            />
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
