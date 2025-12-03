import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js";
import "https://esm.sh/dotenv/config";

let supabaseInstance: SupabaseClient | null = null;

function createSupabaseInstance(): SupabaseClient {
  const supabaseUrl = Deno.env.get("PROJECT_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("PROJECT_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, supabaseKey);
}

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseInstance();
  }
  return supabaseInstance;
}

// Convenience default instance for backwards compatibility
export const supabase = getSupabase();