import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolveWidgetConfig, serializeWidgetConfig } from "./config";
import { createWidgetPolicy } from "./policy";
import { createWidgetRegistry } from "./registry";
import type { WidgetContract } from "./types";

const migrating: WidgetContract<{ label: string; extra?: string }> = {
  id: "migrating",
  version: 2,
  name: "Migrating",
  description: "Versioned widget",
  category: "test",
  defaultSize: { w: 2, h: 2 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 4, h: 4 },
  defaultConfig: { label: "ok", extra: "added" },
  configSchema: z.object({ label: z.string(), extra: z.string() }),
  publicSafe: true,
  migrations: {
    1: (config) => {
      const record = (config ?? {}) as { label?: string };
      return { label: record.label ?? "ok", extra: "added" };
    },
  },
};

describe("widget config resolution", () => {
  const policy = createWidgetPolicy(createWidgetRegistry().register(migrating));

  it("validates the current version", () => {
    expect(policy.resolve("migrating", 2, { label: "now", extra: "kept" })).toEqual({
      status: "ready",
      config: { label: "now", extra: "kept" },
      version: 2,
      publicSafe: true,
    });
  });

  it("migrates older configs in memory without inventing values on invalid JSON", () => {
    expect(policy.resolve("migrating", 1, { label: "old" })).toEqual({
      status: "ready",
      config: { label: "old", extra: "added" },
      version: 2,
      publicSafe: true,
    });
    expect(policy.resolve("migrating", 1, null, true)).toEqual({
      status: "configuration-missing",
    });
  });

  it("does not guess future versions or unknown widgets", () => {
    expect(policy.resolve("migrating", 3, { label: "x", extra: "y" })).toEqual({
      status: "incompatible-version",
    });
    expect(policy.resolve("missing", 1, {})).toEqual({ status: "unknown" });
    expect(policy.resolve("migrating", 2, { nope: true })).toEqual({ status: "invalid-config" });
  });

  it("serializes JSON-compatible configs", () => {
    expect(serializeWidgetConfig({ timezone: "UTC" })).toBe('{"timezone":"UTC"}');
  });

  it("exposes catalog metadata without functions", () => {
    const [entry] = policy.catalog();
    expect(entry).toMatchObject({
      id: "migrating",
      version: 2,
      publicSafe: true,
      defaultSize: { w: 2, h: 2 },
    });
    expect(entry).not.toHaveProperty("configSchema");
    expect(entry).not.toHaveProperty("migrations");
  });

  it("treats unknown widgets as an explicit result", () => {
    expect(resolveWidgetConfig(undefined, 1, {})).toEqual({ status: "unknown" });
  });

  it("isolates a throwing migration as invalid-config without leaking the exception", () => {
    const exploding: WidgetContract<{ label: string }> = {
      id: "exploding",
      version: 2,
      name: "Exploding",
      description: "Throws during migration",
      category: "test",
      defaultSize: { w: 2, h: 2 },
      minSize: { w: 1, h: 1 },
      maxSize: { w: 4, h: 4 },
      defaultConfig: { label: "ok" },
      configSchema: z.object({ label: z.string() }),
      publicSafe: true,
      migrations: {
        1: () => {
          throw new Error("boom");
        },
      },
    };
    expect(resolveWidgetConfig(exploding, 1, { label: "old" })).toEqual({
      status: "invalid-config",
    });
    expect(resolveWidgetConfig(migrating, 2, { label: "now", extra: "kept" }).status).toBe("ready");
  });
});
