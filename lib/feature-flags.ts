import { unstable_noStore as noStore } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/server";

export type FeatureFlagKey = "url_import" | "recipe_sharing";

const defaultFlags: Record<FeatureFlagKey, boolean> = {
  url_import: true,
  recipe_sharing: true,
};

export async function getFeatureFlags() {
  noStore();

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("feature_flags")
      .select("key, enabled")
      .in("key", Object.keys(defaultFlags));

    if (error || !data) {
      return defaultFlags;
    }

    const loadedFlags = { ...defaultFlags };
    for (const row of data) {
      if (row.key in loadedFlags) {
        loadedFlags[row.key as FeatureFlagKey] = Boolean(row.enabled);
      }
    }

    return loadedFlags;
  } catch {
    return defaultFlags;
  }
}

export async function isFeatureEnabled(flag: FeatureFlagKey) {
  const flags = await getFeatureFlags();
  return flags[flag];
}
