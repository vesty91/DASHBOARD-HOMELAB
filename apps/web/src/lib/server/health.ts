import { checkDatabaseConnection } from "@dashboard/db/health";
import { APP_VERSION } from "../env";
import { getDatabase } from "./database";

const READY_TIMEOUT_MS = 3_000;

export async function readyHealth(): Promise<{
  status: number;
  body: { status: "ready" | "not-ready"; version: string };
}> {
  const version = APP_VERSION;
  try {
    const database = await Promise.race([
      getDatabase(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("DB_READY_TIMEOUT")), READY_TIMEOUT_MS);
      }),
    ]);
    await checkDatabaseConnection(database.client);
    return { status: 200, body: { status: "ready", version } };
  } catch {
    return { status: 503, body: { status: "not-ready", version } };
  }
}
