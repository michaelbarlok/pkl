"use client";

import { AvatarUpload } from "@/components/avatar-upload";
import { useSupabase } from "@/components/providers/supabase-provider";
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

      setDisplayName(profile.display_name ?? "");
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setBio(profile.bio ?? "");
      setHomeCourt(profile.home_court ?? "");
      setSkillLevel(profile.skill_level?.toString() ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
      setLoading(false);
    }

    load();
  }, [id, supabase, router]);

  const handleAvatarUpload = useCallback((url: string) => {
    setAvatarUrl(url);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    const updates: Record<string, unknown> = {
      display_name: displayName.trim(),
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      bio: bio.trim() || null,
      home_court: homeCourt.trim() || null,
      skill_level: skillLevel ? parseFloat(skillLevel) : null,
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

          {error && <p className="text-sm text-red-400">{error}</p>}
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
    </div>
  );
}
