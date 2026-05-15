import { GoogleGenerativeAI } from '@google/generative-ai';

export interface TrashEstimate {
  trashType: string;       // e.g. "Household Mixed Waste"
  binCount: number;        // e.g. 2.5 (multiples of the standard 240L bin)
  weightKg: number;        // estimated weight in kg
  priceLow: number;        // lower bound in GHS
  priceHigh: number;       // upper bound in GHS
  recommendedVehicle: string; // e.g. "Tricycle" or "Mini Truck"
  reasoning: string;       // brief explanation
  provider?: 'gemini' | 'groq'; // optional tracking
}

const PRICE_PER_BIN = 30; // GHS 30 per standard 240L bin (Ghana benchmark)

const ANALYSIS_PROMPT = `
You are an expert waste management estimator for the SamSa app in Ghana.

BASELINE REFERENCE:
- A standard orange 240L wheelie bin (like those used in Ghana) costs GHS 30 to empty.
- Use this as your unit of measurement for estimating volume.

YOUR TASK:
Carefully examine the image provided and estimate the amount of trash visible.
Compare the volume of waste to the standard 240L bin baseline.

OUTPUT FORMAT (strict JSON, no extra text):
{
  "trashType": "<type of waste, e.g. Household Mixed Waste, Commercial Waste, etc.>",
  "binCount": <number, how many 240L bins this trash would fill, can be decimal e.g. 0.5 or 2.5>,
  "weightKg": <estimated weight in kg as a number>,
  "recommendedVehicle": "<Tricycle, Pickup, or Mini Truck depending on volume>",
  "reasoning": "<1-2 sentences explaining how you arrived at this estimate>"
}

VEHICLE GUIDELINES:
- Up to 1 bin → Tricycle
- 1-3 bins → Pickup
- 3+ bins → Mini Truck

Be realistic and accurate. If the image is blurry or unclear, estimate conservatively.
`;

/**
 * Main entry point: Tries Gemini first, falls back to Groq if Gemini fails.
 */
export async function analyzeTrashImage(base64Image: string): Promise<TrashEstimate> {
  let geminiErr: any = null;
  try {
    console.log('[AI] Attempting analysis with Gemini...');
    const result = await analyzeWithGemini(base64Image);
    return { ...result, provider: 'gemini' };
  } catch (error: any) {
    geminiErr = error;
    console.warn('[AI] Gemini failed, falling back to Groq:', error?.message || error);
    try {
      const result = await analyzeWithGroq(base64Image);
      return { ...result, provider: 'groq' };
    } catch (groqError: any) {
      console.error('[AI] Both AI providers failed.');
      console.warn('[AI] Returning smart mock estimate to avoid blocking user.');
      
      // Smart Mock Fallback: Allows the user to continue testing the app even if AI is down
      return {
        trashType: 'Mixed Household Waste (Estimated)',
        binCount: 1.5,
        weightKg: 75,
        priceLow: 40,
        priceHigh: 55,
        recommendedVehicle: 'Tricycle',
        reasoning: 'AI is currently unavailable. This is a smart estimate based on typical household waste volumes.',
        provider: undefined
      };
    }
  }
}

async function analyzeWithGemini(base64Image: string): Promise<Omit<TrashEstimate, 'provider'>> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing');

  const genAI = new GoogleGenerativeAI(apiKey);
  // Using standard flash model without forcing apiVersion which can cause conflicts
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const imagePart = {
    inlineData: {
      data: base64Image,
      mimeType: 'image/jpeg' as const,
    },
  };

  const result = await model.generateContent([ANALYSIS_PROMPT, imagePart]);
  const response = await result.response;
  const text = response.text().trim();
  
  return parseAndFormatResponse(text);
}

async function analyzeWithGroq(base64Image: string): Promise<Omit<TrashEstimate, 'provider'>> {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) throw new Error('Groq API key missing');

  const models = [
    "llama-3.2-11b-vision-preview",
    "llama-3.2-90b-vision-preview"
  ];

  let lastError: any = null;

  for (const modelId of models) {
    try {
      console.log(`[AI] Trying Groq with model: ${modelId}...`);
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
  const priceLow = Math.round(binCount * PRICE_PER_BIN * 0.9);
  const priceHigh = Math.round(binCount * PRICE_PER_BIN * 1.1);

  return {
    trashType: parsed.trashType || 'Mixed Household Waste',
    binCount,
    weightKg: Number(parsed.weightKg) || Math.round(binCount * 50),
    priceLow,
    priceHigh,
    recommendedVehicle: parsed.recommendedVehicle || 'Tricycle',
    reasoning: parsed.reasoning || '',
  };
}
