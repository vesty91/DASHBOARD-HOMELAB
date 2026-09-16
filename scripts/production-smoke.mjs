import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const composeFile = "compose.yaml";
const project = process.env.COMPOSE_PROJECT_NAME || "dashboard-homelab-smoke";
const skipBuild = process.env.SKIP_BUILD === "1";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 180_000);

const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: project,
  APP_URL: process.env.APP_URL || "http://127.0.0.1:3000",
  AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(32).toString("hex"),
  SECRET_ENCRYPTION_KEY: process.env.SECRET_ENCRYPTION_KEY || randomBytes(32).toString("base64"),
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || randomBytes(18).toString("base64url"),
  POSTGRES_USER: process.env.POSTGRES_USER || "dashboard",
  POSTGRES_DB: process.env.POSTGRES_DB || "dashboard",
  APP_VERSION: process.env.APP_VERSION || "1.4.0",
  WEB_PORT: process.env.WEB_PORT || "3000",
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

function compose(args, options) {
  if (skipBuild && args[0] === "up") {
    return run(
      [
        "compose",
        "-f",
        composeFile,
        "--project-name",
        project,
        "up",
        "--no-build",
        ...args.slice(1),
      ],
      options,
    );
  }
  return run(["compose", "-f", composeFile, "--project-name", project, ...args], options);
}

async function waitFor(url, expectedStatus, label) {
  const deadline = Date.now() + timeoutMs;
  let last = "no-response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      last = String(response.status);
      if (response.status === expectedStatus) {
        const body = await response.text();
        if (/DATABASE_URL|REDIS_URL|AUTH_SECRET|postgresql:\/\//iu.test(body)) {
          throw new Error(`${label} leaked a secret`);
        }
        return JSON.parse(body);
      }
    } catch (error) {
      last = error instanceof Error ? error.message : "error";
    }
    await delay(2_000);
  }
  throw new Error(`${label} did not reach HTTP ${expectedStatus} (last: ${last})`);
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

try {
  await compose(["config", "--quiet"]);
  if (!skipBuild) await compose(["build"]);
  await compose(["up", "-d", "--wait", "postgres", "redis"]);
  await compose(["up", "migrate", "--exit-code-from", "migrate"]);
  await compose(["up", "-d", "web", "worker", "realtime"]);
  const live = await waitFor("http://127.0.0.1:3000/health/live", 200, "web live");
  if (live.status !== "live") throw new Error("web live contract mismatch");
  const ready = await waitFor("http://127.0.0.1:3000/health/ready", 200, "web ready");
  if (ready.status !== "ready") throw new Error("web ready contract mismatch");
  const home = await fetch("http://127.0.0.1:3000/");
  const homeText = await home.text();
  if (!home.ok || !/\/setup/u.test(homeText)) {
    throw new Error("fresh install did not expose onboarding");
  }
  await inspectUser("web");
  await inspectUser("worker");
  await inspectUser("realtime");
  await compose([
    "exec",
    "-T",
    "worker",
    "node",
    "-e",
    "fetch('http://127.0.0.1:3001/health/live').then((r)=>process.exit(r.ok?0:1))",
  ]);
  await compose([
    "exec",
    "-T",
    "realtime",
    "node",
    "-e",
    "fetch('http://127.0.0.1:3002/health/live').then((r)=>process.exit(r.ok?0:1))",
  ]);
  await compose(["stop", "postgres"]);
  await waitFor("http://127.0.0.1:3000/health/live", 200, "web live with DB down");
  await waitFor("http://127.0.0.1:3000/health/ready", 503, "web ready with DB down");
  await compose(["start", "postgres"]);
  await waitFor("http://127.0.0.1:3000/health/ready", 200, "web ready after DB return");
  console.log("production smoke ok");
} finally {
  await compose(["down", "-v", "--remove-orphans"]).catch(() => undefined);
}
