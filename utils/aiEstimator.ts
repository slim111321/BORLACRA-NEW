export interface TrashEstimate {
  trashType: string;       // e.g. "Household Mixed Waste"
  binCount: number;        // estimated equivalent standard bins, e.g. 2.1 (can be a fraction)
  weightKg: number;        // estimated weight in kg
  price: number;           // total price in GHS = binCount * STANDARD_BIN_PRICE_GHS
  confidence: number;      // 0-100, the AI's own confidence in this volume estimate
  recommendedVehicle: string; // e.g. "Tricycle" or "Mini Truck"
  reasoning: string;       // brief explanation
  provider?: 'nvidia' | 'claude' | 'groq'; // optional tracking
}

// ── Pricing configuration ───────────────────────────────────────────────
// Reference object is the common Ghanaian household wheeled waste bin (~240L,
// two wheels, hinged lid) -- a physical size standard, not any specific
// manufacturer or brand. Update these two values to recalibrate pricing
// platform-wide; nothing else in this file should need to change.
export const STANDARD_BIN_VOLUME_LITERS = 240;
export const STANDARD_BIN_PRICE_GHS = 40; // GHS to empty one completely full standard bin

const PROVIDER_TIMEOUT_MS = 25000; // each provider attempt gets 25s before we move to the next one
// NVIDIA's community NIM endpoint (integrate.api.nvidia.com) measured
// consistently at 90-150+ seconds per request for this model+prompt in
// live testing — the 25s default was aborting it on every single real
// request, long before it ever had a chance to respond. It's no longer the
// first provider tried (see analyzeTrashImage), so a longer timeout here
// only costs time on the rarer path where Groq has already failed.
const NVIDIA_TIMEOUT_MS = 60000;

/**
 * fetch with a hard timeout. Without this, a slow/unresponsive provider
 * (e.g. a large photo uploading over a weak mobile connection) leaves the
 * request pending forever — nothing ever resolves or rejects, so the
 * fallback chain in analyzeTrashImage() never gets a chance to move to the
 * next provider, and the UI spins indefinitely.
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = PROVIDER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

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

/**
 * Main entry point: tries Groq (Qwen3.6 27B) first, then NVIDIA (Mistral
 * Medium 3.5 128B), then Claude, then a hardcoded smart-mock estimate.
 *
 * Groq is first because it's the fastest, most reliable working provider
 * right now (~1-2s, verified live). NVIDIA used to be first, but its
 * community NIM endpoint measured at 90-150+ seconds per request in live
 * testing — every real request was hitting the timeout and silently
 * falling through, which is why "AI providers failed" (the mock estimate)
 * was showing up on every single photo, not just occasionally. NVIDIA is
 * kept in the chain (not removed) as a fallback, just no longer gating the
 * primary experience on its current latency. Claude is kept in place for
 * when a real Anthropic key is added — analyzeWithClaude() throws
 * immediately on a missing key, so it costs nothing to leave it in the
 * chain.
 */
export async function analyzeTrashImage(base64Image: string): Promise<TrashEstimate> {
  try {
    console.log('[AI] Attempting analysis with Groq (Qwen3.6 27B)...');
    const result = await analyzeWithGroq(base64Image);
    return { ...result, provider: 'groq' };
  } catch (groqError: any) {
    console.warn('[AI] Groq failed, falling back to NVIDIA:', groqError?.message || groqError);
    try {
      const result = await analyzeWithNvidia(base64Image);
      return { ...result, provider: 'nvidia' };
    } catch (nvidiaError: any) {
      console.warn('[AI] NVIDIA failed, falling back to Claude:', nvidiaError?.message || nvidiaError);
      try {
        const result = await analyzeWithClaude(base64Image);
        return { ...result, provider: 'claude' };
      } catch (claudeError: any) {
        console.error('[AI] All AI providers failed.');
        console.warn('[AI] Returning smart mock estimate to avoid blocking user.');

        // Smart Mock Fallback: Allows the user to continue testing the app even if AI is down
        const binCount = 1.5;
        return {
          trashType: 'Mixed Household Waste (Estimated)',
          binCount,
          weightKg: 75,
          price: Math.round(binCount * STANDARD_BIN_PRICE_GHS),
          confidence: 50,
          recommendedVehicle: 'Tricycle',
          reasoning: 'AI is currently unavailable. This is a smart estimate based on typical household waste volumes.',
          provider: undefined
        };
      }
    }
  }
}

async function analyzeWithNvidia(base64Image: string): Promise<Omit<TrashEstimate, 'provider'>> {
  const apiKey = process.env.EXPO_PUBLIC_NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA API key missing');

  // NVIDIA NIM (build.nvidia.com) chat/completions — OpenAI-compatible,
  // same image_url content-block shape already used for Groq below.
  const res = await fetchWithTimeout('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'mistralai/mistral-medium-3.5-128b',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: ANALYSIS_PROMPT },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  }, NVIDIA_TIMEOUT_MS);

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(errorBody?.error?.message || `NVIDIA API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('NVIDIA returned no content');
  }

  return parseAndFormatResponse(text);
}

async function analyzeWithClaude(base64Image: string): Promise<Omit<TrashEstimate, 'provider'>> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API key missing');

  // Raw HTTP against the Messages API, not the @anthropic-ai/sdk package —
  // the SDK's credential-resolution code imports the Node built-in
  // `node:fs` at module load time, which doesn't exist in React Native's
  // Hermes engine and breaks the Metro bundle. Same request shape the SDK
  // would send; only the transport differs.
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      output_config: { effort: 'low' }, // fast, cheap classification — user is waiting on the estimate
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            { type: 'text', text: ANALYSIS_PROMPT },
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

  if (data.stop_reason === 'refusal') {
    throw new Error('Claude declined to analyze this image');
  }

  const textBlock = (data.content || []).find((block: any) => block.type === 'text');
  if (!textBlock) {
    throw new Error('Claude returned no text content');
  }

  return parseAndFormatResponse(textBlock.text.trim());
}

async function analyzeWithGroq(base64Image: string): Promise<Omit<TrashEstimate, 'provider'>> {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) throw new Error('Groq API key missing');

  // Both llama-3.2-*-vision-preview models were decommissioned by Groq
  // (confirmed live: every request returned a hard 400 "model_decommissioned"
  // error) — meaning Groq, the last real fallback before the hardcoded mock,
  // was silently guaranteed to fail on every single request. Verified this
  // replacement live: qwen/qwen3.6-27b is Groq's current vision-capable
  // model, returns correctly-structured JSON, ~1-2s response time.
  const models = [
    "qwen/qwen3.6-27b"
  ];

  let lastError: any = null;

  for (const modelId of models) {
    try {
      console.log(`[AI] Trying Groq with model: ${modelId}...`);
      const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: ANALYSIS_PROMPT },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || response.statusText);
      }

      const data = await response.json();
      const text = data.choices[0].message.content;
      return parseAndFormatResponse(text);
    } catch (err: any) {
      lastError = err;
      console.warn(`[AI] Groq model ${modelId} failed:`, err?.message || err);
    }
  }

  throw new Error(lastError?.message || 'Groq failed');
}

function parseAndFormatResponse(text: string): Omit<TrashEstimate, 'provider'> {
  let jsonText = text;
  // Use regex to extract the JSON object even if there is surrounding chatter
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }

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
    trashType: parsed.trashType || 'Mixed Household Waste',
    binCount,
    weightKg: Number(parsed.weightKg) || Math.round(binCount * 50),
    price,
    confidence,
    recommendedVehicle: parsed.recommendedVehicle || 'Tricycle',
    reasoning: parsed.reasoning || '',
  };
}
