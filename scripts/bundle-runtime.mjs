import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "bundle",
  legalComments: "none",
  external: ["pg", "pg-native", "argon2"],
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
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
