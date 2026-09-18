import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import lighthouse, { desktopConfig, generateReport } from "lighthouse";
import { chromium } from "@playwright/test";
import {
  evaluateByteWeight,
  evaluateLighthouseCategories,
  lighthouseByteWeightBudgetBytes,
  lighthouseCategoryBudgets,
} from "./lighthouse-budgets.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptsDir);
const webRoot = join(repoRoot, "apps", "web");
const reportsDir = join(repoRoot, "lighthouse-reports");
const sqlitePath = join(webRoot, ".lh-ci.sqlite");
const adminPassword = "correct horse battery staple";
const SQLITE_MIGRATIONS = [
  "0000_last_spyke.sql",
  "0001_sharp_doomsday.sql",
  "0002_wooden_callisto.sql",
  "0003_loud_titanium_man.sql",
  "0004_green_tenebrous.sql",
  "0005_wandering_mac_gargan.sql",
  "0006_exotic_sugar_man.sql",
  "0007_dashing_smasher.sql",
  "0008_reflective_norman_osborn.sql",
  "0009_flimsy_arachne.sql",
  "0010_many_yellowjacket.sql",
  "0011_normal_mac_gargan.sql",
  "0012_tranquil_mindworm.sql",
  "0013_mushy_captain_midlands.sql",
  "0014_boring_millenium_guard.sql",
  "0015_great_wendell_rand.sql",
];

function buildWebEnv(port) {
  return {
    ...process.env,
    NODE_ENV: "development",
    DB_DRIVER: "sqlite",
    DATABASE_URL: "./.lh-ci.sqlite",
    AUTH_SECRET: "phase-20-lighthouse-secret-value-at-least-32-ch",
    SECRET_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    APP_URL: `http://127.0.0.1:${port}`,
    PORT: String(port),
  };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to allocate a port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

async function prepareSqlite() {
  await rm(sqlitePath, { force: true });
  const database = new DatabaseSync(sqlitePath);
  try {
    database.exec("PRAGMA foreign_keys=ON");
    for (const name of SQLITE_MIGRATIONS) {
      database.exec(
        await readFile(join(repoRoot, "packages", "db", "drizzle", "sqlite", name), "utf8"),
      );
    }
  } finally {
    database.close();
  }
}

function startWeb(port, webEnv) {
  const nextBin = createRequire(join(webRoot, "package.json")).resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: webRoot,
    env: webEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout?.on("data", (chunk) => {
    if (process.env.LIGHTHOUSE_VERBOSE === "1") process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    if (process.env.LIGHTHOUSE_VERBOSE === "1") process.stderr.write(chunk);
  });
  return child;
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 90_000;
  let last = "no-response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health/live`, { redirect: "manual" });
      last = String(response.status);
      if (response.status === 200) return;
    } catch (error) {
      last = error instanceof Error ? error.message : "error";
    }
    await delay(400);
  }
  throw new Error(`lighthouse web server did not become ready (last: ${last})`);
}

/**
 * Compile cold Next routes before Lighthouse measures them.
 * /health/live readiness alone leaves `/` and `/setup` uncompiled.
 */
async function warmUpPages(baseUrl, paths) {
  for (const path of paths) {
    const deadline = Date.now() + 90_000;
    let last = "no-response";
    let ok = false;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
        last = String(response.status);
        if (response.status >= 200 && response.status < 500) {
          // Drain body so Next finishes streaming/compiling.
          await response.arrayBuffer();
          ok = true;
          break;
        }
      } catch (error) {
        last = error instanceof Error ? error.message : "error";
      }
      await delay(400);
    }
    if (!ok) {
      throw new Error(`lighthouse warm-up failed for ${path} (last: ${last})`);
    }
  }
}

async function launchChrome(debugPort) {
  const chromePath = chromium.executablePath();
  const child = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      `--remote-debugging-port=${debugPort}`,
      "--remote-debugging-address=127.0.0.1",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return child;
    } catch {
      await delay(200);
    }
  }
  child.kill();
  throw new Error("Chrome remote debugging port did not open");
}

async function audit(debugPort, url, cookieHeader) {
  const result = await lighthouse(
    url,
    {
      port: debugPort,
      hostname: "127.0.0.1",
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      ...(cookieHeader ? { extraHeaders: { Cookie: cookieHeader } } : {}),
    },
    desktopConfig,
  );
  if (!result?.lhr) throw new Error(`Lighthouse returned no result for ${url}`);
  return result;
}

function slugFor(label) {
  return label
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
}

async function writeReports(label, result) {
  const slug = slugFor(label);
  await writeFile(join(reportsDir, `${slug}.json`), JSON.stringify(result.lhr, null, 2), "utf8");
  await writeFile(join(reportsDir, `${slug}.html`), generateReport(result.lhr, "html"), "utf8");
}

function summarize(label, lhr) {
  const categories = {};
  for (const id of Object.keys(lighthouseCategoryBudgets)) {
    categories[id] = lhr.categories[id]?.score ?? null;
  }
  return {
    label,
    requestedUrl: lhr.requestedUrl,
    finalUrl: lhr.finalUrl,
    categories,
    totalByteWeight: lhr.audits["total-byte-weight"]?.numericValue ?? null,
  };
}

async function completeOnboarding(baseUrl) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/setup`, { waitUntil: "domcontentloaded" });
    if (/\/setup$/u.test(new URL(page.url()).pathname)) {
      await page.getByLabel("Identifiant").fill("Vesty");
      await page.getByLabel("Nom affiché").fill("Administrator");
      await page.getByLabel("Mot de passe").fill(adminPassword);
      await page.getByRole("button", { name: "Initialiser" }).click();
      await page.waitForURL(/\/login/u);
    }
  } finally {
    await browser.close();
  }
}

async function loginCookieHeader(baseUrl) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Identifiant").fill("Vesty");
    await page.getByLabel("Mot de passe").fill(adminPassword);
    await page.getByRole("button", { name: "Connexion" }).click();
    await page.waitForURL(/\/(admin|boards)/u);
    const cookies = await context.cookies();
    if (cookies.length === 0) throw new Error("login did not set a session cookie");
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  } finally {
    await browser.close();
  }
}

function stop(child) {
  if (!child?.pid || child.killed) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  child.kill("SIGTERM");
}

const web = { current: null };
const chrome = { current: null };

try {
  const port = Number(process.env.LIGHTHOUSE_PORT) || (await freePort());
  const baseUrl = `http://127.0.0.1:${port}`;
  const webEnv = buildWebEnv(port);

  await prepareSqlite();
  await mkdir(reportsDir, { recursive: true });
  web.current = startWeb(port, webEnv);
  await waitForServer(baseUrl);
  // Warm compile public routes before measuring — avoids cold-dev public-home flake.
  await warmUpPages(baseUrl, ["/", "/setup"]);
  const debugPort = await freePort();
  chrome.current = await launchChrome(debugPort);

  const runs = [];
  const publicHome = await audit(debugPort, `${baseUrl}/`);
  await writeReports("public-home", publicHome);
  runs.push(summarize("public-home", publicHome.lhr));

  const setup = await audit(debugPort, `${baseUrl}/setup`);
  await writeReports("setup", setup);
  runs.push(summarize("setup", setup.lhr));

  await completeOnboarding(baseUrl);

  const login = await audit(debugPort, `${baseUrl}/login`);
  await writeReports("login", login);
  runs.push(summarize("login", login.lhr));

  const cookieHeader = await loginCookieHeader(baseUrl);
  const boards = await audit(debugPort, `${baseUrl}/boards`, cookieHeader);
  await writeReports("boards", boards);
  runs.push(summarize("boards", boards.lhr));

  const failures = [];
  for (const run of runs) {
    const categories = {};
    for (const [id, score] of Object.entries(run.categories)) {
      categories[id] = { score };
    }
    for (const failure of evaluateLighthouseCategories(categories)) {
      failures.push({ page: run.label, ...failure });
    }
    const byteFailure = evaluateByteWeight(run.totalByteWeight);
    if (byteFailure) failures.push({ page: run.label, ...byteFailure });
  }

  const summary = {
    baseUrl,
    budgets: {
      categories: lighthouseCategoryBudgets,
      totalByteWeight: lighthouseByteWeightBudgetBytes,
    },
    runs,
    failures,
  };
  await writeFile(join(reportsDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    throw new Error(
      `Lighthouse budgets failed:\n${failures
        .map((failure) =>
          "minScore" in failure
            ? `${failure.page} ${failure.id}: ${failure.score} < ${failure.minScore}`
            : `${failure.page} ${failure.id}: ${failure.bytes} > ${failure.maxBytes}`,
        )
        .join("\n")}`,
    );
  }
  console.log("lighthouse budgets ok");
} finally {
  stop(chrome.current);
  stop(web.current);
}
