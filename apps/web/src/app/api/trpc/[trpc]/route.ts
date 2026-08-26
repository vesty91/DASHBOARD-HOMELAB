import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@dashboard/api";
import { createBoardApiContext } from "../../../../lib/server/board-api";

function handler(request: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: createBoardApiContext,
    onError: ({ error, path }) => console.error("tRPC request failed", { path, code: error.code }),
  });
}
export { handler as GET, handler as POST };
