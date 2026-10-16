/**
 * Languages Sift speaks, both for its interface and for answers. `english` names the
 * language in prompts, `native` is what the language picker shows, `chrome` is the
 * folder name under _locales for the store listing.
 */
export const LANGUAGES = [
  { code: "en", english: "English", native: "English", locale: "en-US", chrome: "en" },
  { code: "tr", english: "Turkish", native: "Türkçe", locale: "tr-TR", chrome: "tr" },
  { code: "de", english: "German", native: "Deutsch", locale: "de-DE", chrome: "de" },
  { code: "es", english: "Spanish", native: "Español", locale: "es-ES", chrome: "es" },
  { code: "fr", english: "French", native: "Français", locale: "fr-FR", chrome: "fr" },
  { code: "pt", english: "Brazilian Portuguese", native: "Português", locale: "pt-BR", chrome: "pt_BR" },
  { code: "it", english: "Italian", native: "Italiano", locale: "it-IT", chrome: "it" },
  { code: "ru", english: "Russian", native: "Русский", locale: "ru-RU", chrome: "ru" },
  { code: "ja", english: "Japanese", native: "日本語", locale: "ja-JP", chrome: "ja" },
  { code: "ko", english: "Korean", native: "한국어", locale: "ko-KR", chrome: "ko" },
  { code: "zh", english: "Simplified Chinese", native: "简体中文", locale: "zh-CN", chrome: "zh_CN" },
  { code: "id", english: "Indonesian", native: "Bahasa Indonesia", locale: "id-ID", chrome: "id" },
] as const;

export type UiLang = (typeof LANGUAGES)[number]["code"];

export const LANG_CODES: readonly UiLang[] = LANGUAGES.map((l) => l.code);

export function language(code: UiLang): (typeof LANGUAGES)[number] {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** Maps a browser language tag ("pt-BR", "zh-Hans-CN", "tr") to a supported code. */
export function matchLanguage(tag: string | null | undefined): UiLang | null {
  const base = (tag ?? "").toLowerCase().split(/[-_]/)[0] ?? "";
  if (base === "in") return "id";
  return LANG_CODES.find((c) => c === base) ?? null;
}
