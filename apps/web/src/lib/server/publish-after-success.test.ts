import { describe, expect, it, vi } from "vitest";
import { publishAfterSuccess } from "./publish-after-success";

describe("publishAfterSuccess", () => {
  it("publishes only after a successful mutation and swallows publish failures", async () => {
    const publish = vi.fn(async () => undefined);
    await expect(publishAfterSuccess(async () => "ok", publish)).resolves.toBe("ok");
    expect(publish).toHaveBeenCalledTimes(1);
    const failedPublish = vi.fn(async () => {
      throw new Error("redis://:secret@localhost/0");
    });
    await expect(publishAfterSuccess(async () => "ok", failedPublish)).resolves.toBe("ok");
  });

  it("does not publish when the mutation fails", async () => {
    const publish = vi.fn(async () => undefined);
    await expect(
      publishAfterSuccess(async () => {
        throw new Error("FORBIDDEN");
      }, publish),
    ).rejects.toThrow("FORBIDDEN");
    expect(publish).not.toHaveBeenCalled();
  });
});
