import { expect, test, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const databasePath = resolve(process.cwd(), ".e2e-auth.sqlite");
test.setTimeout(240_000);

async function loginAdmin(page: Page) {
  await page.goto("/setup");
  if (/\/setup$/.test(page.url())) {
    await page.getByLabel("Identifiant").fill("Vesty");
    await page.getByLabel("Nom affiché").fill("Administrator");
    await page.getByLabel("Mot de passe").fill("correct horse battery staple");
    await page.getByRole("button", { name: "Initialiser" }).click();
    await expect(page).toHaveURL(/\/login/);
  }
  if (!/\/login/.test(page.url())) await page.goto("/login");
  await page.getByLabel("Identifiant").fill("Vesty");
  await page.getByLabel("Mot de passe").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Connexion" }).click();
  await expect(page).toHaveURL(/\/(admin|boards)/);
  await expect(page.getByRole("button", { name: "Administrator" })).toBeVisible();
}

async function releaseGridDrag(page: Page) {
  await page.mouse.up();
  await expect(page.locator(".grid-stack-placeholder")).toHaveCount(0);
}

function openE2eDatabase() {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000;");
  return database;
}

function boardRevision(slug: string) {
  const database = openE2eDatabase();
  try {
    return Number(database.prepare("SELECT revision FROM boards WHERE slug=?").get(slug)?.revision);
  } finally {
    database.close();
  }
}

test("widget engine clock, bookmarks, app tile, publicSafe and coordinator", async ({
  page,
  context,
}) => {
  await loginAdmin(page);
  await page.goto("/boards");
  await page.getByRole("button", { name: "Nouveau board" }).click();
  await page.getByRole("dialog").getByLabel("Nom").fill("Phase 6 Widgets");
  await page.getByRole("dialog").getByLabel("Slug").fill("phase-6-widgets");
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await expect(page).toHaveURL(/\/boards\/phase-6-widgets\/edit/);

  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  await page.getByRole("button", { name: "Ajouter Horloge" }).click();
  await expect(page.getByText("Horloge").first()).toBeVisible();
  await page.getByRole("button", { name: "Configurer" }).click();
  await page.getByLabel("Fuseau horaire").selectOption("Europe/Paris");
  await page.getByRole("button", { name: "Enregistrer la configuration" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-clock-timezone='Europe/Paris']")).toBeVisible();

  const clock = page.locator(".grid-stack-item").first();
  const box = await clock.boundingBox();
  if (!box) throw new Error("Clock was not rendered");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2, { steps: 8 });
  await releaseGridDrag(page);
  await page.getByRole("button", { name: "Mobile" }).click();
  await expect.poll(() => boardRevision("phase-6-widgets")).toBeGreaterThan(2);
  await page.getByRole("button", { name: "Desktop" }).click();
  await page.reload();
  await expect(page.locator("[data-clock-timezone='Europe/Paris']")).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/boards/phase-6-widgets");
  await expect(page.locator(".board-read-grid")).toHaveAttribute("data-breakpoint", "desktop");
  const desktopX = Number(await page.locator("[data-item-id]").getAttribute("data-x"));

  await page.goto("/boards/phase-6-widgets/edit");
  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  await page.getByRole("button", { name: "Ajouter Signets" }).click();
  await page.getByRole("button", { name: "Configurer" }).nth(1).click();
  await page.getByRole("button", { name: "Ajouter un lien" }).click();
  await page.getByRole("group", { name: "Lien 1" }).getByLabel("Titre").fill("Docs");
  await page
    .getByRole("group", { name: "Lien 1" })
    .getByLabel("URL")
    .fill("https://example.com/docs");
  await page.getByRole("group", { name: "Lien 1" }).getByLabel("Ouverture").selectOption("new-tab");
  await page.getByRole("button", { name: "Ajouter un lien" }).click();
  await page.getByRole("group", { name: "Lien 2" }).getByLabel("Titre").fill("Status");
  await page
    .getByRole("group", { name: "Lien 2" })
    .getByLabel("URL")
    .fill("https://example.com/status");
  await page.getByRole("button", { name: "Enregistrer la configuration" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await page.reload();
  const docs = page.getByRole("link", { name: "Docs" });
  await expect(docs).toHaveAttribute("target", "_blank");
  await expect(docs).toHaveAttribute("rel", "noopener noreferrer");

  await page.goto("/apps");
  await page.getByRole("link", { name: "Ajouter une App" }).click();
  await page.getByLabel("Nom").fill("Widget App");
  await page.getByLabel("URL", { exact: true }).fill("http://192.168.1.20/");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: "Widget App" })).toBeVisible();

  await page.goto("/boards/phase-6-widgets/edit");
  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  await page.getByRole("button", { name: "Ajouter Tuile d'application" }).click();
  await page.getByLabel("Application").selectOption({ label: "Widget App" });
  await page.getByRole("button", { name: "Ajouter la tuile" }).click();
  await expect(page.getByRole("link", { name: "Widget App" })).toBeVisible();
  await expect(page.getByText("Vérification désactivée")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Widget App" })).toBeVisible();

  await page.getByRole("button", { name: "Configurer" }).first().click();
  await page.getByLabel("Fuseau horaire").selectOption("UTC");
  await page.getByRole("button", { name: "Enregistrer la configuration" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-clock-timezone='UTC']")).toBeVisible();

  await page.getByRole("button", { name: "Supprimer", exact: true }).first().click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: "Supprimer", exact: true }).first().click();
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await page.reload();

  await page.goto("/boards");
  await page.getByRole("button", { name: "Nouveau board" }).click();
  await page.getByRole("dialog").getByLabel("Nom").fill("Public Clock");
  await page.getByRole("dialog").getByLabel("Slug").fill("public-clock");
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  await page.getByRole("button", { name: "Ajouter Horloge" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  const clockItem = page.locator(".grid-stack-item").first();
  const clockBox = await clockItem.boundingBox();
  if (!clockBox) throw new Error("Public clock missing");
  await page.mouse.move(clockBox.x + clockBox.width / 2, clockBox.y + clockBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(clockBox.x + clockBox.width / 2 + 120, clockBox.y + clockBox.height / 2, {
    steps: 6,
  });
  await releaseGridDrag(page);
  await page.getByRole("button", { name: "Configurer" }).click();
  await page.getByLabel("Afficher les secondes").check();
  await page.getByRole("button", { name: "Enregistrer la configuration" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-clock-timezone]")).toBeVisible();

  await page.getByLabel("Visibilité").selectOption("public");
  await expect(page.getByLabel("Visibilité")).toHaveValue("public");
  await page.getByRole("button", { name: "Enregistrer les métadonnées" }).click();
  await expect(page.getByLabel("Visibilité")).toHaveValue("public");

  await page.goto("/boards/phase-6-widgets/edit");
  await expect(page.getByRole("heading", { name: "Modifier Phase 6 Widgets" })).toBeVisible();
  await page.getByLabel("Visibilité").selectOption("public");
  await page.getByRole("button", { name: "Enregistrer les métadonnées" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Public boards may only contain known public-safe widgets with valid configuration",
    }),
  ).toBeVisible();

  await context.clearCookies();
  await page.goto("/boards/public-clock");
  await expect(page.locator("[data-clock-timezone]")).toBeVisible();
  await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ajouter un widget" })).toHaveCount(0);

  await loginAdmin(page);
  await page.goto("/boards/public-clock/edit");
  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  await expect(page.getByRole("button", { name: "Ajouter Signets" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Ajouter Tuile d'application" })).toBeDisabled();
  expect(desktopX).toBeGreaterThanOrEqual(0);
});

test("shared revision coordinates layout, metadata and widget config", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/boards");
  await page.getByRole("button", { name: "Nouveau board" }).click();
  await page.getByRole("dialog").getByLabel("Nom").fill("Phase 6 Coordination");
  await page.getByRole("dialog").getByLabel("Slug").fill("phase-6-coordination");
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await expect(page).toHaveURL(/\/boards\/phase-6-coordination\/edit/);

  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  await page.getByRole("button", { name: "Ajouter Horloge" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();

  const clockItem = page.locator(".grid-stack-item").first();
  const origin = await clockItem.getAttribute("gs-x");
  const box = await clockItem.boundingBox();
  if (!box) throw new Error("Clock was not rendered");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2, { steps: 8 });
  await releaseGridDrag(page);
  await page.getByLabel("Nom").fill("Coordination Renamed");
  await page.getByLabel("Description").fill("Layout then metadata");
  await page.getByRole("button", { name: "Enregistrer les métadonnées" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await expect(page.getByText("Le board a été modifié ailleurs.")).toHaveCount(0);
  const movedX = await page.locator(".grid-stack-item").first().getAttribute("gs-x");
  await page.reload();
  await expect(page.getByLabel("Nom")).toHaveValue("Coordination Renamed");
  await expect(page.getByLabel("Description")).toHaveValue("Layout then metadata");
  await expect(page.locator(".grid-stack-item").first()).toHaveAttribute("gs-x", movedX ?? "");
  expect(movedX).not.toBe(origin);

  await page.getByLabel("Description").fill("Metadata then config");
  await page.getByRole("button", { name: "Enregistrer les métadonnées" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await page.getByRole("button", { name: "Configurer" }).click();
  await page.getByLabel("Fuseau horaire").selectOption("America/New_York");
  await page.getByRole("button", { name: "Enregistrer la configuration" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await expect(page.getByText("Le board a été modifié ailleurs.")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Description")).toHaveValue("Metadata then config");
  await expect(page.locator("[data-clock-timezone='America/New_York']")).toBeVisible();
});

test("bookmark validation does not freeze the editor", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/boards");
  await page.getByRole("button", { name: "Nouveau board" }).click();
  await page.getByRole("dialog").getByLabel("Nom").fill("Phase 6 Bookmarks Validation");
  await page.getByRole("dialog").getByLabel("Slug").fill("phase-6-bookmark-validation");
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await expect(page).toHaveURL(/\/boards\/phase-6-bookmark-validation\/edit/);

  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  await page.getByRole("button", { name: "Ajouter Signets" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await page.getByRole("button", { name: "Configurer" }).click();
  await page.getByRole("button", { name: "Ajouter un lien" }).click();
  await expect(page.getByRole("group", { name: "Lien 1" }).getByLabel("URL")).toHaveValue("");
  await page.getByRole("group", { name: "Lien 1" }).getByLabel("Titre").fill("Docs");
  await page.getByRole("group", { name: "Lien 1" }).getByLabel("URL").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Enregistrer la configuration" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unknown widget or invalid configuration" }),
  ).toBeVisible();
  await expect(page.getByText("Le board a été modifié ailleurs.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recharger le board" })).toHaveCount(0);
  await page
    .getByRole("group", { name: "Lien 1" })
    .getByLabel("URL")
    .fill("https://example.com/docs");
  await page.getByRole("button", { name: "Enregistrer la configuration" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await expect(page.getByText("Le board a été modifié ailleurs.")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("link", { name: "Docs" })).toHaveAttribute(
    "href",
    "https://example.com/docs",
  );
});
