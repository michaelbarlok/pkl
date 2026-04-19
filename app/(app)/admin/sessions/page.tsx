import { createClient } from "@/lib/supabase/server";
import { SessionsTable, type SessionRow } from "./sessions-table";

export default async function AdminSessionsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("shootout_sessions")
    .select(
      `*, sheet:signup_sheets(event_date, location), group:shootout_groups(name, slug), participants:session_participants(count)`
    )
    .order("created_at", { ascending: false });

  const sessions: SessionRow[] = (data ?? []) as unknown as SessionRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-heading">Shootout Sessions</h1>
      </div>

      <SessionsTable sessions={sessions} />
    </div>
  );
}
