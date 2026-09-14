import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import { mapHealth, mapStats, mapVersion, parseJsonValue } from "./dto";

const TOKEN = "tk_secretAccessToken012345";

describe("ntfy dto", () => {
  it("maps health and rejects a missing healthy boolean", () => {
    expect(mapHealth({ healthy: true })).toEqual({ healthy: true });
    expect(mapHealth({ healthy: false })).toEqual({ healthy: false });
    expect(() => mapHealth([])).toThrow(IntegrationError);
    expect(() => mapHealth({})).toThrow(/healthy/i);
    expect(() => mapHealth({ healthy: "true" })).toThrow(/healthy/i);
  });

  it("maps public aggregate stats without topic names", () => {
    const mapped = mapStats({ messages: 42, messages_rate: 0.25, topic: "alerts" });
    expect(mapped).toEqual({ messages: 42, messagesRate: 0.25 });
    expect(JSON.stringify(mapped)).not.toContain("alerts");
    expect(() => mapStats({ messages: -1, messages_rate: 0 })).toThrow(IntegrationError);
    expect(() => mapStats({ messages: 1.5, messages_rate: 0 })).toThrow(IntegrationError);
    expect(() => mapStats({ messages: 1, messages_rate: Number.POSITIVE_INFINITY })).toThrow(
      IntegrationError,
    );
  });

  it("maps version strings, redacts secrets and rejects control characters", () => {
    expect(
      mapVersion({ version: "2.11.0", commit: "deadbeef", date: "2026-01-01" }, [TOKEN]),
    ).toEqual({
      version: "2.11.0",
      commit: "deadbeef",
      date: "2026-01-01",
    });
    expect(mapVersion({ version: TOKEN, commit: "abc", date: "2026-01-01" }, [TOKEN])).toEqual({
      version: "[REDACTED]",
      commit: "abc",
      date: "2026-01-01",
    });
    expect(mapVersion({ version: "bad\nver", commit: "", date: 1 }, [TOKEN])).toEqual({
      version: null,
      commit: null,
      date: null,
    });
  });

  it("rejects invalid JSON", () => {
    expect(() => parseJsonValue("{")).toThrow(/invalid JSON/);
  });
});
