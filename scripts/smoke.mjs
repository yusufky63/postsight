// Live check of the provider clients against the real APIs, using keys from the
// environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY). Each run costs a
// fraction of a cent per provider, plus about $0.01 per web search when --web is set.
//   node scripts/smoke.mjs [--web]
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "postsight-smoke-"));
const outfile = join(dir, "smoke.mjs");

const entry = `
import { runAnthropic, listAnthropicModels } from "./src/background/providers/anthropic";
import { runOpenAI, listOpenAIModels } from "./src/background/providers/openai";
import { runDeepSeek, listDeepSeekModels, deepSeekBalance } from "./src/background/providers/deepseek";
import { CATALOG } from "./src/shared/models";
import { buildPrompt } from "./src/shared/prompts";
import { costUsd } from "./src/shared/pricing";
export { runAnthropic, listAnthropicModels, runOpenAI, listOpenAIModels, runDeepSeek, listDeepSeekModels, deepSeekBalance, CATALOG, buildPrompt, costUsd };
`;

await esbuild.build({
  stdin: { contents: entry, resolveDir: root, loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "error",
  define: { __POSTSIGHT_VERSION__: '"smoke"' },
});

const m = await import(pathToFileURL(outfile).href);
const web = process.argv.includes("--web");

const tweet = {
  id: "1",
  url: "https://x.com/example/status/1",
  authorName: "Example",
  handle: "example",
  text: "The Eiffel Tower was completed in 1889 for the World's Fair in Paris.",
  lang: "en",
  createdAt: "2026-10-15T10:00:00.000Z",
  images: [],
  hasVideo: false,
  quote: null,
  card: null,
  thread: [],
  links: [],
  poll: null,
  note: null,
  isArticle: false,
  body: null,
};

const providers = [
  { id: "anthropic", key: process.env.ANTHROPIC_API_KEY, run: m.runAnthropic, list: m.listAnthropicModels, model: "claude-haiku-5-5", webModel: "claude-sonnet-5-5" },
  { id: "openai", key: process.env.OPENAI_API_KEY, run: m.runOpenAI, list: m.listOpenAIModels, model: "gpt-6-luna", webModel: "gpt-6-luna" },
  { id: "deepseek", key: process.env.DEEPSEEK_API_KEY, run: m.runDeepSeek, list: m.listDeepSeekModels, model: "deepseek-flash", webModel: null },
];

const callbacks = { onText() {}, onStatus() {}, onSource() {}, onReset() {} };
let failures = 0;

async function attempt(p, action, modelId, useWeb) {
  const model = m.CATALOG.find((x) => x.provider === p.id && x.id === modelId);
  const prompt = m.buildPrompt(action, tweet, { lang: "tr", detail: "brief", useWeb, imagesVisible: false, today: "2026-10-16" });
  const started = Date.now();
  try {
    const out = await p.run(
      {
        apiKey: p.key,
        model,
        system: prompt.system,
        user: prompt.user,
        images: [],
        useWeb,
        depth: prompt.depth,
        maxTokens: prompt.maxTokens,
        maxSearches: 1,
        signal: AbortSignal.timeout(120_000),
      },
      callbacks,
    );
    const cost = m.costUsd(model, out.usage, new Date());
    console.log(`ok   ${p.id} ${action}${useWeb ? "+web" : ""} ${out.model} ${Date.now() - started}ms`);
    console.log(`     usage ${JSON.stringify(out.usage)} cost $${cost?.toFixed(5)} sources ${out.sources.length}`);
    console.log(`     ${out.text.replace(/\s+/g, " ").slice(0, 220)}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${p.id} ${action}: ${err.code ?? ""} ${err.detail ?? err.message}`);
  }
}

for (const p of providers) {
  if (!p.key) {
    console.log(`skip ${p.id}: no key in environment`);
    continue;
  }
  try {
    const ids = await p.list(p.key);
    console.log(`ok   ${p.id} models: ${ids.length} (${ids.filter((id) => id === p.model).length ? "has" : "missing"} ${p.model})`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${p.id} models: ${err.code ?? ""} ${err.detail ?? err.message}`);
  }
  await attempt(p, "translate", p.model, false);
  await attempt(p, "verify", p.webModel ?? p.model, Boolean(web && p.webModel));
  if (p.id === "deepseek") {
    try {
      const b = await m.deepSeekBalance(p.key);
      console.log(`ok   deepseek balance entries: ${b.length}`);
    } catch (err) {
      failures += 1;
      console.log(`FAIL deepseek balance: ${err.code ?? ""}`);
    }
  }
}

rmSync(dir, { recursive: true, force: true });
process.exitCode = failures ? 1 : 0;
