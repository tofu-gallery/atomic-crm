import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

// Tofu: a managed database gives a Vite app its public key as VITE_SUPABASE_PUBLISHABLE_KEY (and
// VITE_SUPABASE_ANON_KEY). Upstream's own name, VITE_SB_PUBLISHABLE_KEY, still wins when it is set.
export const supabasePublishableKey: string | undefined =
  import.meta.env.VITE_SB_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  undefined;

let supabaseClient: SupabaseClient | null = null;

export const getSupabaseClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      supabasePublishableKey as string,
    );
  }
  return supabaseClient;
};
