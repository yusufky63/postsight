// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { extractTweet, readThread } from "./tweet";
import { actionBar, moreButton, posts, statusLink, timeFromId } from "./xdom";

/*
 * Markup shaped like X's October 2026 web app: no data-testid, Tailwind classes, the
 * quoted post a nested article inside an embedded-tweet-frame, a timestamp script next to
 * the time link. Accounts and text are made up.
 */
const actions = `
  <div class="-mx-2 flex h-5">
    <div class="min-w-0 flex-1" data-engagement-action="reply"><a aria-label="Reply" href="/compose/post?in_reply_to=1">3</a></div>
    <div class="min-w-0 flex-1" data-engagement-action="retweet"><button data-slot="xds-menu-trigger" aria-haspopup="menu" aria-label="Repost">1</button></div>
    <div class="min-w-0 flex-1" data-engagement-action="like"><button aria-label="Like">9</button></div>
    <button data-engagement-action="share" data-slot="xds-menu-trigger" aria-haspopup="menu" aria-label="Share"></button>
  </div>`;

const quote = `
  <div role="link" data-slot="embedded-tweet-frame" data-href="/garden/status/1850000000000000002">
    <a aria-hidden="true" href="/garden/status/1850000000000000002" tabindex="-1"></a>
    <article>
      <div class="x-middot-group">
        <a href="/garden"><div class="text-body font-bold">Garden Club</div></a>
        <a href="/garden"><span>@garden</span></a>
        <a href="/garden/status/1850000000000000002">Oct 8</a><script>window.__xClientTextFormatters?.run("a")</script>
      </div>
      <div class="max-w-full text-body line-clamp-5 whitespace-pre-wrap" dir="auto"><span>Tomatoes are ripe this week.</span></div>
    </article>
    <img src="https://pbs.twimg.com/media/QUOTEPHOTO?format=jpg&amp;name=small">
  </div>`;

const timelinePost = `
  <article class="flex flex-col gap-1">
    <div class="flex gap-2">
      <a href="/kitchen"><img alt="@kitchen" src="https://pbs.twimg.com/profile_images/1/a_norm"></a>
      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <div class="flex items-start justify-between gap-2">
          <div class="x-middot-group">
            <a href="/kitchen"><div class="text-body font-bold">Kitchen Notes</div></a>
            <a href="/kitchen"><span>@kitchen</span></a>
            <a href="/kitchen/status/1850000000000000001">20s</a><script>window.__xClientTextFormatters?.run("b")</script>
          </div>
          <div class="flex shrink-0 items-center gap-1"><button data-slot="xds-menu-trigger" aria-haspopup="menu" aria-label="More"><svg></svg></button></div>
        </div>
        <div class="max-w-full text-body whitespace-pre-wrap" dir="auto"><span>Bread from </span><a href="https://t.co/abc">example.com/bread</a></div>
        <img alt="" src="https://pbs.twimg.com/media/MAINPHOTO?format=jpg&amp;name=small">
        <div class="flex flex-col gap-1">
          <a href="https://t.co/card" target="_blank"><img src="https://pbs.twimg.com/card_img/1/abc"><div>Bread basics</div></a>
          <a href="https://t.co/card" target="_blank"><div>From example.com</div></a>
        </div>
        ${quote}
        ${actions}
      </div>
    </div>
  </article>`;

describe("the October 2026 layout", () => {
  it("finds the post but not the quote inside it, and skips X's hidden copies", () => {
    document.body.innerHTML = `${timelinePost}<div hidden>${timelinePost}</div>`;
    expect(posts()).toHaveLength(1);
    expect(document.querySelectorAll("article")).toHaveLength(4);
  });

  it("reads the author, text, photos, card and quote of a timeline post", () => {
    document.body.innerHTML = timelinePost;
    const tweet = extractTweet(posts()[0]!)!;
    expect(tweet).toMatchObject({
      id: "1850000000000000001",
      handle: "kitchen",
      authorName: "Kitchen Notes",
      text: "Bread from example.com/bread",
      lang: null,
      images: ["https://pbs.twimg.com/media/MAINPHOTO?format=jpg&name=medium"],
      quote: { authorName: "Garden Club", handle: "garden", text: "Tomatoes are ripe this week." },
    });
    expect(tweet.card).toContain("Bread basics");
    expect(tweet.links).toContain("https://t.co/card");
    expect(tweet.createdAt).toBe(timeFromId("1850000000000000001"));
  });

  it("takes the post's own status link when a quote comes before the timestamp, as on a post page", () => {
    document.body.innerHTML = `
      <article class="flex flex-col gap-1">
        <a href="/kitchen"><div class="text-body font-bold">Kitchen Notes</div></a>
        <a href="/kitchen"><span>@kitchen</span></a>
        <div class="flex shrink-0 items-center gap-1"><button data-slot="xds-menu-trigger" aria-haspopup="menu" aria-label="More"></button></div>
        <div class="max-w-full text-lead whitespace-pre-wrap" dir="auto">Look at this</div>
        ${quote}
        <a href="/kitchen/status/1850000000000000009">3:37 · Oct 27, 2026</a><script>window.__xClientTextFormatters?.run("c")</script>
        ${actions}
      </article>`;
    const post = posts()[0]!;
    expect(statusLink(post)).toEqual({ handle: "kitchen", id: "1850000000000000009" });
    expect(extractTweet(post)).toMatchObject({ authorName: "Kitchen Notes", handle: "kitchen", text: "Look at this" });
  });

  it("finds the more button and the action bar, not the repost and share menus", () => {
    document.body.innerHTML = timelinePost;
    const post = posts()[0]!;
    expect(moreButton(post)?.getAttribute("aria-label")).toBe("More");
    expect(actionBar(post)?.querySelectorAll("[data-engagement-action]")).toHaveLength(4);
  });

  it("follows the author's thread on a post page", () => {
    history.replaceState(null, "", "/kitchen/status/1850000000000000001");
    const reply = timelinePost.replaceAll("1850000000000000001", "1850000000000000003").replace("Bread from", "And butter from");
    document.body.innerHTML = `${timelinePost}${reply}<div hidden>${reply}</div>`;
    const [first] = posts();
    expect(readThread(first!, "kitchen").map((t) => t.text)).toEqual(["And butter from example.com/bread"]);
    history.replaceState(null, "", "/");
  });
});

describe("timeFromId", () => {
  it("reads the creation time out of an X id", () => {
    expect(timeFromId("1850000000000000001")).toBe("2024-10-26T02:22:25.994Z");
    expect(timeFromId("abc")).toBeNull();
  });
});
