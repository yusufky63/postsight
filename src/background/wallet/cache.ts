/*
 * Lookup results kept on this device, so hovering the same address again is instant
 * and the rate-limited services are asked once. Entries carry their own expiry; a
 * failed lookup throws and is never stored.
 */

const PREFIX = "wallet:";
const MAX_ENTRIES = 1500;
const PRUNE_EVERY_MS = 3600_000;

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

interface Entry<T> {
  v: T;
  exp: number;
}

const memory = new Map<string, Entry<unknown>>();
let lastPrune = 0;

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, emptyTtlMs = ttlMs): Promise<T> {
  const id = PREFIX + key;
  const now = Date.now();
  // Callers fill in what they get (a token gains its market data, its test trade), so
  // every caller gets its own copy and the cached answer stays as the source gave it.
  const hot = memory.get(id) as Entry<T> | undefined;
  if (hot && hot.exp > now) return structuredClone(hot.v);
  const stored = (await chrome.storage.local.get(id))[id] as Entry<T> | undefined;
  if (stored && stored.exp > now) {
    memory.set(id, stored);
    return structuredClone(stored.v);
  }
  const value = await load();
  const empty = value === null || (Array.isArray(value) && value.length === 0);
  const entry: Entry<T> = { v: structuredClone(value), exp: now + (empty ? emptyTtlMs : ttlMs) };
  memory.set(id, entry);
  await chrome.storage.local.set({ [id]: entry });
  if (now - lastPrune > PRUNE_EVERY_MS) {
    lastPrune = now;
    void prune(now).catch(() => undefined);
  }
  return value;
}

/** Drops expired entries, and the ones closest to expiring once there are too many. */
async function prune(now: number): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all).filter(([k]) => k.startsWith(PREFIX)) as [string, Entry<unknown>][];
  const expired = entries.filter(([, e]) => !e || typeof e.exp !== "number" || e.exp <= now).map(([k]) => k);
  const live = entries.filter(([k]) => !expired.includes(k)).sort((a, b) => a[1].exp - b[1].exp);
  const excess = live.slice(0, Math.max(0, live.length - MAX_ENTRIES)).map(([k]) => k);
  const remove = [...expired, ...excess];
  for (const k of remove) memory.delete(k);
  if (remove.length) await chrome.storage.local.remove(remove);
}
