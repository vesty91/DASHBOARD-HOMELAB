import { synologyUserError } from "./synology-error";

export type SynologyActionOutcome = { ok: true } | { ok: false; message: string };

export function synologyActionFailure(
  error: unknown,
): Extract<SynologyActionOutcome, { ok: false }> {
  return { ok: false, message: synologyUserError(error) };
}
