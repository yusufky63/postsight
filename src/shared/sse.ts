export interface SseEvent {
  event: string | null;
  data: string;
}

/** Incremental Server-Sent Events parser: feed it text chunks, get complete events back. */
export class SseParser {
  private buffer = "";
  private event: string | null = null;
  private data: string[] = [];

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const out: SseEvent[] = [];
    let newline: number;
    while ((newline = this.buffer.search(/\r\n|\n|\r/)) !== -1) {
      // A lone trailing \r may be the first half of \r\n split across chunks.
      if (this.buffer[newline] === "\r" && newline === this.buffer.length - 1) break;
      const line = this.buffer.slice(0, newline);
      const sep = this.buffer.startsWith("\r\n", newline) ? 2 : 1;
      this.buffer = this.buffer.slice(newline + sep);
      this.line(line, out);
    }
    return out;
  }

  /** Flushes an event that was not followed by a blank line before the stream closed. */
  end(): SseEvent[] {
    const out: SseEvent[] = [];
    if (this.buffer) this.line(this.buffer, out);
    this.buffer = "";
    this.line("", out);
    return out;
  }

  private line(line: string, out: SseEvent[]): void {
    if (line === "") {
      if (this.data.length) out.push({ event: this.event, data: this.data.join("\n") });
      this.event = null;
      this.data = [];
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.event = value;
    else if (field === "data") this.data.push(value);
  }
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
    yield* parser.push(decoder.decode());
    yield* parser.end();
  } finally {
    reader.releaseLock();
  }
}
