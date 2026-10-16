export const VERDICTS = [
  "accurate",
  "mostly_accurate",
  "mixed",
  "misleading",
  "false",
  "unverifiable",
  "opinion",
  "satire",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export type VerdictTone = "positive" | "warning" | "danger" | "neutral";

export const VERDICT_TONE: Record<Verdict, VerdictTone> = {
  accurate: "positive",
  mostly_accurate: "positive",
  mixed: "warning",
  misleading: "warning",
  false: "danger",
  unverifiable: "neutral",
  opinion: "neutral",
  satire: "neutral",
};

export interface ParsedVerdict {
  verdict: Verdict | null;
  confidence: number | null;
  body: string;
  /** True while the first line is still streaming and may turn out to be a verdict line. */
  pending: boolean;
}

const LINE = /^VERDICT\s*:\s*([a-z _-]+?)\s*(?:\|\s*CONFIDENCE\s*:\s*(\d{1,3})\s*%?)?\s*$/i;

function normalizeLabel(raw: string): Verdict | null {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (VERDICTS as readonly string[]).includes(key) ? (key as Verdict) : null;
}

/**
 * Pulls the `VERDICT: label | CONFIDENCE: 80` line out of a fact-check answer.
 * Models sometimes wrap it in bold or backticks, so those are ignored.
 */
export function parseVerdict(text: string): ParsedVerdict {
  const leading = text.match(/^\s*/)?.[0].length ?? 0;
  const rest = text.slice(leading);
  const newline = rest.indexOf("\n");
  const firstLine = newline === -1 ? rest : rest.slice(0, newline);
  const clean = firstLine.replace(/[`*#>]/g, "").trim();

  if (newline === -1 && "VERDICT".startsWith(clean.slice(0, 7).toUpperCase()) && clean.length < 80) {
    return { verdict: null, confidence: null, body: "", pending: true };
  }
  const match = clean.match(LINE);
  if (!match) return { verdict: null, confidence: null, body: text, pending: false };
  const confidence = match[2] === undefined ? null : Math.min(100, Number(match[2]));
  const body = newline === -1 ? "" : rest.slice(newline + 1).replace(/^\s+/, "");
  return { verdict: normalizeLabel(match[1] ?? ""), confidence, body, pending: false };
}
