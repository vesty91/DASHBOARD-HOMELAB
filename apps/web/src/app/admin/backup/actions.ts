"use server";

import { revalidatePath } from "next/cache";
import { requireServerPermission } from "@/lib/server/auth";
import { getBoardCaller } from "@/lib/server/board-api";

function invalidBackupMessage(): string {
  return "Fichier de backup invalide.";
}

export async function exportBackupAction() {
  await requireServerPermission("backup.manage");
  return (await getBoardCaller()).backup.export();
}

export async function validateBackupAction(archive: unknown) {
  await requireServerPermission("backup.manage");
  try {
    const preview = await (await getBoardCaller()).backup.validate({ archive });
    return { ok: true as const, preview };
  } catch (error) {
    void error;
    return { ok: false as const, message: invalidBackupMessage() };
  }
}

export async function restoreBackupAction(archive: unknown) {
  await requireServerPermission("backup.manage");
  try {
    const result = await (
      await getBoardCaller()
    ).backup.restore({
      archive,
      confirm: true,
    });
    revalidatePath("/admin/backup");
    return { ok: true as const, result };
  } catch (error) {
    void error;
    return { ok: false as const, message: invalidBackupMessage() };
  }
}
