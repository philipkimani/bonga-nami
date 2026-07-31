/**
 * ElevenLabs Supported Languages
 *
 * Maps language codes to display names and ISO 3166-1 alpha-2 country codes
 * for flag image rendering via CDN (emoji flags don't render on Windows).
 *
 * Source: ElevenLabs platform Additional Languages panel (Feb 2026).
 *
 * Note: The SDK's TypeScript `Language` type is narrower than what the
 * platform actually supports. We use `string` for the code so we can
 * include all platform-supported languages without type conflicts.
 */

export type SupportedLanguage = string;

export interface LanguageOption {
  code: string;
  name: string;         // English name
  nativeName: string;   // Name in that language
  countryCode: string;  // ISO 3166-1 alpha-2 for flag CDN (e.g. 'gb', 'ke')
}

/**
 * Flag image CDN base URL.
 * Provides cross-platform flag images (works on Windows unlike emoji flags).
 * w20 = 20px wide, w40 = 40px wide.
 */
export const FLAG_CDN = 'https://flagcdn.com';

/** Get a flag image URL for a country code */
export function getFlagUrl(countryCode: string, width: 20 | 24 | 40 = 20): string {
  return `${FLAG_CDN}/w${width}/${countryCode.toLowerCase()}.png`;
}

/**
 * All languages supported by ElevenLabs Conversational AI,
 * sorted alphabetically by English name.
 */
export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'ar', name: 'Arabic',              nativeName: 'العربية',           countryCode: 'sa' },
  { code: 'bg', name: 'Bulgarian',           nativeName: 'Български',         countryCode: 'bg' },
  { code: 'zh', name: 'Chinese',             nativeName: '中文',              countryCode: 'cn' },
  { code: 'hr', name: 'Croatian',            nativeName: 'Hrvatski',          countryCode: 'hr' },
  { code: 'cs', name: 'Czech',               nativeName: 'Čeština',           countryCode: 'cz' },
  { code: 'da', name: 'Danish',              nativeName: 'Dansk',             countryCode: 'dk' },
  { code: 'nl', name: 'Dutch',               nativeName: 'Nederlands',        countryCode: 'nl' },
  { code: 'en', name: 'English',             nativeName: 'English',           countryCode: 'us' },
  { code: 'fi', name: 'Finnish',             nativeName: 'Suomi',             countryCode: 'fi' },
  { code: 'fr', name: 'French',              nativeName: 'Français',          countryCode: 'fr' },
  { code: 'de', name: 'German',              nativeName: 'Deutsch',           countryCode: 'de' },
  { code: 'el', name: 'Greek',               nativeName: 'Ελληνικά',          countryCode: 'gr' },
  { code: 'hi', name: 'Hindi',               nativeName: 'हिन्दी',              countryCode: 'in' },
  { code: 'hu', name: 'Hungarian',           nativeName: 'Magyar',            countryCode: 'hu' },
  { code: 'id', name: 'Indonesian',          nativeName: 'Bahasa Indonesia',  countryCode: 'id' },
  { code: 'it', name: 'Italian',             nativeName: 'Italiano',          countryCode: 'it' },
  { code: 'ja', name: 'Japanese',            nativeName: '日本語',             countryCode: 'jp' },
  { code: 'ko', name: 'Korean',              nativeName: '한국어',              countryCode: 'kr' },
  { code: 'ms', name: 'Malay',               nativeName: 'Bahasa Melayu',     countryCode: 'my' },
  { code: 'no', name: 'Norwegian',           nativeName: 'Norsk',             countryCode: 'no' },
  { code: 'pl', name: 'Polish',              nativeName: 'Polski',            countryCode: 'pl' },
  { code: 'pt', name: 'Portuguese',          nativeName: 'Português',         countryCode: 'pt' },
  { code: 'pt-br', name: 'Portuguese (BR)',  nativeName: 'Português (BR)',    countryCode: 'br' },
  { code: 'ro', name: 'Romanian',            nativeName: 'Română',            countryCode: 'ro' },
  { code: 'ru', name: 'Russian',             nativeName: 'Русский',           countryCode: 'ru' },
  { code: 'sk', name: 'Slovak',              nativeName: 'Slovenčina',        countryCode: 'sk' },
  { code: 'sl', name: 'Slovenian',           nativeName: 'Slovenščina',       countryCode: 'si' },
  { code: 'so', name: 'Somali',              nativeName: 'Soomaali',          countryCode: 'so' },
  { code: 'es', name: 'Spanish',             nativeName: 'Español',           countryCode: 'es' },
  { code: 'sw', name: 'Swahili',             nativeName: 'Kiswahili',         countryCode: 'ke' },
  { code: 'sv', name: 'Swedish',             nativeName: 'Svenska',           countryCode: 'se' },
  { code: 'ta', name: 'Tamil',               nativeName: 'தமிழ்',              countryCode: 'lk' },
  { code: 'te', name: 'Telugu',              nativeName: 'తెలుగు',             countryCode: 'in' },
  { code: 'th', name: 'Thai',                nativeName: 'ไทย',               countryCode: 'th' },
  { code: 'tr', name: 'Turkish',             nativeName: 'Türkçe',            countryCode: 'tr' },
  { code: 'uk', name: 'Ukrainian',           nativeName: 'Українська',        countryCode: 'ua' },
  { code: 'ur', name: 'Urdu',                nativeName: 'اردو',              countryCode: 'pk' },
  { code: 'vi', name: 'Vietnamese',          nativeName: 'Tiếng Việt',        countryCode: 'vn' },
  { code: 'cy', name: 'Welsh',               nativeName: 'Cymraeg',           countryCode: 'gb-wls' },
];

/** Quick lookup by code */
export const LANGUAGE_MAP = new Map(
  SUPPORTED_LANGUAGES.map(l => [l.code, l])
);
