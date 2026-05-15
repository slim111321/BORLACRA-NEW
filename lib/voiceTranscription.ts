import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

/**
 * Transcribe audio to text using Gemini API
 * Supports both English and Twi (Ghanaian language)
 */
export async function transcribeVoiceMessage(
    audioBase64: string,
    mimeType: string = 'audio/webm'
): Promise<{ text: string; language: 'en' | 'tw'; error?: string }> {
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

        const prompt = `Transcribe this voice message. The speaker may be speaking in English or Twi (Ghanaian language). 
    
Instructions:
1. Transcribe exactly what is said
2. If the language is Twi, provide the transcription in Twi
3. Identify the language used (English or Twi)
4. Return in this format:
   Language: [English/Twi]
   Transcription: [exact words spoken]`;

        const result = await model.generateContent([
            {
                inlineData: {
                    data: audioBase64,
                    mimeType: mimeType,
                },
            },
            prompt,
        ]);

        const response = result.response.text();

        // Parse the response
        const languageMatch = response.match(/Language:\s*(English|Twi)/i);
        const transcriptionMatch = response.match(/Transcription:\s*(.+)/i);

        const language = languageMatch?.[1].toLowerCase() === 'twi' ? 'tw' : 'en';
        const text = transcriptionMatch?.[1]?.trim() || response;

        return {
            text,
            language,
        };
    } catch (error: any) {
        console.error('Voice transcription error:', error);
        return {
            text: '',
            language: 'en',
            error: error.message || 'Failed to transcribe voice message',
        };
    }
}

/**
 * Simulate voice message transcription for demo purposes
 * In production, this would receive actual audio data
 */
export function simulateVoiceTranscription(scenario: 'english' | 'twi'): {
    text: string;
    language: 'en' | 'tw';
} {
    const scenarios = {
        english: {
            text: 'I need trash collection at Kasoa Market tomorrow morning for household waste',
            language: 'en' as const,
        },
        twi: {
            text: 'Mepɛ sɛ wogyegye nwura wɔ Kasoa Market ɛkyena anɔpa',
            language: 'tw' as const,
        },
    };

    return scenarios[scenario];
}
