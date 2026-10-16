import { LANGUAGES } from "../shared/languages";
import { h, icon } from "./dom";

export function segmented<T extends string>(
  label: string,
  options: readonly { value: T; label: string }[],
  current: T,
  onChange: (value: T) => void,
  block = false,
): HTMLElement {
  const group = h("div", { class: `seg${block ? " seg-block" : ""}`, role: "group", "aria-label": label });
  for (const option of options) {
    group.appendChild(
      h(
        "button",
        {
          type: "button",
          "aria-pressed": option.value === current ? "true" : "false",
          onClick: () => {
            for (const b of group.querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
            group.children[options.indexOf(option)]?.setAttribute("aria-pressed", "true");
            onChange(option.value);
          },
        },
        option.label,
      ),
    );
  }
  return group;
}

export function toggle(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLLabelElement {
  const input = h("input", { type: "checkbox", role: "switch" });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "switch" }, input, h("span", { class: "track", "aria-hidden": "true" }), label ? h("span", null, label) : null);
}

export interface SelectOption {
  value: string;
  label: string;
}

export function select(
  label: string,
  groups: readonly { label?: string; options: readonly SelectOption[] }[],
  current: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const el = h("select", { class: "select", "aria-label": label });
  for (const group of groups) {
    const parent = group.label ? h("optgroup", { label: group.label }) : el;
    for (const option of group.options) parent.appendChild(h("option", { value: option.value }, option.label));
    if (parent !== el) el.appendChild(parent);
  }
  el.value = current;
  el.addEventListener("change", () => onChange(el.value));
  return el;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string): void {
  document.querySelector(".toast")?.remove();
  clearTimeout(toastTimer);
  const el = h("div", { class: "toast", role: "status" }, icon("check", 16), text);
  document.body.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), 1600);
}

/** Budget bar that turns amber past 80% and red when spent. */
export function budgetBar(spent: number, budget: number): HTMLElement {
  const ratio = budget > 0 ? Math.min(1, spent / budget) : 0;
  const tone = ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "primary";
  return h(
    "div",
    { class: "bar", "data-tone": tone, role: "meter", "aria-valuemin": 0, "aria-valuemax": budget, "aria-valuenow": Number(spent.toFixed(4)) },
    h("span", { style: `width:${(ratio * 100).toFixed(1)}%` }),
  );
}

/** Language picker: one special first choice (browser, same as interface) and every supported language by its own name. */
export function languageSelect(label: string, first: SelectOption, current: string, onChange: (value: string) => void): HTMLSelectElement {
  return select(label, [{ options: [first] }, { options: LANGUAGES.map((l) => ({ value: l.code, label: l.native })) }], current, onChange);
}
