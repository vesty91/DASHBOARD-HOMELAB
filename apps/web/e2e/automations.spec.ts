import { expect, test, type Page } from "@playwright/test";
import { expectPageA11y } from "./a11y";

const adminPassword = "correct horse battery staple";
const deniedPassword = "denied user is secure1";

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

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Connexion" }).click();
  await page.waitForURL(/\/(admin|forbidden|boards|automations)/);
}

async function ensureNtfyIntegration(page: Page) {
  await page.goto("/integrations");
  if (await page.getByRole("heading", { name: "ntfy-e2e-auto" }).count()) return;
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("ntfy");
  await page.getByLabel("Nom").fill("ntfy-e2e-auto");
  await page.getByLabel("URL de base").fill("https://ntfy.invalid");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/);
}

test("automations UI: list, create disabled, edit, enable, dry-run, manual run, history, deny", async ({
  page,
}) => {
  await loginAdmin(page);
  await ensureNtfyIntegration(page);

  await page.goto("/automations");
  await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
  await expectPageA11y(page);

  await page.getByRole("link", { name: "Nouvelle automation" }).click();
  await expect(page.getByRole("heading", { name: "Nouvelle automation" })).toBeVisible();

  await page.getByLabel("Nom").fill("E2E schedule alert");
  await page.getByLabel("Description").fill("Created by Playwright");
  await page.getByRole("button", { name: "Suivant" }).click();

  await page.getByLabel("Type de déclencheur").selectOption("schedule");
  await page.getByLabel("Mode").selectOption("interval");
  await page.getByLabel("Toutes les (minutes)").fill("30");
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();

  await page.getByLabel("Action autorisée").selectOption("ntfy.publish");
  await page.getByLabel("Intégration cible").selectOption({ label: "ntfy-e2e-auto (ntfy)" });
  await page.getByLabel("Topic").fill("homelab-e2e");
  await page.getByLabel("Message").fill("dry-run must not publish");
  await page.getByRole("button", { name: "Suivant" }).click();

  await page.getByLabel("Cooldown (secondes)").fill("120");
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByText("État initial")).toBeVisible();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Enregistrer (désactivée)" }).click();

  await expect(page).toHaveURL(/\/automations\/[0-9a-f-]{36}/i);
  await expect(page.getByText("Désactivée")).toBeVisible();

  await page.getByLabel("Nom").fill("E2E schedule alert edited");
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page.getByText("Automation mise à jour.")).toBeVisible();

  await page.getByRole("button", { name: "Activer" }).click();
  await expect(page.getByText("Automation activée.")).toBeVisible();

  const outbound: string[] = [];
  page.on("request", (request) => {
    if (/ntfy\.invalid/i.test(request.url())) outbound.push(request.url());
  });

  await page.getByRole("button", { name: "Dry-run" }).click();
  await expect(page.getByText(/Dry-run :/)).toBeVisible();
  await expect(
    page.getByText(/S’exécuterait|Serait ignoré|Serait refusé|would-(run|skip|deny)/),
  ).toBeVisible();
  expect(outbound).toEqual([]);

  await page.getByRole("button", { name: "Exécuter" }).click();
  await expect(page.getByText(/Exécution manuelle :/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible();
  await expect(page.locator("table.ui-table tbody tr").first()).toBeVisible();

  await page.getByRole("button", { name: "Désactiver" }).click();
  await expect(page.getByText("Automation désactivée.")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/automations");
  await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expectPageA11y(page);

  const deniedUser = `auto-denied-${Date.now().toString(36)}`;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/admin/users");
  await page.getByLabel("Identifiant").fill(deniedUser);
  await page.getByLabel("Nom affiché").fill("Automation Denied");
  await page.getByLabel("Mot de passe initial").fill(deniedPassword);
  await page.getByLabel("Rôle").selectOption("ADMIN");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText(deniedUser)).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Administrator" }).click();
  await page.getByRole("menuitem", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, deniedUser, deniedPassword);
  await page.goto("/automations");
  await expect(page).toHaveURL(/\/forbidden/);
});
