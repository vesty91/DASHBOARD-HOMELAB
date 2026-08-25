import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { SqliteClient } from "../client/sqlite";
import * as s from "../schema/sqlite";
import type {
  AppCreate,
  BoardCreate,
  DefaultLayout,
  GroupCreate,
  IntegrationCreate,
  UserCreate,
} from "./types";

export function createSqliteRepositories(client: SqliteClient) {
  const { db } = client;
  const now = () => new Date();
  const findUser = (id: string) => db.select().from(s.users).where(eq(s.users.id, id)).get();
  const users = {
    findById: findUser,
    list: () => db.select().from(s.users).all(),
    async create(input: UserCreate) {
      const row = {
        id: randomUUID(),
        username: input.username,
        usernameCanonical:
          input.usernameCanonical ?? input.username.normalize("NFKC").toLowerCase(),
        email: input.email ?? undefined,
        displayName: input.displayName ?? undefined,
        isSystemAdmin: input.isSystemAdmin ?? false,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.insert(s.users).values(row).run();
      return (await findUser(row.id))!;
    },
  };
  const findGroup = (id: string) => db.select().from(s.groups).where(eq(s.groups.id, id)).get();
  const groups = {
    findById: findGroup,
    list: () => db.select().from(s.groups).all(),
    async create(input: GroupCreate) {
      const row = {
        id: randomUUID(),
        name: input.name,
        description: input.description ?? undefined,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.insert(s.groups).values(row).run();
      return (await findGroup(row.id))!;
    },
  };
  const findBoard = (id: string) => db.select().from(s.boards).where(eq(s.boards.id, id)).get();
  const boards = {
    findById: findBoard,
    list: () => db.select().from(s.boards).all(),
    async create(input: BoardCreate) {
      const row = {
        id: randomUUID(),
        slug: input.slug,
        name: input.name,
        description: input.description ?? undefined,
        ownerUserId: input.ownerUserId ?? undefined,
        visibility: input.visibility ?? ("private" as const),
        createdAt: now(),
        updatedAt: now(),
      };
      await db.insert(s.boards).values(row).run();
      return (await findBoard(row.id))!;
    },
  };
  const findApp = (id: string) => db.select().from(s.apps).where(eq(s.apps.id, id)).get();
  const apps = {
    findById: findApp,
    list: () => db.select().from(s.apps).all(),
    async create(input: AppCreate) {
      const row = {
        id: randomUUID(),
        name: input.name,
        url: input.url,
        description: input.description ?? undefined,
        integrationId: input.integrationId ?? undefined,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.insert(s.apps).values(row).run();
      return (await findApp(row.id))!;
    },
  };
  const findIntegration = (id: string) =>
    db.select().from(s.integrations).where(eq(s.integrations.id, id)).get();
  const integrations = {
    findById: findIntegration,
    list: () => db.select().from(s.integrations).all(),
    async create(input: IntegrationCreate) {
      const row = {
        id: randomUUID(),
        type: input.type,
        name: input.name,
        baseUrl: input.baseUrl,
        createdBy: input.createdBy ?? undefined,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.insert(s.integrations).values(row).run();
      return (await findIntegration(row.id))!;
    },
  };
  async function createBoardWithLayouts(input: BoardCreate, defaults: readonly DefaultLayout[]) {
    return db.transaction(async (tx) => {
      const row = {
        id: randomUUID(),
        slug: input.slug,
        name: input.name,
        description: input.description ?? undefined,
        ownerUserId: input.ownerUserId ?? undefined,
        visibility: input.visibility ?? ("private" as const),
        createdAt: now(),
        updatedAt: now(),
      };
      await tx.insert(s.boards).values(row).run();
      for (const layout of defaults)
        await tx
          .insert(s.layouts)
          .values({
            id: randomUUID(),
            boardId: row.id,
            ...layout,
            createdAt: now(),
            updatedAt: now(),
          })
          .run();
      return row;
    });
  }
  return { users, groups, boards, apps, integrations, createBoardWithLayouts };
}
