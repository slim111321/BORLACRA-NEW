// Voice-note transcription proxy (Gemini).
//
// Same motivation as ../ai-trash-estimate: EXPO_PUBLIC_GEMINI_API_KEY used
// to ship inside the compiled client app (lib/voiceTranscription.ts called
// Gemini directly), extractable from the binary with no limit on requests.
// The key now lives only as an edge-function secret; every call requires a
// signed-in user and is subject to the same per-user daily quota mechanism
// as the trash estimator (see the paired migration).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const DAILY_LIMIT_PER_USER = 40;
const MAX_AUDIO_BASE64_CHARS = 12_000_000; // ~9MB decoded, comfortably above a short voice note

const PROMPT = `Transcribe this voice message. The speaker may be speaking in English or Twi (Ghanaian language).

Instructions:
1. Transcribe exactly what is said
2. If the language is Twi, provide the transcription in Twi
3. Identify the language used (English or Twi)
4. Return in this format:
   Language: [English/Twi]
   Transcription: [exact words spoken]`;

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
  const userId = userData.user.id;

  let body: { audioBase64?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const audioBase64 = body.audioBase64;
  const mimeType = body.mimeType || "audio/webm";
  if (!audioBase64 || typeof audioBase64 !== "string") {
    return new Response(JSON.stringify({ error: "Missing 'audioBase64' in request body" }), { status: 400 });
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    return new Response(JSON.stringify({ error: "Audio too large" }), { status: 413 });
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: allowed, error: quotaError } = await serviceClient.rpc("check_and_log_ai_proxy_request", {
    p_user_id: userId,
    p_endpoint: "voice_transcribe",
    p_daily_limit: DAILY_LIMIT_PER_USER,
  });

  if (quotaError) {
    console.error("[Voice] quota check failed:", quotaError.message);
    return new Response(JSON.stringify({ error: "Internal error checking usage quota" }), { status: 500 });
  }
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: `Daily voice transcription limit reached (${DAILY_LIMIT_PER_USER}/day). Try again tomorrow.` }),
      { status: 429 },
    );
  }

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "Gemini API key not configured" }), { status: 500 });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ inlineData: { mimeType, data: audioBase64 } }, { text: PROMPT }],
            },
          ],
        }),
      },
    );

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new Error(errorBody?.error?.message || `Gemini API error: ${res.status}`);
    }

    const data = await res.json();
    const responseText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const languageMatch = responseText.match(/Language:\s*(English|Twi)/i);
    const transcriptionMatch = responseText.match(/Transcription:\s*(.+)/i);
    const language = languageMatch?.[1]?.toLowerCase() === "twi" ? "tw" : "en";
    const text = transcriptionMatch?.[1]?.trim() || responseText;

    return new Response(JSON.stringify({ text, language }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[Voice] transcription failed:", (err as Error)?.message);
    return new Response(
      JSON.stringify({ text: "", language: "en", error: (err as Error)?.message || "Failed to transcribe voice message" }),
      { headers: { "Content-Type": "application/json" }, status: 502 },
    );
  }
});
