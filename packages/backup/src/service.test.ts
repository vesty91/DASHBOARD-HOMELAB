import { describe, expect, it, vi } from "vitest";
import { BackupError, buildArchive, createBackupService, emptyBackupTables } from "./index";

describe("backup service", () => {
  it("validates without mutating and requires confirm before restore", async () => {
    const tables = emptyBackupTables();
    tables.server_settings = [
      {
        id: "global",
        schemaVersion: 2,
        instanceName: null,
        onboardingCompleted: false,
        createdAt: "2026-09-14T12:00:00.000Z",
        updatedAt: "2026-09-14T12:00:00.000Z",
      },
    ];
    const archive = buildArchive(tables, "2026-09-14T12:00:00.000Z");
    const store = {
      exportSnapshot: vi.fn(async () => tables),
      replaceSnapshot: vi.fn(async () => undefined),
    };
    const afterCommit = vi.fn();
    const service = createBackupService({ store, afterCommit });
    const preview = await service.validate(archive);
    expect(preview.compatible).toBe(true);
    expect(store.replaceSnapshot).not.toHaveBeenCalled();
    await expect(service.restore(archive, false)).rejects.toMatchObject({
      code: "CONFIRM_REQUIRED",
    });
    expect(store.replaceSnapshot).not.toHaveBeenCalled();
    await expect(service.restore("{not-json", true)).rejects.toBeInstanceOf(BackupError);
    expect(store.replaceSnapshot).not.toHaveBeenCalled();
    const restored = await service.restore(archive, true);
    expect(restored.restored).toBe(true);
    expect(store.replaceSnapshot).toHaveBeenCalledTimes(1);
    expect(afterCommit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(restored.preview)).not.toMatch(/passwordHash|ciphertext/u);
  });
});
