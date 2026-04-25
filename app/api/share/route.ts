import { NextResponse } from "next/server";

import { isFeatureEnabled } from "@/lib/feature-flags";

export async function POST() {
  const enabled = await isFeatureEnabled("recipe_sharing");

  if (!enabled) {
    return NextResponse.json(
      { error: "Recipe sharing is currently disabled by feature flag." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      message: "Recipe sharing endpoint scaffolded. Implementation follows in later issues.",
    },
    { status: 501 },
  );
}
