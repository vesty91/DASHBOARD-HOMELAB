import { describe, expect, it } from "vitest";
import { jellyfinUserError } from "./jellyfin-error";

describe("jellyfinUserError", () => {
  it("maps transport and auth codes", () => {
    expect(jellyfinUserError({ code: "UNAUTHORIZED" })).toBe("Clé API Jellyfin invalide.");
    expect(jellyfinUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Jellyfin.");
    expect(jellyfinUserError({ code: "TOO_MANY_REQUESTS" })).toContain("actualisations");
  });
});
