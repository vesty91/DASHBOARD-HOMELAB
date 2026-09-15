"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toProxmoxActionOutcome, type ProxmoxActionOutcome } from "./proxmox-action-result";

export type ProxmoxGuestActionInput = {
  integrationId: string;
  node: string;
  guestType: "qemu" | "lxc";
  vmid: number;
};

export async function refreshProxmoxOverviewAction(
  integrationId: string,
): Promise<ProxmoxActionOutcome> {
  try {
    await (await getBoardCaller()).proxmox.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toProxmoxActionOutcome(error);
  }
}

function revalidateProxmox(integrationId: string) {
  revalidatePath(`/integrations/${integrationId}`);
  revalidatePath("/boards");
}

export async function startProxmoxGuestAction(
  input: ProxmoxGuestActionInput,
): Promise<ProxmoxActionOutcome> {
  try {
    await (await getBoardCaller()).proxmox.guests.start(input);
    revalidateProxmox(input.integrationId);
    return { ok: true };
  } catch (error) {
    return toProxmoxActionOutcome(error);
  }
}

export async function shutdownProxmoxGuestAction(
  input: ProxmoxGuestActionInput,
): Promise<ProxmoxActionOutcome> {
  try {
    await (await getBoardCaller()).proxmox.guests.shutdown(input);
    revalidateProxmox(input.integrationId);
    return { ok: true };
  } catch (error) {
    return toProxmoxActionOutcome(error);
  }
}

export async function rebootProxmoxGuestAction(
  input: ProxmoxGuestActionInput,
): Promise<ProxmoxActionOutcome> {
  try {
    await (await getBoardCaller()).proxmox.guests.reboot(input);
    revalidateProxmox(input.integrationId);
    return { ok: true };
  } catch (error) {
    return toProxmoxActionOutcome(error);
  }
}
