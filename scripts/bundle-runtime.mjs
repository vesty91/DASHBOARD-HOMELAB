import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  packages: "bundle",
  legalComments: "none",
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["apps/worker/src/main.ts"],
    outfile: "dist/worker.cjs",
  }),
  build({
    ...shared,
    entryPoints: ["apps/realtime/src/main.ts"],
    outfile: "dist/realtime.cjs",
  }),
  build({
    ...shared,
    entryPoints: ["packages/db/src/migrate.ts"],
    outfile: "dist/migrate.cjs",
  }),
]);

console.log("bundled worker, realtime, and migrate runtimes");
