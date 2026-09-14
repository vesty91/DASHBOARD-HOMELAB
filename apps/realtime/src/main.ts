import { realtimeOptionsFromEnv } from "./env";
import { startRealtime } from "./server";
import { bindProcessShutdown } from "./shutdown";

const realtime = await startRealtime(realtimeOptionsFromEnv(process.env));

console.log(
  JSON.stringify({
    msg: "startup",
    service: "realtime",
    version: process.env.APP_VERSION?.trim() || "0.1.0",
    environment: process.env.NODE_ENV ?? "development",
    port: realtime.port(),
  }),
);

bindProcessShutdown(() => realtime.close());
