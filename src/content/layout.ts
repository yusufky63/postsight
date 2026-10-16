/** Attribute on the element that hosts Postsight's button in a post header. */
export const TRIGGER = "data-postsight-trigger";

/** Default size of X's header icons; their hover circle is drawn outside this box. */
export const X_ICON = 18.75;

/**
 * X wraps each header icon in several vertical (column) boxes, so the caret's own
 * parent is not where icons sit side by side. Walks up to the first ancestor that
 * lays out its children in a row and holds something besides the caret's branch;
 * `item` is that ancestor's child containing the caret.
 */
export function iconRow(caret: Element, stop: Element): { row: Element; item: Element } | null {
  let item: Element = caret;
  let row = caret.parentElement;
  while (row && row !== stop) {
    const style = getComputedStyle(row);
    const horizontal = style.display.includes("flex") && style.flexDirection.startsWith("row");
    if (horizontal && [...row.children].some((c) => c !== item && !c.hasAttribute(TRIGGER))) return { row, item };
    item = row;
    row = row.parentElement;
  }
  return null;
}

/** Box of the last icon drawn inside an element, if it is laid out. */
export function iconBox(el: Element): DOMRect | undefined {
  const svgs = el.querySelectorAll("svg");
  const box = svgs[svgs.length - 1]?.getBoundingClientRect();
  return box && box.width > 0 ? box : undefined;
}
