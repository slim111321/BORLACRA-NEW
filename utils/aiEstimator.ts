import { supabase } from '../lib/supabase';

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

// GHS to empty one completely full standard (~240L) bin. Only used here to
// price the local smart-mock fallback below -- the real per-provider
// pricing math now lives server-side in the ai-trash-estimate edge
// function (supabase/functions/ai-trash-estimate/index.ts), which has its
// own copy of this same constant.
export const STANDARD_BIN_PRICE_GHS = 40;

/**
 * Main entry point for the AI Trash Estimator.
 *
 * The Groq -> NVIDIA -> Claude provider chain (and the API keys it needs)
 * now lives entirely in the `ai-trash-estimate` Supabase edge function, not
 * here. Those provider keys used to be shipped inside the compiled app via
 * EXPO_PUBLIC_* env vars -- extractable from the app binary, or just
 * readable off the outgoing request, with nothing to stop unlimited
 * requests against our own provider billing. This function now just calls
 * that edge function (which requires a signed-in user and enforces a daily
 * per-user quota -- see supabase/migrations/20260721000000_ai_proxy_rate_limit.sql)
 * and falls back to the same hardcoded smart-mock estimate the old
 * client-side chain used when every provider failed, so a proxy outage
 * still never blocks a user from completing a booking.
 */
export async function analyzeTrashImage(base64Image: string): Promise<TrashEstimate> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-trash-estimate', {
      body: { image: base64Image },
    });

    if (error) throw error;
    if (!data || typeof data.binCount !== 'number') {
      throw new Error('Malformed response from AI estimator proxy');
    }

    return data as TrashEstimate;
  } catch (err: any) {
    console.warn('[AI] ai-trash-estimate proxy failed, returning smart mock estimate:', err?.message || err);

    // Smart Mock Fallback: Allows the user to continue booking even if the
    // proxy or every upstream AI provider is down.
    const binCount = 1.5;
    return {
      trashType: 'Mixed Household Waste (Estimated)',
      binCount,
      weightKg: 75,
      price: Math.round(binCount * STANDARD_BIN_PRICE_GHS),
      confidence: 50,
      recommendedVehicle: 'Tricycle',
      reasoning: 'AI is currently unavailable. This is a smart estimate based on typical household waste volumes.',
      provider: undefined,
    };
  }
}
