# Privacy policy

Last updated: 2026-10-16

Postsight is a browser extension that analyses posts on X (x.com) with an AI model you choose. This page explains what it handles and where that goes. Postsight has no server of its own, no account system, no analytics and no advertising.

## What Postsight stores

Everything stays in your browser's extension storage (`chrome.storage.local`) on your device and is never synced:

- the API keys you enter for Claude (Anthropic), OpenAI or DeepSeek, and an Etherscan key if you add one for wallet cards;
- your settings (languages, models, budgets, which actions show);
- a usage log (time, action, model, token counts, cost) used to show spend against your budgets;
- saved results, so the same request is not paid for twice, listed under History;
- if you use wallet cards, the public facts they looked up (names, balances, profiles, scores, security flags, market data), kept for up to a day so the same address is not looked up again.

Storage is limited to the extension's own pages and service worker, so the script that runs on x.com cannot read your keys. You can clear the usage log and history in Settings; uninstalling the extension removes everything.

## What is sent, and to whom

Only when you run an action on a post (Verify, Research, Summarize, Translate, Explain, Reply ideas, Ask), Postsight sends that post to the AI provider you picked or that Auto picked:

- api.anthropic.com (Claude), api.openai.com (OpenAI) or api.deepseek.com (DeepSeek), with your own API key.
- The request contains the post text, author name and handle, time, quoted post, link preview text, poll, community note, links to its images (only for models that can see images), the rest of the author's thread on a post page, the text of an X Article, and the text of linked pages if you allowed that.

Each provider handles that data under its own terms and privacy policy. Postsight does not send anything to anyone else.

## Pages Postsight fetches

- **X Articles.** To read a long-form X Article, Postsight loads that post's public page on x.com without your cookies (as a logged-out visitor).
- **t.co links.** Postsight resolves X's short links to see where they point, without your cookies.
- **Linked pages.** Only if you turn on "Read the pages posts link to" and grant the all-sites permission, Postsight loads the pages a post links to, without your cookies, when you run an action on that post. You can turn this off at any time in Settings or remove the permission in your browser.

## Wallet cards (optional)

Wallet cards are off until you turn them on in Settings, which also asks your browser for access to the services they read. With them on, hovering a wallet address (0x...) or an ENS or Basename (.eth) in a post sends that address or name, and nothing else, without your cookies, to these public services that need no key:

- Ethereum and Base nodes (ethereum-rpc.publicnode.com, eth.drpc.org, mainnet.base.org, base-rpc.publicnode.com): names, text records, balances and transaction counts;
- api.web3.bio: profiles linked to the address;
- api.ethos.network: Ethos reviews and score;
- base.easscan.org: Coinbase verification attestations on Base;
- api.gopluslabs.io: security flags for the address and, for a token, its contract checks;
- api.dexscreener.com: trading pairs for a token, the links its team listed and what the team paid DexScreener for;
- api.geckoterminal.com: a token's score, holder spread, listed links and developer address;
- api.honeypot.is: a simulated buy and sell of a token, to measure its taxes and whether it can be sold;
- eth.blockscout.com: who deployed a contract on Ethereum;
- www.clanker.world: whether a Base token was launched on Clanker, and by which wallet.

If you add your own Etherscan API key, cards also ask api.etherscan.io, with that key, who created a contract, the contract's verified name and when a wallet first transacted. The key goes only to api.etherscan.io.

Nothing is sent until you hover an address or name, or open one from the post's menu. Names, text records, profile links and the accounts a token lists are what their owner or the token's team published; Postsight shows them as claims, not proof of identity. "Research with AI" on a card sends those facts with the post to your AI provider, like any other action. You can turn wallet cards off at any time or remove the access in your browser.

## What Postsight does not do

- It does not read your timeline, messages, bookmarks or account settings.
- It does not connect to, read or sign with your crypto wallet; wallet cards only look up public data about addresses written in posts.
- It does not post, like, reply or follow on your behalf; reply ideas are drafts you copy.
- It does not sell, share or transfer data, and it does not use data for credit, lending or advertising purposes.

## Contact

Questions or concerns: open an issue at https://github.com/yusufky63/postsight/issues.
