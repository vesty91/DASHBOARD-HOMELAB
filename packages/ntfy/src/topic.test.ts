import { describe, expect, it } from "vitest";
import {
  assertNtfyMessage,
  assertNtfyPriority,
  assertNtfyTags,
  assertNtfyTitle,
  assertNtfyTopic,
  isNtfyPublishPath,
  ntfyPublishPath,
} from "./topic";

describe("ntfy topic policy", () => {
  it("accepts a strict topic and rejects reserved or traversable names", () => {
    expect(assertNtfyTopic("homelab-alerts")).toBe("homelab-alerts");
    expect(ntfyPublishPath("homelab-alerts")).toBe("/homelab-alerts");
    expect(isNtfyPublishPath("/homelab-alerts")).toBe(true);
    expect(isNtfyPublishPath("/v1/health")).toBe(false);
    expect(isNtfyPublishPath("/metrics")).toBe(false);
    expect(() => assertNtfyTopic("v1")).toThrow(/Reserved/);
    expect(() => assertNtfyTopic("../config")).toThrow(/Invalid ntfy topic/);
    expect(() => assertNtfyTopic("a/b")).toThrow(/Invalid ntfy topic/);
  });

  it("bounds message, title, tags and priority without allowing header injection", () => {
    expect(assertNtfyPriority("high")).toBe("high");
    expect(() => assertNtfyPriority("urgent")).toThrow(/priority/);
    expect(assertNtfyTitle("Disk")).toBe("Disk");
    expect(() => assertNtfyTitle("bad\r\nActions: http, x, https://evil")).toThrow(/title/);
    expect(assertNtfyMessage("hello")).toBe("hello");
    expect(() => assertNtfyMessage("x".repeat(4097))).toThrow(/message/);
    expect(assertNtfyTags(["warning", "disk"])).toEqual(["warning", "disk"]);
    expect(() => assertNtfyTags(["bad tag"])).toThrow(/tag/);
    expect(() => assertNtfyTags(["a", "b", "c", "d", "e", "f"])).toThrow(/Too many/);
  });
});
