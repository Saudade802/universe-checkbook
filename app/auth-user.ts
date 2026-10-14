import { cookies } from "next/headers";
import { localPreviewEnabled, supabaseConfig } from "../lib/supabase/config";
import { createSupabaseServerClient } from "../lib/supabase/server";

export const LOCAL_PREVIEW_COOKIE = "checkbook-local-preview";
export type CurrentUser = { userId: string; displayName: string; email: string; localPreview: boolean };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (localPreviewEnabled() && (await cookies()).get(LOCAL_PREVIEW_COOKIE)?.value === "enabled") {
    return { userId: "local-preview", displayName: "本地预览账户", email: "", localPreview: true };
  }
  if (!supabaseConfig()) return null;
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const name = typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name.slice(0, 40) : user.email || "我的账户";
  return { userId: user.id, displayName: name, email: user.email || "", localPreview: false };
}
