import { buildArchive, parseBackupArchive } from "./archive";
import { BackupError } from "./errors";
import { previewArchive, type BackupPreview } from "./preview";
import type { BackupArchive, BackupTables } from "./schema";

export interface BackupSnapshotStore {
  exportSnapshot(): Promise<BackupTables>;
  replaceSnapshot(tables: BackupTables): Promise<void>;
}

export interface BackupRestoreResult {
  restored: true;
  preview: BackupPreview;
  preRestore: BackupArchive;
}

export interface BackupService {
  exportArchive(): Promise<BackupArchive>;
  validate(input: unknown): Promise<BackupPreview>;
  restore(input: unknown, confirm: boolean): Promise<BackupRestoreResult>;
}

export interface BackupServiceDeps {
  store: BackupSnapshotStore;
  afterCommit?: () => Promise<void> | void;
}

async function emitBestEffort(task: () => Promise<void> | void): Promise<void> {
  try {
    await task();
  } catch (error) {
    void error;
    console.error(JSON.stringify({ msg: "backup_restore_side_effect_failed" }));
  }
}

export function createBackupService(deps: BackupServiceDeps): BackupService {
  return {
    async exportArchive() {
      return buildArchive(await deps.store.exportSnapshot());
    },
    async validate(input) {
      return previewArchive(parseBackupArchive(input));
    },
    async restore(input, confirm) {
      const incoming = parseBackupArchive(input);
      if (confirm !== true) {
        throw new BackupError("CONFIRM_REQUIRED", "Backup restore requires explicit confirmation");
      }
      const preRestore = buildArchive(await deps.store.exportSnapshot());
      try {
        await deps.store.replaceSnapshot(incoming.tables);
      } catch (error) {
        void error;
        throw new BackupError("RESTORE_FAILED", "Backup restore failed");
      }
      if (deps.afterCommit) await emitBestEffort(deps.afterCommit);
      return {
        restored: true,
        preview: previewArchive(incoming),
        preRestore,
      };
    },
  };
}
