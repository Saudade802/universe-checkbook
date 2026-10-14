import connection from "../../supabase/public-config.json";

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || connection.url;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || connection.publishableKey;
  if (!url || !key) return null;
  return { url, key };
}

export function localPreviewEnabled() {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL && process.env.CHECKBOOK_LOCAL_PREVIEW === "1";
}
