import type { Translate } from "../shared/i18n";
import { sendRequest } from "../shared/messages";
import type { UpdateStatus } from "../shared/update";
import { h } from "./dom";

export function loadUpdateStatus(force = false): Promise<UpdateStatus | null> {
  return sendRequest<UpdateStatus | undefined>({ type: "update-status", force }).then(
    (s) => s ?? null,
    () => null,
  );
}

/**
 * The notice the popup and settings show when a newer version exists. A store copy already
 * has it and only needs a restart; a GitHub copy has to be downloaded and reloaded by hand.
 */
export function updateBanner(status: UpdateStatus | null, t: Translate): HTMLElement | null {
  if (!status?.latest) return null;
  const vars = { version: status.latest, current: status.current };
  if (status.source === "store") {
    return h(
      "div",
      { class: "banner update-banner", "data-tone": "primary", role: "status" },
      h("span", null, t("update.ready", vars)),
      h(
        "button",
        { class: "btn btn-sm btn-primary", type: "button", onClick: () => void sendRequest({ type: "apply-update" }).catch(() => undefined) },
        t("update.restart"),
      ),
    );
  }
  return h(
    "div",
    { class: "banner update-banner", "data-tone": "primary", role: "status" },
    h("span", null, t("update.available", vars), " ", h("span", { class: "secondary" }, t("update.howTo"))),
    h(
      "a",
      { class: "btn btn-sm btn-primary", href: status.url ?? "https://github.com/yusufky63/postsight/releases/latest", target: "_blank", rel: "noreferrer noopener" },
      t("update.download", vars),
    ),
  );
}
