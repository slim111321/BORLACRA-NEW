import { supabase } from './supabase';

/**
 * Transcribe audio to text via the `voice-transcribe` Supabase edge
 * function. Supports both English and Twi (Ghanaian language).
 *
 * The actual Gemini call (and EXPO_PUBLIC_GEMINI_API_KEY) used to live
 * directly in this file, shipping the key inside the compiled app. It now
 * lives server-side in the edge function, which requires a signed-in user
 * and enforces a daily per-user quota -- see
 * supabase/migrations/20260721000000_ai_proxy_rate_limit.sql.
 */
export async function transcribeVoiceMessage(
    audioBase64: string,
    mimeType: string = 'audio/webm'
): Promise<{ text: string; language: 'en' | 'tw'; error?: string }> {
    try {
        const { data, error } = await supabase.functions.invoke('voice-transcribe', {
            body: { audioBase64, mimeType },
        });

        if (error) throw error;

        return {
            text: data?.text || '',
            language: data?.language === 'tw' ? 'tw' : 'en',
            error: data?.error,
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
