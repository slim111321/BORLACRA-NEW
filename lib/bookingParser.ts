import { TrashType } from '../types';

export interface BookingIntent {
    location?: string;
    trashType?: TrashType;
    timePreference?: string;
    confidence: number;
    rawText: string;
    language: 'en' | 'tw';
}

/**
 * Parse transcribed text to extract booking intent
 * Uses AI to understand natural language booking requests
 */
export function parseBookingIntent(
    transcribedText: string,
    language: 'en' | 'tw'
): BookingIntent {
    const text = transcribedText.toLowerCase();

    // Initialize result
    const intent: BookingIntent = {
        rawText: transcribedText,
        language,
        confidence: 0,
    };

    // Detect location
    const locationKeywords = {
        en: ['kasoa', 'market', 'new market', 'location', 'at', 'from'],
        tw: ['kasoa', 'market', 'wɔ', 'baabi'],
    };

    const keywords = language === 'tw' ? locationKeywords.tw : locationKeywords.en;

    if (keywords.some(kw => text.includes(kw))) {
        // Extract location - default to Kasoa Market for demo
        intent.location = 'Kasoa New Market, Ghana';
        intent.confidence += 0.3;
    }

    // Detect trash type
    const trashTypeMap = {
        household: ['household', 'home', 'house', 'domestic', 'efie', 'fie'],
        commercial: ['commercial', 'business', 'shop', 'store', 'adwuma'],
        industrial: ['industrial', 'factory', 'fɛktri'],
        medical: ['medical', 'hospital', 'clinic', 'ayaresabea'],
        electronic: ['electronic', 'e-waste', 'computer', 'phone'],
    };

    for (const [type, keywords] of Object.entries(trashTypeMap)) {
        if (keywords.some(kw => text.includes(kw))) {
            intent.trashType = type.toUpperCase() as TrashType;
            intent.confidence += 0.4;
            break;
        }
    }

    // Default to HOUSEHOLD if not specified
    if (!intent.trashType) {
        intent.trashType = TrashType.HOUSEHOLD;
        intent.confidence += 0.2;
    }

    // Detect time preference
    const timeKeywords = {
        en: ['tomorrow', 'today', 'now', 'morning', 'afternoon', 'evening'],
        tw: ['ɛkyena', 'nnɛ', 'seesei', 'anɔpa', 'awia', 'anwummerɛ'],
    };

    const timeKw = language === 'tw' ? timeKeywords.tw : timeKeywords.en;

    for (const keyword of timeKw) {
        if (text.includes(keyword)) {
            intent.timePreference = keyword;
            intent.confidence += 0.3;
            break;
        }
    }

    // Ensure confidence is between 0 and 1
    intent.confidence = Math.min(intent.confidence, 1);

    return intent;
}

/**
 * Generate confirmation message in the user's language
 */
export function generateConfirmationMessage(
    intent: BookingIntent
): string {
    if (intent.language === 'tw') {
        return `Yɛate! Yɛbɛgyegye ${intent.trashType?.toLowerCase()} nwura wɔ ${intent.location || 'wo baabi'}. ${intent.timePreference ? `Berɛ: ${intent.timePreference}` : ''
            }`;
    }

    return `Got it! We'll collect ${intent.trashType?.toLowerCase()} trash at ${intent.location || 'your location'
        }. ${intent.timePreference ? `Time: ${intent.timePreference}` : ''}`;
}
