import { TRPCError } from "@trpc/server";

export async function resolveAppLibraryTemplate<T>(load: () => Promise<T>): Promise<T | undefined> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") return undefined;
    throw error;
  }
}
