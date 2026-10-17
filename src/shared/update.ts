/*
 * The new-version notice. A copy installed from the Chrome Web Store or Edge Add-ons updates
 * itself: the store downloads the new version and the browser applies it on the next
 * restart, so the notice only offers that restart. A copy loaded from the GitHub zip never
 * updates on its own, so it asks GitHub's releases API, at most once a day, which version
 * is the newest.
 */

export const RELEASES_API = "https://api.github.com/repos/yusufky63/postsight/releases/latest";
export const RELEASES_PAGE = "https://github.com/yusufky63/postsight/releases/";
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
/** After a failed check, try again sooner than a day. */
export const RETRY_AFTER_MS = 60 * 60 * 1000;

export type InstallSource = "store" | "github";

/** What the worker remembers from the last GitHub check. */
export interface UpdateCheck {
  checkedAt: number;
  latest?: string;
  url?: string;
  failed?: boolean;
}

export interface UpdateStatus {
  current: string;
  source: InstallSource;
  /** A newer version. For a store copy it is already downloaded and waits for a restart. */
  latest?: string;
  /** The release page for a GitHub copy. */
  url?: string;
  checkedAt?: number;
  /** The last check could not reach GitHub. */
  failed?: boolean;
  /** The reader turned the GitHub check off. */
  off?: boolean;
}

/** "normal" is a store install; "admin" is one a policy installed, which updates the same way. */
export function installSource(installType: string | undefined): InstallSource {
  return installType === "normal" || installType === "admin" ? "store" : "github";
}

function parts(version: string): number[] {
  return version.split(".").map((p) => Number.parseInt(p, 10) || 0);
}

/** Negative when a is older than b, positive when newer, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function isNewer(current: string, latest: string | undefined): latest is string {
  return !!latest && compareVersions(latest, current) > 0;
}

/** The version and page of GitHub's latest release, or null for anything unexpected. */
export function parseRelease(raw: unknown): { version: string; url: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.draft === true || r.prerelease === true) return null;
  const tag = typeof r.tag_name === "string" ? r.tag_name.trim() : "";
  const match = /^v?(\d+(?:\.\d+){0,3})$/.exec(tag);
  if (!match?.[1]) return null;
  // Only ever link to this repo's release pages, whatever the response says.
  const page = typeof r.html_url === "string" && r.html_url.startsWith(RELEASES_PAGE) ? r.html_url : `${RELEASES_PAGE}latest`;
  return { version: match[1], url: page };
}

/** Whether the saved check is old enough to ask GitHub again. */
export function checkIsStale(saved: UpdateCheck | undefined, now: number): boolean {
  if (!saved) return true;
  return now - saved.checkedAt >= (saved.failed ? RETRY_AFTER_MS : CHECK_EVERY_MS);
}
