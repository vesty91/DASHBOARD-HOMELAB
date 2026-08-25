import "next-auth";
import "next-auth/jwt";
declare module "next-auth" {
  interface User {
    username: string;
    displayName: string | null;
    isSystemAdmin: boolean;
    authVersion: number;
  }
  interface Session {
    user: {
      id: string;
      username: string;
      displayName: string | null;
      isSystemAdmin: boolean;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    username?: string;
    displayName?: string | null;
    isSystemAdmin?: boolean;
    authVersion?: number;
  }
}
