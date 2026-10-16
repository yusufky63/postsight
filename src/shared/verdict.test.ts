import { describe, expect, it } from "vitest";
import { parseVerdict } from "./verdict";

describe("parseVerdict", () => {
  it("reads the label and confidence and strips the line", () => {
    const out = parseVerdict("VERDICT: misleading | CONFIDENCE: 72\n## Claims\n- one");
    expect(out).toEqual({ verdict: "misleading", confidence: 72, body: "## Claims\n- one", pending: false });
  });

  it("tolerates markdown decoration and spaced labels", () => {
    const out = parseVerdict("**VERDICT: Mostly Accurate | CONFIDENCE: 85%**\n\nBody");
    expect(out.verdict).toBe("mostly_accurate");
    expect(out.confidence).toBe(85);
    expect(out.body).toBe("Body");
  });

  it("waits while the first line is still streaming", () => {
    expect(parseVerdict("VERD").pending).toBe(true);
    expect(parseVerdict("VERDICT: fal").pending).toBe(true);
    expect(parseVerdict("").pending).toBe(true);
  });

  it("passes through answers without a verdict line", () => {
    const out = parseVerdict("The post says X.\nMore");
    expect(out).toMatchObject({ verdict: null, pending: false, body: "The post says X.\nMore" });
  });

  it("ignores unknown labels but still hides the line", () => {
    const out = parseVerdict("VERDICT: kinda | CONFIDENCE: 10\nText");
    expect(out.verdict).toBeNull();
    expect(out.body).toBe("Text");
  });

  it("caps confidence at 100", () => {
    expect(parseVerdict("VERDICT: false | CONFIDENCE: 400\n").confidence).toBe(100);
  });
});
