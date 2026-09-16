import { readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
await rm(new URL("../.e2e-auth.sqlite", import.meta.url), { force: true });
const database = new DatabaseSync(fileURLToPath(new URL("../.e2e-auth.sqlite", import.meta.url)));
try {
  database.exec("PRAGMA foreign_keys=ON");
  for (const name of [
    "0000_last_spyke.sql",
    "0001_sharp_doomsday.sql",
    "0002_wooden_callisto.sql",
    "0003_loud_titanium_man.sql",
    "0004_green_tenebrous.sql",
    "0005_wandering_mac_gargan.sql",
    "0006_exotic_sugar_man.sql",
    "0007_dashing_smasher.sql",
    "0008_reflective_norman_osborn.sql",
    "0009_flimsy_arachne.sql",
    "0010_many_yellowjacket.sql",
    "0011_normal_mac_gargan.sql",
    "0012_tranquil_mindworm.sql",
  ])
    database.exec(
      await readFile(
        new URL(`../../../packages/db/drizzle/sqlite/${name}`, import.meta.url),
        "utf8",
      ),
    );
} finally {
  database.close();
}
