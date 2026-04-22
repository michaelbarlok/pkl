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
    .select(
      "id, title, body, created_at, group_id, attachment_url, attachment_type, attachment_name, sender:profiles!sent_by(display_name)"
    )
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

        {announcement.attachment_url && (
          <div className="pt-2 border-t border-surface-border">
            {announcement.attachment_type?.startsWith("image/") ? (
              <a
                href={announcement.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <img
                  src={announcement.attachment_url}
                  alt={announcement.attachment_name ?? "Attachment"}
                  className="max-h-[60vh] w-auto rounded-md border border-surface-border"
                />
              </a>
            ) : (
              <a
                href={announcement.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                {announcement.attachment_name ?? "Open attachment"}
              </a>
            )}
          </div>
        )}
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
