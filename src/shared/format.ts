import { language } from "./languages";
import type { UiLang } from "./types";

const LOCALE = (lang: UiLang) => language(lang).locale;

export function formatUsd(value: number | null, lang: UiLang): string {
  if (value === null) return "-";
  // Sub-hundredth-of-a-cent requests would otherwise read as a misleading zero.
  if (value > 0 && value < 0.0001) return `<${formatUsd(0.0001, lang)}`;
  const digits = value === 0 ? 2 : value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return new Intl.NumberFormat(LOCALE(lang), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatTokens(value: number, lang: UiLang): string {
  return new Intl.NumberFormat(LOCALE(lang), { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatInt(value: number, lang: UiLang): string {
  return new Intl.NumberFormat(LOCALE(lang)).format(value);
}

export function formatSeconds(ms: number, lang: UiLang): string {
  return `${new Intl.NumberFormat(LOCALE(lang), { maximumFractionDigits: 1 }).format(ms / 1000)}s`;
}

export function formatDateTime(ts: number, lang: UiLang): string {
  return new Intl.DateTimeFormat(LOCALE(lang), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(ts);
}

const URL_TEXT = /^(?:https?:\/\/)?(?:www\.)?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:[/?#]\S*)?$/u;

/** True for text that is a web address rather than a @mention, #hashtag or $cashtag. */
export function isUrlText(text: string): boolean {
  const value = text.trim();
  return !/^[@#$]/.test(value) && URL_TEXT.test(value);
}

/**
 * A link as a person would read it: percent-escapes decoded, scheme, www, query and
 * fragment dropped, cut at `max` characters. News links with encoded non-Latin slugs
 * otherwise run to hundreds of characters, cost tokens and get copied into answers.
 */
export function shortUrl(raw: string, max = 60): string {
  let value = raw.trim().replace(/…$/, "");
  try {
    value = decodeURI(value);
  } catch {
    // Malformed escapes: keep the address as it was written.
  }
  value = value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  const chars = [...value];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : value;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
