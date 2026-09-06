import { describe, expect, it } from "vitest";
import { redactKnownSecretValues } from "./secrets";

describe("redactKnownSecretValues", () => {
  it("redacts finite numbers and booleans by exact string match only", () => {
    expect(redactKnownSecretValues({ uptime: 4096 }, ["4096"])).toEqual({ uptime: "[REDACTED]" });
    expect(redactKnownSecretValues({ uptime: 4097 }, ["4096"])).toEqual({ uptime: 4097 });
    expect(redactKnownSecretValues({ uptime: 40960 }, ["4096"])).toEqual({ uptime: 40960 });
    expect(redactKnownSecretValues({ flag: true }, ["true"])).toEqual({ flag: "[REDACTED]" });
    expect(redactKnownSecretValues({ flag: false }, ["true"])).toEqual({ flag: false });
    expect(redactKnownSecretValues({ flag: null }, ["null"])).toEqual({ flag: null });
  });

  it("keeps substring replacement for strings", () => {
    expect(redactKnownSecretValues("DSM-4096-build", ["4096"])).toBe("DSM-[REDACTED]-build");
  });
});
