import { describe, expect, it } from "vitest";
import { createStatusPageSchema, statusPageSlugSchema } from "./schemas";
import { isReservedStatusPageSlug, normalizeStatusPageSlug } from "./slug";

describe("status page slug", () => {
  it("normalizes case and validates bounded regex", () => {
    expect(normalizeStatusPageSlug("  Homelab-Core  ")).toBe("homelab-core");
    expect(statusPageSlugSchema.parse("Homelab-Core")).toBe("homelab-core");
    expect(() => statusPageSlugSchema.parse("a")).toThrow();
    expect(() => statusPageSlugSchema.parse("Bad_Slug")).toThrow();
    expect(() => statusPageSlugSchema.parse("-leading")).toThrow();
    expect(() => statusPageSlugSchema.parse("a".repeat(65))).toThrow();
  });

  it("rejects reserved routes", () => {
    expect(isReservedStatusPageSlug("admin")).toBe(true);
    expect(() => statusPageSlugSchema.parse("api")).toThrow();
    expect(() => statusPageSlugSchema.parse("login")).toThrow();
  });

  it("defaults visibility to private", () => {
    const created = createStatusPageSchema.parse({
      name: "Core",
      slug: "core-status",
    });
    expect(created.visibility).toBe("private");
    expect(created.enabled).toBe(true);
  });
});
