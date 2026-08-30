import { dockerUserError } from "./docker-error";

export type DockerActionOutcome = { ok: true } | { ok: false; message: string };

export function dockerActionFailure(error: unknown): Extract<DockerActionOutcome, { ok: false }> {
  return { ok: false, message: dockerUserError(error) };
}
