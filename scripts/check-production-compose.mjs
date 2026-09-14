import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const composePath = resolve("compose.yaml");
const compose = await readFile(composePath, "utf8");

function fail(message) {
  throw new Error(`production compose contract: ${message}`);
}

for (const service of ["postgres:", "redis:", "migrate:", "web:", "worker:", "realtime:"]) {
  if (!compose.includes(`  ${service}`)) fail(`missing service ${service}`);
}

if (compose.includes("/var/run/docker.sock") || compose.includes("docker.sock")) {
  fail("must not mount docker.sock");
}
if (/privileged:\s*true/u.test(compose)) fail("must not set privileged: true");
if (!/restart:\s*"no"/u.test(compose) && !/restart:\s*no/u.test(compose)) {
  fail("migrate must use restart: no");
}

const postgresBlock = compose.split(/\n  postgres:\n/u)[1]?.split(/\n  [a-z]/u)[0] ?? "";
const redisBlock = compose.split(/\n  redis:\n/u)[1]?.split(/\n  [a-z]/u)[0] ?? "";
if (/\n {4}ports:/u.test(postgresBlock)) fail("postgres must not publish ports");
if (/\n {4}ports:/u.test(redisBlock)) fail("redis must not publish ports");
if (!compose.includes("service_completed_successfully")) {
  fail("web/worker must wait for migrate success");
}
if (!compose.includes("pg_isready")) fail("postgres healthcheck must use pg_isready");
if (!compose.includes("redis-cli")) fail("redis healthcheck must use redis-cli");

console.log("production compose contract ok");
