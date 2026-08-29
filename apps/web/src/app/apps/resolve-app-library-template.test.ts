import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { resolveAppLibraryTemplate } from "./resolve-app-library-template";

const jellyfin = {
  id: "jellyfin",
  name: "Jellyfin",
  description: "Serveur média libre.",
  icon: { path: "/app-icons/jellyfin.svg" },
};

describe("resolveAppLibraryTemplate", () => {
  it("returns a known template for form prefill", async () => {
    await expect(resolveAppLibraryTemplate(async () => jellyfin)).resolves.toEqual(jellyfin);
  });

  it("treats NOT_FOUND as a manual custom form", async () => {
    await expect(
      resolveAppLibraryTemplate(() => {
        throw new TRPCError({ code: "NOT_FOUND", message: "App definition not found" });
      }),
    ).resolves.toBeUndefined();
  });

  it("propagates FORBIDDEN", async () => {
    const error = new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });
    await expect(resolveAppLibraryTemplate(() => Promise.reject(error))).rejects.toBe(error);
  });

  it("propagates INTERNAL_SERVER_ERROR", async () => {
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected template lookup failure",
    });
    await expect(resolveAppLibraryTemplate(() => Promise.reject(error))).rejects.toBe(error);
  });
});
