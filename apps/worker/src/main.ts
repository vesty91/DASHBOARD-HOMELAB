import { workerOptionsFromEnv } from "./env";
import { startWorker } from "./server";

const worker = await startWorker(workerOptionsFromEnv(process.env));

function shutdown(): void {
  void worker.close().then(() => {
    process.exit(0);
  });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
