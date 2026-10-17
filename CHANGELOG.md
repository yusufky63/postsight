# Changelog

## Unreleased

- A notice in the popup and at the top of Settings when a newer Postsight is out. Copies from the Chrome Web Store or Edge Add-ons get an "Update now" button once the store has downloaded it. Copies loaded from the release zip ask GitHub once a day for the latest release and link to it; the check can be turned off under Help, Updates.

## 1.1.0 (2026-10-17)

### Wallet cards (optional, off by default)

- Every 0x address and .eth name in a post gets a tinted, dashed underline. Hover it, or pick it from the post's menu, for a card: its ENS name or Basename (checked both ways) and text records, its balance and transactions on Ethereum and Base, linked profiles from web3.bio, Ethos reviews, Coinbase verification on Base and GoPlus security flags.
- For a token, the card adds:
  - DexScreener price, liquidity, market cap, volume and paid listings.
  - GeckoTerminal's score and the top 10 holders' share.
  - A Honeypot.is test buy and sell with the real fees.
  - GoPlus contract checks.
  - A Clanker launch.
  - Who created the token, with that creator's own card one click away.
- The card says when the wallet's names, the token's listed X account or the creator wallet's name point to the post's author, or to someone else, and warns when an address's letter case breaks its checksum.
- "Research with AI" on a card asks your model about that wallet with the facts the card found.
- Public sources only, no keys needed. The hosts are requested when you turn the cards on, and nothing is sent until you hover an address.

### Explorer keys (optional)

- Your own Etherscan API key (a free one works) adds, on every chain Etherscan indexes, who created a contract and through which factory, the contract's verified name, and when a wallet first transacted.
- A Blockscout PRO API key gives contract creators, Base included, and verified names on 100+ chains, and shows what a proxy contract runs.
- Keys stay on this device and go only to that explorer. Each has a Test button, and the settings page says when the extension needs a reload to test it.

### Other changes

- Turkish wallet cards use the terms Turkish crypto users use (holder, volume, fee, market cap) and write compact numbers as 595,1K or $1,7B.
- The toolbar popup opens at its usual size instead of growing after it appears.

## 1.0.1 (2026-10-16)

- Renamed from Sift to Postsight.
- Store name, descriptions and the extension name updated in all 12 languages.

## 1.0.0 (2026-10-16)

First public release, under the name Sift.

- AI button on every post on X with Verify, Research, Summarize, Translate, Explain, Reply ideas, Ask and Copy.
- Claude, OpenAI and DeepSeek with your own API keys; Auto mode picks a light, detailed or hardest model per task, or pick one per post.
- Live web search with cited sources for fact-checks on Claude and OpenAI.
- Reads X Articles, polls, community notes and threads; with your permission, also the pages a post links to.
- Token, search and cost counts on every result; monthly budgets per provider with what is left and roughly how many tokens that buys; DeepSeek balance.
- Long links shown short in cards and in what is sent to the model.
- Interface and answers in 12 languages: English, Türkçe, Deutsch, Español, Français, Português, Italiano, Русский, 日本語, 한국어, 简体中文, Bahasa Indonesia.
