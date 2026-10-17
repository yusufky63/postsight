import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELEASES_API } from "../shared/update";

const store = new Map<string, unknown>();
let installType = "development";
let reloaded = 0;

/** A fresh worker module each time: it caches the install type for its lifetime. */
async function worker() {
  vi.resetModules();
  return import("./update");
}

function release(tag: string) {
  return new Response(JSON.stringify({ tag_name: tag, html_url: `https://github.com/yusufky63/postsight/releases/tag/${tag}` }), { status: 200 });
}

beforeEach(() => {
  store.clear();
  installType = "development";
  reloaded = 0;
  vi.stubGlobal("chrome", {
    runtime: { getManifest: () => ({ version: "1.1.0" }), reload: () => reloaded++ },
    management: { getSelf: async () => ({ installType }) },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store.get(key) }),
        set: async (items: Record<string, unknown>) => Object.entries(items).forEach(([k, v]) => store.set(k, v)),
        remove: async (keys: string[]) => keys.forEach((k) => store.delete(k)),
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("updateStatus", () => {
  it("asks GitHub once a day for a copy loaded from the zip", async () => {
    const fetchMock = vi.fn(async () => release("v1.2.0"));
    vi.stubGlobal("fetch", fetchMock);
    const { updateStatus } = await worker();
    const first = await updateStatus();
    expect(first).toMatchObject({ current: "1.1.0", source: "github", latest: "1.2.0", url: "https://github.com/yusufky63/postsight/releases/tag/v1.2.0" });
    await updateStatus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([RELEASES_API, expect.objectContaining({ credentials: "omit" })]);
    await updateStatus(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says nothing when the installed version is the latest", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => release("v1.1.0")));
    const { updateStatus } = await worker();
    const status = await updateStatus();
    expect(status.latest).toBeUndefined();
    expect(status.failed).toBeUndefined();
  });

  it("keeps the last answer when GitHub cannot be reached", async () => {
    store.set("updateCheck", { checkedAt: 0, latest: "1.2.0", url: "https://github.com/yusufky63/postsight/releases/tag/v1.2.0" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 403 })));
    const { updateStatus } = await worker();
    expect(await updateStatus()).toMatchObject({ latest: "1.2.0", failed: true });
  });

  it("does not ask GitHub when the check is off", async () => {
    store.set("settings", { checkUpdates: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { updateStatus } = await worker();
    expect(await updateStatus()).toMatchObject({ source: "github", off: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never asks GitHub for a store copy and offers the downloaded update", async () => {
    installType = "normal";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { updateStatus, applyUpdate } = await worker();
    expect(await updateStatus()).toEqual({ current: "1.1.0", source: "store" });
    store.set("updateReady", "1.2.0");
    expect(await updateStatus()).toEqual({ current: "1.1.0", source: "store", latest: "1.2.0" });
    expect(fetchMock).not.toHaveBeenCalled();
    await applyUpdate();
    expect(reloaded).toBe(1);
  });

  it("only restarts a store copy", async () => {
    const { applyUpdate } = await worker();
    expect(await applyUpdate()).toEqual({ ok: false });
    expect(reloaded).toBe(0);
  });
});
