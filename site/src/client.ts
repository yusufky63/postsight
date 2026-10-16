// The only script on the site: the light/dark toggle. Without it the site follows the
// system theme, so everything still works when scripts are blocked.
import { THEME_KEY } from "./theme";

type Theme = "light" | "dark";

const root = document.documentElement;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function current(): Theme {
  const set = root.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return systemDark.matches ? "dark" : "light";
}

const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]"));

function sync(): void {
  const dark = current() === "dark";
  for (const button of buttons) button.setAttribute("aria-pressed", String(dark));
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked (private mode, site data off): the choice lasts for this page only.
    }
    sync();
  });
}

systemDark.addEventListener("change", sync);
sync();
