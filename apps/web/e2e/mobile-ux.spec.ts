import { expect, test, type Page } from "@playwright/test";

const adminPassword = "correct horse battery staple";

const VIEWPORTS = [
  { width: 375, height: 812, label: "375x812" },
  { width: 390, height: 844, label: "390x844" },
  { width: 430, height: 932, label: "430x932" },
] as const;

test.setTimeout(180_000);

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
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
}

async function mockPushManager(page: Page) {
  await page.addInitScript(() => {
    const endpoint = "https://push.example/e2e-device";
    const fakeSubscription = {
      endpoint,
      expirationTime: null,
      options: { userVisibleOnly: true },
      getKey(name: string) {
        const bytes =
          name === "p256dh" ? new Uint8Array([1, 2, 3, 4]) : new Uint8Array([5, 6, 7, 8]);
        return bytes.buffer;
      },
      async unsubscribe() {
        return true;
      },
      toJSON() {
        return {
          endpoint,
          expirationTime: null,
          keys: { p256dh: "AQIDBA", auth: "BQYHCA" },
        };
      },
    };

    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: class {
        static permission: NotificationPermission = "granted";
        static async requestPermission() {
          this.permission = "granted";
          return "granted" as NotificationPermission;
        }
        constructor(public title: string) {}
      },
    });

    const pushManager = {
      async getSubscription() {
        return null;
      },
      async subscribe() {
        return fakeSubscription;
      },
      async permissionState() {
        return "granted" as PermissionState;
      },
    };

    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: function PushManager() {},
    });

    Object.defineProperty(Navigator.prototype, "serviceWorker", {
      configurable: true,
      get() {
        return {
          ready: Promise.resolve({
            pushManager,
            active: { scriptURL: "/sw.js" },
          }),
          async getRegistration() {
            return { pushManager, active: { scriptURL: "/sw.js" } };
          },
          async register() {
            return { pushManager, active: { scriptURL: "/sw.js" } };
          },
        };
      },
    });
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`mobile UX ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("login, shell menu, board, notifications, automations, integrations, push prefs", async ({
      page,
    }) => {
      await mockPushManager(page);

      await page.goto("/login");
      await expect(page.getByRole("heading", { name: /Connexion|Homelab/i })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await expect(page.getByRole("button", { name: /Installer/i })).toHaveCount(0);

      await loginAdmin(page);
      await assertNoHorizontalOverflow(page);

      await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
      await expect(page.locator("#navigation-principale")).toBeVisible();
      await expect(page.getByRole("link", { name: "Boards" })).toBeVisible();
      await page.getByRole("button", { name: "Fermer la navigation" }).first().click();
      await assertNoHorizontalOverflow(page);

      await page.goto("/boards");
      await expect(page.getByRole("heading", { name: /Boards/i })).toBeVisible();
      await expect(page.getByRole("button", { name: "Ouvrir la navigation" })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await page.getByTestId("notification-bell").click();
      await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
      await expect(page.getByTestId("notification-push-prefs-link")).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page
        .getByRole("dialog", { name: "Notifications" })
        .getByRole("button", { name: "Fermer", exact: true })
        .click();

      await page.goto("/automations");
      await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await page.goto("/integrations");
      await expect(page.getByRole("heading", { name: /Intégrations/i })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await page.goto("/account/security#push");
      await expect(page.getByTestId("push-preferences-panel")).toBeVisible();
      await expect(page.getByTestId("push-enable")).toBeVisible();
      await expect(page.getByTestId("push-disable-current")).toBeVisible();
      await expect(page.getByTestId("push-disable-all")).toBeVisible();
      await expect(page.getByRole("button", { name: /Installer l.?app|Install/i })).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
    });
  });
}
