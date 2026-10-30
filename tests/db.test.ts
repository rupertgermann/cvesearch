import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureColumn, getDb } from "../src/lib/db";

async function withTempDb(run: (db: ReturnType<typeof getDb>) => void): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-db-"));
  const previous = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");

  try {
    const db = getDb();
    db.exec("CREATE TABLE guard_target (id TEXT PRIMARY KEY)");
    run(db);
  } finally {
    if (previous === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previous;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function columnNames(db: ReturnType<typeof getDb>): string[] {
  return (db.prepare("PRAGMA table_info(guard_target)").all() as Array<{ name: string }>).map((entry) => entry.name);
}

test("ensureColumn adds a missing column with a valid identifier, idempotently", async () => {
  await withTempDb((db) => {
    ensureColumn(db, "guard_target", "Owner_2", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "guard_target", "Owner_2", "TEXT NOT NULL DEFAULT ''");

    assert.deepEqual(columnNames(db), ["id", "Owner_2"]);
  });
});

test("ensureColumn rejects unsafe identifiers before executing any SQL", async () => {
  await withTempDb((db) => {
    const unsafe = ['bad"name', "bad'name", "bad name", "bad;name", "bad(name)", "1bad", ""];

    for (const value of unsafe) {
      assert.throws(() => ensureColumn(db, "guard_target", value, "TEXT"), /Unsafe column identifier/);
      assert.throws(() => ensureColumn(db, value, "safe_column", "TEXT"), /Unsafe table identifier/);
    }
    assert.throws(
      () => ensureColumn(db, "guard_target", "evil", "TEXT; DROP TABLE guard_target"),
      /Unsafe column definition/,
    );

    assert.deepEqual(columnNames(db), ["id"]);
  });
});
