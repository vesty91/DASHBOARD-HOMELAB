import { argon2id, hash, needsRehash, verify } from "argon2";
import { z } from "zod";
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
export const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} as const;
export async function hashPassword(password: string): Promise<string> {
  return hash(passwordSchema.parse(password), ARGON2_OPTIONS);
}
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
export function needsPasswordRehash(passwordHash: string): boolean {
  try {
    return needsRehash(passwordHash, ARGON2_OPTIONS);
  } catch {
    return true;
  }
}
