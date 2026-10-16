import type { RunStatus } from "../../shared/messages";
import type { ErrorCode, ModelInfo, Source, UsageNumbers } from "../../shared/types";

export interface ProviderRequest {
  apiKey: string;
  model: ModelInfo;
  system: string;
  user: string;
  images: string[];
  useWeb: boolean;
  depth: "light" | "deep";
  maxTokens: number;
  maxSearches: number;
  signal: AbortSignal;
}

export interface ProviderCallbacks {
  onText(delta: string): void;
  onStatus(status: RunStatus): void;
  onSource(source: Source): void;
  /** Drops text streamed so far; used when it turns out to be narration rather than the answer. */
  onReset(): void;
}

export interface ProviderResult {
  text: string;
  sources: Source[];
  usage: UsageNumbers;
  /** The model that actually answered; a server-side fallback can differ from the requested one. */
  model: string;
}

export class ProviderError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
  ) {
    super(detail ?? code);
  }
}

/** Removes anything that looks like an API key before an error reaches the page. */
export function scrub(text: string): string {
  return text.replace(/\b(sk-[A-Za-z0-9]{0,4})[A-Za-z0-9_\-*]{8,}/g, "$1...").slice(0, 240);
}

export function messageFromBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const raw = typeof parsed.error === "string" ? parsed.error : (parsed.error?.message ?? parsed.message ?? "");
    return scrub(raw);
  } catch {
    return scrub(body);
  }
}

export function codeForStatus(status: number, body: string): ErrorCode {
  const text = body.toLowerCase();
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "billing";
  if (status === 429) return /insufficient_quota|quota|balance|billing/.test(text) ? "billing" : "rate_limit";
  if (status === 404) return "model_not_found";
  if (status >= 500) return "server";
  if (/credit balance|insufficient balance|insufficient_quota|billing/.test(text)) return "billing";
  if (/model/.test(text) && /(not exist|not found|does not have access|unknown model|invalid model)/.test(text)) {
    return "model_not_found";
  }
  return "bad_request";
}

export async function failFromResponse(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  throw new ProviderError(codeForStatus(res.status, body), messageFromBody(body));
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Collects sources once each, in the order they were first seen. */
export class SourceList {
  private readonly seen = new Map<string, Source>();

  constructor(private readonly onNew: (source: Source) => void) {}

  add(url: string, title: string | null | undefined): void {
    if (!/^https?:\/\//.test(url)) return;
    const key = url.replace(/#.*$/, "").replace(/\/$/, "");
    if (this.seen.has(key)) return;
    const source = { url, title: (title ?? "").trim() || url };
    this.seen.set(key, source);
    this.onNew(source);
  }

  get list(): Source[] {
    return [...this.seen.values()];
  }
}
