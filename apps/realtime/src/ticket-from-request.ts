import { REALTIME_TICKET_MAX_TOKEN_BYTES } from "@dashboard/events";

export function ticketFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "http://realtime.invalid");
    const ticket = parsed.searchParams.get("ticket");
    if (!ticket || ticket.length === 0) return null;
    if (Buffer.byteLength(ticket, "utf8") > REALTIME_TICKET_MAX_TOKEN_BYTES) return null;
    return ticket;
  } catch {
    return null;
  }
}
