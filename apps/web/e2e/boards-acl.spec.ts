import { expect, test, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const databasePath = resolve(process.cwd(), ".e2e-auth.sqlite");
const adminPassword = "correct horse battery staple";
const editorPassword = "editor password is secure";
const groupPassword = "group editor is secure";
const viewerPassword = "acl viewer is secure";

test.setTimeout(180_000);

function openE2eDatabase() {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000;");
  return database;
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

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Connexion" }).click();
  await page.waitForURL(/\/(admin|forbidden|boards)/);
}

async function loginAsBoardUser(
  page: Page,
  username: string,
  password: string,
  displayName: string,
) {
  await login(page, username, password);
  await page.goto("/boards");
  await expect(page.getByRole("button", { name: displayName })).toBeVisible();
}

async function logout(page: Page, displayName: string) {
  await page.getByRole("button", { name: displayName }).click();
  await page.getByRole("menuitem", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/login/);
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

function grantGroupBoardPermission(slug: string, groupName: string, permission: string) {
  const database = openE2eDatabase();
  try {
    const board = database.prepare("SELECT id FROM boards WHERE slug=?").get(slug);
    const group = database.prepare("SELECT id FROM groups WHERE name=?").get(groupName);
    if (!board?.id || !group?.id)
      throw new Error(`Missing board or group for ${slug}/${groupName}`);
    database
      .prepare("INSERT INTO board_group_permissions(board_id, group_id, permission) VALUES(?,?,?)")
      .run(String(board.id), String(group.id), permission);
  } finally {
    database.close();
  }
}

async function createLocalUser(
  page: Page,
  input: { username: string; password: string; role: string; displayName: string },
) {
  await page.goto("/admin/users");
  await page.getByPlaceholder("Identifiant").fill(input.username);
  await page.getByPlaceholder("Nom affiché").fill(input.displayName);
  await page.getByPlaceholder("Mot de passe initial").fill(input.password);
  await page.getByLabel("Rôle").selectOption(input.role);
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByRole("row", { name: new RegExp(input.username) })).toContainText("Actif");
}

test("dialog focus stays trapped and restores to the trigger", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/boards");
  const trigger = page.getByRole("button", { name: "Nouveau board" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]');
      return Boolean(panel && document.activeElement && panel.contains(document.activeElement));
    });
    expect(inside).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("delegated board.edit ACL shows Modifier and opens the editor", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/boards");
  await page.getByRole("button", { name: "Nouveau board" }).click();
  await page.getByRole("dialog").getByLabel("Nom").fill("ACL Shared Board");
  await page.getByRole("dialog").getByLabel("Slug").fill("acl-shared");
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await expect(page).toHaveURL(/\/boards\/acl-shared\/edit/);

  await createLocalUser(page, {
    username: "delegated-editor",
    password: editorPassword,
    role: "EDITOR",
    displayName: "Delegated Editor",
  });
  await createLocalUser(page, {
    username: "group-editor",
    password: groupPassword,
    role: "USER",
    displayName: "Group Editor",
  });
  await createLocalUser(page, {
    username: "acl-viewer",
    password: viewerPassword,
    role: "VIEWER",
    displayName: "ACL Viewer",
  });

  await page.goto("/admin/groups");
  await page.getByPlaceholder("Nom").fill("Board Editors");
  await page.getByLabel("Rôle").selectOption("VIEWER");
  await page.getByLabel("Membre initial").selectOption({ label: "group-editor" });
  await page.getByRole("button", { name: "Créer le groupe" }).click();
  await expect(page.getByRole("cell", { name: "Board Editors" })).toBeVisible();

  grantUserBoardPermission("acl-shared", "delegated-editor", "board.edit");
  grantGroupBoardPermission("acl-shared", "Board Editors", "board.edit");
  grantUserBoardPermission("acl-shared", "acl-viewer", "board.view");

  await logout(page, "Administrator");
  await loginAsBoardUser(page, "delegated-editor", editorPassword, "Delegated Editor");

  const directCard = page.locator(".entity-card", { hasText: "ACL Shared Board" });
  await expect(directCard.getByRole("link", { name: "Modifier" })).toBeVisible();
  await page.goto("/boards/acl-shared");
  await expect(page.getByRole("link", { name: "Modifier" })).toBeVisible();
  await page.getByRole("link", { name: "Modifier" }).click();
  await expect(page).toHaveURL(/\/boards\/acl-shared\/edit/);
  await expect(page.getByRole("heading", { name: "Modifier ACL Shared Board" })).toBeVisible();

  await logout(page, "Delegated Editor");
  await loginAsBoardUser(page, "group-editor", groupPassword, "Group Editor");
  const groupCard = page.locator(".entity-card", { hasText: "ACL Shared Board" });
  await expect(groupCard.getByRole("link", { name: "Modifier" })).toBeVisible();
  await page.goto("/boards/acl-shared");
  await expect(page.getByRole("link", { name: "Modifier" })).toBeVisible();
  await page.goto("/boards/acl-shared/edit");
  await expect(page).toHaveURL(/\/boards\/acl-shared\/edit/);
  await expect(page.getByRole("heading", { name: "Modifier ACL Shared Board" })).toBeVisible();

  await logout(page, "Group Editor");
  await loginAsBoardUser(page, "acl-viewer", viewerPassword, "ACL Viewer");
  const viewerCard = page.locator(".entity-card", { hasText: "ACL Shared Board" });
  await expect(viewerCard.getByRole("link", { name: "Ouvrir" })).toBeVisible();
  await expect(viewerCard.getByRole("link", { name: "Modifier" })).toHaveCount(0);
  await page.goto("/boards/acl-shared");
  await expect(page.getByRole("heading", { name: "ACL Shared Board" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0);
  await page.goto("/boards/acl-shared/edit");
  await expect(page).toHaveURL(/\/forbidden/);
});
