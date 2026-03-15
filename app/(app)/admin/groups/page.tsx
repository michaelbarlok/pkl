import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default async function AdminGroupsPage() {
  const supabase = await createClient();

  // Fetch all groups with member counts and last session info
  const { data: groups } = await supabase
    .from("shootout_groups")
    .select("*, group_memberships(count)")
    .order("name", { ascending: true });

  // Fetch last session date per group
  const { data: sessions } = await supabase
    .from("shootout_sessions")
    .select("group_id, created_at")
    .order("created_at", { ascending: false });

  const lastSessionMap = new Map<string, string>();
  if (sessions) {
    for (const s of sessions) {
      if (!lastSessionMap.has(s.group_id)) {
        lastSessionMap.set(s.group_id, s.created_at);
      }
    }
  }

  // ============================================================
  // Server Actions
  // ============================================================

  async function createGroup(formData: FormData) {
    "use server";

    const name = formData.get("name") as string;
    const city = (formData.get("city") as string)?.trim() || null;
    const state = (formData.get("state") as string)?.trim() || null;
    if (!name?.trim()) return;

    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) return;

    const groupType = (formData.get("group_type") as string) || "ladder_league";
    const visibility = (formData.get("visibility") as string) || "public";

    const { data: newGroup, error } = await supabase
      .from("shootout_groups")
      .insert({
        name: name.trim(),
        slug,
        city,
        state,
        created_by: profile.id,
        is_active: true,
        group_type: groupType,
        visibility,
      })
      .select("id")
      .single();

    if (!error && newGroup && groupType === "ladder_league") {
      // Create default preferences (only for ladder league groups)
      await supabase.from("group_preferences").insert({
        group_id: newGroup.id,
        pct_window_sessions: 10,
        new_player_start_step: 5,
        min_step: 1,
        step_move_up: 1,
        step_move_down: 1,
        game_limit_4p: 3,
        game_limit_5p: 4,
        win_by_2: true,
      });
    }

    if (!error && newGroup) {
      // Automatically add the creator as a group admin
      await supabase.from("group_memberships").insert({
        group_id: newGroup.id,
        player_id: profile.id,
        current_step: 5,
        group_role: "admin",
      });
    }

    revalidatePath("/admin/groups");
  }

  async function toggleActive(formData: FormData) {
    "use server";

    const groupId = formData.get("groupId") as string;
    const currentActive = formData.get("currentActive") === "true";

    const supabase = await createClient();
    await supabase
      .from("shootout_groups")
      .update({ is_active: !currentActive })
      .eq("id", groupId);

    revalidatePath("/admin/groups");
  }

  async function renameGroup(formData: FormData) {
    "use server";

    const groupId = formData.get("groupId") as string;
    const newName = formData.get("newName") as string;
    if (!newName?.trim()) return;

    const newSlug = newName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    const supabase = await createClient();
    await supabase
      .from("shootout_groups")
      .update({ name: newName.trim(), slug: newSlug })
      .eq("id", groupId);

    revalidatePath("/admin/groups");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Manage Groups</h1>
        <p className="mt-1 text-surface-muted">
          Create and manage shootout groups.
        </p>
      </div>

      {/* Create Group */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-dark-100">
          Create New Group
        </h2>
        <form action={createGroup} className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              name="name"
              placeholder="Group name (e.g. Monday Shootout)"
              required
              className="input flex-1"
            />
            <button type="submit" className="btn-primary whitespace-nowrap">
              Create Group
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              name="city"
              placeholder="City (e.g. Athens)"
              className="input"
            />
            <input
              type="text"
              name="state"
              placeholder="State (e.g. GA)"
              className="input"
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-dark-200">Type:</span>
            <label className="flex items-center gap-2 text-sm text-dark-100">
              <input type="radio" name="group_type" value="ladder_league" defaultChecked className="text-brand-600 focus:ring-brand-500" />
              Ladder League
            </label>
            <label className="flex items-center gap-2 text-sm text-dark-100">
              <input type="radio" name="group_type" value="free_play" className="text-brand-600 focus:ring-brand-500" />
              Free Play
            </label>
            <span className="text-sm font-medium text-dark-200 ml-4">Visibility:</span>
            <label className="flex items-center gap-2 text-sm text-dark-100">
              <input type="radio" name="visibility" value="public" defaultChecked className="text-brand-600 focus:ring-brand-500" />
              Public
            </label>
            <label className="flex items-center gap-2 text-sm text-dark-100">
              <input type="radio" name="visibility" value="private" className="text-brand-600 focus:ring-brand-500" />
              Private
            </label>
          </div>
        </form>
      </div>

      {/* Groups Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-border">
            <thead className="bg-surface-overlay">
              <tr>
                <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Name
                </th>
                <th className="hidden sm:table-cell px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Type
                </th>
                <th className="hidden sm:table-cell px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Visibility
                </th>
                <th className="hidden sm:table-cell px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Slug
                </th>
                <th className="px-2 sm:px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Members
                </th>
                <th className="hidden sm:table-cell px-2 sm:px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Last Session
                </th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Active
                </th>
                <th className="px-2 sm:px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border bg-surface-raised">
              {groups?.map((group) => {
                const memberCount =
                  (
                    group.group_memberships as unknown as {
                      count: number;
                    }[]
                  )?.[0]?.count ?? 0;
                const lastSession = lastSessionMap.get(group.id);

                return (
                  <tr key={group.id}>
                    <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm font-medium text-dark-100">
                      {group.name}
                    </td>
                    <td className="hidden sm:table-cell whitespace-nowrap px-2 sm:px-4 py-3 text-sm">
                      <span className={group.group_type === "free_play" ? "badge-yellow" : "badge-blue"}>
                        {group.group_type === "free_play" ? "Free Play" : "Ladder"}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell whitespace-nowrap px-2 sm:px-4 py-3 text-sm">
                      <span className={group.visibility === "private" ? "badge-gray" : "badge-green"}>
                        {group.visibility === "private" ? "Private" : "Public"}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-surface-muted">
                      {group.slug}
                    </td>
                    <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-right text-sm text-dark-100">
                      {memberCount}
                    </td>
                    <td className="hidden sm:table-cell whitespace-nowrap px-2 sm:px-4 py-3 text-right text-sm text-surface-muted">
                      {lastSession
                        ? formatDate(lastSession)
                        : "None"}
                    </td>
                    <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-center text-sm">
                      {group.is_active ? (
                        <span className="badge-green">Active</span>
                      ) : (
                        <span className="badge-gray">Inactive</span>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-right text-sm">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <Link
                          href={`/admin/groups/${group.id}`}
                          className="text-brand-600 hover:text-brand-500"
                        >
                          Edit
                        </Link>
                        <form action={toggleActive} className="inline">
                          <input
                            type="hidden"
                            name="groupId"
                            value={group.id}
                          />
                          <input
                            type="hidden"
                            name="currentActive"
                            value={String(group.is_active)}
                          />
                          <button
                            type="submit"
                            className={
                              group.is_active
                                ? "text-red-400 hover:text-red-500"
                                : "text-teal-300 hover:text-green-500"
                            }
                          >
                            {group.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                        <RenameForm groupId={group.id} currentName={group.name} action={renameGroup} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!groups || groups.length === 0) && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-sm text-surface-muted"
                  >
                    No groups created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Rename inline form (Server Component)
// ============================================================

function RenameForm({
  groupId,
  currentName,
  action,
}: {
  groupId: string;
  currentName: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <details className="relative inline-block">
      <summary className="cursor-pointer text-surface-muted hover:text-surface-muted">
        Rename
      </summary>
      <div className="absolute right-0 top-6 z-10 w-64 rounded-lg border bg-surface-raised p-3 shadow-lg">
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="groupId" value={groupId} />
          <input
            type="text"
            name="newName"
            defaultValue={currentName}
            required
            className="input"
          />
          <button type="submit" className="btn-secondary text-sm">
            Save
          </button>
        </form>
      </div>
    </details>
  );
}
