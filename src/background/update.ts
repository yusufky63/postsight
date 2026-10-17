import { loadSettings, STORAGE_KEYS } from "../shared/storage";
import type { InstallSource, UpdateCheck, UpdateStatus } from "../shared/update";
import { checkIsStale, installSource, isNewer, parseRelease, RELEASES_API } from "../shared/update";

let source: Promise<InstallSource> | null = null;
let checking: Promise<UpdateCheck> | null = null;

/** management.getSelf needs no permission; if it fails, assume the copy cannot update itself. */
function sourceOf(): Promise<InstallSource> {
  source ??= chrome.management
    .getSelf()
    .then((self) => installSource(self.installType))
    .catch(() => "github" as const);
  return source;
}

async function read<T>(key: string): Promise<T | undefined> {
  return (await chrome.storage.local.get(key))[key] as T | undefined;
}

/** One request to GitHub with no cookies and nothing about the reader; failures keep the last answer. */
async function askGitHub(previous: UpdateCheck | undefined): Promise<UpdateCheck> {
  const checkedAt = Date.now();
  let next: UpdateCheck;
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const release = res.ok ? parseRelease(await res.json()) : null;
    next = release ? { checkedAt, latest: release.version, url: release.url } : { ...previous, checkedAt, failed: true };
  } catch {
    next = { ...previous, checkedAt, failed: true };
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.updateCheck]: next });
  return next;
}

/** The status the popup and settings show; `force` asks GitHub now instead of using the daily answer. */
export async function updateStatus(force = false): Promise<UpdateStatus> {
  const current = chrome.runtime.getManifest().version;
  const src = await sourceOf();
  if (src === "store") {
    const ready = await read<string>(STORAGE_KEYS.updateReady);
    return { current, source: src, ...(isNewer(current, ready) ? { latest: ready } : {}) };
  }
  if (!(await loadSettings()).checkUpdates) return { current, source: src, off: true };
  const stored = await read<UpdateCheck>(STORAGE_KEYS.updateCheck);
  let saved: UpdateCheck;
  if (force || !stored || checkIsStale(stored, Date.now())) {
    checking ??= askGitHub(stored).finally(() => (checking = null));
    saved = await checking;
  } else {
    saved = stored;
  }
  return {
    current,
    source: src,
    checkedAt: saved.checkedAt,
    ...(saved.failed ? { failed: true } : {}),
    ...(isNewer(current, saved.latest) ? { latest: saved.latest, url: saved.url } : {}),
  };
}

/** Store copies: the browser has the new version and applies it when the extension restarts. */
export function watchStoreUpdates(): void {
  chrome.runtime.onUpdateAvailable.addListener((details) => {
    void chrome.storage.local.set({ [STORAGE_KEYS.updateReady]: details.version });
  });
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "update") void chrome.storage.local.remove([STORAGE_KEYS.updateReady, STORAGE_KEYS.updateCheck]);
  });
}

/** Restarts the extension so a downloaded store update takes over; open Postsight pages close. */
export async function applyUpdate(): Promise<{ ok: boolean }> {
  if ((await sourceOf()) !== "store") return { ok: false };
  chrome.runtime.reload();
  return { ok: true };
}
