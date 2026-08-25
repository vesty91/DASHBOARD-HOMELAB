import { readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
await rm(new URL("../.e2e-auth.sqlite", import.meta.url), { force: true });
const database = new DatabaseSync(fileURLToPath(new URL("../.e2e-auth.sqlite", import.meta.url)));
try {
  database.exec("PRAGMA foreign_keys=ON");
  for (const name of ["0000_last_spyke.sql", "0001_sharp_doomsday.sql"])
    database.exec(
      await readFile(
        new URL(`../../../packages/db/drizzle/sqlite/${name}`, import.meta.url),
        "utf8",
      ),
    );
} finally {
  database.close();
}
