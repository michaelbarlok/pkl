import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";

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

    const { data: newGroup, error } = await supabase
      .from("shootout_groups")
      .insert({
        name: name.trim(),
        slug,
        created_by: profile.id,
        is_active: true,
      })
      .select("id")
      .single();

    if (!error && newGroup) {
      // Create default preferences
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
        <h1 className="text-2xl font-bold text-gray-900">Manage Groups</h1>
        <p className="mt-1 text-gray-600">
          Create and manage shootout groups.
        </p>
      </div>

      {/* Create Group */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Create New Group
        </h2>
        <form action={createGroup} className="flex gap-3">
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
        </form>
      </div>

      {/* Groups Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Slug
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Members
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Last Session
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Active
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
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
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {group.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {group.slug}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                      {memberCount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                      {lastSession
                        ? new Date(lastSession).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "None"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center text-sm">
                      {group.is_active ? (
                        <span className="badge-green">Active</span>
                      ) : (
                        <span className="badge-gray">Inactive</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
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
                                ? "text-red-600 hover:text-red-500"
                                : "text-green-600 hover:text-green-500"
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
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-gray-500"
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
      <summary className="cursor-pointer text-gray-600 hover:text-gray-500">
        Rename
      </summary>
      <div className="absolute right-0 top-6 z-10 w-64 rounded-lg border bg-white p-3 shadow-lg">
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
