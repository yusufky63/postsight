// Drives one headless Chrome or Edge over the DevTools protocol, for the share cards and
// for local visual checks. One browser at a time; its process tree and temporary profile
// are removed when the work ends, fails or is interrupted.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = {
  win32: [
    [process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"],
    [process.env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe"],
    [process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"],
    [process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe"],
    [process.env.PROGRAMFILES, "Microsoft/Edge/Application/msedge.exe"],
  ],
  darwin: [
    ["/Applications", "Google Chrome.app/Contents/MacOS/Google Chrome"],
    ["/Applications", "Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
    ["/Applications", "Chromium.app/Contents/MacOS/Chromium"],
  ],
  linux: [
    ["/usr/bin", "google-chrome"],
    ["/usr/bin", "google-chrome-stable"],
    ["/usr/bin", "chromium"],
    ["/usr/bin", "chromium-browser"],
    ["/usr/bin", "microsoft-edge"],
  ],
};

export function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const [base, rel] of CANDIDATES[process.platform] ?? []) {
    if (base && existsSync(join(base, rel))) return join(base, rel);
  }
  throw new Error("No Chrome or Edge found. Set CHROME_PATH to the browser executable.");
}

const exited = (proc) => proc.exitCode !== null || proc.signalCode !== null;

function killTree(proc) {
  if (exited(proc)) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
  else proc.kill("SIGKILL");
}

function waitForExit(proc, ms) {
  if (exited(proc)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * Windows can keep profile files locked for a while after the browser is gone, hence the
 * retries. Anything still left is reported; the machine's headless cleanup removes it later.
 */
async function removeProfile(profile) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  console.warn(`could not remove ${profile}; delete it once the browser has exited`);
}

async function devtoolsPort(profile, proc) {
  const file = join(profile, "DevToolsActivePort");
  for (let waited = 0; waited < 20000; waited += 100) {
    if (proc.exitCode !== null) throw new Error("the browser exited while starting");
    if (existsSync(file)) {
      const port = Number(readFileSync(file, "utf8").split("\n")[0]);
      if (port) return port;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("the browser did not open a DevTools port");
}

class Page {
  #ws;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      const waiter = msg.id ? this.#pending.get(msg.id) : undefined;
      if (waiter) {
        this.#pending.delete(msg.id);
        if (msg.error) waiter.reject(new Error(`${waiter.method}: ${msg.error.message}`));
        else waiter.resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.#listeners.get(msg.method) ?? []) fn(msg.params);
      }
    });
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { method, resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const fn = (params) => {
        clearTimeout(timer);
        this.#listeners.set(
          method,
          (this.#listeners.get(method) ?? []).filter((f) => f !== fn),
        );
        resolve(params);
      };
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), timeoutMs);
      this.#listeners.set(method, [...(this.#listeners.get(method) ?? []), fn]);
    });
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }

  /** Loads `url` at `width` x `height` CSS px in the given color scheme. */
  async open({ url, width, height = 800, dark = false }) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await this.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
    const loaded = this.once("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
    await this.evaluate("document.fonts.ready.then(() => true)");
  }

  /** Writes a PNG of the viewport, or of the whole page with `fullPage`. */
  async screenshot(out, { fullPage = false } = {}) {
    const { cssLayoutViewport, cssContentSize } = await this.send("Page.getLayoutMetrics");
    const width = cssLayoutViewport.clientWidth;
    const height = fullPage ? Math.ceil(cssContentSize.height) : cssLayoutViewport.clientHeight;
    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width, height, scale: 1 },
      captureBeyondViewport: fullPage,
    });
    writeFileSync(out, Buffer.from(data, "base64"));
    return out;
  }
}

/** Starts the browser, hands `fn` a page, and always shuts the browser down afterwards. */
export async function withBrowser(fn) {
  const profile = mkdtempSync(join(tmpdir(), "cdpshot-postsight-"));
  const proc = spawn(
    findBrowser(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-gpu",
      "--hide-scrollbars",
      "--mute-audio",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let ws;
  let page;
  const cleanup = async () => {
    // A browser that quits on its own closes the profile cleanly; force the tree only if it hangs.
    if (page) await Promise.race([page.send("Browser.close").catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))]);
    try {
      ws?.close();
    } catch {
      // Already closed.
    }
    if (!(await waitForExit(proc, 5000))) {
      killTree(proc);
      await waitForExit(proc, 5000);
    }
    await removeProfile(profile);
  };
  const onSignal = () => {
    killTree(proc);
    process.exit(130);
  };
  // Last resort if this process dies abruptly; a left-over profile is removed by the next cleanup.
  const onExit = () => killTree(proc);
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  process.once("exit", onExit);
  try {
    const port = await devtoolsPort(profile, proc);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find((t) => t.type === "page");
    if (!target) throw new Error("the browser has no page target");
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("could not connect to the browser")), { once: true });
    });
    page = new Page(ws);
    await page.send("Page.enable");
    return await fn(page);
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("exit", onExit);
    await cleanup();
  }
}
