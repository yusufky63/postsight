# Contributing

Thanks for helping. Bug reports, translations and small focused pull requests are the most useful.

## Setup

```bash
pnpm install
pnpm dev        # rebuilds dist/ on change
```

Load `dist/` as an unpacked extension (`chrome://extensions` or `edge://extensions`, Developer mode, Load unpacked) and reload it after each change.

## Before you open a pull request

```bash
pnpm check      # typecheck, lint with zero warnings, tests, build
```

- Keep changes small and explain the why in the description.
- UI text lives in `src/shared/locales/`. `en.ts` is the source; add new keys there first, then to every other locale (the tests fail if a key or a `{placeholder}` is missing).
- Comments explain why, not what. Tests sit next to the code they test.
- Never commit API keys. `pnpm smoke` reads keys from environment variables only.

## Translations

To improve a language, edit `src/shared/locales/<code>.ts`, `public/_locales/<code>/messages.json` (store name and summary) and `store/listing/<code>.md` (store description). To add a language, add it to `src/shared/languages.ts` and create those three files. The website is in English and Turkish; its copy is in `site/src/content.ts`.

## Layout of the code

| Folder | What is in it |
|---|---|
| `src/background` | Service worker: routing, budgets, caching, page fetching, provider clients |
| `src/content` | The script on x.com: reads posts, the AI button, menu and result card |
| `src/popup`, `src/options` | Toolbar popup and settings page |
| `src/shared` | Models and prices, router, prompts, pricing, usage, languages, markdown, readable-text extraction |
| `src/ui` | DOM helpers, controls and design tokens shared by the pages |
| `harness` | Local pages that run the built bundles with a mocked `chrome` API |
| `site` | The postsight.app website: landing, privacy and support pages, built from `PRIVACY.md` and the locales (see `site/README.md`) |
