# Postsight

An AI button on every post on X: fact-check, research, summarize, translate and explain it with your own Claude, OpenAI or DeepSeek API key, and see exactly what each answer cost.

## What it does

- **Verify**: a verdict (accurate, mostly accurate, mixed, misleading, false, unverifiable, opinion, satire), a confidence score, claim-by-claim notes and the sources behind them, from live web search on Claude and OpenAI.
- **Research, Summarize, Explain**: background and dated facts, a TL;DR, or the jargon and references made clear. Threads, quoted posts, polls and community notes are included.
- **Reads what posts point to**: X Articles (long-form posts) are read from X's public post page; with your permission, so are the news and blog pages a post links to. A link-only post is not judged by its headline.
- **Translate**: into your language (or your second language when the post is already in yours), with links and mentions intact.
- **Reply ideas and Ask**: three drafts to copy, or any question about the post. Postsight never posts for you.
- **Copy**: the text, the link, or a ready-made quote.
- **Auto routing**: light jobs go to cheap fast models, fact-checks to stronger models with web search; or pick a model per post.
- **Cost control**: tokens, searches, cost and time on every result; monthly budgets per provider with what is left and roughly how many tokens that buys.
- **12 languages** for the interface and the answers: English, Türkçe, Deutsch, Español, Français, Português, Italiano, Русский, 日本語, 한국어, 简体中文, Bahasa Indonesia.

## Install

**From a release.** Download `postsight-<version>.zip` from [Releases](https://github.com/yusufky63/postsight/releases), unzip it, open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose **Load unpacked** and pick the unzipped folder.

**From source.** Node 22+ and pnpm:

```bash
pnpm install
pnpm build
```

Then load the `dist` folder the same way. The settings page opens on first install: paste at least one API key and press **Save key**; Postsight tests it and loads the provider's model list. On x.com every post now has a small **AI** label next to Grok and the "more" menu.

## How Auto picks a model

Each action has a base weight; long posts, threads, images, quoted posts and articles add to it, and the strategy (economy, balanced, quality) shifts it. The score picks a tier, and the tier picks a model from the first provider in your order that has a key, is under budget and supports what the task needs.

| Tier | Claude | OpenAI | DeepSeek |
|---|---|---|---|
| Light | Claude Haiku 5.5 | GPT-6 Luna | DeepSeek Flash |
| Detailed | Claude Sonnet 5.5 | GPT-6.1 Sol | DeepSeek V4 Pro |
| Hardest | Claude Opus 5.5 | GPT-6 Astra | DeepSeek V4 Pro |

Every tier, the provider order and the prices are editable in settings, which also shows what Auto would pick right now. Claude Opus 5.5 and Sonnet 5.5 requests opt into Anthropic's server-side refusal fallback, so a request a safety classifier declines is retried on the recommended model instead of failing.

## Costs

Token counts come from each provider's response; cost uses the price table in settings (USD per 1M tokens, checked 2026-10-16) plus web searches at the provider's rate. DeepSeek's peak-hour pricing is applied automatically. DeepSeek also shows its live account balance; Anthropic and OpenAI have no balance endpoint for normal keys, so your monthly budget is the count-down there. Saved results are reused instead of paying for the same request twice.

## Privacy

Keys stay in your browser's extension storage and go only to the provider they belong to. There is no Postsight server, no analytics and no tracking. The x.com script cannot read your keys, and pages are fetched without your cookies. Details: [PRIVACY.md](PRIVACY.md).

## Development

| Command | What it does |
|---|---|
| `pnpm dev` | Rebuilds `dist/` on change; reload the extension to see it |
| `pnpm check` | Typecheck, lint with zero warnings, tests, build (extension and website) |
| `pnpm package` | Builds the store zip in `release/` |
| `pnpm harness` | Serves `harness/` at http://localhost:4317 to view the UI with a mocked `chrome` API |
| `pnpm smoke` | Calls the real APIs with keys from `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` (a fraction of a cent; `--web` adds one search) |
| `pnpm icons` | Redraws the toolbar icons |
| `pnpm site:dev` | Serves the website (`site/`) at http://localhost:4320 and rebuilds on change |
| `pnpm site:build` | Builds the static website into `site/dist` for Cloudflare Pages |

Stack: TypeScript, esbuild, Manifest V3, the Anthropic TypeScript SDK, plain `fetch` for OpenAI's Responses API and DeepSeek, Vitest and happy-dom. No UI framework; the content script renders into shadow roots.

Code layout and translation notes are in [CONTRIBUTING.md](CONTRIBUTING.md); store submission notes in [store/README.md](store/README.md); the website for postsight.app in [site/README.md](site/README.md); security reporting in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
