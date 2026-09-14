import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@dashboard/api";
import { createBoardApiContext } from "../../../../lib/server/board-api";
import { serverEnv } from "../../../../lib/env";
import { isSameAppOrigin } from "../../../../lib/security-headers";

function handler(request: Request) {
  if (!isSameAppOrigin(request.headers.get("origin"), serverEnv.APP_URL)) {
    return Response.json({ error: "Forbidden origin" }, { status: 403 });
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: createBoardApiContext,
    onError: ({ error, path }) => console.error("tRPC request failed", { path, code: error.code }),
  });
}

export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export { handler as POST };
