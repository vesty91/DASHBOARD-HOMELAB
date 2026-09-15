import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  assertCsp,
  cookieFlagReport,
  isHttpsRedirect,
  missingSecurityHeaders,
  sessionCookieViolations,
} from "./https-proxy-smoke.assertions.mjs";

const composeFiles = ["compose.yaml", "compose.proxy.yaml", "compose.proxy.smoke.yaml"];
const project = process.env.HTTPS_SMOKE_COMPOSE_PROJECT || "dashboard-homelab-https-smoke";
const skipBuild = process.env.SKIP_BUILD === "1";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 180_000);
const httpPort = process.env.PROXY_HTTP_PORT || "18080";
const httpsPort = process.env.PROXY_HTTPS_PORT || "18443";
const dashboardHost = process.env.DASHBOARD_HOST || "127.0.0.1";
const publicOrigin = `https://${dashboardHost}:${httpsPort}`;
const publicUrl = new URL(publicOrigin);

const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: project,
  APP_URL: publicOrigin,
  AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(32).toString("hex"),
  SECRET_ENCRYPTION_KEY: process.env.SECRET_ENCRYPTION_KEY || randomBytes(32).toString("base64"),
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || randomBytes(18).toString("base64url"),
  POSTGRES_USER: process.env.POSTGRES_USER || "dashboard",
  POSTGRES_DB: process.env.POSTGRES_DB || "dashboard",
  APP_VERSION: process.env.APP_VERSION || "1.0.1",
  WEB_PORT: process.env.WEB_PORT || "3000",
  PROXY_HTTP_PORT: httpPort,
  PROXY_HTTPS_PORT: httpsPort,
  DASHBOARD_HOST: dashboardHost,
  CADDY_PUBLIC_ORIGIN: publicOrigin,
  CADDYFILE: process.env.CADDYFILE || "./deploy/Caddyfile.https-smoke",
};

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      env,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(new Error(`docker ${args.join(" ")} exited ${code}${stderr ? `\n${stderr}` : ""}`));
    });
  });
}

function composeArgs(args) {
  return [
    "compose",
    ...composeFiles.flatMap((file) => ["-f", file]),
    "--profile",
    "proxy",
    "--project-name",
    project,
    ...args,
  ];
}

function isIpHostname(hostname) {
  return hostname === "::1" || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname);
}

function compose(args, options) {
  if (skipBuild && args[0] === "up") {
    return run(composeArgs(["up", "--no-build", ...args.slice(1)]), options);
  }
  return run(composeArgs(args), options);
}

function request(url, options = {}) {
  const target = new URL(url);
  const isHttps = target.protocol === "https:";
  const headers = { ...(options.headers ?? {}) };
  const requestOptions = {
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: `${target.pathname}${target.search}`,
    method: options.method ?? "GET",
    headers,
  };
  if (isHttps) {
    if (!options.ca) {
      throw new Error("HTTPS smoke must pass the Caddy local CA; refusing unverified TLS");
    }
    requestOptions.ca = options.ca;
    requestOptions.rejectUnauthorized = true;
    if (!isIpHostname(target.hostname)) requestOptions.servername = target.hostname;
  }
  const lib = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(requestOptions, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function websocketUpgrade({ ca, origin, path }) {
  const key = randomBytes(16).toString("base64");
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: publicUrl.hostname,
      port: publicUrl.port || 443,
      path,
      method: "GET",
      ca,
      rejectUnauthorized: true,
      ...(isIpHostname(publicUrl.hostname) ? {} : { servername: publicUrl.hostname }),
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        Origin: origin,
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": key,
      },
    });
    req.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve({ status: 101, headers: response.headers });
    });
    req.on("response", (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.setTimeout(8_000, () => {
      req.destroy(new Error("websocket upgrade timeout"));
    });
    req.end();
  });
}

function generateSmokeCertificates() {
  const dir = mkdtempSync(join(tmpdir(), "dashboard-https-smoke-"));
  const cnf = join(dir, "openssl.cnf");
  const alt = isIpHostname(dashboardHost)
    ? `IP.1 = ${dashboardHost}\nDNS.1 = localhost\n`
    : `DNS.1 = ${dashboardHost}\nDNS.2 = localhost\n`;
  writeFileSync(
    cnf,
    `[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = ${dashboardHost}
[v3]
subjectAltName = @alt
basicConstraints = CA:TRUE
[alt]
${alt}`,
  );
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-days",
      "2",
      "-nodes",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
      "-config",
      cnf,
    ],
    { env: { ...process.env, OPENSSL_CONF: cnf }, stdio: "pipe" },
  );
  chmodSync(dir, 0o755);
  chmodSync(join(dir, "cert.pem"), 0o644);
  chmodSync(join(dir, "key.pem"), 0o644);
  return dir;
}

async function waitFor(url, expectedStatus, label, ca) {
  const deadline = Date.now() + timeoutMs;
  let last = "no-response";
  while (Date.now() < deadline) {
    try {
      const response = await request(url, ca ? { ca } : {});
      last = String(response.status);
      if (response.status === expectedStatus) {
        if (/DATABASE_URL|REDIS_URL|AUTH_SECRET|postgresql:\/\//iu.test(response.body)) {
          throw new Error(`${label} leaked a secret`);
        }
        return JSON.parse(response.body);
      }
    } catch (error) {
      last = error instanceof Error ? error.message : "error";
    }
    await delay(2_000);
  }
  throw new Error(`${label} did not reach HTTP ${expectedStatus} (last: ${last})`);
}

function assertNoSecrets(body, label) {
  if (/DATABASE_URL|REDIS_URL|AUTH_SECRET|postgresql:\/\//iu.test(body)) {
    throw new Error(`${label} leaked a secret`);
  }
}

function assertHttpsHeaders(headers, label) {
  const missing = missingSecurityHeaders(headers, { https: true });
  if (missing.length > 0) {
    throw new Error(`${label} missing headers: ${missing.join(", ")}`);
  }
  const csp = headers["content-security-policy"];
  assertCsp(Array.isArray(csp) ? csp.join(",") : csp);
}

async function inspectUser(service) {
  const { stdout: id } = await compose(["ps", "-q", service], { capture: true });
  const containerId = id.trim();
  if (!containerId) throw new Error(`${service} is not running`);
  const { stdout } = await run(
    ["inspect", "-f", "{{.Config.User}} {{.HostConfig.Privileged}}", containerId],
    { capture: true },
  );
  const [user, privileged] = stdout.trim().split(/\s+/u);
  if (user !== "dashboard" && user !== "10001:10001" && user !== "10001") {
    throw new Error(`${service} must run as non-root, got ${user}`);
  }
  if (privileged === "true") throw new Error(`${service} must not be privileged`);
  const { stdout: mounts } = await run(
    ["inspect", "-f", "{{range .Mounts}}{{.Source}} {{end}}", containerId],
    { capture: true },
  );
  if (mounts.includes("docker.sock")) throw new Error(`${service} mounts docker.sock`);
}

let certDir;
try {
  certDir = generateSmokeCertificates();
  env.HTTPS_SMOKE_CERT_DIR = certDir.replaceAll("\\", "/");
  const ca = readFileSync(join(certDir, "cert.pem"));
  await compose(["config", "--quiet"]);
  if (!skipBuild) await compose(["build"]);
  await compose(["up", "-d", "--wait", "postgres", "redis"]);
  await compose(["up", "migrate", "--exit-code-from", "migrate"]);
  await compose(["up", "-d", "web", "worker", "realtime"]);
  await waitFor("http://127.0.0.1:3000/health/ready", 200, "web ready on loopback");
  await compose(["up", "-d", "proxy"]);
  let live;
  try {
    live = await waitFor(`${publicOrigin}/health/live`, 200, "https live", ca);
  } catch (error) {
    const logs = await compose(["logs", "proxy"], { capture: true }).catch(() => ({
      stdout: "",
      stderr: "",
    }));
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}\n--- proxy logs ---\n${logs.stdout}${logs.stderr}`);
  }
  if (live.status !== "live") throw new Error("https live contract mismatch");
  const ready = await waitFor(`${publicOrigin}/health/ready`, 200, "https ready", ca);
  if (ready.status !== "ready") throw new Error("https ready contract mismatch");

  const livePage = await request(`${publicOrigin}/health/live`, { ca });
  assertHttpsHeaders(livePage.headers, "https /health/live");

  const home = await request(`${publicOrigin}/`, { ca });
  if (home.status !== 200 || !/\/setup/u.test(home.body)) {
    throw new Error("fresh install did not expose onboarding behind HTTPS");
  }
  assertHttpsHeaders(home.headers, "https /");
  assertNoSecrets(home.body, "https /");

  const httpLive = await request(`http://${dashboardHost}:${httpPort}/health/live`);
  if (!isHttpsRedirect(httpLive.status, httpLive.headers.location, publicOrigin)) {
    throw new Error(
      `HTTP did not redirect to ${publicOrigin} (status ${httpLive.status}, location ${httpLive.headers.location})`,
    );
  }

  const csrf = await request(`${publicOrigin}/api/auth/csrf`, { ca });
  const cookies = cookieFlagReport(csrf.headers["set-cookie"]);
  const cookieProblems = sessionCookieViolations(cookies);
  if (cookieProblems.length > 0) {
    throw new Error(`cookie attributes: ${cookieProblems.join("; ")}`);
  }
  if (cookies.length === 0) {
    const login = await request(`${publicOrigin}/login`, { ca });
    const loginCookies = cookieFlagReport(login.headers["set-cookie"]);
    const loginProblems = sessionCookieViolations(loginCookies);
    if (loginProblems.length > 0) {
      throw new Error(`login cookie attributes: ${loginProblems.join("; ")}`);
    }
  }

  const wsProbe = await request(`${publicOrigin}/api/realtime/ws`, { ca });
  if (wsProbe.status !== 426) {
    throw new Error(`WebSocket HTTP probe expected 426, got ${wsProbe.status} ${wsProbe.body}`);
  }
  assertNoSecrets(wsProbe.body, "https /api/realtime/ws");

  const forbiddenOrigin = await websocketUpgrade({
    ca,
    origin: "https://evil.example",
    path: "/api/realtime/ws",
  });
  if (forbiddenOrigin.status !== 403) {
    throw new Error(
      `invalid Origin must be 403 on WebSocket, got ${forbiddenOrigin.status} ${forbiddenOrigin.body ?? ""}`,
    );
  }

  const authorizedOrigin = await websocketUpgrade({
    ca,
    origin: publicOrigin,
    path: "/api/realtime/ws",
  });
  if (authorizedOrigin.status !== 401) {
    throw new Error(
      `same-origin WebSocket without ticket expected 401, got ${authorizedOrigin.status} ${authorizedOrigin.body ?? ""}`,
    );
  }

  const sse = await request(`${publicOrigin}/api/realtime/events`, { ca });
  if (sse.status !== 401) {
    throw new Error(`SSE without ticket expected 401, got ${sse.status} ${sse.body}`);
  }
  assertNoSecrets(sse.body, "https /api/realtime/events");

  const trpc = await request(`${publicOrigin}/api/trpc/oidc.publicConfig`, {
    ca,
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (trpc.status !== 403) {
    throw new Error(`tRPC invalid Origin expected 403, got ${trpc.status} ${trpc.body}`);
  }

  await inspectUser("web");
  await inspectUser("worker");
  await inspectUser("realtime");

  await compose(["stop", "postgres"]);
  await waitFor(`${publicOrigin}/health/live`, 200, "https live with DB down", ca);
  await waitFor(`${publicOrigin}/health/ready`, 503, "https ready with DB down", ca);
  await compose(["start", "postgres"]);
  await waitFor(`${publicOrigin}/health/ready`, 200, "https ready after DB return", ca);

  console.log("https reverse-proxy smoke ok");
} finally {
  await compose(["down", "-v", "--remove-orphans"]).catch(() => undefined);
  if (certDir) rmSync(certDir, { recursive: true, force: true });
}
