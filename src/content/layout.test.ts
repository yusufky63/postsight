// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { iconRow, TRIGGER } from "./layout";

const col = "display:flex;flex-direction:column";
const row = "display:flex;flex-direction:row";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.querySelector("article")!;
}

describe("iconRow", () => {
  it("skips X's single-child column wrappers and stops at the row with Grok", () => {
    const article = mount(`
      <article>
        <div id="header" style="${row}">
          <div id="name">name</div>
          <div id="icons" style="${row}">
            <div id="grok" style="${col}"><button><svg></svg></button></div>
            <div id="outer" style="${col}"><div style="${col}"><button data-testid="caret"><svg></svg></button></div></div>
          </div>
        </div>
      </article>`);
    const found = iconRow(article.querySelector('[data-testid="caret"]')!, article);
    expect(found?.row.id).toBe("icons");
    expect(found?.item.id).toBe("outer");
  });

  it("falls back to the header row when the caret has no icon siblings", () => {
    const article = mount(`
      <article>
        <div id="header" style="${row}">
          <div id="name">name</div>
          <div id="right" style="${col}"><div style="${col}"><button data-testid="caret"><svg></svg></button></div></div>
        </div>
      </article>`);
    const found = iconRow(article.querySelector('[data-testid="caret"]')!, article);
    expect(found?.row.id).toBe("header");
    expect(found?.item.id).toBe("right");
  });

  it("ignores a row that only holds the caret and Postsight's own button", () => {
    const article = mount(`
      <article>
        <div id="header" style="${row}">
          <div id="name">name</div>
          <div id="inner" style="${row}"><div ${TRIGGER}></div><button data-testid="caret"><svg></svg></button></div>
        </div>
      </article>`);
    const found = iconRow(article.querySelector('[data-testid="caret"]')!, article);
    expect(found?.row.id).toBe("header");
  });

  it("gives up rather than guess when no row exists", () => {
    const article = mount(`<article><div style="${col}"><button data-testid="caret"></button></div></article>`);
    expect(iconRow(article.querySelector('[data-testid="caret"]')!, article)).toBeNull();
  });
});
