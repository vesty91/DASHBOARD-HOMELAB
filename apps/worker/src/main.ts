import { workerOptionsFromEnv } from "./env";
import { createJobRecorderFromEnv } from "./jobs";
import { startWorker } from "./server";
import { bindProcessShutdown } from "./shutdown";

const options = workerOptionsFromEnv(process.env);
const jobs = createJobRecorderFromEnv(process.env);
const worker = await startWorker({
  ...options,
  ...(jobs ? { jobs: jobs.recorder } : {}),
});

console.log(
  JSON.stringify({
    msg: "startup",
    service: "worker",
    version: process.env.APP_VERSION?.trim() || "1.0.0",
    environment: process.env.NODE_ENV ?? "development",
    port: worker.port(),
  }),
);

bindProcessShutdown(async () => {
  await worker.close();
  if (jobs) await jobs.close();
});
