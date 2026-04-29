"use client";

import { FormError } from "@/components/form-error";
import { useConfirm } from "@/components/confirm-modal";
import { useSupabase } from "@/components/providers/supabase-provider";
import { getDivisionLabel, getDivisionGender } from "@/lib/divisions";
import type { TournamentRegistration } from "@/types/database";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  tournamentId: string;
  tournamentType: string;
  divisions: string[];
  /** Backwards-compat alias for myRegistrations[0]. */
  myRegistration: TournamentRegistration | null;
  /** Every non-withdrawn registration the viewer has — could be 0,
   *  1, or 2 (one gendered + one mixed). */
  myRegistrations?: TournamentRegistration[];
  /** Viewer's own profile id. Lets the row distinguish "I'm the
   *  registering player" from "I was added as the partner" so the
   *  button can read 'Withdraw' vs 'Decline partnership' with the
   *  matching server-side semantics. */
  myProfileId?: string;
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
  myRegistrations,
  myProfileId,
  playerCap,
  maxTeamsPerDivision,
  confirmedCount,
  divisionConfirmedCounts,
}: Props) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const confirm = useConfirm();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Partner-invite state. When the inviter clicks the "send invite
  // link" CTA, we hit the partner-invites API which registers them
  // as Need-Partner and returns a token URL. The UI then surfaces
  // a small modal with native-share / copy / SMS / mail options.
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteTournamentTitle, setInviteTournamentTitle] = useState<string>("");

  // Multi-division support: a player can sign up for at most one
  // gendered division (Men's OR Women's) AND optionally one Mixed
  // alongside it. Compute which divisions are still eligible based
  // on what the viewer is already in.
  const allMine = myRegistrations ?? (myRegistration ? [myRegistration] : []);
  const myGenders = new Set(
    allMine
      .map((r) => r.division && getDivisionGender(r.division))
      .filter(Boolean) as ("mens" | "womens" | "mixed")[]
  );
  const myDivisions = new Set(allMine.map((r) => r.division));
  const eligibleDivisions = divisions.filter((d) => {
    if (myDivisions.has(d)) return false;
    const g = getDivisionGender(d);
    if (!g) return true;
    if (g === "mens" || g === "womens") {
      // Already in a gendered division? Can't add another gendered.
      if (myGenders.has("mens") || myGenders.has("womens")) return false;
    }
    if (g === "mixed" && myGenders.has("mixed")) return false;
    return true;
  });

  const [selectedDivision, setSelectedDivision] = useState(
    eligibleDivisions.length === 1 ? eligibleDivisions[0] : ""
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
    setLoading("register");
    setError("");

    if (tournamentType === "doubles" && !selectedPartner && !needPartner) {
      setError("Please select a partner or check \"I need a partner\"");
      setLoading(null);
      return;
    }

    if (eligibleDivisions.length > 1 && !selectedDivision) {
      setError("Please select a division");
      setLoading(null);
      return;
    }

    const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partner_id: needPartner ? null : selectedPartner?.id || null,
        division: selectedDivision || eligibleDivisions[0] || null,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Registration failed");
      setLoading(null);
      return;
    }

    // Reset form state so the next registration (if eligible) starts
    // clean instead of carrying over the prior partner / division.
    setSelectedPartner(null);
    setNeedPartner(false);
    setSelectedDivision("");
    setLoading(null);
    router.refresh();
  }

  // Returns true when the viewer is the partner (not the original
  // registering player) on a given registration row. Same DELETE
  // endpoint handles both cases server-side; the only thing this
  // affects is the button label and the confirm-modal copy.
  function viewerIsPartner(reg: TournamentRegistration): boolean {
    if (!myProfileId) return false;
    const playerId = (reg as unknown as { player_id?: string }).player_id;
    const partnerId = (reg as unknown as { partner_id?: string | null }).partner_id;
    return partnerId === myProfileId && playerId !== myProfileId;
  }

  async function handleWithdraw(reg: TournamentRegistration) {
    const divisionCode = reg.division;
    const divLabel = divisionCode ? getDivisionLabel(divisionCode) : "this tournament";
    const isPartnerSide = viewerIsPartner(reg);

    const ok = await confirm({
      title: isPartnerSide
        ? `Decline partnership in ${divLabel}?`
        : `Withdraw from ${divLabel}?`,
      description: isPartnerSide
        ? "You'll be removed as their partner. The original registrant stays on the list as a Need-Partner registrant — they can pair with someone else."
        : "You'll lose your spot in this division. If registration is still open you can rejoin, but your seed may change.",
      confirmLabel: isPartnerSide ? "Decline" : "Withdraw",
      cancelLabel: isPartnerSide ? "Stay as partner" : "Stay in",
      variant: "danger",
    });
    if (!ok) return;
    setLoading(`withdraw:${divisionCode ?? ""}`);
    setError("");

    const url = divisionCode
      ? `/api/tournaments/${tournamentId}/register?division=${encodeURIComponent(divisionCode)}`
      : `/api/tournaments/${tournamentId}/register`;
    const res = await fetch(url, { method: "DELETE" });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? (isPartnerSide ? "Could not decline" : "Withdrawal failed"));
      setLoading(null);
      return;
    }

    setLoading(null);
    router.refresh();
  }

  // Render existing registrations as their own row(s) above the
  // form. With multi-division support a player may have one or two
  // active rows; each gets its own withdraw button.
  const registeredRows = allMine.length > 0 && (
    <div className="card space-y-2">
      {allMine.map((reg) => (
        <div key={reg.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-teal-vivid">
              {viewerIsPartner(reg)
                ? reg.status === "confirmed"
                  ? "You were added as a partner"
                  : "Added as partner (waitlist)"
                : reg.status === "confirmed"
                  ? "You're registered!"
                  : "You're on the waitlist"}
            </p>
            {viewerIsPartner(reg) && reg.player?.display_name && (
              <p className="text-xs text-surface-muted">
                Registered by {reg.player.display_name}
              </p>
            )}
            {reg.division && (
              <p className="text-xs text-surface-muted">
                Division: {getDivisionLabel(reg.division)}
              </p>
            )}
            {reg.waitlist_position && (
              <p className="text-xs text-surface-muted">Waitlist position #{reg.waitlist_position}</p>
            )}
          </div>
          <button
            onClick={() => handleWithdraw(reg)}
            disabled={loading !== null}
            className="btn-secondary text-xs !border-red-500/50 !text-red-400 shrink-0"
          >
            {loading === `withdraw:${reg.division ?? ""}`
              ? "..."
              : viewerIsPartner(reg)
                ? "Decline"
                : "Withdraw"}
          </button>
        </div>
      ))}
      <FormError message={error} />
    </div>
  );

  // No more eligible divisions to add — show only the existing
  // registrations card and exit.
  if (allMine.length > 0 && eligibleDivisions.length === 0) {
    return registeredRows || null;
  }

  // Determine if the selected division (or overall tournament) is full
  const activeDivision = selectedDivision || (eligibleDivisions.length === 1 ? eligibleDivisions[0] : "");
  const divisionFull = maxTeamsPerDivision != null && activeDivision
    ? (divisionConfirmedCounts[activeDivision] ?? 0) >= maxTeamsPerDivision
    : false;
  const overallFull = playerCap != null && confirmedCount >= playerCap;
  const willWaitlist = divisionFull || overallFull;

  return (
    <>
      {registeredRows}
      <div className="card space-y-3">
        {allMine.length > 0 && (
          <p className="text-sm font-semibold text-dark-200">
            Add another division
          </p>
        )}
      {/* Division selector */}
      {eligibleDivisions.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-1">Division *</label>
          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="input"
            required
          >
            <option value="">Select a division...</option>
            {eligibleDivisions.map((code) => {
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
              <button
                type="button"
                onClick={async () => {
                  setError("");
                  setLoading("invite");
                  try {
                    const res = await fetch(
                      `/api/tournaments/${tournamentId}/partner-invites`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          division: activeDivision || null,
                        }),
                      }
                    );
                    const data = await res.json();
                    if (!res.ok) {
                      setError(data.error ?? "Could not create invite");
                      return;
                    }
                    setInviteUrl(data.url);
                    setInviteTournamentTitle(data.tournamentTitle ?? "");
                    setInviteCopied(false);
                    // Server already registered the inviter as
                    // Need-Partner — refresh so the form shows their
                    // new registration row immediately.
                    router.refresh();
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Could not create invite"
                    );
                  } finally {
                    setLoading(null);
                  }
                }}
                disabled={loading !== null}
                className="block text-xs text-brand-vivid hover:underline mt-1"
              >
                Partner not on Tri-Star Pickleball yet? Send them an invite link
              </button>
            </div>
          )}
        </div>
      )}

      {/* Share modal — fires after the invite API returns a URL.
           Tries the native Web Share sheet (which surfaces Messages,
           Mail, etc. on iOS/Android) and falls back to copy + sms +
           mailto buttons for desktop browsers without `navigator.share`. */}
      {inviteUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="card w-full max-w-md space-y-3">
            <h3 className="text-base font-semibold text-dark-100">
              Share invite link
            </h3>
            <p className="text-xs text-surface-muted">
              You&apos;re registered as Need-Partner. Send this link to your
              partner — they&apos;ll register and be locked in as your partner
              automatically.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="input flex-1 text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    setInviteCopied(true);
                    setTimeout(() => setInviteCopied(false), 2000);
                  } catch {
                    /* ignore */
                  }
                }}
                className="btn-secondary text-xs whitespace-nowrap"
              >
                {inviteCopied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  // Web Share opens the OS share sheet — Messages,
                  // Mail, WhatsApp, etc. — on iOS/Android. On desktop
                  // browsers without it, this falls through silently
                  // and the user uses Copy / SMS / Email below.
                  if (
                    typeof navigator !== "undefined" &&
                    typeof navigator.share === "function"
                  ) {
                    try {
                      await navigator.share({
                        title: `Be my partner for ${inviteTournamentTitle}`,
                        text: `Tap this link to register and join my team for ${inviteTournamentTitle}: ${inviteUrl}`,
                        url: inviteUrl,
                      });
                    } catch {
                      /* user cancelled — ignore */
                    }
                  }
                }}
                className="btn-primary text-xs flex-1"
              >
                Share…
              </button>
              <a
                href={`sms:?&body=${encodeURIComponent(
                  `Be my partner for ${inviteTournamentTitle}: ${inviteUrl}`
                )}`}
                className="btn-secondary text-xs flex-1 text-center"
              >
                SMS
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(
                  `Be my partner for ${inviteTournamentTitle}`
                )}&body=${encodeURIComponent(
                  `Tap this link to register and join my team:\n\n${inviteUrl}`
                )}`}
                className="btn-secondary text-xs flex-1 text-center"
              >
                Email
              </a>
            </div>

            <button
              type="button"
              onClick={() => {
                setInviteUrl(null);
                setInviteCopied(false);
              }}
              className="btn-secondary text-xs w-full mt-1"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <FormError message={error} />

      <button
        onClick={handleRegister}
        disabled={loading !== null}
        className="btn-primary w-full"
      >
        {loading === "register" ? "Registering..." : willWaitlist ? "Join Waitlist" : "Register"}
      </button>
      </div>
    </>
  );
}
