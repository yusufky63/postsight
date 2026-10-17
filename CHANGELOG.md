# Changelog

## 1.1.0 (2026-10-16)

- Wallet cards (optional, off by default): hover a 0x address or a .eth name in a post to see its ENS name or Basename (checked both ways) and text records, balances and transaction counts on Ethereum and Base, profiles from web3.bio, Ethos reviews, Coinbase verification on Base, GoPlus security flags, and for a token its DexScreener market data and GoPlus contract checks.
- A wallet card says when the wallet's records name the post's author or another X account, and warns when an address's checksum does not match.
- Token cards: the X accounts and links the token's team listed (DexScreener, GeckoTerminal, Clanker), compared with the post's author; GeckoTerminal's score and the top 10 holders' share; a Honeypot.is test buy and sell with the measured taxes; paid DexScreener profiles and ads; a Clanker launch; and who created the token (Clanker, Blockscout on Ethereum, GoPlus or GeckoTerminal), with its own card one click away.
- An optional Blockscout PRO API key, as an alternative or a complement to Etherscan: contract creators (Base included) and verified names on 100+ chains, and what a proxy contract runs.
- Testing an explorer key no longer fails silently when the settings page is newer than the running extension; it says to reload the extension.
- An optional Etherscan API key in settings (your own; a free one works) adds, on every chain Etherscan indexes, who created a contract and through which factory, the contract's verified name, and when a wallet first transacted.
- Addresses in posts carry a tint and a thicker line, drawn stronger under the pointer, and the card no longer covers the address it belongs to.
- "Research with AI" on a wallet card asks your model about that wallet with the facts the card found.
- The post menu lists the wallets in a post, so their cards can be opened with the keyboard.
- Wallet cards use public sources only, without keys; they ask for access to those hosts when turned on, and send nothing until you hover an address.

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
