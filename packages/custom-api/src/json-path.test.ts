import { describe, expect, it } from "vitest";
import { extractJsonPath, parseJsonPath } from "./json-path";

describe("custom-api json-path", () => {
  it("parses dotted keys and numeric indexes", () => {
    expect(parseJsonPath("data.items[0].value")).toEqual([
      { kind: "key", name: "data" },
      { kind: "key", name: "items" },
      { kind: "index", index: 0 },
      { kind: "key", name: "value" },
    ]);
    expect(extractJsonPath({ data: { items: [{ value: 7 }] } }, "data.items[0].value")).toBe(7);
  });

  it("rejects empty, wildcards, filters, prototype keys and overflow", () => {
    expect(() => parseJsonPath("")).toThrow(/required/i);
    expect(() => parseJsonPath("$")).toThrow();
    expect(() => parseJsonPath("a..b")).toThrow();
    expect(() => parseJsonPath("items[*]")).toThrow();
    expect(() => parseJsonPath("items[?(@.id)]")).toThrow();
    expect(() => parseJsonPath("a b")).toThrow();
    expect(() => parseJsonPath("__proto__.x")).toThrow(/prototype/i);
    expect(() => parseJsonPath("prototype")).toThrow(/prototype/i);
    expect(() => parseJsonPath("constructor")).toThrow(/prototype/i);
    expect(() => parseJsonPath("a.b.c.d.e.f.g.h.i")).toThrow(/depth/i);
    expect(() => parseJsonPath("x".repeat(129))).toThrow(/too long/i);
  });

  it("does not follow prototype pollution and returns undefined for missing keys", () => {
    const poisoned = JSON.parse('{"ok":true}') as { ok: boolean };
    expect(extractJsonPath(poisoned, "__proto__")).toBeUndefined();
    expect(extractJsonPath({ a: 1 }, "missing")).toBeUndefined();
    expect(extractJsonPath({ items: [] }, "items[0]")).toBeUndefined();
    expect(extractJsonPath({ items: [1] }, "items.0")).toBeUndefined();
  });
});
