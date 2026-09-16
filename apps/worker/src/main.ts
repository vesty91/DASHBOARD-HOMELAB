import { workerOptionsFromEnv } from "./env";
import { createWorkerPersistenceFromEnv } from "./database";
import { startWorker } from "./server";
import { bindProcessShutdown } from "./shutdown";

const options = workerOptionsFromEnv(process.env);
const persistence = createWorkerPersistenceFromEnv(process.env);
const worker = await startWorker({
  ...options,
  ...(persistence
    ? {
        jobs: persistence.jobs,
        purgeNotifications: persistence.purgeNotifications,
        incidents: persistence.incidents,
        automations: {
          store: persistence.schedulerStore,
          loadOwner: persistence.loadOwner,
          integrationStore: persistence.integrationStore,
          audit: persistence.audit,
          ...(process.env.SECRET_ENCRYPTION_KEY
            ? { secretEncryptionKey: process.env.SECRET_ENCRYPTION_KEY }
            : {}),
        },
      }
    : {}),
});

console.log(
  JSON.stringify({
    msg: "startup",
    service: "worker",
    version: process.env.APP_VERSION?.trim() || "1.4.0",
    environment: process.env.NODE_ENV ?? "development",
    port: worker.port(),
  }),
);

bindProcessShutdown(async () => {
  await worker.close();
  if (persistence) await persistence.close();
});
