import { cookies } from "next/headers";
import { LOCAL_PREVIEW_COOKIE } from "../../auth-user";
import { localPreviewEnabled, supabaseConfig } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { isSameOrigin } from "../../../lib/request-security";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ message: "请求来源无效" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 3000) return json({ message: "登录内容过长" }, 400);
    const body = JSON.parse(raw) as { mode?: string; email?: string; password?: string; name?: string };
    if (body.mode === "preview") {
      if (!localPreviewEnabled()) return json({ message: "本地预览登录不可用" }, 403);
      (await cookies()).set(LOCAL_PREVIEW_COOKIE, "enabled", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 86400 });
      return json({ signedIn: true });
    }
    if (!supabaseConfig()) return json({ message: "账户服务暂时不可用，请稍后再试" }, 503);
    if (!["login", "signup"].includes(body.mode || "")) return json({ message: "登录方式无效" }, 400);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128) return json({ message: "请输入有效邮箱和至少8位的密码" }, 400);
    const client = await createSupabaseServerClient();
    if (body.mode === "signup") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
      if (!name) return json({ message: "请填写你的名字" }, 400);
      const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: `${new URL(request.url).origin}/auth/confirm` } });
      if (error) return json({ message: error.status === 429 ? "请求较频繁，请稍后再试" : "暂时无法注册，请检查邮箱或稍后再试" }, error.status === 429 ? 429 : 400);
      return json({ signedIn: !!data.session, message: "注册确认邮件已发送。确认邮箱后，请回到此页面登录。" });
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return json({ message: error.code === "email_not_confirmed" ? "请先通过邮件确认邮箱，再登录" : error.status === 429 ? "登录尝试较频繁，请稍后再试" : "邮箱或密码不正确，请重试" }, error.status === 429 ? 429 : 401);
    return json({ signedIn: true });
  } catch { return json({ message: "暂时无法完成登录，请稍后重试" }, 503); }
}
