"use server";

import { getBoardCaller } from "../../lib/server/board-api";

export async function issueLiveRealtimeTicket(input: {
  boardIds?: string[];
  integrationIds?: string[];
}): Promise<{ token: string; expiresAt: string } | null> {
  try {
    return await (
      await getBoardCaller()
    ).realtime.ticket({
      ...(input.boardIds ? { boardIds: input.boardIds } : {}),
      ...(input.integrationIds ? { integrationIds: input.integrationIds } : {}),
    });
  } catch (error) {
    void error;
    return null;
  }
}
