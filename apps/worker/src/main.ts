import { workerOptionsFromEnv } from "./env";
import { createJobRecorderFromEnv } from "./jobs";
import { startWorker } from "./server";

const options = workerOptionsFromEnv(process.env);
const jobs = createJobRecorderFromEnv(process.env);
const worker = await startWorker({
  ...options,
  ...(jobs ? { jobs } : {}),
});

function shutdown(): void {
  void worker.close().then(() => {
    process.exit(0);
  });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
