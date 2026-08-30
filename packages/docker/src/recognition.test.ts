import { describe, expect, it } from "vitest";
import { recognizeDockerImage } from "./recognition";

describe("Docker App Library recognition", () => {
  it("recognizes official and legacy images without inventing URLs", () => {
    expect(recognizeDockerImage("jellyfin/jellyfin:10.10.0")).toMatchObject({
      id: "jellyfin",
      name: "Jellyfin",
      lifecycleStatus: "active",
    });
    expect(recognizeDockerImage("ghcr.io/immich-app/immich-server:v1")).toMatchObject({
      id: "immich",
    });
    expect(recognizeDockerImage("portainer/portainer-ce:2")).toMatchObject({ id: "portainer" });
    expect(recognizeDockerImage("ghcr.io/seerr-team/seerr:latest")).toMatchObject({
      id: "seerr",
      lifecycleStatus: "active",
    });
    expect(recognizeDockerImage("fallenbagel/jellyseerr:2")).toMatchObject({
      id: "jellyseerr",
      lifecycleStatus: "legacy",
      replacedBy: "seerr",
      replacedByName: "Seerr",
    });
    const recognized = recognizeDockerImage("jellyfin/jellyfin");
    expect(JSON.stringify(recognized)).not.toMatch(/url|hostname|:8096/i);
  });

  it("does not match malware-style image names", () => {
    expect(recognizeDockerImage("my-jellyfin-malware")).toBeNull();
  });
});
