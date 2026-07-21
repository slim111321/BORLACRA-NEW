// AI Trash Estimator proxy.
//
// Runs the same Groq -> NVIDIA -> Claude provider fallback chain that used
// to live in utils/aiEstimator.ts and call these providers directly from
// the client. That meant EXPO_PUBLIC_NVIDIA_API_KEY / GROQ_API_KEY /
// ANTHROPIC_API_KEY shipped inside the compiled app and could be pulled out
// of the binary (or read straight off the outgoing Authorization header) --
// anyone who did that could run unlimited requests against our provider
// billing. The provider keys now live only as edge-function secrets
// (never sent to the client), and every call is gated by a signed-in user
// plus a per-user daily quota (see the ai_proxy_requests table /
// check_and_log_ai_proxy_request in the paired migration) so this doesn't
// just trade "anyone can steal the key" for "any one account can hammer it
// for free."
//
// The client side of this (utils/aiEstimator.ts) still has its own final
// fallback to a hardcoded smart-mock estimate if this function is
// unreachable or errors, so a proxy outage never blocks a user from
// completing a booking -- same behavior as before this change, just with
// the "all providers failed" case now also covering "couldn't reach our
// own backend."
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const DAILY_LIMIT_PER_USER = 40; // generous for real booking usage, cheap to raise later if it's too tight
const MAX_IMAGE_BASE64_CHARS = 12_000_000; // ~9MB decoded -- comfortably above a quality:0.7 phone photo, guards against abusive payloads

const STANDARD_BIN_VOLUME_LITERS = 240;
const STANDARD_BIN_PRICE_GHS = 40;

const PROVIDER_TIMEOUT_MS = 25000;
const NVIDIA_TIMEOUT_MS = 60000; // NVIDIA's community NIM endpoint measured at 90-150s+ per request live -- see utils/aiEstimator.ts history

const ANALYSIS_PROMPT = `
You are an expert waste-volume estimator for the SamSa waste collection app in Ghana.

REFERENCE OBJECT (use this exact standard -- never reference any brand, manufacturer, or logo):
The standard Ghanaian household wheeled waste bin:
- Approximately ${STANDARD_BIN_VOLUME_LITERS} liters
- Two wheels, hinged lid
- Commonly used by homes, schools, and businesses across Ghana
Judge scale purely from the physical size and shape of this generic bin type. Different manufacturers make nearly identical bins -- ignore any logos or branding and reason only about physical size.

YOUR TASK:
Estimate the TOTAL waste volume shown as a number of equivalent standard bins (a decimal, e.g. 0.25, 0.5, 1.0, or spanning multiple containers, e.g. 2.1). To do this, reason carefully about:
- Overall waste volume, height of the pile, width and footprint
- Density of the waste (loosely piled material fills more volume per kg than tightly packed material)
- Perspective and distance (closer objects appear larger in a photo -- account for camera distance/angle before judging size)
- Whether any containers shown are empty, partially filled, or completely full
- Whether waste is piled or stacked above the rim/lid of a container
- If multiple containers or separate piles appear in the same image, estimate each one individually, then sum them into a single total bin-equivalent count

Do not simply detect objects present in the photo -- estimate the actual waste volume relative to the standard bin described above, not a generic guess.

OUTPUT FORMAT (strict JSON, no extra text):
{
  "trashType": "<type of waste, e.g. Household Mixed Waste, Commercial Waste, etc.>",
  "binCount": <number, total equivalent standard bins across everything visible, decimal allowed e.g. 0.25, 0.75, 2.1>,
  "weightKg": <estimated weight in kg as a number>,
  "confidence": <integer 0-100, how confident you are in this volume estimate>,
  "recommendedVehicle": "<Tricycle, Pickup, or Mini Truck depending on volume>",
  "reasoning": "<1-2 sentences explaining how you arrived at this estimate>"
}

VEHICLE GUIDELINES:
- Up to 1 bin → Tricycle
- 1-3 bins → Pickup
- 3+ bins → Mini Truck

Be realistic and precise, not conservative -- most real waste photos should not default to a low estimate. Weigh height, footprint, density, and stacking carefully, and estimate the size actually visible in the photo. If the image itself is genuinely blurry or ambiguous, reflect that by lowering the confidence score, not by lowering the volume estimate.
`;

interface TrashEstimate {
  trashType: string;
  binCount: number;
  weightKg: number;
  price: number;
  confidence: number;
  recommendedVehicle: string;
  reasoning: string;
  provider?: "nvidia" | "claude" | "groq";
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = PROVIDER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseAndFormatResponse(text: string): Omit<TrashEstimate, "provider"> {
  let jsonText = text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonText = jsonMatch[0];

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`AI returned invalid JSON: ${text}`);
  }

  const binCount: number = Number(parsed.binCount) || 1;
  const price = Math.round(binCount * STANDARD_BIN_PRICE_GHS);
  const rawConfidence = Number(parsed.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(100, Math.round(rawConfidence))) : 70;

  return {
    trashType: parsed.trashType || "Mixed Household Waste",
    binCount,
    weightKg: Number(parsed.weightKg) || Math.round(binCount * 50),
    price,
    confidence,
    recommendedVehicle: parsed.recommendedVehicle || "Tricycle",
    reasoning: parsed.reasoning || "",
  };
}

async function analyzeWithGroq(base64Image: string): Promise<Omit<TrashEstimate, "provider">> {
  if (!GROQ_API_KEY) throw new Error("Groq API key missing");

  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "qwen/qwen3.6-27b",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: ANALYSIS_PROMPT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error?.message || response.statusText);
  }

  const data = await response.json();
  const text = data.choices[0].message.content;
  return parseAndFormatResponse(text);
}

async function analyzeWithNvidia(base64Image: string): Promise<Omit<TrashEstimate, "provider">> {
  if (!NVIDIA_API_KEY) throw new Error("NVIDIA API key missing");

  const res = await fetchWithTimeout(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistralai/mistral-medium-3.5-128b",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ANALYSIS_PROMPT },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1024,
      }),
    },
    NVIDIA_TIMEOUT_MS,
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(errorBody?.error?.message || `NVIDIA API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("NVIDIA returned no content");
  return parseAndFormatResponse(text);
}

async function analyzeWithClaude(base64Image: string): Promise<Omit<TrashEstimate, "provider">> {
  if (!ANTHROPIC_API_KEY) throw new Error("Anthropic API key missing");

  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
            { type: "text", text: ANALYSIS_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(errorBody?.error?.message || `Claude API error: ${res.status}`);
  }

  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("Claude declined to analyze this image");

  const textBlock = (data.content || []).find((block: any) => block.type === "text");
  if (!textBlock) throw new Error("Claude returned no text content");
  return parseAndFormatResponse(textBlock.text.trim());
}

async function analyzeTrashImage(base64Image: string): Promise<TrashEstimate> {
  try {
    const result = await analyzeWithGroq(base64Image);
    return { ...result, provider: "groq" };
  } catch (groqError) {
    console.warn("[AI] Groq failed, falling back to NVIDIA:", (groqError as Error)?.message);
    try {
      const result = await analyzeWithNvidia(base64Image);
      return { ...result, provider: "nvidia" };
    } catch (nvidiaError) {
      console.warn("[AI] NVIDIA failed, falling back to Claude:", (nvidiaError as Error)?.message);
      const result = await analyzeWithClaude(base64Image);
      return { ...result, provider: "claude" };
    }
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401 });
  }

  // Identify the real signed-in user from their own JWT -- the anon key
  // alone (public, embedded in the app) would also pass Supabase's
  // platform-level JWT check, so this is what actually ties usage to one
  // account for the daily quota below.
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 });
  }
  const userId = userData.user.id;

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const base64Image = body.image;
  if (!base64Image || typeof base64Image !== "string") {
    return new Response(JSON.stringify({ error: "Missing 'image' (base64) in request body" }), { status: 400 });
  }
  if (base64Image.length > MAX_IMAGE_BASE64_CHARS) {
    return new Response(JSON.stringify({ error: "Image too large" }), { status: 413 });
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: allowed, error: quotaError } = await serviceClient.rpc("check_and_log_ai_proxy_request", {
    p_user_id: userId,
    p_endpoint: "trash_estimate",
    p_daily_limit: DAILY_LIMIT_PER_USER,
  });

  if (quotaError) {
    console.error("[AI] quota check failed:", quotaError.message);
    return new Response(JSON.stringify({ error: "Internal error checking usage quota" }), { status: 500 });
  }
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: `Daily AI estimate limit reached (${DAILY_LIMIT_PER_USER}/day). Try again tomorrow.` }),
      { status: 429 },
    );
  }

  try {
    const estimate = await analyzeTrashImage(base64Image);
    return new Response(JSON.stringify(estimate), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[AI] All providers failed:", (err as Error)?.message);
    // Let the client fall back to its own smart-mock estimate rather than
    // guessing one server-side -- utils/aiEstimator.ts already does this
    // on any non-2xx/network failure from this function.
    return new Response(JSON.stringify({ error: "All AI providers unavailable" }), { status: 502 });
  }
});
