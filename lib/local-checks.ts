import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { INSERT_ATTEMPT, LIMIT, validateFields, type SavedCheck } from "./checks";
import { localPreviewEnabled } from "./supabase/config";

type Row = { request_id: string; successful: number; data: string | null; errors: string; created_at: string };
async function database() {
  if (!localPreviewEnabled()) throw new Error("Local preview storage is disabled");
  const { DatabaseSync } = await import("node:sqlite");
  const folder = join(process.cwd(), ".sites-runtime");
  mkdirSync(folder, { recursive: true });
  const db = new DatabaseSync(join(folder, "next-local-preview.sqlite"));
  db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS check_attempts (user_id TEXT NOT NULL, request_id TEXT NOT NULL, successful INTEGER NOT NULL, data TEXT, errors TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,request_id));");
  return db;
}
const saved = (row: Row): SavedCheck => ({ requestId: row.request_id, fields: JSON.parse(row.data!), createdAt: row.created_at });

export async function localStatus(userId: string) {
  const db = await database();
  try {
    const used = Number(db.prepare("SELECT COUNT(*) AS used FROM check_attempts WHERE user_id=?").get(userId)?.used ?? 0);
    const row = db.prepare("SELECT * FROM check_attempts WHERE user_id=? AND successful=1 ORDER BY created_at DESC,rowid DESC LIMIT 1").get(userId) as Row | undefined;
    return { used, remaining: LIMIT - used, latest: row ? saved(row) : null };
  } finally { db.close(); }
}

export async function localSubmit(userId: string, requestId: string, input: unknown) {
  const db = await database();
  try {
    const { fields, errors } = validateFields(input);
    const successful = Object.keys(errors).length === 0;
    db.exec("BEGIN IMMEDIATE");
    db.prepare(INSERT_ATTEMPT).run(userId, requestId, successful ? 1 : 0, successful ? JSON.stringify(fields) : null, JSON.stringify(errors), new Date().toISOString(), userId);
    const row = db.prepare("SELECT * FROM check_attempts WHERE user_id=? AND request_id=?").get(userId, requestId) as Row | undefined;
    const used = Number(db.prepare("SELECT COUNT(*) AS used FROM check_attempts WHERE user_id=?").get(userId)?.used ?? 0);
    db.exec("COMMIT");
    return { used, remaining: LIMIT - used, success: !!row?.successful, errors: row ? JSON.parse(row.errors) : {}, check: row?.successful ? saved(row) : null, status: !row ? "limit" : row.successful ? "success" : "invalid" };
  } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  finally { db.close(); }
}
