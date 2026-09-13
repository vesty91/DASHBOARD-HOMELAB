import { realtimeOptionsFromEnv } from "./env";
import { startRealtime } from "./server";

const realtime = await startRealtime(realtimeOptionsFromEnv(process.env));

function shutdown(): void {
  void realtime.close().then(() => {
    process.exit(0);
  });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
