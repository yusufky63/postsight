import type { UiLang } from "./languages";
import { de } from "./locales/de";
import { en } from "./locales/en";
import type { MessageKey } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { id } from "./locales/id";
import { it } from "./locales/it";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";
import { pt } from "./locales/pt";
import { ru } from "./locales/ru";
import { tr } from "./locales/tr";
import { zh } from "./locales/zh";

export type { MessageKey } from "./locales/en";

const DICT: Record<UiLang, Record<MessageKey, string>> = { en, tr, de, es, fr, pt, it, ru, ja, ko, zh, id };

export function t(lang: UiLang, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = DICT[lang]?.[key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export function translator(lang: UiLang) {
  return (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
}

export type Translate = ReturnType<typeof translator>;

export const dictionaries = DICT;
