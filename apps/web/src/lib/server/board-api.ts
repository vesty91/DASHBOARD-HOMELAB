import "server-only";
import { createBoardService } from "@dashboard/boards";
import { createCaller, type BoardApiContext } from "@dashboard/api";
import { createAppService } from "@dashboard/apps";
import { createBuiltInWidgetPolicy } from "@dashboard/widgets";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { getDatabase } from "./database";

export async function createBoardApiContext(): Promise<BoardApiContext> {
  const session = await getServerSession(authOptions);
  const database = await getDatabase();
  const userId = session?.user?.id ?? null;
  const subject = userId
    ? ((await database.authStore.resolvePermissionSubject(userId)) ?? null)
    : null;
  return {
    actor: { userId, subject },
    boards: createBoardService(database.boardStore, createBuiltInWidgetPolicy()),
    apps: createAppService(database.appStore),
  };
}

export async function getBoardCaller() {
  return createCaller(await createBoardApiContext());
}
