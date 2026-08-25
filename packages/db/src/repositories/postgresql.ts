import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PostgresqlClient } from "../client/postgresql";
import * as s from "../schema/postgresql";
import type {
  AppCreate,
  BoardCreate,
  DefaultLayout,
  GroupCreate,
  IntegrationCreate,
  UserCreate,
} from "./types";

export function createPostgresqlRepositories(client: PostgresqlClient) {
  const { db } = client;
  const stamp = () => new Date();
  const users = {
    findById: async (id: string) => (await db.select().from(s.users).where(eq(s.users.id, id)))[0],
    list: () => db.select().from(s.users),
    async create(input: UserCreate) {
      const rows = await db
        .insert(s.users)
        .values({
          id: randomUUID(),
          username: input.username,
          email: input.email ?? null,
          displayName: input.displayName ?? null,
          isSystemAdmin: input.isSystemAdmin ?? false,
          createdAt: stamp(),
          updatedAt: stamp(),
        })
        .returning();
      return rows[0]!;
    },
  };
  const groups = {
    findById: async (id: string) =>
      (await db.select().from(s.groups).where(eq(s.groups.id, id)))[0],
    list: () => db.select().from(s.groups),
    async create(input: GroupCreate) {
      const rows = await db
        .insert(s.groups)
        .values({
          id: randomUUID(),
          name: input.name,
          description: input.description ?? null,
          createdAt: stamp(),
          updatedAt: stamp(),
        })
        .returning();
      return rows[0]!;
    },
  };
  const boards = {
    findById: async (id: string) =>
      (await db.select().from(s.boards).where(eq(s.boards.id, id)))[0],
    list: () => db.select().from(s.boards),
    async create(input: BoardCreate) {
      const rows = await db
        .insert(s.boards)
        .values({
          id: randomUUID(),
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          ownerUserId: input.ownerUserId ?? null,
          visibility: input.visibility ?? "private",
          createdAt: stamp(),
          updatedAt: stamp(),
        })
        .returning();
      return rows[0]!;
    },
  };
  const apps = {
    findById: async (id: string) => (await db.select().from(s.apps).where(eq(s.apps.id, id)))[0],
    list: () => db.select().from(s.apps),
    async create(input: AppCreate) {
      const rows = await db
        .insert(s.apps)
        .values({
          id: randomUUID(),
          name: input.name,
          url: input.url,
          description: input.description ?? null,
          integrationId: input.integrationId ?? null,
          createdAt: stamp(),
          updatedAt: stamp(),
        })
        .returning();
      return rows[0]!;
    },
  };
  const integrations = {
    findById: async (id: string) =>
      (await db.select().from(s.integrations).where(eq(s.integrations.id, id)))[0],
    list: () => db.select().from(s.integrations),
    async create(input: IntegrationCreate) {
      const rows = await db
        .insert(s.integrations)
        .values({
          id: randomUUID(),
          type: input.type,
          name: input.name,
          baseUrl: input.baseUrl,
          createdBy: input.createdBy ?? null,
          createdAt: stamp(),
          updatedAt: stamp(),
        })
        .returning();
      return rows[0]!;
    },
  };
  async function createBoardWithLayouts(input: BoardCreate, defaults: readonly DefaultLayout[]) {
    return db.transaction(async (tx) => {
      const boardRows = await tx
        .insert(s.boards)
        .values({
          id: randomUUID(),
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          ownerUserId: input.ownerUserId ?? null,
          visibility: input.visibility ?? "private",
          createdAt: stamp(),
          updatedAt: stamp(),
        })
        .returning();
      const board = boardRows[0]!;
      for (const layout of defaults)
        await tx.insert(s.layouts).values({
          id: randomUUID(),
          boardId: board.id,
          ...layout,
          createdAt: stamp(),
          updatedAt: stamp(),
        });
      return board;
    });
  }
  return { users, groups, boards, apps, integrations, createBoardWithLayouts };
}
