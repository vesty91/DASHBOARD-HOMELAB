import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../schema/sqlite";

export function createSqliteClient(path: string) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const toSqlInput = (value: unknown): SQLInputValue => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      value instanceof Uint8Array
    )
      return value;
    throw new TypeError("Unsupported SQLite parameter type");
  };
  const callback = async (
    query: string,
    params: unknown[],
    method: "run" | "all" | "values" | "get",
  ) => {
    const statement = sqlite.prepare(query);
    const inputs = params.map(toSqlInput);
    if (method === "run") {
      statement.run(...inputs);
      return { rows: [] };
    }
    if (method === "get") {
      const row = statement.get(...inputs);
      return { rows: row === undefined ? [] : Object.values(row) };
    }
    return { rows: statement.all(...inputs).map((row) => Object.values(row)) };
  };
  return {
    dialect: "sqlite" as const,
    db: drizzle(callback, { schema }),
    sqlite,
    close: () => sqlite.close(),
  };
}
export type SqliteClient = ReturnType<typeof createSqliteClient>;
