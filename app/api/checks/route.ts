import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { INSERT_ATTEMPT, LIMIT, validateFields } from "../../../lib/checks";

export const dynamic = "force-dynamic";
type Row = { request_id: string; successful: number; data: string | null; errors: string; created_at: string };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
const saved = (row: Row) => ({ requestId: row.request_id, fields: JSON.parse(row.data!), createdAt: row.created_at });

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return json({ message: "请先登录后再填写" }, 401);
  try {
    if (!env.DB) throw new Error("Database binding missing");
    const results = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS used FROM check_attempts WHERE user_id = ?").bind(user.userId),
      env.DB.prepare("SELECT * FROM check_attempts WHERE user_id = ? AND successful = 1 ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(user.userId),
    ]);
    const used = Number((results[0].results[0] as { used: number } | undefined)?.used ?? 0);
    const latest = results[1].results[0] as Row | undefined;
    return json({ used, remaining: Math.max(0, LIMIT - used), latest: latest ? saved(latest) : null });
  } catch (error) {
    console.error("Checkbook status unavailable", error instanceof Error ? error.message : "unknown");
    return json({ message: "暂时无法读取填写次数，请稍后重试" }, 503);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ message: "登录已过期，请重新登录" }, 401);
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) return json({ message: "请求来源无效" }, 403);
  let body: { requestId?: unknown; fields?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 12000) return json({ message: "提交内容过长" }, 413);
    body = JSON.parse(raw);
  } catch { return json({ message: "提交格式无效" }, 400); }
  if (!body || typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) return json({ message: "提交标识无效，请刷新页面" }, 400);
  const { fields, errors } = validateFields(body.fields);
  const successful = Object.keys(errors).length === 0;
  try {
    if (!env.DB) throw new Error("Database binding missing");
    const results = await env.DB.batch([
      env.DB.prepare(INSERT_ATTEMPT).bind(user.userId, body.requestId, successful ? 1 : 0, successful ? JSON.stringify(fields) : null, JSON.stringify(errors), new Date().toISOString(), user.userId),
      env.DB.prepare("SELECT * FROM check_attempts WHERE user_id = ? AND request_id = ?").bind(user.userId, body.requestId),
      env.DB.prepare("SELECT COUNT(*) AS used FROM check_attempts WHERE user_id = ?").bind(user.userId),
    ]);
    const row = results[1].results[0] as Row | undefined;
    const used = Number((results[2].results[0] as { used: number } | undefined)?.used ?? 0);
    const remaining = Math.max(0, LIMIT - used);
    if (!row) return json({ used, remaining, message: "50次提交机会已用完，仍可下载最近一次成功生成的支票。" }, 429);
    return json({ used, remaining, success: !!row.successful, errors: JSON.parse(row.errors), check: row.successful ? saved(row) : null, message: row.successful ? "支票已生成，可以下载了" : "本次已计入填写次数，请修改标记的内容后重新提交" }, row.successful ? 200 : 422);
  } catch (error) {
    console.error("Checkbook submission unavailable", error instanceof Error ? error.message : "unknown");
    return json({ message: "暂时无法确认提交结果，请重试；同一笔提交不会重复扣次。" }, 503);
  }
}
