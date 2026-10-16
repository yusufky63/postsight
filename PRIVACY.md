# Privacy policy

Last updated: 2026-10-16

Sift is a browser extension that analyses posts on X (x.com) with an AI model you choose. This page explains what it handles and where that goes. Sift has no server of its own, no account system, no analytics and no advertising.

## What Sift stores

Everything stays in your browser's extension storage (`chrome.storage.local`) on your device and is never synced:

- the API keys you enter for Claude (Anthropic), OpenAI or DeepSeek;
- your settings (languages, models, budgets, which actions show);
- a usage log (time, action, model, token counts, cost) used to show spend against your budgets;
- saved results, so the same request is not paid for twice, listed under History.

Storage is limited to the extension's own pages and service worker, so the script that runs on x.com cannot read your keys. You can clear the usage log and history in Settings; uninstalling the extension removes everything.

## What is sent, and to whom

Only when you run an action on a post (Verify, Research, Summarize, Translate, Explain, Reply ideas, Ask), Sift sends that post to the AI provider you picked or that Auto picked:

- api.anthropic.com (Claude), api.openai.com (OpenAI) or api.deepseek.com (DeepSeek), with your own API key.
- The request contains the post text, author name and handle, time, quoted post, link preview text, poll, community note, links to its images (only for models that can see images), the rest of the author's thread on a post page, the text of an X Article, and the text of linked pages if you allowed that.

Each provider handles that data under its own terms and privacy policy. Sift does not send anything to anyone else.

## Pages Sift fetches

- **X Articles.** To read a long-form X Article, Sift loads that post's public page on x.com without your cookies (as a logged-out visitor).
- **t.co links.** Sift resolves X's short links to see where they point, without your cookies.
- **Linked pages.** Only if you turn on "Read the pages posts link to" and grant the all-sites permission, Sift loads the pages a post links to, without your cookies, when you run an action on that post. You can turn this off at any time in Settings or remove the permission in your browser.

## What Sift does not do

- It does not read your timeline, messages, bookmarks or account settings.
- It does not post, like, reply or follow on your behalf; reply ideas are drafts you copy.
- It does not sell, share or transfer data, and it does not use data for credit, lending or advertising purposes.

## Contact

Questions or concerns: open an issue at https://github.com/yusufky63/sift/issues.
