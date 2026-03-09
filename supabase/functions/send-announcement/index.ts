import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

serve(async (req) => {
  try {
    const { title, body, sessionId } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get push tokens for target players
    let query = supabase
      .from("players")
      .select("push_token")
      .not("push_token", "is", null);

    if (sessionId) {
      // Only players confirmed for this session
      const { data: signUps } = await supabase
        .from("sign_ups")
        .select("player_id")
        .eq("session_id", sessionId)
        .eq("status", "confirmed");

      const playerIds = signUps?.map((s: any) => s.player_id) ?? [];
      query = query.in("id", playerIds);
    }

    const { data: players } = await query;
    const tokens = (players ?? [])
      .map((p: any) => p.push_token)
      .filter(Boolean);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push tokens found" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Chunk into batches of 100 (Expo limit)
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 100) {
      chunks.push(tokens.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      const messages = chunk.map((token: string) => ({
        to: token,
        title,
        body,
        sound: "default",
        data: { type: "announcement" },
      }));

      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });
    }

    return new Response(
      JSON.stringify({ sent: tokens.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
