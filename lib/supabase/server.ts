import { createClient } from "@supabase/supabase-js";

import { getPublicEnvironment } from "@/lib/env";

export function createServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  const { supabaseUrl } = getPublicEnvironment();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
