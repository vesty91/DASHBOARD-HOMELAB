import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import { mapCustomApiValue, parseJsonValue } from "./dto";

const SECRET = "notareal-custom-api-secret-0123456789";

describe("custom-api dto", () => {
  it("maps text, number, badge and list display modes", () => {
    expect(mapCustomApiValue({ v: "hello" }, "v", "text").data).toEqual({
      display: "text",
      text: "hello",
    });
    expect(mapCustomApiValue({ v: 12.5 }, "v", "number").data).toEqual({
      display: "number",
      number: 12.5,
    });
    expect(mapCustomApiValue({ v: true }, "v", "badge").data).toEqual({
      display: "badge",
      label: "true",
      tone: "success",
    });
    expect(mapCustomApiValue({ v: ["a", "b", "c", "d", "e", "f"] }, "v", "list").data).toEqual({
      display: "list",
      items: ["a", "b", "c", "d", "e"],
      truncated: true,
    });
  });

  it("keeps hostile strings inert, strips controls, truncates and redacts secrets", () => {
    const html = mapCustomApiValue({ v: "<img src=x onerror=alert(1)>" }, "v", "text").data;
    expect(html).toEqual({ display: "text", text: "<img src=x onerror=alert(1)>" });
    const js = mapCustomApiValue({ v: "javascript:alert(1)" }, "v", "text").data;
    expect(js).toEqual({ display: "text", text: "javascript:alert(1)" });
    expect(JSON.stringify(js)).not.toContain("href");
    const stripped = mapCustomApiValue({ v: "ok\nline" }, "v", "text").data;
    expect(stripped).toEqual({ display: "text", text: "okline" });
    const long = "x".repeat(200);
    expect(mapCustomApiValue({ v: long }, "v", "text").data).toEqual({
      display: "text",
      text: "x".repeat(120),
    });
    expect(mapCustomApiValue({ v: SECRET }, "v", "text", [SECRET]).data).toEqual({
      display: "text",
      text: "[REDACTED]",
    });
  });

  it("rejects NaN, Infinity and unresolved paths without fabricating values", () => {
    expect(mapCustomApiValue({ v: Number.NaN }, "v", "number").status).toBe("unavailable");
    expect(mapCustomApiValue({ v: Number.POSITIVE_INFINITY }, "v", "number").status).toBe(
      "unavailable",
    );
    expect(mapCustomApiValue({ v: "12" }, "v", "number").status).toBe("unavailable");
    const missing = mapCustomApiValue({ v: 1 }, "missing", "text");
    expect(missing).toEqual({ status: "unavailable", data: null, reason: "invalid-response" });
    expect(() => parseJsonValue("{")).toThrow(IntegrationError);
  });
});
