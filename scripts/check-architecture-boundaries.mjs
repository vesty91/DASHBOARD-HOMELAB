import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const forbiddenDependencies = new Map([
  ["packages/db/package.json", new Set(["@dashboard/web", "@dashboard/widgets"])],
  [
    "packages/integrations/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/docker",
      "@dashboard/synology",
    ]),
  ],
  [
    "packages/secrets/package.json",
    new Set(["@dashboard/web", "next", "drizzle-orm", "@dashboard/db", "@dashboard/integrations"]),
  ],
  ["packages/apps/package.json", new Set(["@dashboard/web", "next", "drizzle-orm"])],
  [
    "packages/app-library/package.json",
    new Set([
      "@dashboard/web",
      "@dashboard/api",
      "@dashboard/db",
      "@dashboard/integrations",
      "@dashboard/docker",
      "@dashboard/synology",
      "next",
      "react",
      "drizzle-orm",
    ]),
  ],
  ["packages/monitoring/package.json", new Set(["@dashboard/web", "next"])],
  ["packages/shared/package.json", new Set(["@dashboard/db", "@dashboard/widgets", "next"])],
  [
    "packages/widgets/package.json",
    new Set(["@dashboard/web", "next", "@dashboard/db", "@dashboard/boards"]),
  ],
  [
    "packages/docker/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "react",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/synology",
    ]),
  ],
  [
    "packages/synology/package.json",
    new Set([
      "@dashboard/web",
      "next",
      "react",
      "drizzle-orm",
      "@dashboard/db",
      "@dashboard/docker",
    ]),
  ],
]);

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const violations = [];

for (const [manifestPath, forbidden] of forbiddenDependencies) {
  const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));

  for (const field of dependencyFields) {
    const dependencies = manifest[field] ?? {};

    for (const dependency of forbidden) {
      if (Object.hasOwn(dependencies, dependency)) {
        violations.push(`${manifest.name}: ${field} must not contain ${dependency}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Architecture boundary violations:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries: valid");
}
