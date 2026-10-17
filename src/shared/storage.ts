import { mergeSettings } from "./settings";
import type { HistoryEntry, ProviderId, Secrets, Settings, UsageEntry } from "./types";

const KEYS = {
  settings: "settings",
  secrets: "secrets",
  usage: "usage",
  history: "history",
  explorer: "explorerKeys",
} as const;

export const STORAGE_KEYS = KEYS;

const EMPTY_SECRETS: Secrets = { anthropic: "", openai: "", deepseek: "" };

async function read<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

export async function loadSettings(): Promise<Settings> {
  return mergeSettings(await read<Partial<Settings>>(KEYS.settings));
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEYS.settings]: settings });
}

export async function updateSettings(change: (s: Settings) => void): Promise<Settings> {
  const settings = await loadSettings();
  change(settings);
  await saveSettings(settings);
  return settings;
}

export async function loadSecrets(): Promise<Secrets> {
  return { ...EMPTY_SECRETS, ...((await read<Partial<Secrets>>(KEYS.secrets)) ?? {}) };
}

export async function saveSecret(provider: ProviderId, key: string): Promise<void> {
  const secrets = await loadSecrets();
  secrets[provider] = key.trim();
  await chrome.storage.local.set({ [KEYS.secrets]: secrets });
}

export function keyedProviders(secrets: Secrets): Set<ProviderId> {
  return new Set((Object.keys(secrets) as ProviderId[]).filter((p) => secrets[p].length > 0));
}

export async function loadUsage(): Promise<UsageEntry[]> {
  return (await read<UsageEntry[]>(KEYS.usage)) ?? [];
}

export async function saveUsage(entries: UsageEntry[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.usage]: entries });
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  return (await read<HistoryEntry[]>(KEYS.history)) ?? [];
}

export async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.history]: entries });
}

/** Explorer API keys the reader added for wallet cards; kept apart from the AI keys. */
export interface ExplorerKeys {
  etherscan: string;
}

export async function loadExplorerKeys(): Promise<ExplorerKeys> {
  return { etherscan: "", ...((await read<Partial<ExplorerKeys>>(KEYS.explorer)) ?? {}) };
}

export async function saveExplorerKey(name: keyof ExplorerKeys, key: string): Promise<void> {
  const keys = await loadExplorerKeys();
  keys[name] = key.trim();
  await chrome.storage.local.set({ [KEYS.explorer]: keys });
}
