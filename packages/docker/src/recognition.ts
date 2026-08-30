import {
  builtInAppLibrary,
  findDefinitionsForDockerImage,
  presentAppDefinition,
} from "@dashboard/app-library";
import type { DockerRecognizedApp } from "./types";

export function recognizeDockerImage(image: string): DockerRecognizedApp | null {
  const matches = findDefinitionsForDockerImage(image, builtInAppLibrary.list());
  const definition = matches[0];
  if (!definition) return null;
  const view = presentAppDefinition(definition, (id) => builtInAppLibrary.get(id));
  return {
    id: view.id,
    name: view.name,
    iconPath: view.icon.path,
    lifecycleStatus: view.lifecycle.status,
    replacedBy: view.lifecycle.replacedBy ?? null,
    replacedByName: view.lifecycle.replacedByName ?? null,
  };
}
