/**
 * Token bucket per host. The keyless tiers of these services allow well under one
 * request a second for some of them, and a reader can hover several addresses in a
 * row; waiting callers are dropped when their lookup is cancelled.
 */
export class Limiter {
  private tokens: number;
  private last = Date.now();
  private readonly queue: { resolve: () => void; reject: (e: Error) => void; signal?: AbortSignal; onAbort?: () => void }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly rps: number,
    private readonly burst = Math.max(1, Math.ceil(rps)),
  ) {
    this.tokens = burst;
  }

  acquire(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const entry: (typeof this.queue)[number] = { resolve, reject, signal };
      if (signal) {
        entry.onAbort = () => {
          const i = this.queue.indexOf(entry);
          if (i >= 0) this.queue.splice(i, 1);
          reject(abortError());
        };
        signal.addEventListener("abort", entry.onAbort, { once: true });
      }
      this.queue.push(entry);
      this.pump();
    });
  }

  /** After a 429: empty the bucket so the next caller waits. */
  penalise(ms = 2000): void {
    this.tokens = -(ms / 1000) * this.rps;
  }

  private pump(): void {
    if (this.timer) return;
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rps);
    this.last = now;
    while (this.queue.length && this.tokens >= 1) {
      this.tokens -= 1;
      const entry = this.queue.shift()!;
      if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort);
      entry.resolve();
    }
    if (this.queue.length) {
      this.timer = setTimeout(
        () => {
          this.timer = null;
          this.pump();
        },
        Math.max(5, ((1 - this.tokens) / this.rps) * 1000),
      );
    }
  }
}

function abortError(): Error {
  const err = new Error("aborted");
  err.name = "AbortError";
  return err;
}

/** Requests per second each service's keyless tier allows (the values onchain-intel runs with). */
const RPS: Record<string, number> = {
  "api.web3.bio": 0.4,
  "api.ethos.network": 2,
  "base.easscan.org": 2,
  "api.gopluslabs.io": 0.5,
  "api.dexscreener.com": 4,
  // 30 calls a minute without a key.
  "api.geckoterminal.com": 0.5,
  "api.honeypot.is": 2,
  "eth.blockscout.com": 2,
  "www.clanker.world": 1,
  // The free Etherscan plan allows 5 a second; a little under keeps 429s away.
  "api.etherscan.io": 4,
};

const limiters = new Map<string, Limiter>();

function limiterFor(host: string): Limiter {
  let limiter = limiters.get(host);
  if (!limiter) {
    limiter = new Limiter(RPS[host] ?? 2);
    limiters.set(host, limiter);
  }
  return limiter;
}

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

export interface JsonOptions {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signal: AbortSignal;
  timeoutMs?: number;
}

/** JSON from a keyless API, without cookies. A 404 is an answer ("nothing known"), so it returns null. */
export async function getJson<T>(url: string, opts: JsonOptions): Promise<T | null> {
  const host = new URL(url).host;
  const limiter = limiterFor(host);
  await limiter.acquire(opts.signal);
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    credentials: "omit",
    headers: { accept: "application/json", ...(opts.body !== undefined ? { "content-type": "application/json" } : {}), ...opts.headers },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs ?? 6000)]),
  });
  if (res.status === 404) return null;
  if (res.status === 429) limiter.penalise();
  if (!res.ok) throw new HttpError(res.status);
  return (await res.json()) as T;
}
