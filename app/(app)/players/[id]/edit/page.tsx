"use client";

import { AvatarUpload } from "@/components/avatar-upload";
import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getExistingSubscription } from "@/lib/push-client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function EditProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [homeCourt, setHomeCourt] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [duprId, setDuprId] = useState("");
  const [duprSingles, setDuprSingles] = useState("");
  const [duprDoubles, setDuprDoubles] = useState("");
  const [usapMemberId, setUsapMemberId] = useState("");
  const [usapTier, setUsapTier] = useState("");
  const [usapExpiration, setUsapExpiration] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyPush, setNotifyPush] = useState(false);
  const [notifyForumReplies, setNotifyForumReplies] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, { email: boolean; push: boolean }>>({});
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("default");
  const [isStandalone, setIsStandalone] = useState(false);
  const [togglingPush, setTogglingPush] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupAdminIds, setGroupAdminIds] = useState<Set<string>>(new Set());
  const [togglingGroup, setTogglingGroup] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (!profile) {
        setError("Profile not found");
        setLoading(false);
        return;
      }

      // Verify current user can edit this profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: currentProfile } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("user_id", user.id)
        .single();

      if (currentProfile?.id !== id && currentProfile?.role !== "admin") {
        router.push(`/players/${id}`);
        return;
      }

      const callerIsAdmin = currentProfile?.role === "admin";
      setIsAdmin(callerIsAdmin);

      setDisplayName(profile.display_name ?? "");
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setBio(profile.bio ?? "");
      setHomeCourt(profile.home_court ?? "");
      setSkillLevel(profile.skill_level?.toString() ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
      const prefs: string[] = profile.preferred_notify ?? ["email"];
      setNotifyEmail(prefs.includes("email"));
      setNotifyPush(prefs.includes("push"));
      setNotifyForumReplies(profile.notify_forum_replies ?? false);
      setNotificationPrefs((profile.notification_preferences as Record<string, { email: boolean; push: boolean }>) ?? {});
      setDuprId(profile.dupr_id ?? "");
      setDuprSingles(profile.dupr_singles_rating?.toString() ?? "");
      setDuprDoubles(profile.dupr_doubles_rating?.toString() ?? "");
      setUsapMemberId(profile.usap_member_id ?? "");
      setUsapTier(profile.usap_tier ?? "");
      setUsapExpiration(profile.usap_expiration ?? "");

      // If caller is admin, fetch groups and this player's group admin roles
      if (callerIsAdmin) {
        const [groupsRes, membershipsRes] = await Promise.all([
          supabase.from("shootout_groups").select("id, name").order("name"),
          supabase
            .from("group_memberships")
            .select("group_id, group_role")
            .eq("player_id", id),
        ]);

        if (groupsRes.data) setGroups(groupsRes.data);
        if (membershipsRes.data) {
          const adminSet = new Set(
            membershipsRes.data
              .filter((m) => m.group_role === "admin")
              .map((m) => m.group_id)
          );
          setGroupAdminIds(adminSet);
        }
      }

      setLoading(false);

      // Check push notification support (non-blocking)
      if (isPushSupported()) {
        setPushSupported(true);
        setPushPermission(Notification.permission);
        setIsStandalone(
          window.matchMedia("(display-mode: standalone)").matches ||
          ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true)
        );
        getExistingSubscription().then((existingSub) => {
          if (existingSub && prefs.includes("push")) {
            setNotifyPush(true);
          }
        });
      }
    }

    load();
  }, [id, supabase, router]);

  const handleAvatarUpload = useCallback((url: string) => {
    setAvatarUrl(url);
  }, []);

  const toggleGroupAdmin = async (groupId: string, currentlyAdmin: boolean) => {
    setTogglingGroup(groupId);
    const res = await fetch("/api/admin/group-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: id,
        groupId,
        groupRole: currentlyAdmin ? "member" : "admin",
      }),
    });

    if (res.ok) {
      setGroupAdminIds((prev) => {
        const next = new Set(prev);
        if (currentlyAdmin) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        return next;
      });
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to update group role");
    }
    setTogglingGroup(null);
  };

  const handlePushToggle = async (enable: boolean) => {
    setTogglingPush(true);
    if (enable) {
      const success = await subscribeToPush();
      if (success) {
        setNotifyPush(true);
        setPushPermission("granted");
      } else {
        // Permission was denied or subscription failed
        setPushPermission(Notification.permission);
      }
    } else {
      await unsubscribeFromPush();
      setNotifyPush(false);
    }
    setTogglingPush(false);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    // Build notification preferences array
    const preferredNotify: string[] = [];
    if (notifyEmail) preferredNotify.push("email");
    if (notifyPush) preferredNotify.push("push");

    const updates: Record<string, unknown> = {
      display_name: displayName.trim(),
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      bio: bio.trim() || null,
      home_court: homeCourt.trim() || null,
      skill_level: skillLevel ? parseFloat(skillLevel) : null,
      preferred_notify: preferredNotify,
      notify_forum_replies: notifyForumReplies,
      notification_preferences: notificationPrefs,
      dupr_id: duprId.trim() || null,
      dupr_singles_rating: duprSingles ? parseFloat(duprSingles) : null,
      dupr_doubles_rating: duprDoubles ? parseFloat(duprDoubles) : null,
      usap_member_id: usapMemberId.trim() || null,
      usap_tier: usapTier.trim() || null,
      usap_expiration: usapExpiration || null,
    };

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSuccess("Profile updated!");
    setSaving(false);
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-surface-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Edit Profile</h1>
        <p className="mt-1 text-surface-muted">Update your photo and personal info.</p>
      </div>

      <div className="card">
        <div className="mb-6">
          <label className="block text-sm font-medium text-dark-200 mb-3">
            Profile Photo
          </label>
          <AvatarUpload
            profileId={id}
            currentUrl={avatarUrl}
            onUpload={handleAvatarUpload}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-dark-200 mb-1">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-dark-200 mb-1">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-dark-200 mb-1">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input"
              placeholder="(optional)"
            />
          </div>

          <div>
            <label htmlFor="homeCourt" className="block text-sm font-medium text-dark-200 mb-1">
              Home Court
            </label>
            <input
              id="homeCourt"
              type="text"
              value={homeCourt}
              onChange={(e) => setHomeCourt(e.target.value)}
              className="input"
              placeholder="(optional)"
            />
          </div>

          <div>
            <label htmlFor="skillLevel" className="block text-sm font-medium text-dark-200 mb-1">
              Self-Rating
            </label>
            <select
              id="skillLevel"
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value)}
              className="input"
            >
              <option value="">Select a rating</option>
              <option value="2.0">2.0 - Beginner</option>
              <option value="2.5">2.5</option>
              <option value="3.0">3.0 - Intermediate</option>
              <option value="3.5">3.5</option>
              <option value="4.0">4.0 - Advanced</option>
              <option value="4.5">4.5</option>
              <option value="5.0">5.0 - Expert</option>
              <option value="5.5">5.5+</option>
            </select>
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-dark-200 mb-1">
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="input"
              rows={3}
              placeholder="Tell others a bit about yourself (optional)"
            />
          </div>

          {/* DUPR Section */}
          <div className="border-t border-surface-border pt-4 mt-4">
            <h3 className="text-sm font-semibold text-dark-100 mb-3">DUPR</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="duprId" className="block text-sm font-medium text-dark-200 mb-1">
                  DUPR ID
                </label>
                <input
                  id="duprId"
                  type="text"
                  value={duprId}
                  onChange={(e) => setDuprId(e.target.value)}
                  className="input"
                  placeholder="(optional)"
                />
              </div>
              <div>
                <label htmlFor="duprSingles" className="block text-sm font-medium text-dark-200 mb-1">
                  Singles Rating
                </label>
                <input
                  id="duprSingles"
                  type="number"
                  step="0.01"
                  min="2.0"
                  max="8.0"
                  value={duprSingles}
                  onChange={(e) => setDuprSingles(e.target.value)}
                  className="input"
                  placeholder="e.g. 4.25"
                />
              </div>
              <div>
                <label htmlFor="duprDoubles" className="block text-sm font-medium text-dark-200 mb-1">
                  Doubles Rating
                </label>
                <input
                  id="duprDoubles"
                  type="number"
                  step="0.01"
                  min="2.0"
                  max="8.0"
                  value={duprDoubles}
                  onChange={(e) => setDuprDoubles(e.target.value)}
                  className="input"
                  placeholder="e.g. 3.75"
                />
              </div>
            </div>
          </div>

          {/* USA Pickleball Section */}
          <div className="border-t border-surface-border pt-4 mt-4">
            <h3 className="text-sm font-semibold text-dark-100 mb-3">USA Pickleball</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="usapMemberId" className="block text-sm font-medium text-dark-200 mb-1">
                  Membership ID
                </label>
                <input
                  id="usapMemberId"
                  type="text"
                  value={usapMemberId}
                  onChange={(e) => setUsapMemberId(e.target.value)}
                  className="input"
                  placeholder="(optional)"
                />
              </div>
              <div>
                <label htmlFor="usapTier" className="block text-sm font-medium text-dark-200 mb-1">
                  Membership Tier
                </label>
                <input
                  id="usapTier"
                  type="text"
                  value={usapTier}
                  onChange={(e) => setUsapTier(e.target.value)}
                  className="input"
                  placeholder="e.g. Premium"
                />
              </div>
              <div>
                <label htmlFor="usapExpiration" className="block text-sm font-medium text-dark-200 mb-1">
                  Expiration Date
                </label>
                <input
                  id="usapExpiration"
                  type="date"
                  value={usapExpiration}
                  onChange={(e) => setUsapExpiration(e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Notification Preferences */}
          <div className="border-t border-surface-border pt-4 mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-dark-100 mb-0.5">Notification Preferences</h3>
              <p className="text-xs text-surface-muted">
                In-app notifications are always on. Control which types reach your email and device.
              </p>
            </div>

            {/* ── Master channel switches ── */}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-dark-100">Email</span>
              </label>

              {pushSupported ? (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyPush}
                    disabled={togglingPush || pushPermission === "denied"}
                    onChange={(e) => handlePushToggle(e.target.checked)}
                    className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                  />
                  <span className={`text-sm font-medium ${pushPermission === "denied" ? "text-surface-muted" : "text-dark-100"}`}>
                    Push {togglingPush ? "(setting up…)" : pushPermission === "denied" ? "(blocked)" : ""}
                  </span>
                </label>
              ) : null}
            </div>

            {pushPermission === "denied" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-900/20 px-4 py-3 text-xs text-amber-200 space-y-2">
                <p className="font-semibold text-amber-100">How to re-enable push notifications:</p>
                {isStandalone ? (
                  <ol className="list-decimal list-inside space-y-1 text-amber-200/90">
                    <li>Long-press the <strong>Tri-Star Pickleball</strong> icon on your home screen</li>
                    <li>Tap <strong>App info → Permissions → Notifications</strong></li>
                    <li>Select <strong>Allow</strong>, then return here and refresh</li>
                  </ol>
                ) : (
                  <ol className="list-decimal list-inside space-y-1 text-amber-200/90">
                    <li>Tap the <strong>lock icon</strong> (or ⓘ) in the address bar</li>
                    <li>Tap <strong>Permissions → Notifications → Allow</strong></li>
                    <li>Reload this page</li>
                  </ol>
                )}
              </div>
            )}

            {/* ── Per-type table ── */}
            {(() => {
              const groups = [
                {
                  label: "Sign-Up Sheets",
                  types: [
                    { type: "new_sheet", label: "New sheet posted" },
                    { type: "signup_reminder", label: "Sign-up closing soon" },
                    { type: "sheet_updated", label: "Sheet details changed" },
                    { type: "sheet_cancelled", label: "Event cancelled" },
                    { type: "withdraw_closing", label: "Withdrawal deadline soon" },
                  ],
                },
                {
                  label: "Registration",
                  types: [
                    { type: "waitlist_promoted", label: "Moved off waitlist" },
                    { type: "bumped_to_waitlist", label: "Bumped to waitlist" },
                  ],
                },
                {
                  label: "Sessions",
                  types: [
                    { type: "session_starting", label: "Session starting soon" },
                    { type: "pool_assigned", label: "Court assigned" },
                    { type: "session_recap", label: "Post-session recap" },
                  ],
                },
                {
                  label: "Ladder & Ratings",
                  types: [
                    { type: "step_changed", label: "Ladder step changed" },
                    { type: "rating_updated", label: "Rating updated" },
                    { type: "score_confirmed", label: "Score confirmed" },
                  ],
                },
                {
                  label: "Tournaments",
                  types: [
                    { type: "tournament_registration", label: "Tournament registration" },
                    { type: "tournament_reminder", label: "Tournament reminder" },
                    { type: "tournament_cancelled", label: "Tournament cancelled" },
                    { type: "tournament_withdrawal", label: "Withdrawal confirmed" },
                  ],
                },
                {
                  label: "Community",
                  types: [
                    { type: "forum_reply", label: "Reply to your post" },
                    { type: "forum_mention", label: "Mentioned in forum" },
                    { type: "group_announcement", label: "Group announcement" },
                    { type: "badge_earned", label: "Badge earned" },
                    { type: "invite_sent", label: "Group invite" },
                  ],
                },
              ] as const;

              const getVal = (t: string, ch: "email" | "push") =>
                notificationPrefs[t]?.[ch] ?? true;

              const setVal = (t: string, ch: "email" | "push", val: boolean) =>
                setNotificationPrefs((prev) => ({
                  ...prev,
                  [t]: { ...prev[t], email: getVal(t, "email"), push: getVal(t, "push"), [ch]: val },
                }));

              return (
                <div className="rounded-lg border border-surface-border overflow-hidden">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_56px_56px] bg-surface-overlay border-b border-surface-border px-3 py-2">
                    <span className="text-xs font-medium text-surface-muted uppercase tracking-wider">Notification</span>
                    <span className={`text-xs font-medium uppercase tracking-wider text-center ${notifyEmail ? "text-surface-muted" : "text-surface-muted/40"}`}>Email</span>
                    <span className={`text-xs font-medium uppercase tracking-wider text-center ${notifyPush && pushSupported ? "text-surface-muted" : "text-surface-muted/40"}`}>Push</span>
                  </div>

                  {groups.map((group, gi) => (
                    <div key={group.label}>
                      {/* Group header */}
                      <div className="px-3 py-1.5 bg-surface-overlay/60 border-b border-surface-border">
                        <span className="text-[11px] font-semibold text-brand-400 uppercase tracking-wider">{group.label}</span>
                      </div>

                      {/* Rows */}
                      {group.types.map(({ type, label }, ri) => {
                        const emailVal = getVal(type, "email");
                        const pushVal = getVal(type, "push");
                        const isLast = gi === groups.length - 1 && ri === group.types.length - 1;
                        return (
                          <div
                            key={type}
                            className={`grid grid-cols-[1fr_56px_56px] items-center px-3 py-2.5 ${!isLast ? "border-b border-surface-border/50" : ""} hover:bg-surface-overlay/30`}
                          >
                            <span className="text-sm text-dark-200">{label}</span>
                            <div className="flex justify-center">
                              <input
                                type="checkbox"
                                checked={emailVal}
                                disabled={!notifyEmail}
                                onChange={(e) => setVal(type, "email", e.target.checked)}
                                className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                              />
                            </div>
                            <div className="flex justify-center">
                              <input
                                type="checkbox"
                                checked={pushVal}
                                disabled={!notifyPush || !pushSupported}
                                onChange={(e) => setVal(type, "push", e.target.checked)}
                                className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <FormError message={error} />
          {success && <p className="text-sm text-teal-300">{success}</p>}

          <div className="flex gap-3">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => router.push(`/players/${id}`)}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Group Admin Roles — visible to global admins only */}
      {isAdmin && groups.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-dark-100 mb-3">Group Admin Roles</h2>
          <p className="text-sm text-surface-muted mb-4">
            Select which groups this player is an admin of.
          </p>
          <div className="space-y-2">
            {groups.map((group) => {
              const isGroupAdmin = groupAdminIds.has(group.id);
              return (
                <label
                  key={group.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-overlay cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isGroupAdmin}
                    disabled={togglingGroup === group.id}
                    onChange={() => toggleGroupAdmin(group.id, isGroupAdmin)}
                    className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm font-medium text-dark-100">{group.name}</span>
                  {isGroupAdmin && (
                    <span className="inline-flex items-center rounded-full bg-yellow-900/30 px-2 py-0.5 text-xs font-medium text-yellow-400">
                      Admin
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
