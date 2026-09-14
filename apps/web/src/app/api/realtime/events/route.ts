import { REALTIME_TICKET_MAX_TOKEN_BYTES } from "@dashboard/events";
import { serverEnv } from "../../../../lib/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const realtimeUrl = serverEnv.REALTIME_URL;
  if (!realtimeUrl) {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
  const ticket = new URL(request.url).searchParams.get("ticket");
  if (!ticket || Buffer.byteLength(ticket, "utf8") > REALTIME_TICKET_MAX_TOKEN_BYTES) {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }
  try {
    const upstream = await fetch(
      `${realtimeUrl.replace(/\/$/u, "")}/events?ticket=${encodeURIComponent(ticket)}`,
      {
        headers: { accept: "text/event-stream" },
        signal: request.signal,
      },
    );
    if (!upstream.body) {
      return Response.json({ status: "unavailable" }, { status: 503 });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    void error;
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
