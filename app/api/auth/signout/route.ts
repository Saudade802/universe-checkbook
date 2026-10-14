import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { LOCAL_PREVIEW_COOKIE } from "../../../auth-user";
import { localPreviewEnabled, supabaseConfig } from "../../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSameOrigin } from "../../../../lib/request-security";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("请求来源无效", { status: 403 });
  if (localPreviewEnabled()) (await cookies()).delete(LOCAL_PREVIEW_COOKIE);
  if (supabaseConfig()) await (await createSupabaseServerClient()).auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
