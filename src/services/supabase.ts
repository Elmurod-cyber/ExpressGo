import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** Ilova faqat anonim kalitni o'qiydi. Noto'g'ri qiymat ilovani yiqitmaydi. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !key) {
    client = null;
    return client;
  }
  try {
    client = createClient(url, key);
  } catch {
    client = null;
  }
  return client;
}
