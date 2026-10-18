# Store submission kit

Everything needed to list Postsight on the Chrome Web Store and Microsoft Edge Add-ons.

## Package

```bash
pnpm check && pnpm package     # release/postsight-<version>.zip
```

Upload that zip. Bump `version` in `package.json` for every new upload; the build copies it into the manifest.

## Listing text

`listing/<code>.md` holds the name, short description and description for each language. The name and short description inside the package come from `public/_locales/<code>/messages.json`, so the store picks them up per language automatically.

Describe what Postsight does, not which services it reads. The Chrome Web Store rejected the first 1.1.0 description as keyword spam (violation "Yellow Argon") because its wallet paragraph named every data source, so keep provider and service names out of the description (the AI providers a user brings a key for are the exception) and do not list the interface languages by name. The sources are named in `PRIVACY.md` and the permission justifications instead.

## Images

| File | Size | Use |
|---|---|---|
| `public/icons/icon-128.png` | 128 x 128 | Store icon |
| `screenshots/*.png` | 1280 x 800 | Screenshots (up to 5 on Chrome, 10 on Edge). Only the settings pages are here; take the ones of posts on x.com itself with the extension installed, so the store shows X as it really looks. |
| `promo/small-tile.png` | 440 x 280 | Chrome small promo tile |

## Single purpose

Postsight helps people understand posts on X: it fact-checks, researches, summarizes, translates and explains a post with an AI model the user chooses, using the user's own API key.

## Permission justifications

| Permission | Why |
|---|---|
| `storage` | Saves the user's API keys, settings, usage log and saved results on their device. |
| Host `api.anthropic.com`, `api.openai.com`, `api.deepseek.com` | Sends the post the user chose to analyse to the AI provider they picked, with their key. |
| Host `x.com` | Runs the content script that adds the AI button to posts, and reads the public page of an X Article the user asked about. |
| Host `t.co` | Resolves X's short links in a post the user asked about, to see which page they point to. |
| Optional `<all_urls>` | Only if the user turns on "Read the pages posts link to": loads the page a post links to when the user runs an action on that post. Requested at runtime, can be revoked. |
| Optional `ethereum-rpc.publicnode.com`, `eth.drpc.org`, `mainnet.base.org`, `base-rpc.publicnode.com`, `api.web3.bio`, `api.ethos.network`, `base.easscan.org`, `api.gopluslabs.io`, `api.dexscreener.com`, `api.geckoterminal.com`, `api.honeypot.is`, `eth.blockscout.com`, `www.clanker.world` | Only if the user turns on "Wallet cards": when the user hovers a wallet address or .eth name in a post, sends that address or name to these public services to show its names, profiles, reputation, security flags, and for a token its market data, a simulated trade and who created it. Requested at runtime, can be revoked. |
| Optional `api.etherscan.io` | Only if the user adds their own Etherscan API key for wallet cards: looks up who created a contract, its verified name and when a wallet first transacted, with that key. Requested when the key is saved, can be revoked. |
| Optional `api.blockscout.com` | Only if the user adds their own Blockscout PRO API key for wallet cards: looks up who created a contract, its verified name and what a proxy runs, with that key. Requested when the key is saved, can be revoked. |

No remote code: all scripts ship in the package.

## Data usage answers (Chrome "Privacy practices")

- Collects: website content (the post the user runs an action on) and authentication information (the user's own API keys, stored locally).
- Not sold, not used for unrelated purposes, not used for creditworthiness or lending.
- Sent only to the AI provider the user selected, to provide the feature the user asked for.
- Store copies never run the GitHub update check; it exists only for copies loaded from the release zip, which cannot update themselves.
- Privacy policy URL: https://github.com/yusufky63/postsight/blob/main/PRIVACY.md until the website is deployed; after that, https://postsight.xyz/privacy (built from `PRIVACY.md`, see [site/README.md](../site/README.md)).

## Live listings

- Chrome Web Store: https://chromewebstore.google.com/detail/postsight-ai-fact-check-a/fhgkaalhcafnhfebmckfnbgdheekbnin (item id `fhgkaalhcafnhfebmckfnbgdheekbnin`)

## Website URLs

Once https://postsight.xyz is deployed from `site/` on Vercel:

| Store field | URL |
|---|---|
| Privacy policy | https://postsight.xyz/privacy |
| Homepage / official URL | https://postsight.xyz |
| Support URL | https://postsight.xyz/support |

## Publishing and updates

Both stores update installed copies on their own once a new version passes review, so readers who install from a store always run the latest release. The popup then offers a restart (`chrome.runtime.onUpdateAvailable`) instead of waiting for the browser to restart.

For each release:

1. Bump `version` in `package.json`, add the CHANGELOG section, merge, and tag `v<version>`; the Release workflow builds `postsight-<version>.zip`.
2. Chrome Web Store developer dashboard: open the item, Package, Upload new package, pick the zip, then Submit for review.
3. Edge Add-ons in Partner Center: open the extension, Update, Packages, upload the same zip, then Publish.

The first submission also needs the listing text, images, single purpose, permission justifications and privacy answers from this page. The version in each upload must be higher than the one live in that store.

## Developer accounts

- Chrome Web Store: one-time USD 5 registration at https://chrome.google.com/webstore/devconsole
- Edge Add-ons: free, at https://partner.microsoft.com/dashboard/microsoftedge/overview
