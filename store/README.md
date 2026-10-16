# Store submission kit

Everything needed to list Postsight on the Chrome Web Store and Microsoft Edge Add-ons.

## Package

```bash
pnpm check && pnpm package     # release/postsight-<version>.zip
```

Upload that zip. Bump `version` in `package.json` for every new upload; the build copies it into the manifest.

## Listing text

`listing/<code>.md` holds the name, short description and description for each language. The name and short description inside the package come from `public/_locales/<code>/messages.json`, so the store picks them up per language automatically.

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

No remote code: all scripts ship in the package.

## Data usage answers (Chrome "Privacy practices")

- Collects: website content (the post the user runs an action on) and authentication information (the user's own API keys, stored locally).
- Not sold, not used for unrelated purposes, not used for creditworthiness or lending.
- Sent only to the AI provider the user selected, to provide the feature the user asked for.
- Privacy policy URL: https://github.com/yusufky63/postsight/blob/main/PRIVACY.md until the website is deployed; after that, https://postsight.app/privacy (built from `PRIVACY.md`, see [site/README.md](../site/README.md)).

## Website URLs

Once https://postsight.app is deployed from `site/` on Cloudflare Pages:

| Store field | URL |
|---|---|
| Privacy policy | https://postsight.app/privacy |
| Homepage / official URL | https://postsight.app |
| Support URL | https://postsight.app/support |

## Developer accounts

- Chrome Web Store: one-time USD 5 registration at https://chrome.google.com/webstore/devconsole
- Edge Add-ons: free, at https://partner.microsoft.com/dashboard/microsoftedge/overview
