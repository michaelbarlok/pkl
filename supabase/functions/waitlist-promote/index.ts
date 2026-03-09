import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * This function is triggered by a database webhook on sign_ups table
 * when status changes to 'confirmed' (from waitlist promotion).
 */
serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    if (!record || record.status !== "confirmed") {
      return new Response(JSON.stringify({ skip: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get player details
    const { data: player } = await supabase
      .from("players")
      .select("push_token, full_name")
      .eq("id", record.player_id)
      .single();

    if (!player?.push_token) {
      return new Response(JSON.stringify({ message: "No push token" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get session details
    const { data: session } = await supabase
      .from("sessions")
      .select("date, location")
      .eq("id", record.session_id)
      .single();

    const sessionDate = session
      ? new Date(session.date).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : "the upcoming session";

    // Send push notification
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify([
        {
          to: player.push_token,
          title: "You're in! 🎾",
          body: `You've been promoted from the waitlist for ${sessionDate}. See you on the court!`,
          sound: "default",
          data: { type: "waitlist_promotion", sessionId: record.session_id },
        },
      ]),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
