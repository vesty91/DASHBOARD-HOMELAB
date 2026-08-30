"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";

export async function startDockerContainerAction(integrationId: string, containerId: string) {
  await (await getBoardCaller()).docker.containers.start({ integrationId, containerId });
  revalidatePath(`/integrations/${integrationId}`);
  revalidatePath(`/integrations/${integrationId}/containers/${containerId}`);
}

export async function stopDockerContainerAction(integrationId: string, containerId: string) {
  await (await getBoardCaller()).docker.containers.stop({ integrationId, containerId });
  revalidatePath(`/integrations/${integrationId}`);
  revalidatePath(`/integrations/${integrationId}/containers/${containerId}`);
}

export async function restartDockerContainerAction(integrationId: string, containerId: string) {
  await (await getBoardCaller()).docker.containers.restart({ integrationId, containerId });
  revalidatePath(`/integrations/${integrationId}`);
  revalidatePath(`/integrations/${integrationId}/containers/${containerId}`);
}

export async function loadDockerLogsAction(integrationId: string, containerId: string, tail = 200) {
  return (await getBoardCaller()).docker.containers.logs({ integrationId, containerId, tail });
}
