import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { expectPageA11y } from "./a11y";

const databasePath = resolve(process.cwd(), ".e2e-auth.sqlite");
const adminPassword = "correct horse battery staple";
const otherPassword = "other user password secure";

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

async function logout(page: Page, displayName: string) {
  await page.getByRole("button", { name: displayName }).click();
  await page.getByRole("menuitem", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/login/);
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

function adminUserId(): string {
  const database = openE2eDatabase();
  try {
    const row = database.prepare("SELECT id FROM users WHERE username_canonical=?").get("vesty");
    if (!row?.id) throw new Error("Admin user missing");
    return String(row.id);
  } finally {
    database.close();
  }
}

function userIdByUsername(username: string): string {
  const database = openE2eDatabase();
  try {
    const row = database
      .prepare("SELECT id FROM users WHERE username_canonical=?")
      .get(username.toLowerCase());
    if (!row?.id) throw new Error(`User missing: ${username}`);
    return String(row.id);
  } finally {
    database.close();
  }
}

function seedAdminNotifications(titles: string[]): string[] {
  const userId = adminUserId();
  const database = openE2eDatabase();
  const ids: string[] = [];
  const now = Date.now();
  try {
    for (const [index, title] of titles.entries()) {
      const id = randomUUID();
      ids.push(id);
      database
        .prepare(
          `INSERT INTO notifications(
            id, user_id, category, severity, title, body, source_type,
            source_id, source_integration_id, dedup_key, destination_path,
            read_at, dismissed_at, expires_at, created_at, updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          userId,
          "system",
          index === 0 ? "error" : "info",
          title,
          `Body for ${title}`,
          "system",
          null,
          null,
          null,
          index === 0 ? "/incidents" : "https://evil.example/phish",
          null,
          null,
          null,
          now - index * 1000,
          now - index * 1000,
        );
    }
  } finally {
    database.close();
  }
  return ids;
}

function seedOtherUserNotification(otherUserId: string): void {
  const database = openE2eDatabase();
  const now = Date.now();
  try {
    database
      .prepare(
        `INSERT INTO notifications(
          id, user_id, category, severity, title, body, source_type,
          source_id, source_integration_id, dedup_key, destination_path,
          read_at, dismissed_at, expires_at, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        otherUserId,
        "system",
        "warning",
        "Private other user alert",
        "Should not appear for admin",
        "system",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        now,
        now,
      );
  } finally {
    database.close();
  }
}

function seedIncident(): { incidentId: string; integrationName: string } {
  const database = openE2eDatabase();
  const incidentId = randomUUID();
  const integrationId = randomUUID();
  const eventId = randomUUID();
  const now = Date.now();
  const openedAt = now - 90 * 60 * 1000;
  const integrationName = "E2E Monitor Target";
  try {
    database
      .prepare(
        `INSERT INTO integrations(
          id, type, name, base_url, enabled, config_json, status,
          last_checked_at, config_revision, created_by, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        integrationId,
        "ntfy",
        integrationName,
        "https://ntfy.invalid",
        1,
        "{}",
        "unavailable",
        now,
        1,
        null,
        now,
        now,
      );
    database
      .prepare(
        `INSERT INTO incidents(
          id, integration_id, kind, severity, status, opened_at, last_changed_at,
          resolved_at, opening_event_id, closing_event_id, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        incidentId,
        integrationId,
        "availability",
        "error",
        "open",
        openedAt,
        openedAt,
        null,
        `status:${integrationId}:unavailable:${new Date(openedAt).toISOString()}`,
        null,
        openedAt,
        openedAt,
      );
    database
      .prepare(
        `INSERT INTO incident_events(id, incident_id, event_type, summary, created_at)
         VALUES (?,?,?,?,?)`,
      )
      .run(eventId, incidentId, "opened", "ntfy became unavailable.", openedAt);
  } finally {
    database.close();
  }
  return { incidentId, integrationName };
}

test("notification center badge, actions, incidents, and isolation", async ({ page }) => {
  await loginAdmin(page);

  const notificationIds = seedAdminNotifications([
    "E2E unread critical",
    "E2E unread info",
    "E2E unread third",
  ]);
  const { incidentId, integrationName } = seedIncident();

  await page.goto("/boards");
  await expect(page.getByTestId("notification-bell")).toBeVisible();
  await expect(page.getByTestId("notification-unread-badge")).toHaveText("3");
  await expect(page.getByTestId("notification-unread-status")).toHaveText(
    "3 notifications non lues",
  );

  await page.getByTestId("notification-bell").click();
  const dialog = page.getByRole("dialog", { name: "Notifications" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "E2E unread critical" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Ouvrir" }).first()).toHaveAttribute(
    "href",
    "/incidents",
  );
  await expect(dialog.locator('a[href*="evil"]')).toHaveCount(0);

  await dialog.getByRole("button", { name: "Marquer lue" }).first().click();
  await expect(page.getByTestId("notification-unread-badge")).toHaveText("2", { timeout: 10_000 });

  await dialog.getByRole("button", { name: "Ignorer" }).nth(1).click();
  await expect(dialog.getByRole("heading", { name: "E2E unread info" })).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(page.getByTestId("notification-unread-badge")).toHaveText("1", { timeout: 10_000 });

  await dialog.getByTestId("notification-mark-all-read").click();
  await expect(page.getByTestId("notification-unread-badge")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("notification-unread-status")).toHaveText(
    "Aucune notification non lue",
  );

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Notifications" })).toHaveCount(0);

  await page.goto("/notifications");
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  await expectPageA11y(page);
  await expect(page.getByRole("heading", { name: "E2E unread critical" })).toBeVisible();
  await page.getByTestId(`notification-dismiss-${notificationIds[0]}`).click();
  await expect(page.getByTestId(`notification-page-item-${notificationIds[0]}`)).toHaveCount(0);

  await page.goto("/incidents");
  await expect(page.getByRole("heading", { level: 1, name: "Incidents" })).toBeVisible();
  await expect(page.getByText(integrationName)).toBeVisible();
  await expect(page.getByTestId(`incident-row-${incidentId}`)).toBeVisible();
  await expectPageA11y(page);
  await page.getByRole("link", { name: "Voir" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/incidents/${incidentId}`));
  await expect(page.getByTestId("incident-timeline")).toBeVisible();
  await expect(page.getByText("ntfy became unavailable.")).toBeVisible();
  await expectPageA11y(page);

  await createLocalUser(page, {
    username: "notifyother",
    password: otherPassword,
    role: "USER",
    displayName: "Notify Other",
  });
  seedOtherUserNotification(userIdByUsername("notifyother"));

  await page.goto("/notifications");
  await expect(page.getByText("Private other user alert")).toHaveCount(0);
  await page.getByTestId("notification-bell").click();
  await expect(page.getByRole("dialog").getByText("Private other user alert")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Notifications" })).toHaveCount(0);

  await logout(page, "Administrator");
});

test("notification center keyboard open and focus trap", async ({ page }) => {
  await loginAdmin(page);
  seedAdminNotifications(["Keyboard unread"]);
  await page.goto("/");
  const trigger = page.getByTestId("notification-bell");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Notifications" });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]');
      return Boolean(panel && document.activeElement && panel.contains(document.activeElement));
    });
    expect(inside).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
