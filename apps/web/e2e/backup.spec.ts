import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const adminPassword = "correct horse battery staple";

test.setTimeout(180_000);

async function loginAdmin(page: Page) {
  await page.goto("/setup");
  if (/\/setup$/.test(page.url())) {
    await page.getByLabel("Identifiant").fill("Vesty");
    await page.getByLabel("Nom affiché").fill("Administrator");
    await page.getByLabel("Mot de passe").fill(adminPassword);
    await page.getByRole("button", { name: "Initialiser" }).click();
    await expect(page).toHaveURL(/\/login/);
  }
  if (!/\/login/.test(page.url())) await page.goto("/login");
  await page.getByLabel("Identifiant").fill("Vesty");
  await page.getByLabel("Mot de passe").fill(adminPassword);
  await page.getByRole("button", { name: "Connexion" }).click();
  await expect(page).toHaveURL(/\/(admin|boards)/);
}

test("exports a versioned backup and rejects an invalid file before mutation", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin");
  await page.getByRole("link", { name: "Backup" }).click();
  await expect(page.getByRole("heading", { name: "Backup" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le backup" }).click();
  const download = await downloadPromise;
  const directory = await mkdtemp(join(tmpdir(), "homarre-backup-"));
  const archivePath = join(directory, download.suggestedFilename());
  await download.saveAs(archivePath);
  const archive = JSON.parse(await readFile(archivePath, "utf8")) as {
    manifest?: { format?: string; formatVersion?: number; schemaVersion?: number };
  };
  expect(archive.manifest?.format).toBe("homelab-dashboard-backup");
  expect(archive.manifest?.formatVersion).toBe(1);
  expect(archive.manifest?.schemaVersion).toBe(7);
  await expect(page.getByText(/Manifest homelab-dashboard-backup v1/)).toBeVisible();

  const invalidPath = join(directory, "invalid.json");
  await writeFile(invalidPath, JSON.stringify({ not: "a-backup" }));
  await page.getByLabel("Archive de backup").setInputFiles(invalidPath);
  await expect(page.getByText("Fichier de backup invalide.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restaurer cette archive" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Backup" })).toBeVisible();
});
