import { describe, expect, it } from "vitest";
import { createEnvKeyring, encryptSecret } from "@dashboard/secrets";
import { SYNOLOGY_OVERVIEW_CACHE_PREFIX, synologyOverviewCacheOperation } from "./cache-key";

const KEY = Buffer.alloc(32, 9).toString("base64");
const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";

describe("synologyOverviewCacheOperation", () => {
  it("changes when configRevision or encrypted secret material changes, never using plaintext", () => {
    const keyring = createEnvKeyring(KEY);
    if (!keyring) throw new Error("keyring");
    const password = encryptSecret(keyring, {
      integrationId: INTEGRATION_ID,
      key: "password",
      plaintext: "s3cret",
    });
    const nextPassword = encryptSecret(keyring, {
      integrationId: INTEGRATION_ID,
      key: "password",
      plaintext: "n3wpass",
    });
    const device = encryptSecret(keyring, {
      integrationId: INTEGRATION_ID,
      key: "deviceId",
      plaintext: "DID-SECRET",
    });
    const baseline = synologyOverviewCacheOperation(1, [{ key: "password", ...password }]);
    const same = synologyOverviewCacheOperation(1, [{ key: "password", ...password }]);
    const revised = synologyOverviewCacheOperation(2, [{ key: "password", ...password }]);
    const rotated = synologyOverviewCacheOperation(1, [{ key: "password", ...nextPassword }]);
    const refreshed = synologyOverviewCacheOperation(1, [{ key: "password", ...password }], 1);
    const enrolled = synologyOverviewCacheOperation(1, [
      { key: "deviceId", ...device },
      { key: "password", ...password },
    ]);
    const cleared = synologyOverviewCacheOperation(1, [{ key: "password", ...password }]);
    expect(baseline).toMatch(new RegExp(`^${SYNOLOGY_OVERVIEW_CACHE_PREFIX}:[a-f0-9]{64}$`, "u"));
    expect(same).toBe(baseline);
    expect(revised).not.toBe(baseline);
    expect(rotated).not.toBe(baseline);
    expect(refreshed).not.toBe(baseline);
    expect(enrolled).not.toBe(baseline);
    expect(cleared).toBe(baseline);
    const serialized = [baseline, revised, rotated, refreshed, enrolled].join("\n");
    expect(serialized).not.toMatch(/s3cret|n3wpass|DID-SECRET|password|deviceId/u);
  });
});
