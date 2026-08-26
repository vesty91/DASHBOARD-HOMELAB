import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
const databasePath = resolve(process.cwd(), ".e2e-auth.sqlite");
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
        0,
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
  await page.getByRole("button", { name: "Mobile" }).click();
  await expect(page.getByText("Fixture item")).toBeVisible();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Modifier Phase 4 Board" })).toBeVisible();

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

  await context.clearCookies();
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login/);
});
