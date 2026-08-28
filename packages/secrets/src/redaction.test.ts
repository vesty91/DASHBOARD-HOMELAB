import { describe, expect, it } from "vitest";
import { redact } from "./redaction";

describe("redaction", () => {
  it("redacts nested sensitive keys case-insensitively", () => {
    expect(
      redact({
        name: "nas",
        APIKEY: "secret-value",
        nested: { Password: "hunter2", token: "abc", keep: 1 },
        headers: { Authorization: "Bearer abc", "Set-Cookie": "sid=1", accept: "json" },
        list: [{ clientSecret: "xyz" }, "ok"],
      }),
    ).toEqual({
      name: "nas",
      APIKEY: "[REDACTED]",
      nested: { Password: "[REDACTED]", token: "[REDACTED]", keep: 1 },
      headers: { Authorization: "[REDACTED]", "Set-Cookie": "[REDACTED]", accept: "json" },
      list: [{ clientSecret: "[REDACTED]" }, "ok"],
    });
  });
});
