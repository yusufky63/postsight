import { describe, expect, it } from "vitest";
import { readSse, SseParser } from "./sse";

describe("SseParser", () => {
  it("parses events split across chunks", () => {
    const p = new SseParser();
    expect(p.push("event: response.output_text.delta\ndata: {\"del")).toEqual([]);
    expect(p.push("ta\":\"Hi\"}\n\n")).toEqual([{ event: "response.output_text.delta", data: '{"delta":"Hi"}' }]);
  });

  it("joins multi-line data and skips comments", () => {
    const p = new SseParser();
    expect(p.push(": keep-alive\ndata: a\ndata: b\n\n")).toEqual([{ event: null, data: "a\nb" }]);
  });

  it("handles CRLF split between chunks", () => {
    const p = new SseParser();
    expect(p.push("data: x\r")).toEqual([]);
    expect(p.push("\n\r\n")).toEqual([{ event: null, data: "x" }]);
  });

  it("flushes a final event without a trailing blank line", () => {
    const p = new SseParser();
    p.push("data: [DONE]");
    expect(p.end()).toEqual([{ event: null, data: "[DONE]" }]);
  });
});

describe("readSse", () => {
  it("decodes a byte stream, including multi-byte characters split across chunks", async () => {
    const bytes = new TextEncoder().encode('data: {"t":"çğü"}\n\ndata: [DONE]\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 12));
        controller.enqueue(bytes.slice(12));
        controller.close();
      },
    });
    const events = [];
    for await (const e of readSse(stream)) events.push(e.data);
    expect(events).toEqual(['{"t":"çğü"}', "[DONE]"]);
  });
});
