export interface UserCreate {
  username: string;
  usernameCanonical?: string;
  email?: string | null;
  displayName?: string | null;
  isSystemAdmin?: boolean;
}
export interface GroupCreate {
  name: string;
  description?: string | null;
}
export interface BoardCreate {
  slug: string;
  name: string;
  description?: string | null;
  ownerUserId?: string | null;
  visibility?: "private" | "authenticated" | "public";
}
export interface AppCreate {
  name: string;
  url: string;
  description?: string | null;
  integrationId?: string | null;
}
export interface IntegrationCreate {
  type: string;
  name: string;
  baseUrl: string;
  createdBy?: string | null;
}
export interface EntityRepository<T, TCreate> {
  findById(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  create(input: TCreate): Promise<T>;
}
export interface DefaultLayout {
  name: string;
  breakpoint: string;
  columns: number;
  rowHeight: number;
  sortOrder: number;
}
