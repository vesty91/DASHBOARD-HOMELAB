import NextAuth from "next-auth";
import { getAuthOptions } from "@/lib/server/auth";

async function handler(...args: Parameters<ReturnType<typeof NextAuth>>) {
  return NextAuth(await getAuthOptions())(...args);
}

export { handler as GET, handler as POST };
