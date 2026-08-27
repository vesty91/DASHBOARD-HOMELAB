import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
const databasePath = resolve(process.cwd(), ".e2e-auth.sqlite");
test.setTimeout(120_000);
test("onboarding, login, protected admin and logout", async ({ page, context }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/setup");
  await page.getByLabel("Identifiant").fill("Vesty");
  await page.getByLabel("Nom affiché").fill("Administrator");
  await page.getByLabel("Mot de passe").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Initialiser" }).click();
  await expect(page).toHaveURL(/\/login\?setup=complete/);
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Identifiant").fill("VESTY");
  await page.getByLabel("Mot de passe").fill("incorrect password");
  await page.getByRole("button", { name: "Connexion" }).click();
  await expect(page.getByText("Identifiant ou mot de passe invalide.")).toBeVisible();
  await page.getByLabel("Mot de passe").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Connexion" }).click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();

  await page.goto("/boards");
  await page.getByLabel("Nom").fill("Phase 4 Board");
  await page.getByLabel("Slug").fill("phase-4-board");
  await page.getByLabel("Description").fill("Persistent board engine");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page).toHaveURL(/\/boards\/phase-4-board\/edit/);
  await expect(page.getByRole("button", { name: "Desktop" })).toBeVisible();
  const fixtureDatabase = new DatabaseSync(databasePath);
  const board = fixtureDatabase.prepare("SELECT id FROM boards WHERE slug=?").get("phase-4-board");
  const layouts = fixtureDatabase
    .prepare("SELECT id,breakpoint FROM layouts WHERE board_id=?")
    .all(String(board?.id));
  const itemId = randomUUID();
  fixtureDatabase
    .prepare(
      "INSERT INTO items(id,board_id,widget_type,widget_version,title,created_at,updated_at) VALUES(?,?,?,1,?,?,?)",
    )
    .run(itemId, String(board?.id), "test.fixture", "Fixture item", Date.now(), Date.now());
  for (const layout of layouts)
    fixtureDatabase
      .prepare("INSERT INTO item_layouts(id,item_id,layout_id,x,y,w,h) VALUES(?,?,?,?,?,?,?)")
      .run(
        randomUUID(),
        itemId,
        String(layout.id),
        0,
        layout.breakpoint === "mobile" ? 5 : 0,
        layout.breakpoint === "mobile" ? 4 : 3,
        2,
      );
  fixtureDatabase.close();
  await page.reload();
  await expect(page.getByText("Fixture item")).toBeVisible();
  const item = page.locator(".grid-stack-item");
  const box = await item.boundingBox();
  if (!box) throw new Error("Grid fixture was not rendered");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Mobile" }).click();
  await expect
    .poll(() => {
      const database = new DatabaseSync(databasePath);
      try {
        return Number(
          database.prepare("SELECT revision FROM boards WHERE id=?").get(String(board?.id))
            ?.revision,
        );
      } finally {
        database.close();
      }
    })
    .toBeGreaterThan(1);
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await expect(page.getByText("Fixture item")).toBeVisible();
  const mobileBox = await item.boundingBox();
  if (!mobileBox) throw new Error("Mobile grid fixture was not rendered");
  await page.mouse.move(mobileBox.x + mobileBox.width / 2, mobileBox.y + mobileBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    mobileBox.x + mobileBox.width / 2,
    mobileBox.y + mobileBox.height / 2 + 100,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
  await page.getByRole("button", { name: "Desktop" }).click();
  await expect
    .poll(() => {
      const database = new DatabaseSync(databasePath);
      try {
        return Number(
          database.prepare("SELECT revision FROM boards WHERE id=?").get(String(board?.id))
            ?.revision,
        );
      } finally {
        database.close();
      }
    })
    .toBeGreaterThan(2);
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Modifier Phase 4 Board" })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/boards/phase-4-board");
  await expect(page.locator(".board-read-grid")).toHaveAttribute("data-breakpoint", "desktop");
  const desktopX = Number(await page.locator("[data-item-id]").getAttribute("data-x"));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".board-read-grid")).toHaveAttribute("data-breakpoint", "mobile");
  const mobileY = Number(await page.locator("[data-item-id]").getAttribute("data-y"));
  expect(desktopX).toBeGreaterThan(0);
  expect(mobileY).toBeGreaterThan(5);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/boards");
  await page.getByLabel("Nom").fill("Delete Me");
  await page.getByLabel("Slug").fill("delete-me");
  await page.getByRole("button", { name: "Créer" }).click();
  await page.getByRole("button", { name: "Supprimer le board" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  const deleteCount = () => {
    const database = new DatabaseSync(databasePath);
    try {
      return Number(
        database.prepare("SELECT count(*) count FROM boards WHERE slug='delete-me'").get()?.count,
      );
    } finally {
      database.close();
    }
  };
  expect(deleteCount()).toBe(1);
  await page.getByRole("button", { name: "Supprimer le board" }).click();
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page).toHaveURL(/\/boards$/);
  expect(deleteCount()).toBe(0);

  await page.goto("/apps");
  await page.getByRole("link", { name: "Ajouter une App" }).click();
  await page.getByLabel("Nom").fill("NAS Portal");
  await page.getByLabel("Description").fill("Persistent service catalog");
  await page.getByLabel("URL", { exact: true }).fill("http://192.168.1.5:5000/");
  await page.getByLabel("Couleur").fill("#336699");
  await page.getByLabel("Tags séparés par des virgules").fill("NAS, Storage");
  await page.getByLabel("Ouvrir dans").selectOption("same-tab");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole("heading", { name: "NAS Portal" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Persistent service catalog")).toBeVisible();
  await page.getByRole("link", { name: "Modifier" }).click();
  await page.getByLabel("Nom").fill("NAS Portal Updated");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: "NAS Portal Updated" })).toBeVisible();
  await page.getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("heading", { name: "NAS Portal Updated" })).toBeVisible();
  await page.getByRole("button", { name: "Supprimer" }).click();
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByRole("heading", { name: "NAS Portal Updated" })).not.toBeVisible();
  await page.getByRole("link", { name: "Ajouter une App" }).click();
  await page.getByLabel("Nom").fill("Viewer Visible App");
  await page.getByLabel("URL", { exact: true }).fill("https://example.com/");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  await page.goto("/admin/users");
  await page.getByPlaceholder("Identifiant").fill("viewer");
  await page.getByPlaceholder("Mot de passe initial").fill("viewer password is secure");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText("viewer — active")).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Identifiant").fill("viewer");
  await page.getByLabel("Mot de passe").fill("viewer password is secure");
  await page.getByRole("button", { name: "Connexion" }).click();
  await expect(page).toHaveURL(/\/forbidden/);
  for (const path of ["/admin/users", "/admin/groups"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/forbidden/);
  }
  await page.goto("/boards/phase-4-board/edit");
  await expect(page).toHaveURL(/\/forbidden/);
  await page.goto("/apps");
  await expect(page.getByRole("heading", { name: "Viewer Visible App" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ajouter une App" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Tester maintenant" })).not.toBeVisible();

  await context.clearCookies();
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login/);
});
