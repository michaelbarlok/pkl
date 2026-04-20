import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string; id: string }>;
}

export default async function AnnouncementPage({ params }: Props) {
  const { slug, id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/groups/${slug}/announcements/${id}`)}`);
  }

  // The group lookup enforces that the slug matches; the announcement
  // lookup pulls the sender's display name for attribution. Both are
  // gated by RLS — non-members just see "not found".
  const { data: group } = await supabase
    .from("shootout_groups")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!group) notFound();

  const { data: announcement } = await supabase
    .from("group_announcements")
    .select("id, title, body, created_at, group_id, sender:profiles!sent_by(display_name)")
    .eq("id", id)
    .eq("group_id", group.id)
    .maybeSingle();

  if (!announcement) notFound();

  const sentBy = (announcement as any).sender?.display_name ?? "Group Admin";
  const sentAt = new Date(announcement.created_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/groups" className="text-surface-muted hover:text-dark-200">
          Groups
        </Link>
        <span className="text-surface-muted">/</span>
        <Link
          href={`/groups/${slug}`}
          className="text-surface-muted hover:text-dark-200"
        >
          {group.name}
        </Link>
        <span className="text-surface-muted">/</span>
        <span className="text-dark-200">Announcement</span>
      </div>

      <article className="card space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-dark-100">
            {announcement.title}
          </h1>
          <p className="text-xs text-surface-muted">
            Sent by {sentBy} · {sentAt}
          </p>
        </header>
        {/* whitespace-pre-wrap preserves the author's line breaks
            without accepting HTML (safer than dangerouslySetInnerHTML). */}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-dark-200">
          {announcement.body}
        </p>
      </article>

      <div>
        <Link
          href={`/groups/${slug}`}
          className="text-sm text-brand-400 hover:text-brand-300"
        >
          ← Back to {group.name}
        </Link>
      </div>
    </div>
  );
}
