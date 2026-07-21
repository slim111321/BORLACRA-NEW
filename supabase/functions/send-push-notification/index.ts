// Push notification sending proxy.
//
// utils/notifications.ts used to call Expo's push API
// (https://exp.host/--/api/v2/push/send) directly from the client, given
// the recipient's raw Expo push token -- which meant the client first had
// to read that OTHER user's push_token out of the profiles table. Anyone
// in possession of another user's push token (extractable the same way
// any client-readable field is) could send them arbitrary push
// notification content with no server involved at all.
//
// This function takes a recipient's *user id*, not their token -- it looks
// up the token itself server-side (service-role, bypasses RLS) and the
// token is never sent to or seen by any client. Requires a real signed-in
// user (validates the caller's JWT, not just the public anon key) and a
// per-caller daily quota (reuses the same check_and_log_ai_proxy_request
// mechanism the AI proxy functions use -- see the paired migration).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DAILY_LIMIT_PER_USER = 200; // generous -- chat messages alone can be frequent

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401 });
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 });
  }
  const callerId = userData.user.id;

  let body: { recipientUserId?: string; title?: string; body?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { recipientUserId, title, body: messageBody, data } = body;
  if (!recipientUserId || typeof recipientUserId !== "string") {
    return new Response(JSON.stringify({ error: "Missing 'recipientUserId'" }), { status: 400 });
  }
  if (!title || !messageBody) {
    return new Response(JSON.stringify({ error: "Missing 'title' or 'body'" }), { status: 400 });
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: allowed, error: quotaError } = await serviceClient.rpc("check_and_log_ai_proxy_request", {
    p_user_id: callerId,
    p_endpoint: "push_notification",
    p_daily_limit: DAILY_LIMIT_PER_USER,
  });
  if (quotaError) {
    console.error("[Push] quota check failed:", quotaError.message);
    return new Response(JSON.stringify({ error: "Internal error checking usage quota" }), { status: 500 });
  }
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: `Daily push notification limit reached (${DAILY_LIMIT_PER_USER}/day).` }),
      { status: 429 },
    );
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("push_token")
    .eq("id", recipientUserId)
    .maybeSingle();

  if (profileError) {
    console.error("[Push] Failed to look up recipient push token:", profileError.message);
    return new Response(JSON.stringify({ error: "Internal error looking up recipient" }), { status: 500 });
  }
  if (!profile?.push_token) {
    // Not an error -- the recipient just doesn't have a registered device.
    return new Response(JSON.stringify({ status: "skipped", reason: "no push token on file" }), { status: 200 });
  }

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: profile.push_token,
        sound: "default",
        title,
        body: messageBody,
        data: data ?? {},
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Expo push API error: ${res.status} ${errText}`);
    }

    return new Response(JSON.stringify({ status: "sent" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[Push] Failed to send:", (err as Error)?.message);
    return new Response(JSON.stringify({ error: "Failed to send push notification" }), { status: 502 });
  }
});
