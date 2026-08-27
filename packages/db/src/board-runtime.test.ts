import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSqliteClient } from "./client/sqlite";
import { migrateSqlite } from "./migrations";
import { BoardRepositoryError, createSqliteBoardStore } from "./board-runtime";

async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  const owner = randomUUID();
  client.sqlite
    .prepare(
      "INSERT INTO users(id,username,username_canonical,created_at,updated_at) VALUES(?,?,?,?,?)",
    )
    .run(owner, "owner", "owner", Date.now(), Date.now());
  return { client, owner, store: createSqliteBoardStore(client.sqlite) };
}
const layouts = [
  { name: "Desktop", breakpoint: "desktop", columns: 12, rowHeight: 72, sortOrder: 0 },
  { name: "Mobile", breakpoint: "mobile", columns: 4, rowHeight: 72, sortOrder: 1 },
];
describe("SQLite board repository", () => {
  it("creates a board and both layouts atomically", async () => {
    const { client, owner, store } = await setup();
    try {
      const result = await store.createBoardWithLayouts({
        slug: "home",
        name: "Home",
        description: null,
        visibility: "private",
        ownerUserId: owner,
        layouts,
      });
      expect(result.board.revision).toBe(1);
      expect(result.layouts.map((l) => l.breakpoint)).toEqual(["desktop", "mobile"]);
    } finally {
      client.close();
    }
  });
  it("updates a projected layout atomically and rejects stale revisions", async () => {
    const { client, owner, store } = await setup();
    try {
      const result = await store.createBoardWithLayouts({
        slug: "home",
        name: "Home",
        description: null,
        visibility: "private",
        ownerUserId: owner,
        layouts,
      });
      const itemId = randomUUID();
      client.sqlite
        .prepare(
          "INSERT INTO items(id,board_id,widget_type,widget_version,created_at,updated_at) VALUES(?,?,?,1,?,?)",
        )
        .run(itemId, result.board.id, "test.fixture", Date.now(), Date.now());
      const desktop = result.layouts[0]!;
      await expect(
        store.updateLayoutBatch(
          {
            boardId: result.board.id,
            layoutId: desktop.id,
            expectedRevision: 1,
            items: [{ itemId, x: 0, y: 0, w: 2, h: 2 }],
          },
          () => {},
        ),
      ).resolves.toBe(2);
      await expect(
        store.updateLayoutBatch(
          {
            boardId: result.board.id,
            layoutId: desktop.id,
            expectedRevision: 1,
            items: [{ itemId, x: 2, y: 0, w: 2, h: 2 }],
          },
          () => {},
        ),
      ).rejects.toMatchObject({ code: "BOARD_REVISION_CONFLICT" });
      expect((await store.findSnapshotById(result.board.id))?.board.revision).toBe(2);
    } finally {
      client.close();
    }
  });
  it("rolls revision back when validation or ownership fails", async () => {
    const { client, owner, store } = await setup();
    try {
      const first = await store.createBoardWithLayouts({
        slug: "one",
        name: "One",
        description: null,
        visibility: "private",
        ownerUserId: owner,
        layouts,
      });
      const second = await store.createBoardWithLayouts({
        slug: "two",
        name: "Two",
        description: null,
        visibility: "private",
        ownerUserId: owner,
        layouts,
      });
      const foreign = randomUUID();
      client.sqlite
        .prepare(
          "INSERT INTO items(id,board_id,widget_type,widget_version,created_at,updated_at) VALUES(?,?,?,1,?,?)",
        )
        .run(foreign, second.board.id, "test.fixture", Date.now(), Date.now());
      await expect(
        store.updateLayoutBatch(
          {
            boardId: first.board.id,
            layoutId: first.layouts[0]!.id,
            expectedRevision: 1,
            items: [{ itemId: foreign, x: 0, y: 0, w: 1, h: 1 }],
          },
          () => {},
        ),
      ).rejects.toBeInstanceOf(BoardRepositoryError);
      expect((await store.findSnapshotById(first.board.id))?.board.revision).toBe(1);
    } finally {
      client.close();
    }
  });
  it("creates, updates and deletes items with revision CAS and cascade", async () => {
    const { client, owner, store } = await setup();
    try {
      const board = await store.createBoardWithLayouts({
        slug: "widgets",
        name: "Widgets",
        description: null,
        visibility: "private",
        ownerUserId: owner,
        layouts,
      });
      const itemId = randomUUID();
      const desktop = board.layouts[0]!;
      const mobile = board.layouts[1]!;
      await expect(
        store.createItem({
          boardId: board.board.id,
          expectedRevision: 1,
          item: {
            id: itemId,
            widgetType: "clock",
            widgetVersion: 1,
            title: "UTC Clock",
            configJson: { timezone: "UTC", showDate: true, showSeconds: false, hour12: false },
            integrationId: null,
          },
          placements: [
            {
              layoutId: desktop.id,
              x: 0,
              y: 0,
              w: 4,
              h: 2,
              minW: 2,
              minH: 1,
              maxW: 8,
              maxH: 4,
            },
            {
              layoutId: mobile.id,
              x: 0,
              y: 0,
              w: 4,
              h: 2,
              minW: 2,
              minH: 1,
              maxW: 4,
              maxH: 4,
            },
          ],
        }),
      ).resolves.toBe(2);
      const created = await store.findSnapshotById(board.board.id);
      expect(created?.items).toMatchObject([
        {
          widgetType: "clock",
          title: "UTC Clock",
          configJson: { timezone: "UTC", showDate: true, showSeconds: false, hour12: false },
          integrationId: null,
        },
      ]);
      expect(created?.placements).toHaveLength(2);
      await expect(
        store.updateItem({
          boardId: board.board.id,
          itemId,
          expectedRevision: 1,
          title: "Stale",
          configJson: {},
          widgetVersion: 1,
        }),
      ).rejects.toMatchObject({ code: "BOARD_REVISION_CONFLICT" });
      await expect(
        store.updateItem({
          boardId: board.board.id,
          itemId,
          expectedRevision: 2,
          title: "Paris",
          configJson: {
            timezone: "Europe/Paris",
            showDate: false,
            showSeconds: true,
            hour12: false,
          },
          widgetVersion: 1,
        }),
      ).resolves.toBe(3);
      expect((await store.findSnapshotById(board.board.id))?.items[0]).toMatchObject({
        title: "Paris",
        configJson: { timezone: "Europe/Paris", showDate: false, showSeconds: true, hour12: false },
      });
      const other = await store.createBoardWithLayouts({
        slug: "other",
        name: "Other",
        description: null,
        visibility: "private",
        ownerUserId: owner,
        layouts,
      });
      await expect(
        store.deleteItem({
          boardId: other.board.id,
          itemId,
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ code: "BOARD_RELATION_MISMATCH" });
      await expect(
        store.deleteItem({ boardId: board.board.id, itemId, expectedRevision: 3 }),
      ).resolves.toBe(4);
      const deleted = await store.findSnapshotById(board.board.id);
      expect(deleted?.items).toEqual([]);
      expect(deleted?.placements).toEqual([]);
      expect(deleted?.board.revision).toBe(4);
    } finally {
      client.close();
    }
  });
  it("reads Phase 5 fixture items including invalid JSON without crashing", async () => {
    const { client, owner, store } = await setup();
    try {
      const board = await store.createBoardWithLayouts({
        slug: "legacy",
        name: "Legacy",
        description: null,
        visibility: "private",
        ownerUserId: owner,
        layouts,
      });
      const validId = randomUUID();
      const invalidId = randomUUID();
      client.sqlite
        .prepare(
          "INSERT INTO items(id,board_id,widget_type,widget_version,title,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          validId,
          board.board.id,
          "clock",
          1,
          "Kept",
          '{"timezone":"UTC","showDate":true,"showSeconds":false,"hour12":false}',
          Date.now(),
          Date.now(),
        );
      client.sqlite
        .prepare(
          "INSERT INTO items(id,board_id,widget_type,widget_version,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(invalidId, board.board.id, "clock", 1, "{not-json", Date.now(), Date.now());
      const snapshot = await store.findSnapshotById(board.board.id);
      expect(snapshot?.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: validId,
            title: "Kept",
            configParseFailed: false,
            configJson: {
              timezone: "UTC",
              showDate: true,
              showSeconds: false,
              hour12: false,
            },
          }),
          expect.objectContaining({ id: invalidId, configParseFailed: true }),
        ]),
      );
    } finally {
      client.close();
    }
  });
  it("resolves direct and group ACL and cascades them", async () => {
    const { client, owner, store } = await setup();
    try {
      const result = await store.createBoardWithLayouts({
        slug: "home",
        name: "Home",
        description: null,
        visibility: "private",
        ownerUserId: owner,
        layouts,
      });
      const viewer = randomUUID(),
        group = randomUUID();
      client.sqlite
        .prepare(
          "INSERT INTO users(id,username,username_canonical,created_at,updated_at) VALUES(?,?,?,?,?)",
        )
        .run(viewer, "viewer", "viewer", Date.now(), Date.now());
      client.sqlite
        .prepare("INSERT INTO groups(id,name,created_at,updated_at) VALUES(?,?,?,?)")
        .run(group, "Readers", Date.now(), Date.now());
      client.sqlite
        .prepare("INSERT INTO group_members(group_id,user_id,created_at) VALUES(?,?,?)")
        .run(group, viewer, Date.now());
      client.sqlite
        .prepare("INSERT INTO board_group_permissions(board_id,group_id,permission) VALUES(?,?,?)")
        .run(result.board.id, group, "board.view");
      expect(await store.resolveResourcePermissions(result.board.id, viewer)).toEqual([
        "board.view",
      ]);
      await store.deleteBoard(result.board.id);
      expect(
        client.sqlite.prepare("SELECT count(*) count FROM board_group_permissions").get()?.count,
      ).toBe(0);
    } finally {
      client.close();
    }
  });
});
