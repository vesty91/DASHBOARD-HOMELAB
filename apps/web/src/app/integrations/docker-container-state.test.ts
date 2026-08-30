import { describe, expect, it } from "vitest";
import { isDockerStartableState } from "./docker-container-state";

describe("isDockerStartableState", () => {
  it.each(["created", "exited"])("allows start for %s", (state) => {
    expect(isDockerStartableState(state)).toBe(true);
  });

  it.each(["running", "paused", "restarting", "removing", "dead", "unknown"])(
    "hides start for %s",
    (state) => {
      expect(isDockerStartableState(state)).toBe(false);
    },
  );
});
