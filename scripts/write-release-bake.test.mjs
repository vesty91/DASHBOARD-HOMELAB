import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReleaseBakeHcl } from "./write-release-bake.mjs";

test("stable bake override uses one image reference per quoted tag", () => {
  const hcl = buildReleaseBakeHcl({
    tag: "1.0.0",
    minor: "1.0",
    major: "1",
    sha: "c2a526a16df6",
    stable: true,
    registry: "ghcr.io/vesty91/dashboard-homelab",
  });
  const quoted = [...hcl.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  for (const value of quoted) {
    assert.equal(value.includes(","), false, value);
  }
  assert.ok(quoted.includes("ghcr.io/vesty91/dashboard-homelab/web:1.0.0"));
  assert.ok(quoted.includes("ghcr.io/vesty91/dashboard-homelab/web:latest"));
  assert.ok(quoted.includes("ghcr.io/vesty91/dashboard-homelab/migrate:1"));
});

test("prerelease bake override omits latest and floating major/minor", () => {
  const hcl = buildReleaseBakeHcl({
    tag: "1.0.1-rc.1",
    minor: "1.0.1-rc",
    major: "1",
    sha: "deadbeef",
    stable: false,
    registry: "ghcr.io/vesty91/dashboard-homelab",
  });
  assert.equal(hcl.includes(":latest"), false);
  assert.equal(hcl.includes("migrate:1.0.1-rc.1"), true);
  assert.equal(hcl.includes('migrate:1"'), false);
});
