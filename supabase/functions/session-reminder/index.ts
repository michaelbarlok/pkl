import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Scheduled function (via pg_cron or Supabase cron) to send reminders
 * 24 hours before each upcoming session.
 */
serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Find sessions starting in ~24 hours
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const { data: sessions } = await supabase
    .from("sessions")
    .select("*")
    .eq("status", "upcoming")
    .gte("start_time", in24h.toISOString())
    .lte("start_time", in25h.toISOString());

  if (!sessions?.length) {
    return new Response(JSON.stringify({ message: "No sessions to remind" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let totalSent = 0;

  for (const session of sessions) {
    const { data: signUps } = await supabase
      .from("sign_ups")
      .select("player:players(push_token, full_name)")
      .eq("session_id", session.id)
      .eq("status", "confirmed");

    const tokens = (signUps ?? [])
      .map((s: any) => s.player?.push_token)
      .filter(Boolean);

    if (!tokens.length) continue;

    const sessionDate = new Date(session.start_time).toLocaleString("en-US", {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    });

    const messages = tokens.map((token: string) => ({
      to: token,
      title: "Session tomorrow! 🎾",
      body: `Don't forget — pickleball at ${session.location} ${sessionDate}`,
      sound: "default",
      data: { type: "session_reminder", sessionId: session.id },
    }));

    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    totalSent += tokens.length;
  }

  return new Response(JSON.stringify({ sent: totalSent }), {
    headers: { "Content-Type": "application/json" },
  });
});
