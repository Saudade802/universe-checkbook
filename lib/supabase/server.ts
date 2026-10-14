import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

export async function createSupabaseServerClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Account service is not configured");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() { return store.getAll(); },
      setAll(items) {
        try { items.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Components are read-only; proxy.ts refreshes cookies. */ }
      },
    },
  });
}
