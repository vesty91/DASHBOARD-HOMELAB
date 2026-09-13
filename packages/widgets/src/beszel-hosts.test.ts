import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  BESZEL_HOSTS_UNSET_INTEGRATION_ID,
  beszelHostsConfigSchema,
  beszelHostsContract,
} from "./beszel-hosts";

describe("beszel-hosts widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(beszelHostsContract.publicSafe).toBe(false);
    expect(beszelHostsContract.id).toBe("beszel-hosts");
    assertWidgetContract(beszelHostsContract);
    expect(beszelHostsConfigSchema.parse(beszelHostsContract.defaultConfig)).toEqual({
      integrationId: BESZEL_HOSTS_UNSET_INTEGRATION_ID,
    });
  });
});
