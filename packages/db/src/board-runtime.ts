import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient } from "pg";

export type BoardVisibility = "private" | "authenticated" | "public";
export type BoardResourcePermission = "board.view" | "board.edit" | "board.manage";
export interface BoardRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: BoardVisibility;
  ownerUserId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface LayoutRow {
  id: string;
  boardId: string;
  name: string;
  breakpoint: string;
  columns: number;
  rowHeight: number;
  sortOrder: number;
}
export interface ItemRow {
  id: string;
  boardId: string;
  widgetType: string;
  widgetVersion: number;
  title: string | null;
}
export interface PlacementRow {
  id: string;
  itemId: string;
  layoutId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface BoardSnapshotRow {
  board: BoardRow;
  layouts: LayoutRow[];
  items: ItemRow[];
  placements: PlacementRow[];
}
export interface PlacementInput {
  itemId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export class BoardRepositoryError extends Error {
  constructor(readonly code: "BOARD_REVISION_CONFLICT" | "BOARD_RELATION_MISMATCH") {
    super(code);
  }
}

type AnyRow = Record<string, unknown>;
const board = (r: AnyRow): BoardRow => ({
  id: String(r.id),
  slug: String(r.slug),
  name: String(r.name),
  description: r.description == null ? null : String(r.description),
  visibility: r.visibility as BoardVisibility,
  ownerUserId: r.owner_user_id == null ? null : String(r.owner_user_id),
  revision: Number(r.revision),
  createdAt: new Date(Number(r.created_at instanceof Date ? r.created_at.getTime() : r.created_at)),
  updatedAt: new Date(Number(r.updated_at instanceof Date ? r.updated_at.getTime() : r.updated_at)),
});
const layout = (r: AnyRow): LayoutRow => ({
  id: String(r.id),
  boardId: String(r.board_id),
  name: String(r.name),
  breakpoint: String(r.breakpoint),
  columns: Number(r.columns),
  rowHeight: Number(r.row_height),
  sortOrder: Number(r.sort_order),
});
const item = (r: AnyRow): ItemRow => ({
  id: String(r.id),
  boardId: String(r.board_id),
  widgetType: String(r.widget_type),
  widgetVersion: Number(r.widget_version),
  title: r.title == null ? null : String(r.title),
});
const placement = (r: AnyRow): PlacementRow => ({
  id: String(r.id),
  itemId: String(r.item_id),
  layoutId: String(r.layout_id),
  x: Number(r.x),
  y: Number(r.y),
  w: Number(r.w),
  h: Number(r.h),
});

export function createSqliteBoardStore(db: DatabaseSync) {
  const snapshot = (where: string, value: string): BoardSnapshotRow | undefined => {
    const raw = db.prepare(`SELECT * FROM boards WHERE ${where}=?`).get(value);
    if (!raw) return undefined;
    const b = board(raw);
    return {
      board: b,
      layouts: db
        .prepare("SELECT * FROM layouts WHERE board_id=? ORDER BY sort_order")
        .all(b.id)
        .map(layout),
      items: db
        .prepare("SELECT * FROM items WHERE board_id=? ORDER BY created_at")
        .all(b.id)
        .map(item),
      placements: db
        .prepare(
          "SELECT il.* FROM item_layouts il JOIN layouts l ON l.id=il.layout_id WHERE l.board_id=?",
        )
        .all(b.id)
        .map(placement),
    };
  };
  return {
    async listBoards() {
      return db.prepare("SELECT * FROM boards ORDER BY name, id").all().map(board);
    },
    async findSnapshotById(id: string) {
      return snapshot("id", id);
    },
    async findSnapshotBySlug(slug: string) {
      return snapshot("slug", slug);
    },
    async resolveResourcePermissions(boardId: string, userId: string) {
      return db
        .prepare(
          "SELECT permission FROM board_user_permissions WHERE board_id=? AND user_id=? UNION SELECT bgp.permission FROM board_group_permissions bgp JOIN group_members gm ON gm.group_id=bgp.group_id WHERE bgp.board_id=? AND gm.user_id=?",
        )
        .all(boardId, userId, boardId, userId)
        .map((r) => String(r.permission) as BoardResourcePermission);
    },
    async createBoardWithLayouts(input: {
      slug: string;
      name: string;
      description: string | null;
      visibility: BoardVisibility;
      ownerUserId: string;
      layouts: readonly Omit<LayoutRow, "id" | "boardId">[];
    }) {
      const id = randomUUID(),
        now = Date.now();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          "INSERT INTO boards(id,slug,name,description,visibility,owner_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        ).run(
          id,
          input.slug,
          input.name,
          input.description,
          input.visibility,
          input.ownerUserId,
          now,
          now,
        );
        const add = db.prepare(
          "INSERT INTO layouts(id,board_id,name,breakpoint,columns,row_height,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        );
        for (const l of input.layouts)
          add.run(
            randomUUID(),
            id,
            l.name,
            l.breakpoint,
            l.columns,
            l.rowHeight,
            l.sortOrder,
            now,
            now,
          );
        db.exec("COMMIT");
        return snapshot("id", id)!;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async updateBoard(input: {
      boardId: string;
      expectedRevision: number;
      name: string;
      description: string | null;
      visibility?: BoardVisibility;
    }) {
      const now = Date.now();
      const result =
        input.visibility === undefined
          ? db
              .prepare(
                "UPDATE boards SET name=?,description=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
              )
              .run(input.name, input.description, now, input.boardId, input.expectedRevision)
          : db
              .prepare(
                "UPDATE boards SET name=?,description=?,visibility=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
              )
              .run(
                input.name,
                input.description,
                input.visibility,
                now,
                input.boardId,
                input.expectedRevision,
              );
      if (result.changes !== 1) throw new BoardRepositoryError("BOARD_REVISION_CONFLICT");
      return input.expectedRevision + 1;
    },
    async updateLayoutBatch(
      input: {
        boardId: string;
        layoutId: string;
        expectedRevision: number;
        items: readonly PlacementInput[];
      },
      validate: (columns: number, p: readonly PlacementInput[]) => void,
    ) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const changed = db
          .prepare("UPDATE boards SET revision=revision+1,updated_at=? WHERE id=? AND revision=?")
          .run(Date.now(), input.boardId, input.expectedRevision);
        if (changed.changes !== 1) throw new BoardRepositoryError("BOARD_REVISION_CONFLICT");
        const l = db
          .prepare("SELECT columns FROM layouts WHERE id=? AND board_id=?")
          .get(input.layoutId, input.boardId);
        if (!l) throw new BoardRepositoryError("BOARD_RELATION_MISMATCH");
        const ids = new Set(input.items.map((p) => p.itemId));
        if (ids.size !== input.items.length)
          throw new BoardRepositoryError("BOARD_RELATION_MISMATCH");
        for (const id of ids)
          if (!db.prepare("SELECT 1 FROM items WHERE id=? AND board_id=?").get(id, input.boardId))
            throw new BoardRepositoryError("BOARD_RELATION_MISMATCH");
        const projected = db
          .prepare(
            "SELECT il.item_id itemId,il.x,il.y,il.w,il.h FROM item_layouts il JOIN items i ON i.id=il.item_id WHERE il.layout_id=? AND i.board_id=?",
          )
          .all(input.layoutId, input.boardId)
          .map((r) => ({
            itemId: String(r.itemId),
            x: Number(r.x),
            y: Number(r.y),
            w: Number(r.w),
            h: Number(r.h),
          }));
        const byId = new Map(projected.map((p) => [p.itemId, p]));
        for (const p of input.items) byId.set(p.itemId, p);
        validate(Number(l.columns), [...byId.values()]);
        const up = db.prepare(
          "INSERT INTO item_layouts(id,item_id,layout_id,x,y,w,h) VALUES(?,?,?,?,?,?,?) ON CONFLICT(item_id,layout_id) DO UPDATE SET x=excluded.x,y=excluded.y,w=excluded.w,h=excluded.h",
        );
        for (const p of input.items)
          up.run(randomUUID(), p.itemId, input.layoutId, p.x, p.y, p.w, p.h);
        db.exec("COMMIT");
        return input.expectedRevision + 1;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async deleteBoard(id: string) {
      db.prepare("DELETE FROM boards WHERE id=?").run(id);
    },
  };
}

export function createPostgresqlBoardStore(pool: Pool) {
  const snapshot = async (
    q: Pool | PoolClient,
    where: "id" | "slug",
    value: string,
  ): Promise<BoardSnapshotRow | undefined> => {
    const br = await q.query(`SELECT * FROM boards WHERE ${where}=$1`, [value]);
    if (!br.rows[0]) return undefined;
    const b = board(br.rows[0]);
    const [ls, is, ps] = await Promise.all([
      q.query("SELECT * FROM layouts WHERE board_id=$1 ORDER BY sort_order", [b.id]),
      q.query("SELECT * FROM items WHERE board_id=$1 ORDER BY created_at", [b.id]),
      q.query(
        "SELECT il.* FROM item_layouts il JOIN layouts l ON l.id=il.layout_id WHERE l.board_id=$1",
        [b.id],
      ),
    ]);
    return {
      board: b,
      layouts: ls.rows.map(layout),
      items: is.rows.map(item),
      placements: ps.rows.map(placement),
    };
  };
  return {
    async listBoards() {
      return (await pool.query("SELECT * FROM boards ORDER BY name,id")).rows.map(board);
    },
    async findSnapshotById(id: string) {
      return snapshot(pool, "id", id);
    },
    async findSnapshotBySlug(slug: string) {
      return snapshot(pool, "slug", slug);
    },
    async resolveResourcePermissions(boardId: string, userId: string) {
      return (
        await pool.query(
          "SELECT permission FROM board_user_permissions WHERE board_id=$1 AND user_id=$2 UNION SELECT bgp.permission FROM board_group_permissions bgp JOIN group_members gm ON gm.group_id=bgp.group_id WHERE bgp.board_id=$1 AND gm.user_id=$2",
          [boardId, userId],
        )
      ).rows.map((r) => String(r.permission) as BoardResourcePermission);
    },
    async createBoardWithLayouts(input: {
      slug: string;
      name: string;
      description: string | null;
      visibility: BoardVisibility;
      ownerUserId: string;
      layouts: readonly Omit<LayoutRow, "id" | "boardId">[];
    }) {
      const c = await pool.connect(),
        id = randomUUID();
      try {
        await c.query("BEGIN");
        await c.query(
          "INSERT INTO boards(id,slug,name,description,visibility,owner_user_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,now(),now())",
          [id, input.slug, input.name, input.description, input.visibility, input.ownerUserId],
        );
        for (const l of input.layouts)
          await c.query(
            "INSERT INTO layouts(id,board_id,name,breakpoint,columns,row_height,sort_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())",
            [randomUUID(), id, l.name, l.breakpoint, l.columns, l.rowHeight, l.sortOrder],
          );
        await c.query("COMMIT");
        return (await snapshot(pool, "id", id))!;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
    async updateBoard(input: {
      boardId: string;
      expectedRevision: number;
      name: string;
      description: string | null;
      visibility?: BoardVisibility;
    }) {
      const values =
        input.visibility === undefined
          ? [input.name, input.description, input.boardId, input.expectedRevision]
          : [
              input.name,
              input.description,
              input.visibility,
              input.boardId,
              input.expectedRevision,
            ];
      const sql =
        input.visibility === undefined
          ? "UPDATE boards SET name=$1,description=$2,revision=revision+1,updated_at=now() WHERE id=$3 AND revision=$4 RETURNING revision"
          : "UPDATE boards SET name=$1,description=$2,visibility=$3,revision=revision+1,updated_at=now() WHERE id=$4 AND revision=$5 RETURNING revision";
      const r = await pool.query(sql, values);
      if (r.rowCount !== 1) throw new BoardRepositoryError("BOARD_REVISION_CONFLICT");
      return Number(r.rows[0].revision);
    },
    async updateLayoutBatch(
      input: {
        boardId: string;
        layoutId: string;
        expectedRevision: number;
        items: readonly PlacementInput[];
      },
      validate: (columns: number, p: readonly PlacementInput[]) => void,
    ) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const changed = await c.query(
          "UPDATE boards SET revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 RETURNING revision",
          [input.boardId, input.expectedRevision],
        );
        if (changed.rowCount !== 1) throw new BoardRepositoryError("BOARD_REVISION_CONFLICT");
        const lr = await c.query("SELECT columns FROM layouts WHERE id=$1 AND board_id=$2", [
          input.layoutId,
          input.boardId,
        ]);
        if (!lr.rows[0]) throw new BoardRepositoryError("BOARD_RELATION_MISMATCH");
        const ids = new Set(input.items.map((p) => p.itemId));
        if (ids.size !== input.items.length)
          throw new BoardRepositoryError("BOARD_RELATION_MISMATCH");
        if (ids.size) {
          const owned = await c.query(
            "SELECT id FROM items WHERE board_id=$1 AND id=ANY($2::uuid[])",
            [input.boardId, [...ids]],
          );
          if (owned.rowCount !== ids.size)
            throw new BoardRepositoryError("BOARD_RELATION_MISMATCH");
        }
        const existing = await c.query(
          "SELECT il.item_id,il.x,il.y,il.w,il.h FROM item_layouts il JOIN items i ON i.id=il.item_id WHERE il.layout_id=$1 AND i.board_id=$2",
          [input.layoutId, input.boardId],
        );
        const byId = new Map(
          existing.rows.map((r) => [
            String(r.item_id),
            {
              itemId: String(r.item_id),
              x: Number(r.x),
              y: Number(r.y),
              w: Number(r.w),
              h: Number(r.h),
            },
          ]),
        );
        for (const p of input.items) byId.set(p.itemId, p);
        validate(Number(lr.rows[0].columns), [...byId.values()]);
        for (const p of input.items)
          await c.query(
            "INSERT INTO item_layouts(id,item_id,layout_id,x,y,w,h) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(item_id,layout_id) DO UPDATE SET x=excluded.x,y=excluded.y,w=excluded.w,h=excluded.h",
            [randomUUID(), p.itemId, input.layoutId, p.x, p.y, p.w, p.h],
          );
        await c.query("COMMIT");
        return Number(changed.rows[0].revision);
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
    async deleteBoard(id: string) {
      await pool.query("DELETE FROM boards WHERE id=$1", [id]);
    },
  };
}
