import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { BackupArchive } from "@dashboard/backup";

export function backupPersistDirectory(): string {
  return process.env.BACKUP_DIR ?? join(process.cwd(), "appdata", "backups");
}

export async function persistPreRestoreArchive(archive: BackupArchive): Promise<void> {
  const directory = backupPersistDirectory();
  await mkdir(directory, { recursive: true });
  const stamp = archive.manifest.createdAt.replaceAll(":", "-").replaceAll(".", "-");
  const target = join(directory, `pre-restore-${stamp}-${randomUUID().slice(0, 8)}.json`);
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(archive), { encoding: "utf8" });
  await rename(temp, target);
}
