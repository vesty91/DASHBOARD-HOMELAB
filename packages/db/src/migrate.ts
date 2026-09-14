import { runProductionMigrateCli } from "./migrate-cli";

try {
  await runProductionMigrateCli();
} catch (error) {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "UNKNOWN";
  console.error(JSON.stringify({ msg: "migrate_failed", service: "migrate", code }));
  process.exitCode = 1;
}
