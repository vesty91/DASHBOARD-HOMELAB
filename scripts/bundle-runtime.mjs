import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "bundle",
  legalComments: "none",
  external: ["pg", "pg-native"],
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["apps/worker/src/main.ts"],
    outfile: "dist/worker.mjs",
  }),
  build({
    ...shared,
    entryPoints: ["apps/realtime/src/main.ts"],
    outfile: "dist/realtime.mjs",
  }),
  build({
    ...shared,
    entryPoints: ["packages/db/src/migrate.ts"],
    outfile: "dist/migrate.mjs",
  }),
]);

console.log("bundled worker, realtime, and migrate runtimes");
