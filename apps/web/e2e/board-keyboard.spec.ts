import { expect, test, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expectPageA11y } from "./a11y";

const databasePath = resolve(process.cwd(), ".e2e-auth.sqlite");
const adminPassword = "correct horse battery staple";
const viewerPassword = "keyboard viewer is secure";

test.setTimeout(180_000);

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

function desktopPlacement(slug: string) {
  const database = openE2eDatabase();
  try {
    const row = database
      .prepare(
        `SELECT il.x AS x, il.w AS w
         FROM item_layouts il
         JOIN layouts l ON l.id = il.layout_id
         JOIN boards b ON b.id = l.board_id
         WHERE b.slug = ? AND l.breakpoint = 'desktop'`,
      )
      .get(slug);
    return { x: Number(row?.x), w: Number(row?.w) };
  } finally {
    database.close();
  }
}

function grantUserBoardPermission(slug: string, username: string, permission: string) {
  const database = openE2eDatabase();
  try {
    const board = database.prepare("SELECT id FROM boards WHERE slug=?").get(slug);
    const user = database
      .prepare("SELECT id FROM users WHERE username_canonical=?")
      .get(username.toLowerCase());
    if (!board?.id || !user?.id) throw new Error(`Missing board or user for ${slug}/${username}`);
    database
      .prepare("INSERT INTO board_user_permissions(board_id, user_id, permission) VALUES(?,?,?)")
      .run(String(board.id), String(user.id), permission);
  } finally {
    database.close();
  }
}

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
  await expect(page.getByRole("button", { name: "Administrator" })).toBeVisible();
}

async function createKeyboardBoard(page: Page, slug: string) {
  await page.goto("/boards");
  await page.getByRole("button", { name: "Nouveau board" }).click();
  await page.getByRole("dialog").getByLabel("Nom").fill(`Keyboard ${slug}`);
  await page.getByRole("dialog").getByLabel("Slug").fill(slug);
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await expect(page).toHaveURL(new RegExp(`/boards/${slug}/edit`));
  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  await page.getByRole("button", { name: "Ajouter Horloge" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await expect(page.locator(".grid-stack-item").first()).toBeVisible();
  await expect(page.locator(".grid-stack.board-editing")).toHaveAttribute(
    "data-grid-ready",
    "true",
  );
}

test("keyboard navigation can select, move, save, configure and delete a widget", async ({
  page,
}) => {
  await loginAdmin(page);
  const slug = `keyboard-board-${randomUUID().slice(0, 8)}`;
  await createKeyboardBoard(page, slug);

  const item = page.locator(".grid-stack-item").first();
  const content = item.locator(".grid-stack-item-content");
  await content.focus();
  await expect(content).toBeFocused();
  await expect(content).toHaveAttribute("data-selected", "true");

  const toolbar = page.getByRole("toolbar", { name: "Actions du widget sélectionné" });
  await expect(toolbar).toBeVisible();

  const originX = await item.getAttribute("gs-x");
  const originW = await item.getAttribute("gs-w");
  const revisionBeforeMove = boardRevision(slug);

  await toolbar.getByRole("button", { name: "Déplacer" }).click();
  await expect(toolbar.getByRole("button", { name: "Déplacer" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#board-keyboard-hint")).toContainText("Mode déplacement");
  await expect(content).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(item).not.toHaveAttribute("gs-x", originX ?? "");
  await expect(page.locator("#board-keyboard-live")).toContainText(/Widget déplacé colonne/);
  await expect.poll(() => boardRevision(slug)).toBeGreaterThan(revisionBeforeMove);
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await expect(content).toBeFocused();

  await toolbar.getByRole("button", { name: "Redimensionner" }).click();
  await expect(toolbar.getByRole("button", { name: "Redimensionner" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#board-keyboard-hint")).toContainText("Mode redimensionnement");
  await page.keyboard.press("ArrowRight");
  await expect(item).not.toHaveAttribute("gs-w", originW ?? "");
  await expect(page.locator("#board-keyboard-live")).toContainText(/Widget redimensionné/);
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await expect(content).toBeFocused();
  const movedX = Number(await item.getAttribute("gs-x"));
  const resizedW = Number(await item.getAttribute("gs-w"));
  await expect.poll(() => desktopPlacement(slug)).toEqual({ x: movedX, w: resizedW });

  await item.getByRole("button", { name: "Configurer" }).click();
  await expect(page.getByRole("heading", { name: "Configurer le widget" })).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("heading", { name: "Configurer le widget" })).toHaveCount(0);

  await toolbar.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Supprimer ce widget ?" })).toBeVisible();
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.locator(".grid-stack-item")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ajouter un widget" })).toBeFocused();

  await page.reload();
  await expect(page.locator(".grid-stack.board-editing")).toHaveAttribute(
    "data-grid-ready",
    "true",
  );
  await expect(page.locator(".grid-stack-item")).toHaveCount(0);
});

test("keyboard layout changes persist after reload", async ({ page }) => {
  await loginAdmin(page);
  const slug = `keyboard-persist-${randomUUID().slice(0, 8)}`;
  await createKeyboardBoard(page, slug);
  const item = page.locator(".grid-stack-item").first();
  const content = item.locator(".grid-stack-item-content");
  await content.focus();
  const toolbar = page.getByRole("toolbar", { name: "Actions du widget sélectionné" });
  await toolbar.getByRole("button", { name: "Déplacer" }).click();
  await expect(toolbar.getByRole("button", { name: "Déplacer" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  const movedX = await item.getAttribute("gs-x");
  await toolbar.getByRole("button", { name: "Redimensionner" }).click();
  await expect(toolbar.getByRole("button", { name: "Redimensionner" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  const resizedW = await item.getAttribute("gs-w");
  await page.reload();
  await expect(page.locator(".grid-stack.board-editing")).toHaveAttribute(
    "data-grid-ready",
    "true",
  );
  await expect(page.locator(".grid-stack-item").first()).toHaveAttribute("gs-x", movedX ?? "");
  await expect(page.locator(".grid-stack-item").first()).toHaveAttribute("gs-w", resizedW ?? "");
});

test("a viewer cannot use keyboard board edit actions", async ({ page }) => {
  await loginAdmin(page);
  const suffix = randomUUID().slice(0, 8);
  const slug = `keyboard-acl-${suffix}`;
  const username = `kb-viewer-${suffix}`;
  await page.goto("/boards");
  await page.getByRole("button", { name: "Nouveau board" }).click();
  await page.getByRole("dialog").getByLabel("Nom").fill("Keyboard ACL Board");
  await page.getByRole("dialog").getByLabel("Slug").fill(slug);
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await expect(page).toHaveURL(new RegExp(`/boards/${slug}/edit`));
  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  await page.getByRole("button", { name: "Ajouter Horloge" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();

  await page.goto("/admin/users");
  await page.getByPlaceholder("Identifiant").fill(username);
  await page.getByPlaceholder("Nom affiché").fill("Keyboard Viewer");
  await page.getByPlaceholder("Mot de passe initial").fill(viewerPassword);
  await page.getByLabel("Rôle").selectOption("VIEWER");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByRole("row", { name: new RegExp(username) })).toContainText("Actif");
  grantUserBoardPermission(slug, username, "board.view");

  await page.getByRole("button", { name: "Administrator" }).click();
  await page.getByRole("menuitem", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill(viewerPassword);
  await page.getByRole("button", { name: "Connexion" }).click();
  await page.waitForURL(/\/(admin|forbidden|boards)/);

  await page.goto(`/boards/${slug}`);
  await expect(page.getByRole("heading", { name: "Keyboard ACL Board" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Déplacer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Redimensionner" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Configurer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Supprimer" })).toHaveCount(0);
  await expectPageA11y(page);

  await page.goto(`/boards/${slug}/edit`);
  await expect(page).toHaveURL(/\/forbidden/);
});
