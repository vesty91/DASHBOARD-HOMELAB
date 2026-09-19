import { expect, test } from "@playwright/test";

test("login shows Restor_Pc branding assets", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("img", { name: "Restor_Pc — Dashboard Homelab" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await expect(page.getByText("Accédez à votre dashboard Restor_Pc.")).toBeVisible();
  await page.getByLabel("Identifiant").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Mot de passe")).toBeFocused();
});

test("serves installable PWA manifest with original branding", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();
  const contentType = response.headers()["content-type"] ?? "";
  expect(contentType.length).toBeGreaterThan(0);
  const manifest = (await response.json()) as {
    name?: string;
    short_name?: string;
    icons?: Array<{ src: string; sizes: string; purpose?: string }>;
  };
  expect(manifest.name).toBe("Restor_Pc — Dashboard Homelab");
  expect(manifest.short_name).toBe("Restor_Pc");
  expect(JSON.stringify(manifest).toLowerCase()).not.toContain("homarr");
  expect(manifest.icons?.some((icon) => icon.src === "/icons/icon-192.png")).toBe(true);
  expect(manifest.icons?.some((icon) => icon.src === "/icons/icon-512.png")).toBe(true);
  expect(
    manifest.icons?.some(
      (icon) => icon.src === "/icons/icon-maskable-512.png" && icon.purpose === "maskable",
    ),
  ).toBe(true);

  for (const path of [
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
    "/branding/restor-pc-logo.png",
    "/branding/login-background.webp",
    "/offline.html",
    "/sw.js",
  ]) {
    const asset = await request.get(path);
    expect(asset.ok(), path).toBeTruthy();
  }
});

test("service worker registers and keeps Cache-Control fresh for sw/manifest", async ({
  page,
  request,
}) => {
  const swHeaders = (await request.get("/sw.js")).headers();
  const manifestHeaders = (await request.get("/manifest.webmanifest")).headers();
  expect(swHeaders["cache-control"] ?? "").toMatch(/no-cache|no-store|must-revalidate/i);
  expect(manifestHeaders["cache-control"] ?? "").toMatch(/no-cache|no-store|must-revalidate/i);

  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const current = await navigator.serviceWorker.getRegistration("/");
        const worker = current?.active ?? current?.waiting ?? current?.installing;
        return worker?.scriptURL ?? "";
      });
    })
    .toMatch(/\/sw\.js$/);

  const registration = await page.evaluate(async () => {
    const current = await navigator.serviceWorker.getRegistration("/");
    const worker = current?.active ?? current?.waiting ?? current?.installing;
    return {
      scope: current?.scope ?? "",
      scriptURL: worker?.scriptURL ?? "",
    };
  });
  expect(registration.scope).toMatch(/\/$/);
  expect(registration.scriptURL).toMatch(/\/sw\.js$/);
});

test("offline navigation falls back to the public offline shell", async ({ page, context }) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    return Boolean(registration?.active);
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const cache = await caches.open("homelab-shell-v1");
    const existing = await cache.match("/offline.html");
    if (!existing) {
      await cache.add("/offline.html");
    }
  });

  await context.setOffline(true);
  const response = await page.goto("/boards", { waitUntil: "domcontentloaded" });
  expect(response?.status() ?? 0).toBeGreaterThanOrEqual(200);
  await expect(page.getByRole("heading", { name: "Vous êtes hors ligne" })).toBeVisible();
  await expect(page.getByText(/Aucune donnée privée/i)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Homarr/i);
  await context.setOffline(false);
});

test("service worker does not cache sensitive API responses", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    return Boolean(registration?.active);
  });

  await page.evaluate(async () => {
    await fetch("/api/trpc/oidc.publicConfig", { method: "GET" }).catch(() => undefined);
    await fetch("/api/auth/session", { method: "GET" }).catch(() => undefined);
  });

  const cachedSensitive = await page.evaluate(async () => {
    const keys = await caches.keys();
    const sensitive: string[] = [];
    for (const key of keys) {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      for (const request of requests) {
        const url = request.url;
        if (
          url.includes("/api/") ||
          url.includes("/trpc") ||
          url.includes("/auth") ||
          url.includes("/notifications") ||
          url.includes("/automations") ||
          url.includes("/integrations") ||
          url.includes("/backup")
        ) {
          sensitive.push(url);
        }
      }
    }
    return sensitive;
  });

  expect(cachedSensitive).toEqual([]);
});

test("CSP still allows workers and optionally scopes manifests", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.ok()).toBeTruthy();
  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("worker-src 'self' blob:");
  expect(csp).toContain("manifest-src 'self'");
  // next dev allows unsafe-eval for React; production CSP forbids it.
  expect(csp).toContain("unsafe-eval");
});
