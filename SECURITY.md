# Security

Sift handles API keys and renders text written by AI models and by strangers on X, so security reports are welcome.

## Reporting

Please report vulnerabilities privately through GitHub's "Report a vulnerability" button on this repository (Security tab), not in a public issue. Include steps to reproduce and the version from `chrome://extensions`. You will get a reply within a week.

## What is in scope

- API keys leaving the extension other than to the provider they belong to.
- Script injection through post content, model output or fetched pages (all of it is rendered as text; links are limited to http and https).
- Prompt injection that makes Sift take an action beyond showing an answer.
- The service worker fetching anything the user did not trigger.

## Design notes

- Keys live in `chrome.storage.local`, restricted to trusted extension contexts; the x.com content script cannot read them.
- Model output is parsed into a small Markdown tree and rendered with text nodes only.
- Linked pages are fetched without cookies and only with the optional all-sites permission.
