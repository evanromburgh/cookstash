import { createClient } from "@supabase/supabase-js";

import { getPublicEnvironment } from "@/lib/env";

const { supabaseUrl, supabaseAnonKey } = getPublicEnvironment();

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
