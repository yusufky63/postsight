/**
 * A tiny HTML template tag: every interpolated value is escaped unless it is already
 * markup produced by `html` or `raw`, so copy from locale files and markdown can never
 * turn into live HTML by accident.
 */
export class Markup {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

type Part = Markup | string | number | boolean | null | undefined | readonly Part[];

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function render(part: Part): string {
  if (part === null || part === undefined || part === false || part === true) return "";
  if (part instanceof Markup) return part.value;
  if (Array.isArray(part)) return part.map(render).join("");
  return escapeHtml(String(part));
}

export function html(strings: TemplateStringsArray, ...values: Part[]): Markup {
  let out = strings[0] ?? "";
  values.forEach((value, i) => {
    out += render(value) + (strings[i + 1] ?? "");
  });
  return new Markup(out);
}

/** Trusted markup written in this repo (inline SVG icons, the theme boot script). */
export function raw(value: string): Markup {
  return new Markup(value);
}

/** JSON for a <script type="application/ld+json"> block; `<` is escaped so text cannot close the tag. */
export function jsonScript(data: unknown): Markup {
  return raw(JSON.stringify(data).replace(/</g, "\\u003c"));
}
