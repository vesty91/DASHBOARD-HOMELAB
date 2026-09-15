const SERVICES = ["web", "worker", "realtime", "migrate"];

export function buildReleaseBakeHcl({ tag, minor, major, sha, stable, registry }) {
  return (
    SERVICES.map((service) => {
      const tags = [`${registry}/${service}:${tag}`, `${registry}/${service}:sha-${sha}`];
      if (stable) {
        tags.push(
          `${registry}/${service}:${minor}`,
          `${registry}/${service}:${major}`,
          `${registry}/${service}:latest`,
        );
      }
      const quoted = tags.map((value) => `    "${value}"`).join(",\n");
      return `target "${service}" {\n  tags = [\n${quoted}\n  ]\n}`;
    }).join("\n\n") + "\n"
  );
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const invoked = process.argv[1]?.replaceAll("\\", "/").endsWith("write-release-bake.mjs");
if (invoked) {
  process.stdout.write(
    buildReleaseBakeHcl({
      tag: required("RELEASE_TAG"),
      minor: process.env.RELEASE_MINOR?.trim() || "",
      major: process.env.RELEASE_MAJOR?.trim() || "",
      sha: required("RELEASE_SHA"),
      stable: required("RELEASE_STABLE") === "true",
      registry: process.env.RELEASE_REGISTRY?.trim() || "ghcr.io/vesty91/dashboard-homelab",
    }),
  );
}
