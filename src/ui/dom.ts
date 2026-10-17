export type Child = Node | string | number | null | undefined | false | Child[];
type AttrValue = string | number | boolean | null | undefined | ((event: never) => void);
export type Attrs = Record<string, AttrValue>;

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(parent, c);
    return;
  }
  parent.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
}

/** Small element builder. Text always goes in as text nodes, never as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "class") {
      el.className = String(value);
    } else if (key === "style") {
      // CSSOM rather than the style attribute: page CSPs may block inline style attributes.
      el.style.cssText = String(value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replace(el: Element, ...children: Child[]): void {
  clear(el);
  append(el, children);
}

const SVG = "http://www.w3.org/2000/svg";

/**
 * Icon shapes on a 24px grid, drawn with a 1.75 stroke. A part starting with
 * "c " is a circle "c cx cy r"; anything else is path data.
 */
const ICONS = {
  lens: ["c 11 11 7", "m21 21-4.3-4.3", "M8 11.2l2 2 3.6-3.8"],
  wallet: ["M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1", "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"],
  spark: ["M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z", "M19 3v4", "M17 5h4"],
  verify: ["c 12 12 9", "M8.5 12.5l2.5 2.5 4.5-5"],
  research: ["c 12 12 9", "M3 12h18", "M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"],
  summarize: ["M4 6h16", "M4 10h12", "M4 14h16", "M4 18h9"],
  translate: ["m5 8 6 6", "m4 14 6-6 2-3", "M2 5h12", "M7 2h1", "m22 22-5-10-5 10", "M14 18h6"],
  explain: ["M9 18h6", "M10 22h4", "M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"],
  reply: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  ask: ["c 12 12 9", "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3", "M12 17h.01"],
  copy: ["M9 9h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
  link: ["M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7", "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"],
  quote: ["M6 7h4v4c0 3-1.5 5-4 6", "M14 7h4v4c0 3-1.5 5-4 6"],
  close: ["M18 6 6 18", "m6 6 12 12"],
  retry: ["M21 12a9 9 0 1 1-3-6.7L21 8", "M21 3v5h-5"],
  chevronDown: ["m6 9 6 6 6-6"],
  chevronLeft: ["m15 18-6-6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  settings: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  stop: ["M7 7h10v10H7z"],
  external: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  up: ["m5 12 7-7 7 7", "M12 19V5"],
  down: ["M12 5v14", "m19 12-7 7-7-7"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "c 12 12 3"],
  eyeOff: ["M3 3l18 18", "M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.6", "M6.6 6.6A17 17 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 5.4-1.6", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
  send: ["M5 12h14", "m12 5 7 7-7 7"],
  history: ["c 12 12 9", "M12 7v5l3 2"],
  check: ["M20 6 9 17l-5-5"],
  alert: ["c 12 12 9", "M12 8v5", "M12 16h.01"],
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const part of ICONS[name]) {
    if (part.startsWith("c ")) {
      const [cx, cy, r] = part.slice(2).split(" ");
      const circle = document.createElementNS(SVG, "circle");
      circle.setAttribute("cx", cx ?? "12");
      circle.setAttribute("cy", cy ?? "12");
      circle.setAttribute("r", r ?? "9");
      svg.appendChild(circle);
    } else {
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("d", part);
      svg.appendChild(path);
    }
  }
  return svg;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Some pages deny the async clipboard; a selected textarea still works there.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}
