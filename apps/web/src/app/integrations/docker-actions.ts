"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { dockerActionFailure, type DockerActionOutcome } from "./docker-action-result";

function revalidateContainer(integrationId: string, containerId: string) {
  revalidatePath(`/integrations/${integrationId}`);
  revalidatePath(`/integrations/${integrationId}/containers/${containerId}`);
}

export async function startDockerContainerAction(
  integrationId: string,
  containerId: string,
): Promise<DockerActionOutcome> {
  try {
    await (await getBoardCaller()).docker.containers.start({ integrationId, containerId });
    revalidateContainer(integrationId, containerId);
    return { ok: true };
  } catch (error) {
    return dockerActionFailure(error);
  }
}

export async function stopDockerContainerAction(
  integrationId: string,
  containerId: string,
): Promise<DockerActionOutcome> {
  try {
    await (await getBoardCaller()).docker.containers.stop({ integrationId, containerId });
    revalidateContainer(integrationId, containerId);
    return { ok: true };
  } catch (error) {
    return dockerActionFailure(error);
  }
}

export async function restartDockerContainerAction(
  integrationId: string,
  containerId: string,
): Promise<DockerActionOutcome> {
  try {
    await (await getBoardCaller()).docker.containers.restart({ integrationId, containerId });
    revalidateContainer(integrationId, containerId);
    return { ok: true };
  } catch (error) {
    return dockerActionFailure(error);
  }
}

export async function loadDockerLogsAction(integrationId: string, containerId: string, tail = 200) {
  return (await getBoardCaller()).docker.containers.logs({ integrationId, containerId, tail });
}
