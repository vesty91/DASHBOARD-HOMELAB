import { describe, expect, it } from "vitest";
import { decodeDockerLogs, DOCKER_LOGS_MAX_BYTES, sanitizeDockerLogText } from "./logs";

function frame(stream: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  const header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

describe("Docker logs decoder", () => {
  it("decodes multiplexed stdout and stderr frames", () => {
    const body = Buffer.concat([frame(1, "out\n"), frame(2, "err\n")]);
    const decoded = decodeDockerLogs(body, false);
    expect(decoded.text).toBe("out\nerr\n");
    expect(decoded.tty).toBe(false);
    expect(decoded.truncated).toBe(false);
  });

  it("decodes TTY plain text and strips ANSI plus control chars", () => {
    const decoded = decodeDockerLogs(
      Buffer.from("hello\u001B[31mred\u001B[0m\tworld\u0007\n", "utf8"),
      true,
    );
    expect(decoded.tty).toBe(true);
    expect(decoded.text).toBe("hellored\tworld\n");
    expect(sanitizeDockerLogText("a\r\nb\u0000c")).toBe("a\nbc");
  });

  it("marks truncated and malformed frames without throwing", () => {
    const header = Buffer.alloc(8);
    header[0] = 1;
    header.writeUInt32BE(20, 4);
    const partial = Buffer.concat([header, Buffer.from("nope")]);
    const decodedPartial = decodeDockerLogs(partial, false);
    expect(decodedPartial.truncated).toBe(true);
    expect(decodedPartial.text).toBe("nope");
    const oversized = Buffer.alloc(DOCKER_LOGS_MAX_BYTES + 8, 65);
    expect(decodeDockerLogs(oversized, true).truncated).toBe(true);
  });

  it("keeps the bounded payload of a truncated multiplexed frame", () => {
    const payload = Buffer.alloc(DOCKER_LOGS_MAX_BYTES, 65);
    const header = Buffer.alloc(8);
    header[0] = 1;
    header.writeUInt32BE(payload.length, 4);
    const decoded = decodeDockerLogs(Buffer.concat([header, payload]), false);
    expect(decoded.truncated).toBe(true);
    expect(decoded.text.length).toBe(DOCKER_LOGS_MAX_BYTES - 8);
    expect(decoded.text).toMatch(/^A+$/u);
  });
});
