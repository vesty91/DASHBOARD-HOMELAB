import { describe, expect, it } from "vitest";
import { issueRealtimeTicket, MemoryEventBus } from "@dashboard/events";
import { startRealtime } from "./server";

const secret = "a".repeat(32);

async function readResponse(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url);
  return { status: response.status, body: await response.text() };
}

describe("realtime SSE", () => {
  it("rejects missing tickets and streams heartbeat events", async () => {
    const bus = new MemoryEventBus();
    const realtime = await startRealtime({ bus, secret, heartbeatMs: 5_000 });
    try {
      const denied = await readResponse(`http://127.0.0.1:${realtime.port()}/events`);
      expect(denied.status).toBe(401);
      const ticket = issueRealtimeTicket(secret, "user-1");
      const stream = await fetch(
        `http://127.0.0.1:${realtime.port()}/events?ticket=${encodeURIComponent(ticket.token)}`,
      );
      expect(stream.status).toBe(200);
      expect(stream.headers.get("content-type")).toMatch(/text\/event-stream/u);
      const publish = bus.publish({
        type: "job.heartbeat",
        jobType: "heartbeat",
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      const reader = stream.body?.getReader();
      if (!reader) throw new Error("missing body");
      const decoder = new TextDecoder();
      let buffer = "";
      while (!buffer.includes("job.heartbeat")) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      await publish;
      await reader.cancel();
      expect(buffer).toContain("event: job.heartbeat");
      expect(buffer).toContain("2026-09-13T00:00:00.000Z");
      expect(buffer).not.toMatch(/AUTH_SECRET|redis:\/\//u);
    } finally {
      await realtime.close();
    }
  });
});
