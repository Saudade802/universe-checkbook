import { getCurrentUser } from "../../auth-user";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { localStatus, localSubmit } from "../../../lib/local-checks";
import { isSameOrigin } from "../../../lib/request-security";
import { validateFields } from "../../../lib/checks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ message: "请先登录后再填写" }, 401);
  try {
    if (user.localPreview) return json(await localStatus(user.userId));
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("manifestation_status");
    if (error) throw new Error(error.code || "Database status unavailable");
    return json(data);
  } catch (error) {
    console.error("Checkbook status unavailable", error instanceof Error ? error.message : "unknown");
    return json({ message: "暂时无法读取填写次数，请稍后重试" }, 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ message: "请求来源无效" }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ message: "登录已过期，请重新登录" }, 401);
  let body: { requestId?: unknown; fields?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 12000) return json({ message: "提交内容过长" }, 413);
    body = JSON.parse(raw);
  } catch { return json({ message: "提交格式无效" }, 400); }
  if (!body || typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) return json({ message: "提交标识无效，请刷新页面" }, 400);
  try {
    let result;
    if (user.localPreview) result = await localSubmit(user.userId, body.requestId, body.fields);
    else {
      const client = await createSupabaseServerClient();
      // The database also validates every field. Calling the RPC directly cannot
      // bypass validation, identity checks, deduplication or the 50-attempt cap.
      const { fields } = validateFields(body.fields);
      const { data, error } = await client.rpc("manifestation_submit", { p_request_id: body.requestId, p_fields: fields });
      if (error) throw new Error(error.code || "Database submission unavailable");
      result = data;
    }
    const status = result.status === "limit" ? 429 : result.success ? 200 : 422;
    const message = status === 429 ? "50次提交机会已用完，仍可下载最近一次成功生成的支票。" : result.success ? "支票已生成，可以下载了" : "本次已计入填写次数，请修改标记的内容后重新提交";
    return json({ ...result, message }, status);
  } catch (error) {
    console.error("Checkbook submission unavailable", error instanceof Error ? error.message : "unknown");
    return json({ message: "暂时无法确认提交结果，请重试；同一笔提交不会重复扣次。" }, 503);
  }
}
